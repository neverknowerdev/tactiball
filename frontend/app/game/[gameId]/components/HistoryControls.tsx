import { Game } from '@/lib/game';

interface HistoryControlsProps {
    game: Game;
    currentHistoryIndex: number;
    getHistoryDescription: (index: number) => string;
    goToPreviousState: () => void;
    goToNextState: () => void;
    goToLatestState: () => void;
}

export default function HistoryControls({
    game,
    currentHistoryIndex,
    getHistoryDescription,
    goToPreviousState,
    goToNextState,
    goToLatestState
}: HistoryControlsProps) {
    if (game.history.length <= 1) return null;

    return (
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
                        {currentHistoryIndex + 1} of 45
                    </div>
                    <div className="text-sm font-medium text-gray-800">
                        {getHistoryDescription(currentHistoryIndex)}
                    </div>
                    {/* Progress bar */}
                    <div className="w-32 h-2 bg-gray-200 rounded-full mt-2 overflow-hidden">
                        <div
                            className="h-full bg-blue-500 transition-all duration-300 ease-in-out"
                            style={{
                                width: `${((currentHistoryIndex + 1) / 45) * 100}%`
                            }}
                        />
                    </div>
                </div>

                <button
                    onClick={goToNextState}
                    disabled={currentHistoryIndex === game.history.length - 1}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${currentHistoryIndex === game.history.length - 1
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
                    disabled={currentHistoryIndex === game.history.length - 1}
                    className={`px-6 py-2 rounded-lg font-medium transition-colors ${currentHistoryIndex === game.history.length - 1
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                >
                    Move to Latest State
                </button>
            </div>
        </div>
    );
}

