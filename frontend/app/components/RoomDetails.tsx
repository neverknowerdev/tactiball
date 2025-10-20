import React, { useState, useEffect } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { authUserWithSignature } from '@/lib/auth';
import { toast } from 'react-toastify';

interface Team {
    id: number;
    name: string;
    elo_rating: number;
    country: number;
    primary_wallet: string;
}

interface Room {
    id: number;
    created_at: string;
    minimum_elo_rating: number;
    status: string;
    guest_team_id: number | null;
    game_request_id: number | null;
    host_team: Team;
    guest_team: Team | null;
}

interface RoomDetailsProps {
    roomId: number;
    userTeamId: number;
    onBack: () => void;
    onGameStarting: (gameRequestId: number) => void;
}

export default function RoomDetails({
    roomId,
    userTeamId,
    onBack,
    onGameStarting
}: RoomDetailsProps) {
    const [room, setRoom] = useState<Room | null>(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [shareUrl, setShareUrl] = useState('');
    const { address } = useAccount();
    const { signMessageAsync } = useSignMessage();

    // Check if user is host
    const isHost = room?.host_team.id === userTeamId;

    // Fetch room details
    const fetchRoom = async () => {
        try {
            const response = await fetch(`/api/waiting-rooms/${roomId}`);
            const data = await response.json();

            if (data.success) {
                setRoom(data.room);

                // Check if game request was created
                if (data.room.game_request_id) {
                    onGameStarting(data.room.game_request_id);
                }
            } else {
                toast.error('Room not found');
                onBack();
            }
        } catch (error) {
            console.error('Error fetching room:', error);
            toast.error('Failed to load room details');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRoom();

        // Generate share URL
        if (typeof window !== 'undefined') {
            setShareUrl(`${window.location.origin}/room/${roomId}`);
        }

        // Poll for updates every 3 seconds
        const interval = setInterval(fetchRoom, 3000);
        return () => clearInterval(interval);
    }, [roomId]);

    // Join room
    const handleJoin = async () => {
        if (!address) {
            toast.error('Please connect your wallet');
            return;
        }

        setProcessing(true);
        try {
            const { signature, message } = await authUserWithSignature(address, signMessageAsync);

            const response = await fetch(`/api/waiting-rooms/${roomId}/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    team_id: userTeamId,
                    wallet_address: address,
                    signature,
                    message
                })
            });

            const data = await response.json();

            if (data.success) {
                toast.success('Joined room!');
                fetchRoom();
            } else {
                toast.error(data.error || 'Failed to join room');
            }
        } catch (error) {
            console.error('Error joining room:', error);
            toast.error('Failed to join room');
        } finally {
            setProcessing(false);
        }
    };

    // Leave room
    const handleLeave = async () => {
        if (!address) return;

        setProcessing(true);
        try {
            const { signature, message } = await authUserWithSignature(address, signMessageAsync);

            const response = await fetch(`/api/waiting-rooms/${roomId}/leave`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    team_id: userTeamId,
                    wallet_address: address,
                    signature,
                    message
                })
            });

            const data = await response.json();

            if (data.success) {
                toast.success(isHost ? 'Room cancelled' : 'Left room');
                onBack();
            } else {
                toast.error(data.error || 'Failed to leave room');
            }
        } catch (error) {
            console.error('Error leaving room:', error);
            toast.error('Failed to leave room');
        } finally {
            setProcessing(false);
        }
    };

    // Create game request (when both teams are ready)
    const handleStartGame = async () => {
        if (!address || !room?.guest_team_id) return;

        setProcessing(true);
        try {
            const { signature, message } = await authUserWithSignature(address, signMessageAsync);

            const response = await fetch('/api/game/create-game-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    team1_id: room.host_team.id,
                    team2_id: room.guest_team_id,
                    wallet_address: address,
                    signature,
                    message
                })
            });

            const data = await response.json();

            if (data.success) {
                // Update room with game request ID
                await fetch(`/api/waiting-rooms/${roomId}/start`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        game_request_id: data.data.gameRequestId
                    })
                });

                toast.success('Starting game...');
                onGameStarting(data.data.gameRequestId);
            } else {
                toast.error(data.error || 'Failed to start game');
            }
        } catch (error) {
            console.error('Error starting game:', error);
            toast.error('Failed to start game');
        } finally {
            setProcessing(false);
        }
    };

    // Share room
    const handleShare = async () => {
        try {
            if (navigator.share) {
                await navigator.share({
                    title: `Join ${room?.host_team.name}'s Game Room`,
                    text: `Join my ChessBall game room!`,
                    url: shareUrl
                });
            } else {
                await navigator.clipboard.writeText(shareUrl);
                toast.success('Room link copied to clipboard!');
            }
        } catch (error) {
            console.error('Error sharing:', error);
        }
    };

    const formatElo = (elo: number) => (elo / 100).toFixed(2);

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-blue-900 to-purple-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-white mx-auto mb-4"></div>
                    <p className="text-white text-lg">Loading room...</p>
                </div>
            </div>
        );
    }

    if (!room) {
        return null;
    }

    const canJoin = !room.guest_team_id && !isHost;
    const isFull = !!room.guest_team_id;

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-900 to-purple-900 p-4">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                    <button
                        onClick={onBack}
                        className="text-white hover:text-blue-200 transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Game Room</h1>
                        <p className="text-blue-200 text-sm">Room #{roomId}</p>
                    </div>
                </div>

                {/* Room Info Card */}
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 mb-6 border-2 border-white/20">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h2 className="text-xl font-bold text-white mb-2">Room Settings</h2>
                            {room.minimum_elo_rating > 0 && (
                                <p className="text-blue-200 text-sm">
                                    Minimum ELO: {formatElo(room.minimum_elo_rating)}
                                </p>
                            )}
                        </div>
                        <button
                            onClick={handleShare}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                            </svg>
                            Share
                        </button>
                    </div>
                </div>

                {/* Teams */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                    {/* Host Team */}
                    <div className={`bg-white/10 backdrop-blur-sm rounded-lg p-6 border-2 ${isHost ? 'border-yellow-500' : 'border-white/20'
                        }`}>
                        <div className="text-center">
                            <div className="w-20 h-20 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-2xl mx-auto mb-3">
                                {room.host_team.name.substring(0, 2).toUpperCase()}
                            </div>
                            <h3 className="text-lg font-bold text-white mb-1">{room.host_team.name}</h3>
                            <p className="text-blue-200 text-sm mb-2">ELO {formatElo(room.host_team.elo_rating)}</p>
                            <span className="inline-block px-3 py-1 bg-blue-500/20 text-blue-200 rounded-full text-xs font-semibold">
                                HOST {isHost && '(You)'}
                            </span>
                        </div>
                    </div>

                    {/* Guest Team or Empty Slot */}
                    {room.guest_team ? (
                        <div className={`bg-white/10 backdrop-blur-sm rounded-lg p-6 border-2 ${!isHost && room.guest_team.id === userTeamId ? 'border-yellow-500' : 'border-white/20'
                            }`}>
                            <div className="text-center">
                                <div className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center text-white font-bold text-2xl mx-auto mb-3">
                                    {room.guest_team.name.substring(0, 2).toUpperCase()}
                                </div>
                                <h3 className="text-lg font-bold text-white mb-1">{room.guest_team.name}</h3>
                                <p className="text-blue-200 text-sm mb-2">ELO {formatElo(room.guest_team.elo_rating)}</p>
                                <span className="inline-block px-3 py-1 bg-red-500/20 text-red-200 rounded-full text-xs font-semibold">
                                    GUEST {!isHost && room.guest_team.id === userTeamId && '(You)'}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white/5 backdrop-blur-sm rounded-lg p-6 border-2 border-dashed border-white/30 flex items-center justify-center">
                            <div className="text-center">
                                <svg className="w-16 h-16 text-white/30 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                <p className="text-white/50 text-sm">Waiting for opponent...</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Status Message */}
                {isFull && (
                    <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-4 mb-6">
                        <p className="text-green-200 text-center font-semibold">
                            🎮 Room is full! Ready to start the game.
                        </p>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-4">
                    {canJoin ? (
                        <>
                            <button
                                onClick={onBack}
                                className="flex-1 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-semibold"
                            >
                                Back
                            </button>
                            <button
                                onClick={handleJoin}
                                disabled={processing}
                                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {processing ? 'Joining...' : 'Join Room'}
                            </button>
                        </>
                    ) : isFull && isHost ? (
                        <>
                            <button
                                onClick={handleLeave}
                                disabled={processing}
                                className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {processing ? 'Cancelling...' : 'Cancel Room'}
                            </button>
                            <button
                                onClick={handleStartGame}
                                disabled={processing}
                                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {processing ? 'Starting...' : 'Start Game'}
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={handleLeave}
                            disabled={processing}
                            className="w-full px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {processing ? 'Leaving...' : isHost ? 'Cancel Room' : 'Leave Room'}
                        </button>
                    )}
                </div>

                {/* Created timestamp */}
                <p className="text-center text-blue-200 text-sm mt-4">
                    Created {new Date(room.created_at).toLocaleString()}
                </p>
            </div>
        </div>
    );
}