// Client-side helpers for move planning (highlighting reachable cells).
// The canister validates and resolves every turn with the Rust engine
// (crates/engine); this mirrors its `path` and `available_cells` so the UI
// only offers moves the canister will accept.

import { MoveType, Side, type Board, type Move, type Pos } from '../bindings/backend';

export const FIELD_WIDTH = 15;
export const FIELD_HEIGHT = 11;

const DISTANCE: Record<MoveType, number> = {
  [MoveType.Pass]: 3,
  [MoveType.Shot]: 4,
  [MoveType.Run]: 2,
  [MoveType.Tackle]: 1,
};

const movesBall = (t: MoveType) => t === MoveType.Pass || t === MoveType.Shot;
export const isGate = (x: number, y: number) => (x === 0 || x === FIELD_WIDTH + 1) && y >= 3 && y <= 7;
const inField = (x: number, y: number) => x >= 1 && x <= FIELD_WIDTH && y >= 0 && y < FIELD_HEIGHT;
export const samePos = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;

function pathTo(from: Pos, tx: number, ty: number, type: MoveType): Pos[] {
  const dx = tx - from.x;
  const dy = ty - from.y;
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  const cells: Pos[] = [];
  for (let i = 1; i <= steps; i++) {
    const x = from.x + sx * i;
    const y = from.y + sy * i;
    if (inField(x, y) || (movesBall(type) && isGate(x, y))) cells.push({ x, y });
    else break;
  }
  return cells;
}

export function team(board: Board, side: Side): Pos[] {
  return side === Side.Team1 ? board.team1 : board.team2;
}

export function ballHolder(board: Board): { side: Side; id: number } | null {
  let holder: { side: Side; id: number } | null = null;
  board.team1.forEach((p, id) => samePos(p, board.ball) && (holder = { side: Side.Team1, id }));
  board.team2.forEach((p, id) => samePos(p, board.ball) && (holder = { side: Side.Team2, id }));
  return holder;
}

/** Move types a player may choose: the ball holder can run, pass or shoot. */
export function modesFor(board: Board, side: Side, id: number): MoveType[] {
  const h = ballHolder(board);
  if (h && h.side === side && h.id === id && board.ball_owner === side) {
    return [MoveType.Run, MoveType.Pass, MoveType.Shot];
  }
  return [MoveType.Run, MoveType.Tackle];
}

/**
 * Reachable cells. `planned` are the side's moves already chosen this turn:
 * a run may not end on a teammate who stays, or on another runner's target.
 */
export function availableCells(board: Board, side: Side, id: number, type: MoveType, planned: Move[]): Pos[] {
  const players = team(board, side);
  const current = players[id];
  const d = DISTANCE[type];
  const dirs = [[0, -d], [d, 0], [0, d], [-d, 0], [-d, -d], [d, -d], [-d, d], [d, d]];
  const blocked: Pos[] = [];
  if (!movesBall(type)) {
    players.forEach((p, i) => {
      const leaving = planned.some((m) => m.player_id === i && !movesBall(m.move_type) && !samePos(m.from, m.to));
      if (i !== id && !leaving) blocked.push(p);
    });
    planned.filter((m) => !movesBall(m.move_type) && m.player_id !== id).forEach((m) => blocked.push(m.to));
  }
  const cells: Pos[] = [];
  for (const [dx, dy] of dirs) {
    for (const c of pathTo(current, current.x + dx, current.y + dy, type)) {
      if (!blocked.some((b) => samePos(b, c))) cells.push(c);
    }
  }
  if (type === MoveType.Tackle) cells.push(current);
  return cells;
}

/** The board as the player sees it while planning: own runners moved, ball passed. */
export function previewBoard(board: Board, side: Side, planned: Move[]): Board {
  const next: Board = { ...board, team1: [...board.team1], team2: [...board.team2], ball: { ...board.ball } };
  const players = side === Side.Team1 ? next.team1 : next.team2;
  for (const m of planned) {
    if (movesBall(m.move_type)) {
      next.ball = m.to;
    } else {
      if (samePos(players[m.player_id], board.ball) && !planned.some((o) => movesBall(o.move_type))) next.ball = m.to;
      players[m.player_id] = m.to;
    }
  }
  return next;
}
