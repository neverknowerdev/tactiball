interface PrimaryActionsProps {
  teamInfo: any;
  onPlayNow: () => void;
}

export function PrimaryActions({ teamInfo, onPlayNow }: PrimaryActionsProps) {
  return (
    <div className="w-full max-w-md mt-2 mb-2">
      <div className="flex justify-center mb-6">
        {teamInfo && teamInfo.active_game_id ? (
          <a
            href={`/game/${teamInfo.active_game_id}/`}
            className="px-8 text-base py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors font-medium"
          >
            Return to Game
          </a>
        ) : (
          <button
            onClick={onPlayNow}
            className="px-8 text-base py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
          >
            Play Now
          </button>
        )}
      </div>
    </div>
  );
}