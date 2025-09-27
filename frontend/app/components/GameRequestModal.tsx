import React, { useState } from 'react';
import { authUserWithSignature } from '@/lib/auth';
import { useSignMessage } from 'wagmi';

interface TeamInfo {
    name: string;
    id: number;
    username: string;
    elo_rating: number;
    primary_wallet: string;
}

interface GameRequestModalProps {
    isOpen: boolean;
    onClose: () => void;
    game_request_id: string;
    team1_info: TeamInfo;
    team2_info: TeamInfo;
    current_user_wallet: string;
    current_team_id: number;
}

export const GameRequestModal: React.FC<GameRequestModalProps> = ({
    isOpen,
    onClose,
    game_request_id,
    team1_info,
    team2_info,
    current_user_wallet,
    current_team_id
}) => {
    // Helper function to format ELO rating from 1000 format to 10.00 format
    const formatElo = (elo: number): string => {
        return (elo / 100).toFixed(2);
    };
    const [isProcessing, setIsProcessing] = useState(false);
    const { signMessageAsync } = useSignMessage();

    // Determine which team is the current user's team
    // For now, we'll assume team1 is the challenger and team2 is the challenged
    // This logic should be updated based on how the game request is structured
    const currentUserTeam = team1_info.id === current_team_id ? team1_info : team2_info;
    const opponentTeam = team1_info.id === current_team_id ? team2_info : team1_info;

    const handleStartGame = async () => {
        if (isProcessing) return;

        setIsProcessing(true);
        try {
            // Get authentication signature
            const { signature, message } = await authUserWithSignature(current_user_wallet, signMessageAsync);

            // Call the start-game API
            const response = await fetch('/api/game/start-game', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    game_request_id,
                    wallet_address: current_user_wallet,
                    signature,
                    message
                })
            });

            const result = await response.json();

            if (!response.ok) {
                console.error('Failed to start game:', result.error);
                // TODO: Show error toast
                return;
            }

            console.log('Game started successfully:', result);
            // TODO: Show success toast and redirect to game
            onClose();

        } catch (error) {
            console.error('Error starting game:', error);
            // TODO: Show error toast
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCancel = async () => {
        if (isProcessing) return;

        setIsProcessing(true);
        try {
            // Get authentication signature
            const { signature, message } = await authUserWithSignature(current_user_wallet, signMessageAsync);

            // Call the cancel-game-request API
            const response = await fetch('/api/game/cancel-game-request', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    game_request_id,
                    wallet_address: current_user_wallet,
                    signature,
                    message
                })
            });

            const result = await response.json();

            if (!response.ok) {
                console.error('Failed to cancel game request:', result.error);
                // TODO: Show error toast
                return;
            }

            console.log('Game request cancelled successfully:', result);
            onClose();

        } catch (error) {
            console.error('Error cancelling game request:', error);
            // TODO: Show error toast
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
                                <p className="text-sm text-gray-600 break-words max-w-[120px] leading-tight">@{team1_info.username}</p>
                                <div className="text-sm font-medium text-blue-600">ELO {formatElo(team1_info.elo_rating)}</div>
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
                                <p className="text-sm text-gray-600 break-words max-w-[120px] leading-tight">@{team2_info.username}</p>
                                <div className="text-sm font-medium text-red-600">ELO {formatElo(team2_info.elo_rating)}</div>
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
                    </div>

                    {/* Action Buttons */}
                    <div className="flex space-x-4">
                        <button
                            onClick={handleCancel}
                            disabled={isProcessing}
                            className="flex-1 bg-gray-200 text-gray-800 px-6 py-3 rounded-lg hover:bg-gray-300 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isProcessing ? 'Processing...' : 'Cancel'}
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
