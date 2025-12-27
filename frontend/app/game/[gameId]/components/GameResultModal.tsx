import { Game, TeamEnum } from '@/lib/game';

interface GameResultModalProps {
    isOpen: boolean;
    game: Game | null;
    currentTeam: any;
    winner: number;
    finishReason: number;
    gameId: number;
    timestamp: number;
    onClose: () => void;
    onViewFinalState: () => void;
}

export default function GameResultModal({
    isOpen,
    game,
    currentTeam,
    winner,
    finishReason,
    gameId,
    timestamp,
    onClose,
    onViewFinalState
}: GameResultModalProps) {
    if (!isOpen || !game) return null;

    return (
        <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-in fade-in duration-300"
            onClick={onClose}
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
                    {winner === 0 ? (
                        <div className="mb-6">
                            <div className="text-xl font-semibold text-gray-600 mb-2">It's a Draw!</div>
                            <div className="text-sm text-gray-500">Both teams played equally well</div>
                        </div>
                    ) : (
                        <div className="mb-6">
                            <div className="text-xl font-semibold text-gray-800 mb-2">🏆 Winner:</div>
                            <div className={`text-2xl font-bold animate-pulse ${winner === 1 ? 'text-blue-600' : 'text-red-600'}`}>
                                {winner === 1 ? game.team1.name : game.team2.name}
                            </div>
                            {winner === (currentTeam?.enum === TeamEnum.TEAM1 ? 1 : 2) && (
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
                                <div className="text-2xl font-bold text-blue-600">{game.team1.score}</div>
                            </div>
                            <div className="text-gray-400 text-xl">-</div>
                            <div className="text-center">
                                <div className="text-lg font-semibold text-red-600">{game.team2.name}</div>
                                <div className="text-2xl font-bold text-red-600">{game.team2.score}</div>
                            </div>
                        </div>
                    </div>

                    {/* Finish Reason */}
                    <div className="mb-6">
                        <div className="text-sm text-gray-600 mb-1">Game ended by:</div>
                        <div className="text-lg font-medium text-gray-800">
                            {finishReason === 0 ? 'Maximum moves reached' : 'Move timeout'}
                        </div>
                    </div>

                    {/* Game Info */}
                    <div className="text-sm text-gray-500 mb-6">
                        Game #{gameId} • {new Date(timestamp * 1000).toLocaleString()}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 justify-center">
                        <button
                            onClick={() => {
                                onViewFinalState();
                                onClose();
                            }}
                            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                            View Final State
                        </button>
                        <button
                            onClick={onClose}
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
    );
}

