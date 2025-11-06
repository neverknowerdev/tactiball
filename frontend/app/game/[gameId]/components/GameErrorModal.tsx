interface GameErrorModalProps {
    error: string;
    gameId: string;
    onRetry: () => void;
}

export default function GameErrorModal({ error, gameId, onRetry }: GameErrorModalProps) {
    return (
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
                            ? `The game with ID ${gameId} was not found.`
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
                            onClick={onRetry}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            Try Again
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

