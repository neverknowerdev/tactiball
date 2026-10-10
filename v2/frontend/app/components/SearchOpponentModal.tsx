import React, { useEffect, useState } from 'react';
import { joinOpponentFindingRoom, leaveOpponentFindingRoom, getOpponentFindingChannel, getCurrentChannelMembers, type OpponentFindingPresence } from '@/lib/ably';
import { authUserWithSignature } from '@/lib/auth';
import { useSignMessage } from 'wagmi';

interface SearchOpponentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCancel: () => void;
    userInfo: {
        team_name: string;
        team_id: number;
        user_wallet_address: string;
        username: string;
        elo_rating: number;
    } | null;
}

export const SearchOpponentModal: React.FC<SearchOpponentModalProps> = ({
    isOpen,
    onClose,
    onCancel,
    userInfo,
}) => {
    const [isSearching, setIsSearching] = useState(false);
    const [isOpponentFound, setIsOpponentFound] = useState(false);
    const [channel, setChannel] = useState<any>(null);
    const { signMessageAsync } = useSignMessage();

    // Function to create game request
    const createGameRequest = async (opponentMember: OpponentFindingPresence) => {
        if (!userInfo) return;
        console.log('Creating game request with opponent:', opponentMember);

        try {
            setIsOpponentFound(true);
            const { signature, message } = await authUserWithSignature(userInfo.user_wallet_address, signMessageAsync);
            console.log('Creating game request with opponent:', opponentMember);

            const response = await fetch('/api/game/create-game-request', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    team1_id: userInfo.team_id,
                    team2_id: opponentMember.team_id,
                    wallet_address: userInfo.user_wallet_address,
                    signature,
                    message
                })
            });

            const result = await response.json();

            if (!response.ok) {
                console.error('Failed to create game request:', result.error);
                setIsOpponentFound(false);
                return;
            }

            // Save game request ID and opponent info
            const gameRequestId = result.data.game_request_id;

            console.log('Game request created successfully:', result);

            // Stop searching since we found an opponent
            setIsSearching(false);
            setIsOpponentFound(false);
            onClose();
        } catch (error) {
            console.error('Error creating game request:', error);
            setIsOpponentFound(false);
        }
    };

    // Join opponent finding room when modal opens
    useEffect(() => {
        if (isOpen && userInfo && !isSearching) {
            const joinRoom = async () => {
                try {
                    setIsSearching(true);

                    const presenceData: OpponentFindingPresence = {
                        ...userInfo,
                        timestamp: Date.now()
                    };

                    // Get initial list of current members
                    const members = await getCurrentChannelMembers();
                    console.log('Current channel members:', members);

                    if (members.length > 0) {
                        // TODO: Handle case where there are already members in the channel
                        console.log('Already have members in the channel');
                        // Sort members by timestamp and get the oldest one
                        const oldestMember = members.sort((a, b) => a.timestamp - b.timestamp)[0];
                        console.log('Oldest member in channel:', oldestMember);

                        // Create game request with oldest member
                        createGameRequest(oldestMember);
                        return;
                    }

                    const opponentChannel = await joinOpponentFindingRoom(presenceData);
                    setChannel(opponentChannel);

                    // Listen for new users joining
                    opponentChannel.presence.subscribe('enter', (member: any) => {
                        console.log('New user joined opponent finding room:', member.data);

                    });

                    // Listen for users leaving
                    opponentChannel.presence.subscribe('leave', (member: any) => {
                        console.log('User left opponent finding room:', member.data);
                    });

                    // Listen for presence updates
                    opponentChannel.presence.subscribe('update', (member: any) => {
                        console.log('User updated presence:', member.data);
                    });

                } catch (error) {
                    console.error('Failed to join opponent finding room:', error);
                    setIsSearching(false);
                }
            };

            joinRoom();
        }

        // Cleanup when modal closes
        return () => {
            if (channel && !isOpen) {
                leaveOpponentFindingRoom();
                setChannel(null);
                setIsSearching(false);
            }
        };
    }, [isOpen, userInfo, isSearching]);

    // Handle cancel search
    const handleCancelSearch = async () => {
        if (channel) {
            await leaveOpponentFindingRoom();
            setChannel(null);
        }
        setIsSearching(false);
        onCancel();
    };

    if (!isOpen) return null;
    // Show searching interface
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
                <div className="text-center">
                    {/* Search icon */}
                    <div className="mb-4">
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${isOpponentFound ? 'bg-green-100' : 'bg-blue-100'
                            }`}>
                            {isOpponentFound ? (
                                <svg
                                    className="w-8 h-8 text-green-600 animate-pulse"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M5 13l4 4L19 7"
                                    />
                                </svg>
                            ) : (
                                <svg
                                    className="w-8 h-8 text-blue-600 animate-pulse"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                    />
                                </svg>
                            )}
                        </div>
                    </div>

                    {/* Title */}
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        {isOpponentFound ? 'Opponent Found!' : 'Searching for Opponent'}
                    </h3>

                    {/* Description */}
                    <p className="text-gray-600 mb-6">
                        {isOpponentFound ? 'Inviting him to play...' : 'Looking for players with similar skill level...'}
                    </p>

                    {/* Progress indicator with animated ball */}
                    <div className="mb-6">
                        <div className="relative w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                            {/* Animated ball */}
                            <img
                                src="/ball.svg"
                                alt="Ball"
                                className="absolute top-0 w-3 h-3 ball-animation"
                            />
                        </div>
                        <div className="flex justify-between text-xs text-gray-500 mt-2">
                            <span>Searching...</span>
                            <span>2-5 min</span>
                        </div>
                    </div>

                    {/* Share Game Block */}
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                            </svg>
                            <span className="text-sm text-gray-700">Share game with friends</span>
                        </div>
                        <button
                            onClick={() => {
                                // TODO: Implement share functionality
                                console.log("Share to feed clicked");
                            }}
                            className="flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 transition-colors text-xs font-medium"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                            </svg>
                            Share
                        </button>
                    </div>

                    {/* Cancel button */}
                    <button
                        onClick={handleCancelSearch}
                        className="w-full bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                    >
                        Cancel Search
                    </button>
                </div>
            </div>

            {/* Custom CSS for ball animation */}
            <style jsx>{`
                .ball-animation {
                    animation: moveBall 8s linear infinite;
                }
                
                @keyframes moveBall {
                    0% {
                        left: 0;
                    }
                    100% {
                        left: calc(100% - 12px);
                    }
                }
            `}</style>
        </div>
    );
};
