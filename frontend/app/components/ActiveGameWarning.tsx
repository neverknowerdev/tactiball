interface ActiveGameWarningProps {
    teamInfo: any;
}

export function ActiveGameWarning({ teamInfo }: ActiveGameWarningProps) {
    if (!teamInfo || !teamInfo.active_game_id) {
        return null;
    }

    return (
        <div className="w-full max-w-md mb-4 bg-yellow-500 text-yellow-900 rounded-lg shadow-sm border border-yellow-600">
            <div className="p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <span className="font-medium">
                            You have an ongoing game! Please return to it immediately.
                        </span>
                    </div>
                    <a
                        href={`/game/${teamInfo.active_game_id}/`}
                        className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm"
                    >
                        Return
                    </a>
                </div>
            </div>
        </div>
    );
}