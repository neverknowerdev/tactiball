import React, { useEffect, useRef, useState } from 'react';
import { api, errorText, ok } from '@/lib/backend';
import { useSession } from '@/app/session';
import { gameUrl } from '@/lib/routes';

interface SearchOpponentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCancel: () => void;
}

const POLL_MS = 2000;

// Quick match: the canister keeps one queue for every chain and pairs the two
// oldest teams in it into a game. We poll the lobby until our game starts.
export const SearchOpponentModal: React.FC<SearchOpponentModalProps> = ({
    isOpen,
    onClose,
    onCancel,
}) => {
    const { ensureSignedIn } = useSession();
    const [isOpponentFound, setIsOpponentFound] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const searching = useRef(false);

    useEffect(() => {
        if (!isOpen) return;
        let stopped = false;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const found = (gameId: bigint) => {
            setIsOpponentFound(true);
            window.location.href = gameUrl(gameId);
        };

        const poll = async () => {
            if (stopped) return;
            try {
                const lobby = ok(await api().lobby());
                if (lobby.active_game !== undefined) return found(lobby.active_game);
                if (!lobby.in_queue) {
                    // Our queue entry expired: join again.
                    const game = ok(await api().join_queue());
                    if (game !== null) return found(game);
                }
            } catch (e) {
                setError(errorText(e));
            }
            timer = setTimeout(poll, POLL_MS);
        };

        const start = async () => {
            searching.current = true;
            setError(null);
            setIsOpponentFound(false);
            try {
                await ensureSignedIn();
                const game = ok(await api().join_queue());
                if (game !== null) return found(game);
                timer = setTimeout(poll, POLL_MS);
            } catch (e) {
                setError(errorText(e));
                searching.current = false;
            }
        };
        start();

        return () => {
            stopped = true;
            if (timer) clearTimeout(timer);
        };
    }, [isOpen, ensureSignedIn]);

    // Handle cancel search
    const handleCancelSearch = async () => {
        if (searching.current) {
            searching.current = false;
            try {
                await api().leave_queue();
            } catch {
                // The queue entry expires on its own.
            }
        }
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
                        {isOpponentFound ? 'Starting the game...' : 'Looking for a player on any chain...'}
                    </p>

                    {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

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
