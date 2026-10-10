import React, { useState } from 'react';
import { api, errorText, formatElo, ok, type GameRequestView } from '@/lib/backend';
import { gameUrl } from '@/lib/routes';
import { ChainBadge } from './ChainBadge';

interface GameRequestModalProps {
    isOpen: boolean;
    onClose: () => void;
    request: GameRequestView;
    current_team_id: bigint | null;
}

// An invite between two teams: the invited team accepts or declines, the
// inviting team can cancel. Accepting starts the game on the canister.
export const GameRequestModal: React.FC<GameRequestModalProps> = ({
    isOpen,
    onClose,
    request,
    current_team_id
}) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const team1_info = request.from_team;
    const team2_info = request.to_team;
    const game_request_id = String(request.id);

    const handleStartGame = async () => {
        if (isProcessing) return;
        setIsProcessing(true);
        setError(null);
        try {
            const gameId = ok(await api().accept_game_request(request.id));
            window.location.href = gameUrl(gameId);
        } catch (e) {
            setError(errorText(e));
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCancel = async () => {
        if (isProcessing) return;
        setIsProcessing(true);
        setError(null);
        try {
            ok(await api().cancel_game_request(request.id));
            onClose();
        } catch (e) {
            setError(errorText(e));
        } finally {
            setIsProcessing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
                <div className="text-center">
                    {/* Title */}
                    <h3 className="text-xl font-bold text-gray-900 mb-6">
                        Game Request
                    </h3>

                    {/* Teams facing each other */}
                    <div className="grid grid-cols-3 items-center gap-4 mb-8">
                        {/* Team 1 (Left) */}
                        <div className="flex flex-col items-center space-y-3">
                            <div className="w-20 h-20 bg-blue-100 rounded-full border-4 border-blue-500 flex items-center justify-center">
                                <span className="text-2xl font-bold text-blue-600">
                                    {team1_info.name.substring(0, 2).toUpperCase()}
                                </span>
                            </div>
                            <div className="text-center">
                                <h4 className="text-lg font-semibold text-gray-900 break-words max-w-[120px] leading-tight">{team1_info.name}</h4>
                                <ChainBadge chain={team1_info.home_chain} />
                                <div className="text-sm font-medium text-blue-600">ELO {formatElo(team1_info.elo)}</div>
                            </div>
                        </div>

                        {/* VS - Centered */}
                        <div className="flex flex-col items-center justify-center space-y-2">
                            <div className="text-3xl font-bold text-gray-400">VS</div>
                            <div className="w-16 h-1 bg-gray-300 rounded-full"></div>
                        </div>

                        {/* Team 2 (Right) */}
                        <div className="flex flex-col items-center space-y-3">
                            <div className="w-20 h-20 bg-red-100 rounded-full border-4 border-red-500 flex items-center justify-center">
                                <span className="text-2xl font-bold text-red-600">
                                    {team2_info.name.substring(0, 2).toUpperCase()}
                                </span>
                            </div>
                            <div className="text-center">
                                <h4 className="text-lg font-semibold text-gray-900 break-words max-w-[120px] leading-tight">{team2_info.name}</h4>
                                <ChainBadge chain={team2_info.home_chain} />
                                <div className="text-sm font-medium text-red-600">ELO {formatElo(team2_info.elo)}</div>
                            </div>
                        </div>
                    </div>

                    {/* Game Request Info */}
                    <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-600">
                            {team1_info.id === current_team_id ? 'You' : <span className="font-medium text-blue-600">{team1_info.name}</span>} has challenged{' '}
                            {team2_info.id === current_team_id ? 'you' : <span className="font-medium text-red-600">{team2_info.name}</span>} to a match!
                        </p>
                        <p className="text-sm text-gray-600">
                            {team1_info.id === current_team_id ? (
                                <>
                                    Waiting for <span className="font-medium text-red-600">{team2_info.name}</span> team to accept your invitation..
                                </>
                            ) : ''}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                            GameRequestID: {game_request_id}
                        </p>
                        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex space-x-4">
                        <button
                            onClick={handleCancel}
                            disabled={isProcessing}
                            className="flex-1 bg-gray-200 text-gray-800 px-6 py-3 rounded-lg hover:bg-gray-300 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isProcessing ? 'Processing...' : team2_info.id === current_team_id ? 'Decline' : 'Cancel'}
                        </button>
                        {team2_info.id === current_team_id ? (
                            <button
                                onClick={handleStartGame}
                                disabled={isProcessing}
                                className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isProcessing ? 'Processing...' : 'Start Game'}
                            </button>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
};
