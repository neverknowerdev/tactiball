import { useEffect } from 'react';
import { subscribeToGame, unsubscribeFromGame } from '@/lib/ably';
import { GameSubmissionState } from '../types';

interface UseGameSubscriptionProps {
    gameId: string;
    gameSubmissionState: GameSubmissionState;
    lastMoveAt: number | null;
    setGameSubmissionState: (state: GameSubmissionState) => void;
}

export function useGameSubscription({
    gameId,
    gameSubmissionState,
    lastMoveAt,
    setGameSubmissionState
}: UseGameSubscriptionProps) {
    useEffect(() => {
        if (!gameId) return;

        // Subscribe to game channel using GameChannelManager
        const connectToGame = async () => {
            try {
                await subscribeToGame(gameId);
                console.log(`Connected to game ${gameId} channel`);
            } catch (error) {
                console.error('Failed to connect to game channel:', error);
            }
        };

        connectToGame();

        // Cleanup function to disconnect when component unmounts or game changes
        return () => {
            unsubscribeFromGame();
            // Reset submission state on cleanup
            setGameSubmissionState(GameSubmissionState.IDLE);
        };
    }, [gameId, setGameSubmissionState]);

}

