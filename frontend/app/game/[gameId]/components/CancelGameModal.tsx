interface CancelGameModalProps {
    isOpen: boolean;
}

export default function CancelGameModal({ isOpen }: CancelGameModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-in fade-in duration-300">
            <div
                className="bg-white rounded-lg p-8 shadow-2xl max-w-md mx-4 animate-in zoom-in-95 duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="text-center">
                    <div className="mb-6">
                        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-red-600 mx-auto mb-4"></div>
                        <h2 className="text-2xl font-bold text-gray-800 mb-2">Cancelling Game...</h2>
                        <p className="text-gray-600">Please wait while we cancel the game</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

