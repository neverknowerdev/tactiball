interface GameLoadingModalProps {
    gameId: string;
}

export default function GameLoadingModal({ gameId }: GameLoadingModalProps) {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-in fade-in duration-300">
            <div className="bg-white rounded-lg p-8 shadow-2xl max-w-md mx-4 animate-in zoom-in-95 duration-300">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-green-600 mx-auto mb-4"></div>
                    <h3 className="text-xl font-semibold text-gray-800 mb-2">Loading Game</h3>
                    <p className="text-gray-600">Loading game {gameId}...</p>
                </div>
            </div>
        </div>
    );
}

