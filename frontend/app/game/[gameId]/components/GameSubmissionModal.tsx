import { GameSubmissionState } from '../types';

interface GameSubmissionModalProps {
    gameSubmissionState: GameSubmissionState;
    secondsAfterLastMove: number;
    onCancelGame: () => void;
}

export default function GameSubmissionModal({
    gameSubmissionState,
    secondsAfterLastMove,
    onCancelGame
}: GameSubmissionModalProps) {
    if (gameSubmissionState === GameSubmissionState.IDLE) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-in fade-in duration-300">
            <div className="bg-white rounded-lg p-8 shadow-2xl max-w-md mx-4 animate-in zoom-in-95 duration-300">
                <div className="text-center">
                    {gameSubmissionState === GameSubmissionState.COMMITTING && (
                        <>
                            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
                            <h3 className="text-xl font-semibold text-gray-800 mb-2">Committing Your Moves</h3>
                            <p className="text-gray-600">Committing your moves to smart-contract...</p>
                        </>
                    )}
                    {gameSubmissionState === GameSubmissionState.WAITING_FOR_OPPONENT && (
                        <>
                            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-yellow-600 mx-auto mb-4"></div>
                            <h3 className="text-xl font-semibold text-gray-800 mb-2">Your Moves Submitted!</h3>
                            <p className="text-gray-600">Your moves are written. Waiting for your opponent to make moves...</p>

                            {secondsAfterLastMove > 60 ? (
                                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                                    <div className="text-red-800 font-medium mb-2">⏰ Game Timeout</div>
                                    <p className="text-red-600 text-sm mb-3">
                                        Your opponent hasn't made a move in over 1 minute. You can cancel the game if they don't respond.
                                    </p>
                                    <button
                                        onClick={onCancelGame}
                                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                                    >
                                        Cancel Game
                                    </button>
                                </div>
                            ) : secondsAfterLastMove > 0 && secondsAfterLastMove <= 60 ? (
                                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <div className="text-yellow-800 font-medium mb-1">⏱️ Timeout Warning</div>
                                    <p className="text-yellow-600 text-sm">
                                        Waiting for opponent... {60 - secondsAfterLastMove}s remaining
                                    </p>
                                </div>
                            ) : null}
                        </>
                    )}
                    {gameSubmissionState === GameSubmissionState.WAITING_FOR_CALCULATION && (
                        <>
                            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-yellow-600 mx-auto mb-4"></div>
                            <h3 className="text-xl font-semibold text-gray-800 mb-2">Calculating New Board Positions</h3>
                            <p className="text-gray-600">All moves are made. Waiting for a game to calculate new state...</p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

