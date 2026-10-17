'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast, ToastContainer } from 'react-toastify';
import { ConnectWallet } from '@coinbase/onchainkit/wallet';
import 'react-toastify/dist/ReactToastify.css';
import './game.css';
import {
    api, errorText, formatElo, nsToMs, ok,
    FrameKind, GameStatus, MoveType, Side,
    type Board, type GameView, type Move, type Pos, type TurnRecord,
} from '@/lib/backend';
import { availableCells, ballHolder, loadEngine, modesFor, newGameBoard, planMove, previewBoard, samePos, team } from '@/lib/engine';
import { useSession } from '@/app/session';
import { ChainBadge } from '@/app/components/ChainBadge';
import GameTipsModal from './GameTipsModal';

// Game submission state enum
enum GameSubmissionState {
    IDLE = 'idle',
    COMMITTING = 'committing',
    WAITING_FOR_OPPONENT = 'waiting_for_opponent',
}

const FIELD_WIDTH = 17;
const FIELD_HEIGHT = 11;
const POLL_MS = 1500;
const FRAME_MS = 400;

/** One step of the game's history, as v1's history list. */
interface HistoryState {
    board: Board;
    kind: FrameKind;
    turn: number;
}

const sideClass = (side: Side | undefined) => (side === Side.Team1 ? 'team1' : side === Side.Team2 ? 'team2' : '');
const modeClass = (mode: MoveType | undefined) => (mode ? mode.toLowerCase() : '');

/** History entries for a turn: a goal shows the goal and the kick-off after it. */
function historyOf(turn: TurnRecord): HistoryState[] {
    const goalAt = turn.frames.findIndex((f) => f.kind === FrameKind.GoalTeam1 || f.kind === FrameKind.GoalTeam2);
    const last = turn.frames[turn.frames.length - 1];
    if (goalAt >= 0) {
        return [
            { board: turn.frames[goalAt].board, kind: turn.frames[goalAt].kind, turn: turn.turn },
            { board: last.board, kind: FrameKind.StartPositions, turn: turn.turn },
        ];
    }
    return [{ board: last.board, kind: FrameKind.Move, turn: turn.turn }];
}

export default function GamePage() {
    const params = useSearchParams();
    const gameIdText = params.get('id') ?? '';
    const gameId = /^\d+$/.test(gameIdText) ? BigInt(gameIdText) : null;

    const { isConnected: walletConnected, session, ensureSignedIn } = useSession();
    // Signed in with email, or a wallet is connected (it signs in on first move).
    const isConnected = walletConnected || Boolean(session);
    const [game, setGame] = useState<GameView | null>(null);
    const [history, setHistory] = useState<HistoryState[]>([]);
    const [animBoard, setAnimBoard] = useState<Board | null>(null);
    const [planned, setPlanned] = useState<Move[]>([]);
    const [selected, setSelected] = useState<{ id: number; modeIndex: number } | null>(null);
    const [showTips, setShowTips] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [submission, setSubmission] = useState<GameSubmissionState>(GameSubmissionState.IDLE);
    const [currentHistoryIndex, setCurrentHistoryIndex] = useState<number>(0);
    const [isDebugMode, setIsDebugMode] = useState(false);
    const [now, setNow] = useState(Date.now());
    const [resultOpen, setResultOpen] = useState(false);
    const [lastRolls, setLastRolls] = useState<number[]>([]);

    const version = useRef<bigint>(-1n);
    const turnsSeen = useRef<number>(-1);
    const animating = useRef(false);
    const wasActive = useRef<boolean | null>(null);

    const animate = useCallback(async (turns: TurnRecord[]) => {
        animating.current = true;
        for (const t of turns) {
            for (const f of t.frames) {
                setAnimBoard(f.board);
                if (f.kind === FrameKind.GoalTeam1 || f.kind === FrameKind.GoalTeam2) {
                    toast.success(`🎉 Goal!`);
                    await new Promise((r) => setTimeout(r, 1200));
                } else {
                    await new Promise((r) => setTimeout(r, FRAME_MS));
                }
            }
        }
        setAnimBoard(null);
        animating.current = false;
    }, []);

    // Polls the canister; replaces v1's Ably game channel.
    const fetchGameData = useCallback(async () => {
        if (gameId === null) return;
        try {
            await loadEngine();
            const g = await api().get_game(gameId);
            if (!g) throw new Error('Game not found');
            if (g.version === version.current) return;
            version.current = g.version;
            const previous = turnsSeen.current;
            turnsSeen.current = g.turns_played;

            if (previous < 0) {
                // First load: the whole history, from kick-off.
                const turns: TurnRecord[] = [];
                while (turns.length < g.turns_played) {
                    const page = await api().get_turns(gameId, turns.length + 1, 50);
                    if (page.length === 0) break;
                    turns.push(...page);
                }
                const start: HistoryState = { board: newGameBoard(), kind: FrameKind.StartPositions, turn: 0 };
                const all = [start, ...turns.flatMap(historyOf)];
                setHistory(all);
                setCurrentHistoryIndex(all.length - 1);
                setLastRolls(turns.length ? [...turns[turns.length - 1].rolls] : []);
            } else if (g.turns_played > previous) {
                const turns = await api().get_turns(gameId, previous + 1, 50);
                setHistory((h) => {
                    const all = [...h, ...turns.flatMap(historyOf)];
                    setCurrentHistoryIndex(all.length - 1);
                    return all;
                });
                setLastRolls(turns.length ? [...turns[turns.length - 1].rolls] : []);
                setPlanned([]);
                setSelected(null);
                setSubmission(GameSubmissionState.IDLE);
                animate(turns);
            }

            const mine = g.my_side === Side.Team1 ? g.committed1 : g.my_side === Side.Team2 ? g.committed2 : false;
            if (g.status === GameStatus.Active && mine) {
                setSubmission(GameSubmissionState.WAITING_FOR_OPPONENT);
                if (g.my_pending) setPlanned(g.my_pending);
            } else if (g.status !== GameStatus.Active) {
                setSubmission(GameSubmissionState.IDLE);
            }
            if (wasActive.current === true && g.status !== GameStatus.Active) setResultOpen(true);
            wasActive.current = g.status === GameStatus.Active;
            setGame(g);
            setError(null);
        } catch (err) {
            setError(errorText(err));
        } finally {
            setIsLoading(false);
        }
    }, [gameId, animate]);

    useEffect(() => {
        version.current = -1n;
        turnsSeen.current = -1;
        wasActive.current = null;
        if (gameId === null) {
            setError('Game not found');
            setIsLoading(false);
            return;
        }
        fetchGameData();
        const poll = setInterval(fetchGameData, POLL_MS);
        const clock = setInterval(() => setNow(Date.now()), 500);
        return () => {
            clearInterval(poll);
            clearInterval(clock);
        };
        // The session key changes after sign-in, which changes `my_side`.
    }, [fetchGameData, gameId, session]);

    // Debug mode detection effect
    useEffect(() => {
        setIsDebugMode(params.has('debug'));
    }, [params]);

    const mySide = game?.my_side;
    const active = game?.status === GameStatus.Active;
    const latest = currentHistoryIndex >= history.length - 1;
    const canPlan = !!game && active && !!mySide && submission === GameSubmissionState.IDLE && latest && !animating.current;

    // What the field shows: an animation frame, a history state, or the live
    // board with our planned moves applied.
    const board: Board | null = useMemo(() => {
        if (!game) return null;
        if (animBoard) return animBoard;
        if (!latest && history[currentHistoryIndex]) return history[currentHistoryIndex].board;
        return mySide && planned.length ? previewBoard(game.board, mySide, planned) : game.board;
    }, [game, animBoard, latest, history, currentHistoryIndex, mySide, planned]);

    const modes = selected && game && mySide ? modesFor(game.board, mySide, selected.id) : [];
    const currentMode = selected ? modes[selected.modeIndex % modes.length] : undefined;
    const highlighted: Pos[] = useMemo(() => {
        if (!canPlan || !selected || !currentMode || !game || !mySide) return [];
        return availableCells(game.board, mySide, selected.id, currentMode, planned);
    }, [canPlan, selected, currentMode, game, mySide, planned]);

    const clearSelection = () => setSelected(null);

    const onCellClick = (x: number, y: number) => {
        if (!game || !board) return;
        const pos = { x, y };
        if (!canPlan || !mySide) {
            if (active && !mySide && board.team1.concat(board.team2).some((p) => samePos(p, pos))) {
                toast.info(isConnected ? 'You are watching this game.' : 'Connect your wallet or sign in with email to play.');
            }
            return;
        }

        if (selected && currentMode && highlighted.some((c) => samePos(c, pos))) {
            setPlanned(planMove(game.board, mySide, planned, selected.id, currentMode, pos));
            clearSelection();
            return;
        }

        // A player of ours, at their planned spot or where they stand now.
        const shown = team(board, mySide);
        const start = team(game.board, mySide);
        let id = shown.findIndex((p) => samePos(p, pos));
        if (id < 0) id = start.findIndex((p) => samePos(p, pos));
        if (id < 0) {
            const opponent = team(board, mySide === Side.Team1 ? Side.Team2 : Side.Team1).some((p) => samePos(p, pos));
            if (opponent) alert(`You cannot move opponent's player!`);
            clearSelection();
            return;
        }
        if (selected?.id === id) {
            // Same player again: next move type, as in v1.
            setSelected({ id, modeIndex: selected.modeIndex + 1 });
            return;
        }
        if (planned.some((m) => m.player_id === id)) {
            // Undo this player's move.
            setPlanned(planned.filter((m) => m.player_id !== id));
            clearSelection();
            return;
        }
        setSelected({ id, modeIndex: 0 });
    };

    const handleReady = async () => {
        if (!game) return;
        if (planned.length === 0) {
            toast.error('No moves to commit');
            return;
        }
        setSubmission(GameSubmissionState.COMMITTING);
        try {
            await ensureSignedIn();
            const r = ok(await api().commit_moves(game.id, game.turns_played + 1, planned));
            clearSelection();
            setSubmission(r.resolved ? GameSubmissionState.IDLE : GameSubmissionState.WAITING_FOR_OPPONENT);
            await fetchGameData();
        } catch (err) {
            toast.error(`Failed to commit move: ${errorText(err)}`);
            setSubmission(GameSubmissionState.IDLE);
        }
    };

    const handleSurrender = async () => {
        if (!game || !confirm('Give up this game? It counts as a 0:3 loss.')) return;
        try {
            await ensureSignedIn();
            ok(await api().surrender(game.id));
            await fetchGameData();
        } catch (err) {
            toast.error(errorText(err));
        }
    };

    // History navigation functions
    const goToHistoryIndex = (index: number) => {
        if (index < 0 || index >= history.length) return;
        setCurrentHistoryIndex(index);
        clearSelection();
    };
    const goToPreviousState = () => goToHistoryIndex(currentHistoryIndex - 1);
    const goToNextState = () => goToHistoryIndex(currentHistoryIndex + 1);
    const goToLatestState = () => goToHistoryIndex(history.length - 1);

    const getHistoryDescription = (index: number) => {
        const state = history[index];
        if (!state || !game) return '';
        if (index === 0) return 'Initial Positions';
        if (state.kind === FrameKind.GoalTeam1) return `Goal! ${game.team1.name}`;
        if (state.kind === FrameKind.GoalTeam2) return `Goal! ${game.team2.name}`;
        if (state.kind === FrameKind.StartPositions) return `Kick-off after move ${state.turn}`;
        return `Move ${state.turn}`;
    };

    const secondsLeft = game ? Math.max(0, Math.ceil((nsToMs(game.turn_deadline) - now) / 1000)) : 0;
    const holder = board ? ballHolder(board) : undefined;
    const movedIds = new Set(canPlan || submission !== GameSubmissionState.IDLE ? planned.filter((m) => m.move_type !== MoveType.Pass && m.move_type !== MoveType.Shot).map((m) => m.player_id) : []);
    const ballMoved = planned.some((m) => m.move_type === MoveType.Pass || m.move_type === MoveType.Shot);
    const selectedPos = selected && board && mySide ? team(board, mySide)[selected.id] : undefined;

    const statusText = (s: GameStatus) =>
        s === GameStatus.Active ? 'ACTIVE' : s === GameStatus.Finished ? 'FINISHED' : s === GameStatus.FinishedByTimeout ? 'FINISHED_BY_TIMEOUT' : s === GameStatus.Surrendered ? 'SURRENDERED' : 'ABANDONED';

    const finishReason = (g: GameView) => {
        switch (g.status) {
            case GameStatus.Finished:
                return 'Maximum moves reached';
            case GameStatus.FinishedByTimeout:
                return 'Move timeout';
            case GameStatus.Surrendered:
                return 'A team gave up';
            case GameStatus.Abandoned:
                return 'Nobody moved in time (not counted)';
            default:
                return '';
        }
    };

    const eloDelta = (before: bigint, after?: bigint) => {
        if (after === undefined) return '';
        const d = Number(after) - Number(before);
        return `${d >= 0 ? '+' : '-'}${formatElo(Math.abs(d))}`;
    };

    return (
        <div className="min-h-screen bg-green-100 p-2 sm:p-4">
            {/* Game Loading Popup */}
            {isLoading && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-in fade-in duration-300">
                    <div className="bg-white rounded-lg p-8 shadow-2xl max-w-md mx-4 animate-in zoom-in-95 duration-300">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-green-600 mx-auto mb-4"></div>
                            <h3 className="text-xl font-semibold text-gray-800 mb-2">Loading Game</h3>
                            <p className="text-gray-600">Loading game {gameIdText}...</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Error Display */}
            {error && !game && !isLoading && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-in fade-in duration-300">
                    <div className="bg-white rounded-lg p-8 shadow-2xl max-w-md mx-4 animate-in zoom-in-95 duration-300">
                        <div className="text-center">
                            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-semibold text-gray-800 mb-2">
                                {error.includes('Game not found') ? 'Game Not Found' : 'Error Loading Game'}
                            </h3>
                            <p className="text-gray-600 mb-6">
                                {error.includes('Game not found')
                                    ? `The game with ID ${gameIdText} was not found.`
                                    : error
                                }
                            </p>
                            <div className="flex gap-3 justify-center">
                                <button
                                    onClick={() => window.location.href = '/'}
                                    className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                                >
                                    Go Back
                                </button>
                                <button
                                    onClick={() => fetchGameData()}
                                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                    Try Again
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {game && board && (

                <div className="max-w-6xl mx-auto">
                    {/* Back to Main - only show if game is not active */}
                    {!active && (
                        <div className="flex justify-start mb-4">
                            <a
                                href="/"
                                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 underline transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                                Back to Main
                            </a>
                        </div>
                    )}

                    <h1 className="text-2xl sm:text-3xl font-bold text-center mb-4 sm:mb-6">TactiBall Game #{gameIdText}</h1>

                    {/* Tips Modal */}
                    <GameTipsModal
                        isOpen={showTips}
                        onClose={() => setShowTips(false)}
                        isConnected={isConnected}
                        mySide={mySide}
                    />

                    {/* Game Info */}
                    <div className="mb-6">
                        {/* Scores Row */}
                        <div className="flex justify-center gap-6 sm:gap-12 mb-4">
                            <div className={`text-center ${mySide === Side.Team1 ? 'ring-4 ring-yellow-400 ring-opacity-75 rounded-lg p-3' : ''}`}>
                                <div className={`text-lg font-semibold text-blue-600`}>{game.team1.name} <ChainBadge chain={game.team1.home_chain} /></div>
                                <div className={`text-3xl font-bold text-blue-600`}>{game.score1}</div>
                                {mySide === Side.Team1 && <div className="text-xs text-yellow-600 font-semibold mt-1">YOUR TEAM</div>}
                            </div>
                            <div className={`text-center ${mySide === Side.Team2 ? 'ring-4 ring-yellow-400 ring-opacity-75 rounded-lg p-3' : ''}`}>
                                <div className={`text-lg font-semibold text-red-600`}>{game.team2.name} <ChainBadge chain={game.team2.home_chain} /></div>
                                <div className={`text-3xl font-bold text-red-600`}>{game.score2}</div>
                                {mySide === Side.Team2 && <div className="text-xs text-yellow-600 font-semibold mt-1">YOUR TEAM</div>}
                            </div>
                        </div>

                        {/* Game Info Row */}
                        <div className="text-center">
                            <div className="text-sm text-gray-600 inline-block bg-white px-4 py-2 rounded-lg shadow-sm">
                                Game ID: {gameIdText} | Status: {statusText(game.status)}
                                {active && <> | Move {game.turns_played + 1} / {game.max_turns} | <span className={secondsLeft <= 10 ? 'text-red-600 font-semibold' : ''}>{secondsLeft}s left</span></>}
                                {isDebugMode && (
                                    <span className="ml-2 px-2 py-1 bg-yellow-500 text-black text-xs font-bold rounded">
                                        DEBUG MODE
                                    </span>
                                )}
                            </div>
                            {active && (
                                <div className="text-xs text-gray-600 mt-2">
                                    {game.team1.name}: {game.committed1 ? '✅ ready' : '🤔 thinking'} · {game.team2.name}: {game.committed2 ? '✅ ready' : '🤔 thinking'}
                                    {lastRolls.length > 0 && <> · last move had {lastRolls.length} contested ball{lastRolls.length === 1 ? '' : 's'}</>}
                                </div>
                            )}
                        </div>
                    </div>

                    {!latest && (
                        <div className="mb-4 bg-yellow-100 border border-yellow-300 rounded-lg p-3 text-center">
                            <div className="text-yellow-800 font-medium">
                                📜 Viewing Historical State - {getHistoryDescription(currentHistoryIndex)}
                            </div>
                            <div className="text-sm text-yellow-600 mt-1">
                                Use the history controls below to navigate or click &quot;Move to Latest State&quot; to return to current game
                            </div>
                        </div>
                    )}
                    {/* How to Play Button - Above Field, Aligned with Field Right Edge */}
                    <div className="flex justify-end mb-1" style={{ maxWidth: '800px', margin: '0 auto' }}>
                        <button
                            onClick={() => setShowTips(!showTips)}
                            className="flex items-center gap-1 text-xs bg-white bg-opacity-90 hover:bg-opacity-100 text-gray-700 hover:text-gray-900 px-2 py-1 rounded shadow-sm transition-all duration-200"
                        >
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                            </svg>
                            How to play?
                        </button>
                    </div>

                    <div className="field">
                        <div className="grid grid-cols-[repeat(17,1fr)] grid-rows-[repeat(11,1fr)] absolute inset-0 w-full h-full">
                            {board.team1.map((p, index) => (
                                <div key={`t1-${index}`} className={`player team1 player${index} ${mySide === Side.Team1 && movedIds.has(index) ? 'action-done' : ''} ${holder?.side === Side.Team1 && holder.id === index ? 'has-ball' : ''}`}
                                    style={{ gridRow: p.y + 1, gridColumn: p.x + 1 }}>
                                    {isDebugMode && (
                                        <div className="absolute -top-2 -left-2 bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                                            {index}
                                        </div>
                                    )}
                                </div>
                            ))}
                            {board.team2.map((p, index) => (
                                <div key={`t2-${index}`} className={`player team2 player${index} ${mySide === Side.Team2 && movedIds.has(index) ? 'action-done' : ''} ${holder?.side === Side.Team2 && holder.id === index ? 'has-ball' : ''}`}
                                    style={{ gridRow: p.y + 1, gridColumn: p.x + 1 }}>
                                    {isDebugMode && (
                                        <div className="absolute -top-2 -left-2 bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                                            {index}
                                        </div>
                                    )}
                                </div>
                            ))}
                            <div className={`ball ${sideClass(board.ball_owner)} ${canPlan && ballMoved ? 'action-done' : ''}`} style={{
                                gridRow: board.ball.y + 1,
                                gridColumn: board.ball.x + 1
                            }} />

                            {Array.from({ length: FIELD_WIDTH }, (_, x) =>
                                Array.from({ length: FIELD_HEIGHT }, (_, y) => {
                                    const isHighlighted = highlighted.some((c) => c.x === x && c.y === y);
                                    const isMargin = x === 0 || x === FIELD_WIDTH - 1;
                                    const isSelected = selectedPos && selectedPos.x === x && selectedPos.y === y;
                                    return (
                                        <div
                                            onClick={() => onCellClick(x, y)}
                                            key={`${x}-${y}`}
                                            data-cell={`${x}-${y}`}
                                            className={`field-cell relative cell-${x}-${y} ${isHighlighted ? `highlighted ${modeClass(currentMode)}` : ''} ${isMargin ? 'field_margin' : 'field_cell'} ${isSelected ? 'ring-2 ring-yellow-300 ring-inset' : ''}`}
                                            style={{ gridRow: y + 1, gridColumn: x + 1 }}
                                        />
                                    );
                                }),
                            )}
                        </div>
                    </div>

                    {canPlan && (
                        <div className="mt-2 text-center text-sm text-gray-700">
                            {selected && currentMode
                                ? <>Player {selected.id}: <b>{currentMode}</b>{modes.length > 1 && <> (tap again for {modes.filter((m) => m !== currentMode).join(' / ')})</>}</>
                                : <>{planned.length} move{planned.length === 1 ? '' : 's'} planned. Tap a player to plan a move.</>}
                        </div>
                    )}

                    {/* Ready Button or Connect Wallet */}
                    <div className="mt-4 flex justify-center">
                        {!isConnected ? (
                            <div className="flex items-center gap-3">
                                <ConnectWallet className="bg-black px-4 py-2 rounded-lg hover:bg-gray-800 custom-connect-wallet">
                                    Connect Wallet
                                </ConnectWallet>
                                <a href="/" className="text-sm text-blue-600 hover:underline">or sign in with email</a>
                            </div>
                        ) : active && mySide ? (
                            <button
                                onClick={handleReady}
                                disabled={planned.length === 0 || submission !== GameSubmissionState.IDLE || !latest}
                                className={`px-8 py-3 font-semibold rounded-lg transition-colors shadow-lg ${planned.length === 0
                                    ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                                    : 'bg-green-600 text-white hover:bg-green-700'
                                    }`}
                            >
                                Ready!
                            </button>
                        ) : active ? (
                            <div className="text-sm text-gray-600">You are watching this game.</div>
                        ) : null}
                    </div>
                    {active && mySide && (
                        <div className="mt-2 flex justify-center">
                            <button onClick={handleSurrender} className="text-xs text-gray-500 underline hover:text-gray-700">Give up</button>
                        </div>
                    )}

                    {/* Move History Controls */}
                    {history.length > 1 && (
                        <div className="mt-6 bg-white rounded-lg shadow-lg p-4">
                            <h3 className="text-lg font-semibold text-gray-800 mb-3 text-center">Move History</h3>
                            <div className="flex items-center justify-center gap-4 mb-3">
                                <button
                                    onClick={goToPreviousState}
                                    disabled={currentHistoryIndex === 0}
                                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${currentHistoryIndex === 0
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        : 'bg-blue-600 text-white hover:bg-blue-700'
                                        }`}
                                >
                                    ← Previous
                                </button>

                                <div className="text-center">
                                    <div className="text-sm text-gray-600 mb-1">
                                        {currentHistoryIndex + 1} of {history.length}
                                    </div>
                                    <div className="text-sm font-medium text-gray-800">
                                        {getHistoryDescription(currentHistoryIndex)}
                                    </div>
                                    {/* Progress bar */}
                                    <div className="w-32 h-2 bg-gray-200 rounded-full mt-2 overflow-hidden">
                                        <div
                                            className="h-full bg-blue-500 transition-all duration-300 ease-in-out"
                                            style={{
                                                width: `${(Math.min(history[currentHistoryIndex]?.turn ?? 0, game.max_turns) / game.max_turns) * 100}%`
                                            }}
                                        />
                                    </div>
                                </div>

                                <button
                                    onClick={goToNextState}
                                    disabled={latest}
                                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${latest
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        : 'bg-blue-600 text-white hover:bg-blue-700'
                                        }`}
                                >
                                    Next →
                                </button>
                            </div>

                            <div className="flex justify-center">
                                <button
                                    onClick={goToLatestState}
                                    disabled={latest}
                                    className={`px-6 py-2 rounded-lg font-medium transition-colors ${latest
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        : 'bg-green-600 text-white hover:bg-green-700'
                                        }`}
                                >
                                    Move to Latest State
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Toast Container for notifications */}
            <ToastContainer
                position="top-right"
                autoClose={5000}
                hideProgressBar={false}
                newestOnTop={false}
                closeOnClick
                rtl={false}
                pauseOnFocusLoss
                draggable
                pauseOnHover
                theme="light"
            />

            {/* Game Result Modal */}
            {resultOpen && game && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-in fade-in duration-300"
                    onClick={() => setResultOpen(false)}
                >
                    <div
                        className="bg-white rounded-lg p-8 shadow-2xl max-w-md mx-4 animate-in zoom-in-95 duration-300"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="text-center">
                            {/* Trophy Icon */}
                            <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                <svg className="w-12 h-12 text-yellow-600" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                </svg>
                            </div>

                            {/* Game Finished Title */}
                            <h2 className="text-2xl font-bold text-gray-800 mb-4">Game Finished!</h2>

                            {/* Winner Display */}
                            {game.winner === undefined ? (
                                <div className="mb-6">
                                    <div className="text-xl font-semibold text-gray-600 mb-2">{game.status === GameStatus.Abandoned ? 'No result' : "It's a Draw!"}</div>
                                    <div className="text-sm text-gray-500">{game.status === GameStatus.Abandoned ? 'Neither team moved in time' : 'Both teams played equally well'}</div>
                                </div>
                            ) : (
                                <div className="mb-6">
                                    <div className="text-xl font-semibold text-gray-800 mb-2">🏆 Winner:</div>
                                    <div className={`text-2xl font-bold animate-pulse ${game.winner === Side.Team1 ? 'text-blue-600' : 'text-red-600'}`}>
                                        {game.winner === Side.Team1 ? game.team1.name : game.team2.name}
                                    </div>
                                    {game.winner === mySide && (
                                        <div className="text-sm text-green-600 font-semibold mt-2">🎉 Congratulations! You won!</div>
                                    )}
                                </div>
                            )}

                            {/* Final Score */}
                            <div className="bg-gray-50 rounded-lg p-4 mb-6">
                                <div className="text-sm text-gray-600 mb-2">Final Score</div>
                                <div className="flex justify-center items-center gap-4">
                                    <div className="text-center">
                                        <div className="text-lg font-semibold text-blue-600">{game.team1.name}</div>
                                        <div className="text-2xl font-bold text-blue-600">{game.score1}</div>
                                        <div className="text-xs text-gray-500">{eloDelta(game.team1.elo_before, game.team1.elo_after)}</div>
                                    </div>
                                    <div className="text-gray-400 text-xl">-</div>
                                    <div className="text-center">
                                        <div className="text-lg font-semibold text-red-600">{game.team2.name}</div>
                                        <div className="text-2xl font-bold text-red-600">{game.score2}</div>
                                        <div className="text-xs text-gray-500">{eloDelta(game.team2.elo_before, game.team2.elo_after)}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Finish Reason */}
                            <div className="mb-6">
                                <div className="text-sm text-gray-600 mb-1">Game ended by:</div>
                                <div className="text-lg font-medium text-gray-800">{finishReason(game)}</div>
                            </div>

                            {/* Game Info */}
                            <div className="text-sm text-gray-500 mb-6">
                                Game #{gameIdText}{game.finished_at !== undefined && <> • {new Date(nsToMs(game.finished_at)).toLocaleString()}</>}
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-3 justify-center">
                                <button
                                    onClick={() => {
                                        setResultOpen(false);
                                        goToLatestState();
                                    }}
                                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                                >
                                    View Final State
                                </button>
                                <button
                                    onClick={() => setResultOpen(false)}
                                    className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                                >
                                    Close
                                </button>
                                <button
                                    onClick={() => window.location.href = '/'}
                                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                    Back to Home
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Game Submission Status Popup */}
            {submission !== GameSubmissionState.IDLE && active && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-in fade-in duration-300">
                    <div className="bg-white rounded-lg p-8 shadow-2xl max-w-md mx-4 animate-in zoom-in-95 duration-300">
                        <div className="text-center">
                            {submission === GameSubmissionState.COMMITTING && (
                                <>
                                    <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
                                    <h3 className="text-xl font-semibold text-gray-800 mb-2">Committing Your Moves</h3>
                                    <p className="text-gray-600">Sending your moves to the game canister...</p>
                                </>
                            )}
                            {submission === GameSubmissionState.WAITING_FOR_OPPONENT && (
                                <>
                                    <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-yellow-600 mx-auto mb-4"></div>
                                    <h3 className="text-xl font-semibold text-gray-800 mb-2">Your Moves Submitted!</h3>
                                    <p className="text-gray-600">Your moves are locked in. Waiting for your opponent to make moves...</p>

                                    {secondsLeft > 0 ? (
                                        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                            <div className="text-yellow-800 font-medium mb-1">⏱️ Timeout Warning</div>
                                            <p className="text-yellow-600 text-sm">
                                                Opponent has {secondsLeft}s left. If they miss it, you win 3:0.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                                            <div className="text-red-800 font-medium mb-2">⏰ Game Timeout</div>
                                            <p className="text-red-600 text-sm">Your opponent ran out of time. Finishing the game...</p>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
