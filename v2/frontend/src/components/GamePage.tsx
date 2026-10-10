import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FrameKind, GameStatus, MoveType, Side, type Board, type GameView, type Move, type Pos, type TurnRecord } from '../bindings/backend';
import { api, errorText, nsToMs, ok } from '../lib/backend';
import { availableCells, ballHolder, FIELD_HEIGHT, FIELD_WIDTH, isGate, modesFor, previewBoard, samePos, team } from '../lib/engine';
import { navigate, type AppState } from '../App';
import { ChainBadge } from './ChainBadge';

const POLL_MS = 1500;
const FRAME_MS = 450;

const MODE_LABEL: Record<MoveType, string> = {
  [MoveType.Run]: 'Run',
  [MoveType.Pass]: 'Pass',
  [MoveType.Shot]: 'Shot',
  [MoveType.Tackle]: 'Tackle',
};

export function GamePage({ gameId, app }: { gameId: bigint; app: AppState }) {
  const [game, setGame] = useState<GameView | null>(null);
  const [shownBoard, setShownBoard] = useState<Board | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [planned, setPlanned] = useState<Move[]>([]);
  const [selected, setSelected] = useState<{ id: number; mode: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [lastTurn, setLastTurn] = useState<TurnRecord | null>(null);

  const version = useRef<bigint>(-1n);
  const turnsSeen = useRef<number>(-1);
  const animating = useRef(false);

  const animate = useCallback(async (turns: TurnRecord[], final: Board) => {
    animating.current = true;
    for (const t of turns) {
      for (const f of t.frames) {
        setShownBoard(f.board);
        if (f.kind === FrameKind.GoalTeam1 || f.kind === FrameKind.GoalTeam2) {
          setBanner('GOAL!');
          await new Promise((r) => setTimeout(r, 1200));
          setBanner(null);
        } else {
          await new Promise((r) => setTimeout(r, FRAME_MS));
        }
      }
    }
    setShownBoard(final);
    animating.current = false;
  }, []);

  const load = useCallback(async () => {
    try {
      const g = await api().get_game(gameId);
      if (!g) {
        setError('Game not found');
        return;
      }
      if (g.version === version.current) return;
      version.current = g.version;
      const previous = turnsSeen.current;
      turnsSeen.current = g.turns_played;
      setGame(g);

      if (previous >= 0 && g.turns_played > previous) {
        const turns = await api().get_turns(gameId, previous + 1, 50);
        setLastTurn(turns[turns.length - 1] ?? null);
        setPlanned([]);
        setSelected(null);
        animate(turns, g.board);
      } else if (!animating.current) {
        setShownBoard(g.board);
        if (previous < 0 && g.turns_played > 0) {
          const turns = await api().get_turns(gameId, g.turns_played, 1);
          setLastTurn(turns[0] ?? null);
        }
      }
      if (g.my_pending) setPlanned(g.my_pending);
    } catch (e) {
      setError(errorText(e));
    }
  }, [gameId, animate]);

  useEffect(() => {
    version.current = -1n;
    turnsSeen.current = -1;
    load();
    const poll = setInterval(load, POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), 500);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [load]);

  const mySide = game?.my_side;
  const active = game?.status === GameStatus.Active;
  const committed = mySide === Side.Team1 ? game?.committed1 : mySide === Side.Team2 ? game?.committed2 : false;
  const canPlan = !!game && active && !!mySide && !committed && !animating.current;

  const board = useMemo(() => {
    if (!shownBoard) return null;
    return canPlan && mySide ? previewBoard(shownBoard, mySide, planned) : shownBoard;
  }, [shownBoard, canPlan, mySide, planned]);

  const modes = selected && game && mySide ? modesFor(game.board, mySide, selected.id) : [];
  const mode = selected ? modes[selected.mode % modes.length] : undefined;
  const highlighted: Pos[] = useMemo(() => {
    if (!selected || !mode || !game || !mySide) return [];
    return availableCells(game.board, mySide, selected.id, mode, planned);
  }, [selected, mode, game, mySide, planned]);

  const onCell = (pos: Pos) => {
    if (!canPlan || !game || !mySide) return;
    if (selected && mode && highlighted.some((c) => samePos(c, pos))) {
      const from = team(game.board, mySide)[selected.id];
      setPlanned([...planned.filter((m) => m.player_id !== selected.id), { player_id: selected.id, move_type: mode, from, to: pos }]);
      setSelected(null);
      return;
    }
    // Click on one of my players (at its planned or original position).
    const start = team(game.board, mySide);
    const preview = board ? team(board, mySide) : start;
    const id = preview.findIndex((p) => samePos(p, pos));
    const origin = start.findIndex((p) => samePos(p, pos));
    const pid = id >= 0 ? id : origin;
    if (pid < 0) {
      setSelected(null);
      return;
    }
    if (planned.some((m) => m.player_id === pid)) {
      setPlanned(planned.filter((m) => m.player_id !== pid));
      setSelected(null);
      return;
    }
    if (selected?.id === pid) setSelected({ id: pid, mode: selected.mode + 1 });
    else setSelected({ id: pid, mode: 0 });
  };

  const commit = async () => {
    if (!game) return;
    setBusy(true);
    setError(null);
    try {
      const r = ok(await api().commit_moves(game.id, game.turns_played + 1, planned));
      setSelected(null);
      if (!r.resolved) {
        version.current = r.game.version;
        setGame(r.game);
      }
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const surrender = async () => {
    if (!game || !confirm('Give up this game? It counts as a 0:3 loss.')) return;
    try {
      ok(await api().surrender(game.id));
      await load();
    } catch (e) {
      setError(errorText(e));
    }
  };

  if (!game || !board) return <p className="muted center">{error ?? 'Loading game…'}</p>;

  const secondsLeft = Math.max(0, Math.ceil((nsToMs(game.turn_deadline) - now) / 1000));
  const holder = ballHolder(board);

  return (
    <div className="game">
      <div className="scoreboard">
        <div className="side team1">
          <img src="/Player1.png" alt="" />
          <div>
            <strong>{game.team1.name}</strong> <ChainBadge chain={game.team1.home_chain} settings={app.settings} />
            {mySide === Side.Team1 && <span className="you">you</span>}
          </div>
        </div>
        <div className="score">
          {game.score1} : {game.score2}
          <div className="muted small">
            {active ? `Turn ${game.turns_played + 1} / ${game.max_turns}` : `Full time`}
          </div>
        </div>
        <div className="side team2">
          <div>
            {mySide === Side.Team2 && <span className="you">you</span>}
            <ChainBadge chain={game.team2.home_chain} settings={app.settings} /> <strong>{game.team2.name}</strong>
          </div>
          <img src="/Player2.png" alt="" />
        </div>
      </div>

      {active && (
        <div className="turn-status">
          <span className={secondsLeft <= 10 ? 'error' : ''}>{secondsLeft}s left</span>
          <span>
            {game.team1.name}: {game.committed1 ? 'ready' : 'thinking'} · {game.team2.name}: {game.committed2 ? 'ready' : 'thinking'}
          </span>
        </div>
      )}

      <div className="pitch-wrap">
        {banner && <div className="goal-banner">{banner}</div>}
        <div className="pitch" style={{ gridTemplateColumns: `repeat(${FIELD_WIDTH + 2}, 1fr)` }}>
          {Array.from({ length: FIELD_HEIGHT }, (_, y) =>
            Array.from({ length: FIELD_WIDTH + 2 }, (_, x) => {
              const pos = { x, y };
              const edge = x === 0 || x === FIELD_WIDTH + 1;
              const gate = isGate(x, y);
              const p1 = board.team1.findIndex((p) => samePos(p, pos));
              const p2 = board.team2.findIndex((p) => samePos(p, pos));
              const isBall = samePos(board.ball, pos);
              const hl = highlighted.some((c) => samePos(c, pos));
              const isSelected = selected && mySide && samePos(team(board, mySide)[selected.id], pos);
              const ghost = canPlan && mySide && planned.some((m) => !samePos(m.from, m.to) && samePos(m.from, pos) && m.move_type !== MoveType.Pass && m.move_type !== MoveType.Shot);
              const cls = ['cell', edge ? (gate ? 'gate' : 'margin') : 'field', hl ? `hl ${mode?.toLowerCase()}` : '', isSelected ? 'selected' : '', x === 8 ? 'midline' : ''].join(' ');
              return (
                <div key={`${x}-${y}`} className={cls} onClick={() => onCell(pos)}>
                  {ghost && <span className="ghost" />}
                  {p1 >= 0 && <img className={`player t1 ${holder?.side === Side.Team1 && holder.id === p1 ? 'has-ball' : ''}`} src="/Player1.png" alt="" />}
                  {p2 >= 0 && <img className={`player t2 ${holder?.side === Side.Team2 && holder.id === p2 ? 'has-ball' : ''}`} src="/Player2.png" alt="" />}
                  {isBall && <img className="ball" src="/ball.svg" alt="" />}
                </div>
              );
            }),
          )}
        </div>
      </div>

      {canPlan && (
        <div className="planner">
          <p className="muted small">
            Tap a player to pick a move ({selected && mode ? `now: ${MODE_LABEL[mode]}, tap again to switch` : 'run, pass, shot or tackle'}), then tap a highlighted cell. Tap a moved player to undo.
          </p>
          <div className="row">
            <span>{planned.length} move{planned.length === 1 ? '' : 's'} planned</span>
            <button className="primary" disabled={busy || planned.length === 0} onClick={commit}>
              {busy ? 'Sending…' : 'Ready'}
            </button>
          </div>
        </div>
      )}
      {active && committed && <p className="center pulse">Moves locked in. Waiting for the opponent…</p>}
      {active && !mySide && <p className="center muted">You are watching this game.</p>}

      {lastTurn && lastTurn.rolls.length > 0 && <p className="muted small center">Last turn had {lastTurn.rolls.length} contested ball{lastTurn.rolls.length === 1 ? '' : 's'} (rolls: {[...lastTurn.rolls].join(', ')}).</p>}

      {!active && (
        <section className="card result">
          <h2>{resultText(game)}</h2>
          {game.team1.elo_after !== undefined && game.team2.elo_after !== undefined && (
            <p>
              ELO: {game.team1.name} {eloDelta(game.team1.elo_before, game.team1.elo_after)}, {game.team2.name} {eloDelta(game.team2.elo_before, game.team2.elo_after)}
            </p>
          )}
          <button className="primary" onClick={() => navigate('#/')}>
            Back to lobby
          </button>
        </section>
      )}

      {active && mySide && (
        <p className="center">
          <button className="link" onClick={surrender}>
            Give up
          </button>
        </p>
      )}
      {error && <p className="error center">{error}</p>}
    </div>
  );
}

function eloDelta(before: bigint, after: bigint): string {
  const d = (Number(after) - Number(before)) / 100;
  return `${d >= 0 ? '+' : ''}${d.toFixed(2)}`;
}

function resultText(g: GameView): string {
  const winner = g.winner === Side.Team1 ? g.team1.name : g.winner === Side.Team2 ? g.team2.name : null;
  switch (g.status) {
    case GameStatus.Finished:
      return winner ? `${winner} won ${g.score1}:${g.score2}` : `Draw ${g.score1}:${g.score2}`;
    case GameStatus.FinishedByTimeout:
      return `${winner} won on time`;
    case GameStatus.Surrendered:
      return `${winner} won, the opponent gave up`;
    case GameStatus.Abandoned:
      return 'Game abandoned: nobody moved in time';
    default:
      return '';
  }
}
