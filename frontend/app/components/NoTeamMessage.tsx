// NoTeamMessage.tsx
interface NoTeamMessageProps {
    onCreateTeam: () => void;
}

export function NoTeamMessage({ onCreateTeam }: NoTeamMessageProps) {
    return (
        <div className="p-4 text-center">
            <div className="mb-3">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Your Team</h3>
            </div>
            <div className="text-gray-500 mb-4">
                <p className="text-sm">No team found for this wallet address</p>
                <p className="text-xs mt-1">Create a team to get started</p>
            </div>
            <button
                onClick={onCreateTeam}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm"
            >
                Create Team
            </button>
        </div>
    );
}