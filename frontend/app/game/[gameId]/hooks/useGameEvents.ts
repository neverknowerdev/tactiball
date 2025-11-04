import { useEffect, useRef } from 'react';
import { Game } from '@/lib/game';
import { convertEventStateToGameState, GameStateType, TeamEnum } from '@/lib/game';
import { toast } from 'react-toastify';
import { GameSubmissionState } from '../types';

interface UseGameEventsProps {
    game: Game | null;
    setGame: (game: Game) => void;
    setGameSubmissionState: (state: GameSubmissionState) => void;
    setGameResultModal: (modal: any) => void;
    setLastMoveAt: (timestamp: number) => void;
    isNewStateRecalculatedRef: React.MutableRefObject<boolean | null>;
}

export function useGameEvents({
    game,
    setGame,
    setGameSubmissionState,
    setGameResultModal,
    setLastMoveAt,
    isNewStateRecalculatedRef
}: UseGameEventsProps) {
    useEffect(() => {
        const handleGameEvent = (event: CustomEvent) => {
            const gameEvent = event.detail;
            console.log('Received game event on game page:', gameEvent);

            // Handle NEW_GAME_STATE_NOTIFICATION
            if (gameEvent.type === 'NEW_GAME_STATE') {
                console.log('New game state notification received, re-fetching game data...');

                console.log('gameEvent', gameEvent);
                console.log('gameEvent.new_state', gameEvent.new_state);

                game!.playerMoves = [];

                // Convert event state to GameState format
                const gameState = convertEventStateToGameState(gameEvent.new_state);
                console.log('Converted gameState', gameState);

                game!.saveState(gameState);
                game!.restoreState(gameState);

                isNewStateRecalculatedRef.current = true;

                setGame(game!);
                // Reset submission state when new game state is received
                setGameSubmissionState(GameSubmissionState.IDLE);

                localStorage.removeItem('commitedActions');

                // Reset timeout tracking when new game state is received
                setLastMoveAt(Math.floor(Date.now() / 1000));
            }
            if (gameEvent.type === 'GAME_ACTION_COMMITTED') {
                console.log('Game action committed notification received, re-fetching game data...');
                // Reset submission state when game finished is received
                setGameSubmissionState(GameSubmissionState.WAITING_FOR_CALCULATION);
                isNewStateRecalculatedRef.current = false;

                // Reset timeout tracking when opponent commits their move
                setLastMoveAt(Math.floor(Date.now() / 1000));
            }
            if (gameEvent.type === 'GAME_FINISHED') {
                console.log('Game finished notification received:', gameEvent);
                // Show game result modal
                setGameResultModal({
                    isOpen: true,
                    winner: gameEvent.winner,
                    finishReason: gameEvent.finish_reason,
                    gameId: gameEvent.game_id,
                    timestamp: gameEvent.timestamp
                });
                // Reset submission state when game finished is received
                setGameSubmissionState(GameSubmissionState.IDLE);
            }
            if (gameEvent.type === 'GOAL_SCORED') {
                console.log('Goal scored notification received:', gameEvent);

                // Update the appropriate team's score
                if (gameEvent.teamEnum == 1) {
                    game!.team1.score += 1;
                    toast.success(`🎉 ${game!.team1.name} scored a goal!`);
                } else if (gameEvent.teamEnum == 2) {
                    game!.team2.score += 1;
                    toast.success(`🎉 ${game!.team2.name} scored a goal!`);
                }

                // Update the game state to trigger re-render by creating a new Game instance
                const updatedGame = Object.assign(Object.create(Object.getPrototypeOf(game!)), game!);
                setGame(updatedGame);
            }
            if (gameEvent.type === 'GAME_STATE_ERROR') {
                console.log('Game state error notification received:', gameEvent);

                // Show error toast notification
                toast.error(`Game Error: ${gameEvent.error_msg || 'Unknown error occurred'}`);

                // Reset submission state on error
                setGameSubmissionState(GameSubmissionState.IDLE);
            }
        };

        if (!game) {
            return;
        }

        // Add event listener for game events
        window.addEventListener('game-event', handleGameEvent as EventListener);

        // Cleanup function that runs when the component unmounts or when dependencies change
        // This removes the event listener to prevent memory leaks and duplicate listeners
        return () => {
            window.removeEventListener('game-event', handleGameEvent as EventListener);
        };
    }, [game, setGame, setGameSubmissionState, setGameResultModal, setLastMoveAt, isNewStateRecalculatedRef]);
}

