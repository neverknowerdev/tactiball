'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useAccount, useSignMessage } from "wagmi";
import { toast, ToastContainer } from "react-toastify";
import 'react-toastify/dist/ReactToastify.css';
import '../game.css';
import * as Sentry from "@sentry/nextjs";

// Game utilities
import { Game, TeamPlayer } from '@/lib/game';
import { authUserWithSignature } from '@/lib/auth';

// Types
import { GameSubmissionState } from './types';

// Hooks
import { useGameData } from './hooks/useGameData';
import { useGameEvents } from './hooks/useGameEvents';
import { useGameSubmission } from './hooks/useGameSubmission';
import { useCellStates } from './hooks/useCellStates';
import { useHistoryNavigation } from './hooks/useHistoryNavigation';
import { usePlayerSelection } from './hooks/usePlayerSelection';
import { useGameSubscription } from './hooks/useGameSubscription';

// Components
import GameTipsModal from './GameTipsModal';
import GameLoadingModal from './components/GameLoadingModal';
import GameErrorModal from './components/GameErrorModal';
import GameInfo from './components/GameInfo';
import GameField from './components/GameField';
import HistoryControls from './components/HistoryControls';
import ReadyButton from './components/ReadyButton';
import GameSubmissionModal from './components/GameSubmissionModal';
import GameResultModal from './components/GameResultModal';
import CancelGameModal from './components/CancelGameModal';

export default function GamePage() {
    const params = useParams<{ gameId?: string }>();
    const gameId = params?.gameId ?? '';

    if (!gameId) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-green-100 p-4">
                <div className="max-w-md text-center bg-white shadow-sm rounded-lg p-6 border border-gray-100">
                    <h1 className="text-xl font-semibold text-gray-800 mb-2">Game not found</h1>
                    <p className="text-gray-600 mb-4">Please return to the lobby and select a valid game.</p>
                    <a
                        href="/"
                        className="inline-flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                    >
                        Back to Home
                    </a>
                </div>
            </div>
        );
    }

    // Wallet connection
    const { address, isConnected } = useAccount();
    const { signMessageAsync } = useSignMessage();

    // UI state
    const [showTips, setShowTips] = useState(false);
    const [isDebugMode, setIsDebugMode] = useState(false);
    const [isCancelRequestSending, setIsCancelRequestSending] = useState(false);
    const [gameResultModal, setGameResultModal] = useState<{
        isOpen: boolean;
        winner: number;
        finishReason: number;
        gameId: number;
        timestamp: number;
    }>({
        isOpen: false,
        winner: 0,
        finishReason: 0,
        gameId: 0,
        timestamp: 0
    });

    const isNewStateRecalculatedRef = useRef<boolean | null>(false);

    // Custom hooks
    const {
        game,
        setGame,
        currentTeam,
        isLoading,
        error,
        lastMoveAt,
        setLastMoveAt,
        isTwoTeamCommitted,
        setIsTwoTeamCommitted,
        fetchGameData
    } = useGameData(gameId);

    const {
        cellStates,
        updateCellHighlights,
        clearCellHighlights
    } = useCellStates();

    const {
        currentHistoryIndex,
        setCurrentHistoryIndex,
        goToPreviousState,
        goToNextState,
        goToLatestState,
        getHistoryDescription
    } = useHistoryNavigation({ game });

    const {
        selectedPlayer,
        currentMode,
        onCellClick,
        clearSelection
    } = usePlayerSelection({
        game,
        currentTeam,
        updateCellHighlights,
        clearCellHighlights
    });

    const {
        gameSubmissionState,
        setGameSubmissionState,
        secondsAfterLastMove,
        setSecondsAfterLastMove,
        handleReady
    } = useGameSubmission({
        game,
        currentTeam,
        address,
        signMessageAsync,
        isConnected,
        isTwoTeamCommitted,
        setIsTwoTeamCommitted,
        fetchGameData,
        isNewStateRecalculatedRef,
        setLastMoveAt,
        clearSelection
    });

    useGameSubscription({
        gameId,
        gameSubmissionState,
        lastMoveAt,
        setGameSubmissionState
    });

    useGameEvents({
        game,
        setGame,
        setGameSubmissionState,
        setGameResultModal,
        setLastMoveAt,
        isNewStateRecalculatedRef
    });

    useEffect(() => {
        if (isConnected && address) {
            Sentry.setUser({
                id: address as `0x${string}`,
                username: address,
            });
        } else {
            Sentry.setUser(null);
        }
    }, [isConnected, address]);

    // Debug mode detection effect
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        setIsDebugMode(urlParams.has('debug'));
    }, []);

    // Timeout check effect - runs every second when waiting for opponent
    useEffect(() => {
        if (gameSubmissionState !== GameSubmissionState.WAITING_FOR_OPPONENT || !lastMoveAt) {
            return;
        }
        setSecondsAfterLastMove(Math.floor(Date.now() / 1000) - lastMoveAt);

        const interval = setInterval(() => {
            setSecondsAfterLastMove(prev => {
                const newValue = prev + 1;
                return newValue;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [gameSubmissionState, lastMoveAt, setSecondsAfterLastMove]);

    // Send cancel game request
    const handleCancelGameRequest = async () => {
        if (!address || !signMessageAsync) {
            toast.error('Please connect your wallet first');
            return;
        }

        setIsCancelRequestSending(true);
        setGameSubmissionState(GameSubmissionState.IDLE);

        try {
            const signature = await authUserWithSignature(address, signMessageAsync);

            const response = await fetch('/api/game/finish-game-by-timeout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    game_id: gameId,
                    wallet_address: address,
                    signature: signature.signature,
                    message: signature.message
                })
            });

            if (!response.ok) {
                const data = await response.json();
                console.error('Failed to cancel game:', data);
                toast.error(data.error || 'Failed to cancel game');
                return;
            }

            const data = await response.json();
            console.log('Game cancelled successfully:', data);
            toast.success('Game cancelled due to timeout');

            // Reset the game state
            setGameSubmissionState(GameSubmissionState.IDLE);

            // Redirect to main page after 5 seconds
            setTimeout(() => {
                window.location.href = '/';
            }, 5000);

        } catch (error) {
            console.error('Error cancelling game:', error);
            toast.error('Failed to cancel game. Please try again.');
        } finally {
            setIsCancelRequestSending(false);
        }
    };

    // Helper functions
    const isHasOldState = (player: TeamPlayer) => {
        return player.oldPosition != null;
    }

    const isHasOldStateBall = () => {
        return game!.ball.oldPosition != null;
    }

    const handleGoToPreviousState = () => {
        goToPreviousState(() => {
            // Clear selection when navigating history
            clearCellHighlights();
        });
    }

    const handleGoToNextState = () => {
        goToNextState(() => {
            clearCellHighlights();
        });
    }

    const handleGoToLatestState = () => {
        goToLatestState(() => {
            clearCellHighlights();
        });
    }

    const handleCellClick = (cell: any) => {
        onCellClick(cell, cellStates);
    }

    return (
        <div className="min-h-screen bg-green-100 p-2 sm:p-4">
            {/* Game Loading Popup */}
            {isLoading && <GameLoadingModal gameId={gameId} />}

            {/* Error Display */}
            {error && (
                <GameErrorModal
                    error={error}
                    gameId={gameId}
                    onRetry={fetchGameData}
                />
            )}

            {game && (
                <div className="max-w-6xl mx-auto">
                    {/* Back to Main - only show if game is not active */}
                    {game && game.status !== 'ACTIVE' && (
                        <div className="flex justify-start mb-4">
                            <a
                                href="/"
                                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 underline transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                                Back to Main
                            </a>
                        </div>
                    )}

                    <h1 className="text-2xl sm:text-3xl font-bold text-center mb-4 sm:mb-6">TactiBall Game #{gameId}</h1>

                    {/* Tips Modal */}
                    <GameTipsModal
                        isOpen={showTips}
                        onClose={() => setShowTips(false)}
                        isConnected={isConnected}
                        currentTeam={currentTeam}
                    />

                    {/* Game Info */}
                    <GameInfo
                        game={game}
                        currentTeam={currentTeam}
                        isDebugMode={isDebugMode}
                    />

                    {/* Chessboard-style Soccer Field */}
                    {currentHistoryIndex < game.history.length - 1 && (
                        <div className="mb-4 bg-yellow-100 border border-yellow-300 rounded-lg p-3 text-center">
                            <div className="text-yellow-800 font-medium">
                                📜 Viewing Historical State - {getHistoryDescription(currentHistoryIndex)}
                            </div>
                            <div className="text-sm text-yellow-600 mt-1">
                                Use the history controls below to navigate or click "Move to Latest State" to return to current game
                            </div>
                        </div>
                    )}

                    {/* How to Play Button - Above Field, Aligned with Field Right Edge */}
                    <div className="flex justify-end mb-1" style={{ maxWidth: '800px', margin: '0 auto' }}>
                        <button
                            onClick={() => setShowTips(!showTips)}
                            className="flex items-center gap-1 text-xs bg-white bg-opacity-90 hover:bg-opacity-100 text-gray-700 hover:text-gray-900 px-2 py-1 rounded shadow-sm transition-all duration-200"
                        >
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                            </svg>
                            How to play?
                        </button>
                    </div>

                    <GameField
                        game={game}
                        cellStates={cellStates}
                        currentMode={currentMode || ''}
                        isDebugMode={isDebugMode}
                        onCellClick={handleCellClick}
                        isHasOldState={isHasOldState}
                        isHasOldStateBall={isHasOldStateBall}
                    />

                    {/* Ready Button or Connect Wallet */}
                    <ReadyButton
                        isConnected={isConnected}
                        game={game}
                        gameSubmissionState={gameSubmissionState}
                        onReady={handleReady}
                    />

                    {/* Move History Controls */}
                    <HistoryControls
                        game={game}
                        currentHistoryIndex={currentHistoryIndex}
                        getHistoryDescription={getHistoryDescription}
                        goToPreviousState={handleGoToPreviousState}
                        goToNextState={handleGoToNextState}
                        goToLatestState={handleGoToLatestState}
                    />
                </div>
            )}

            {/* Toast Container for notifications */}
            <ToastContainer
                position="top-right"
                autoClose={5000}
                hideProgressBar={false}
                newestOnTop={false}
                closeOnClick
                rtl={false}
                pauseOnFocusLoss
                draggable
                pauseOnHover
                theme="light"
            />

            {/* Game Result Modal */}
            <GameResultModal
                isOpen={gameResultModal.isOpen}
                game={game}
                currentTeam={currentTeam}
                winner={gameResultModal.winner}
                finishReason={gameResultModal.finishReason}
                gameId={gameResultModal.gameId}
                timestamp={gameResultModal.timestamp}
                onClose={() => setGameResultModal(prev => ({ ...prev, isOpen: false }))}
                onViewFinalState={handleGoToLatestState}
            />

            {/* Cancel Game Loading Modal */}
            <CancelGameModal isOpen={isCancelRequestSending} />

            {/* Game Submission Status Popup */}
            <GameSubmissionModal
                gameSubmissionState={gameSubmissionState}
                secondsAfterLastMove={secondsAfterLastMove}
                onCancelGame={handleCancelGameRequest}
            />
        </div>
    );
}
