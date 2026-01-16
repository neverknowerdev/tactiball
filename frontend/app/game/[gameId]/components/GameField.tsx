import { Game, TeamPlayer, GameState } from '@/lib/game';
import { CellState, CellType } from '../types';

interface GameFieldProps {
    game: Game;
    cellStates: CellState[][];
    currentMode: string | null;
    isDebugMode: boolean;
    onCellClick: (cell: CellState) => void;
    isHasOldState: (player: TeamPlayer) => boolean;
    isHasOldStateBall: () => boolean;
    animatedState?: GameState | null; // Optional animated state to render instead of game state
}

export default function GameField({
    game,
    cellStates,
    currentMode,
    isDebugMode,
    onCellClick,
    isHasOldState,
    isHasOldStateBall,
    animatedState
}: GameFieldProps) {
    // If animated state is provided, use it to render positions
    // Otherwise, use the game state
    const getPlayerPosition = (playerId: number, team: 'team1' | 'team2') => {
        if (animatedState) {
            const positions = team === 'team1' ? animatedState.team1PlayerPositions : animatedState.team2PlayerPositions;
            return positions[playerId] || { x: 0, y: 0 };
        }
        const player = team === 'team1' 
            ? game.team1.players.find(p => p.id === playerId)
            : game.team2.players.find(p => p.id === playerId);
        return player?.position || { x: 0, y: 0 };
    };

    const getBallPosition = () => {
        if (animatedState) {
            return animatedState.ballPosition;
        }
        return game.ball.position;
    };

    const getBallOwner = () => {
        if (animatedState) {
            return animatedState.ballOwner;
        }
        return game.ball.ownerTeam;
    };

    return (
        <div className="field">
            <div className="grid grid-cols-[repeat(17,1fr)] grid-rows-[repeat(11,1fr)] absolute inset-0 w-full h-full">
                {game.team1.players.map((player, index) => {
                    const position = getPlayerPosition(player.id, 'team1');
                    return (
                        <div 
                            key={`team1-${player.id}-${animatedState ? `${position.x}-${position.y}` : 'static'}`} 
                            className={`player team1 player${player.key()} ${isHasOldState(player) ? 'action-done' : ''}`}
                            style={{
                                gridRow: position.y + 1,
                                gridColumn: position.x + 1
                            }}>
                            {isDebugMode && (
                                <div className="absolute -top-2 -left-2 bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                                    {index}
                                </div>
                            )}
                        </div>
                    );
                })}
                {game.team2.players.map((player, index) => {
                    const position = getPlayerPosition(player.id, 'team2');
                    return (
                        <div 
                            key={`team2-${player.id}-${animatedState ? `${position.x}-${position.y}` : 'static'}`} 
                            className={`player team2 player${player.key()} ${isHasOldState(player) ? 'action-done' : ''}`}
                            style={{
                                gridRow: position.y + 1,
                                gridColumn: position.x + 1
                            }}>
                            {isDebugMode && (
                                <div className="absolute -top-2 -left-2 bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                                    {index}
                                </div>
                            )}
                        </div>
                    );
                })}
                <div 
                    key={`ball-${animatedState ? `animated-${animatedState.ballPosition.x}-${animatedState.ballPosition.y}` : 'static'}`}
                    className={`ball ${getBallOwner() != null ? getBallOwner() : ''} ${isHasOldStateBall() ? 'action-done' : ''}`} 
                    style={{
                        gridRow: getBallPosition().y + 1,
                        gridColumn: getBallPosition().x + 1
                    }} 
                />

                {cellStates.map((row) => (
                    row.map((cell) => (
                        <div
                            onClick={() => {
                                onCellClick(cell);
                            }}
                            key={`${cell.position.x}-${cell.position.y}`}
                            className={`field-cell relative cell-${cell.position.x}-${cell.position.y} ${cell.highlighted ? `highlighted ${currentMode || ''}` : ''} ${cell.type === CellType.FIELD_MARGIN ? 'field_margin' : 'field_cell'}`}
                            style={{
                                gridRow: cell.position.y + 1,
                                gridColumn: cell.position.x + 1
                            }}
                        />
                    ))
                ))}
            </div>
        </div>
    );
}

