import { Game, TeamEnum } from '@/lib/game';

interface GameInfoProps {
    game: Game;
    currentTeam: any;
    isDebugMode: boolean;
}

export default function GameInfo({ game, currentTeam, isDebugMode }: GameInfoProps) {
    return (
        <div className="mb-6">
            {/* Scores Row */}
            <div className="flex justify-center gap-6 sm:gap-12 mb-4">
                <div className={`text-center ${currentTeam?.enum === TeamEnum.TEAM1 ? 'ring-4 ring-yellow-400 ring-opacity-75 rounded-lg p-3' : ''}`}>
                    <div className={`text-lg font-semibold text-blue-600`}>{game.team1.name}</div>
                    <div className={`text-3xl font-bold text-blue-600`}>{game.team1.score}</div>
                    {currentTeam?.enum === TeamEnum.TEAM1 && <div className="text-xs text-yellow-600 font-semibold mt-1">YOUR TURN</div>}
                </div>
                <div className={`text-center ${currentTeam?.enum === TeamEnum.TEAM2 ? 'ring-4 ring-yellow-400 ring-opacity-75 rounded-lg p-3' : ''}`}>
                    <div className={`text-lg font-semibold text-red-600`}>{game.team2.name}</div>
                    <div className={`text-3xl font-bold text-red-600`}>{game.team2.score}</div>
                    {currentTeam?.enum === TeamEnum.TEAM2 && <div className="text-xs text-yellow-600 font-semibold mt-1">YOUR TURN</div>}
                </div>
            </div>

            {/* Game Info Row */}
            <div className="text-center">
                <div className="text-sm text-gray-600 inline-block bg-white px-4 py-2 rounded-lg shadow-sm">
                    Game ID: {game.gameId} | Status: {game.status}
                    {isDebugMode && (
                        <span className="ml-2 px-2 py-1 bg-yellow-500 text-black text-xs font-bold rounded">
                            DEBUG MODE
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

