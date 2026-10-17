// The game rules in the browser: the same Rust engine the canister runs
// (crates/engine), compiled to WASM by scripts/build-engine-wasm.sh. The UI
// asks it which moves a player may make, so it only offers plans the
// canister will accept.

import init, * as wasm from './pkg/engine';
import { MoveType, Side, type Board, type Move, type Pos } from '@/lib/backend';

let ready: Promise<unknown> | null = null;

/** Loads the WASM module once; call before any other function here. */
export function loadEngine(): Promise<unknown> {
  ready ??= init();
  return ready;
}

export const FIELD_WIDTH = 15;
export const FIELD_HEIGHT = 11;

/** Every game kicks off from this board (team 1 on the ball). */
export function newGameBoard(): Board {
  return wasm.newGameBoard();
}

export const samePos = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;
export const isGate = (x: number, y: number): boolean => wasm.isInGates(x, y);
export const team = (board: Board, side: Side): Pos[] => (side === Side.Team1 ? board.team1 : board.team2);

export function ballHolder(board: Board): { side: Side; id: number } | undefined {
  return wasm.ballHolder(board) ?? undefined;
}

export function modesFor(board: Board, side: Side, playerId: number): MoveType[] {
  return wasm.modesFor(board, side, playerId);
}

export function availableCells(board: Board, side: Side, playerId: number, moveType: MoveType, planned: Move[]): Pos[] {
  return wasm.availableCells(board, side, playerId, moveType, planned);
}

/** Adds or replaces the player's move. Throws if the cell isn't reachable. */
export function planMove(board: Board, side: Side, planned: Move[], playerId: number, moveType: MoveType, to: Pos): Move[] {
  return wasm.planMove(board, side, planned, playerId, moveType, to);
}

export function previewBoard(board: Board, side: Side, planned: Move[]): Board {
  return wasm.previewBoard(board, side, planned);
}

/** `undefined` when the canister would accept these moves, else why not. */
export function validateMoves(board: Board, side: Side, moves: Move[]): string | undefined {
  return wasm.validateMoves(board, side, moves) ?? undefined;
}
