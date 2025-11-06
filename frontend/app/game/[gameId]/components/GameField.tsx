import { Game, TeamPlayer } from '@/lib/game';
import { CellState, CellType } from '../types';

interface GameFieldProps {
    game: Game;
    cellStates: CellState[][];
    currentMode: string | null;
    isDebugMode: boolean;
    onCellClick: (cell: CellState) => void;
    isHasOldState: (player: TeamPlayer) => boolean;
    isHasOldStateBall: () => boolean;
}

export default function GameField({
    game,
    cellStates,
    currentMode,
    isDebugMode,
    onCellClick,
    isHasOldState,
    isHasOldStateBall
}: GameFieldProps) {
    return (
        <div className="field">
            <div className="grid grid-cols-[repeat(17,1fr)] grid-rows-[repeat(11,1fr)] absolute inset-0 w-full h-full">
                {game.team1.players.map((player, index) => (
                    <div key={index} className={`player team1 player${player.key()} ${isHasOldState(player) ? 'action-done' : ''}`}
                        style={{
                            gridRow: player.position.y + 1,
                            gridColumn: player.position.x + 1
                        }}>
                        {isDebugMode && (
                            <div className="absolute -top-2 -left-2 bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                                {index}
                            </div>
                        )}
                    </div>
                ))}
                {game.team2.players.map((player, index) => (
                    <div key={index} className={`player team2 player${player.key()} ${isHasOldState(player) ? 'action-done' : ''}`}
                        style={{
                            gridRow: player.position.y + 1,
                            gridColumn: player.position.x + 1
                        }}>
                        {isDebugMode && (
                            <div className="absolute -top-2 -left-2 bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                                {index}
                            </div>
                        )}
                    </div>
                ))}
                <div className={`ball ${game.ball.ownerTeam != null ? game.ball.ownerTeam : ''} ${isHasOldStateBall() ? 'action-done' : ''}`} style={{
                    gridRow: game.ball.position.y + 1,
                    gridColumn: game.ball.position.x + 1
                }} />

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

