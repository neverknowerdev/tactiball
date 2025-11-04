import { useState, useEffect } from 'react';
import { Game, TeamEnum } from '@/lib/game';
import { authUserWithSignature } from '@/lib/auth';
import { GameSubmissionState } from '../types';
import { toast } from 'react-toastify';

interface UseGameSubmissionProps {
    game: Game | null;
    currentTeam: any;
    address: string | undefined;
    signMessageAsync: any;
    isConnected: boolean;
    isTwoTeamCommitted: boolean;
    setIsTwoTeamCommitted: (value: boolean) => void;
    fetchGameData: () => Promise<void>;
    isNewStateRecalculatedRef: React.MutableRefObject<boolean | null>;
    setLastMoveAt: (timestamp: number) => void;
    clearSelection: () => void;
}

export function useGameSubmission({
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
}: UseGameSubmissionProps) {
    const [gameSubmissionState, setGameSubmissionState] = useState<GameSubmissionState>(GameSubmissionState.IDLE);
    const [secondsAfterLastMove, setSecondsAfterLastMove] = useState<number>(0);

    useEffect(() => {
        if (!game || !isConnected) return;

        if (game?.team1.isCommittedMove && game?.team2.isCommittedMove) {
            setGameSubmissionState(GameSubmissionState.WAITING_FOR_CALCULATION);
        } else if (currentTeam?.isCommittedMove) {
            setGameSubmissionState(GameSubmissionState.WAITING_FOR_OPPONENT);
        }
    }, [game, isConnected, currentTeam]);

    useEffect(() => {
        console.log('isTwoTeamCommitted, isConnected', isTwoTeamCommitted, isConnected);
        if (!isConnected) return;

        const calculateNewGameState = async () => {
            console.log('Calculating new game state');
            const signature = await authUserWithSignature(address!, signMessageAsync);
            const response = await fetch('/api/game/calculate-new-game-state', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    game_id: Number(game!.gameId),
                    team_enum: currentTeam?.enum == TeamEnum.TEAM1 ? 1 : 2,
                    team_id: Number(currentTeam?.teamId),
                    wallet_address: address,
                    signature: signature.signature,
                    message: signature.message
                })
            });

            if (!response.ok) {
                const data = await response.json();
                console.log('Failed to calculate new game state', data);
                throw new Error('Failed to calculate new game state');
            }

            if (!isNewStateRecalculatedRef.current) {
                setGameSubmissionState(GameSubmissionState.WAITING_FOR_CALCULATION);
                await new Promise(resolve => setTimeout(resolve, 3000));
                if (!isNewStateRecalculatedRef.current) {
                    fetchGameData();
                }
            }

            localStorage.removeItem('commitedActions');
            setIsTwoTeamCommitted(false);
        }

        if (isTwoTeamCommitted) {
            setGameSubmissionState(GameSubmissionState.WAITING_FOR_CALCULATION);
            calculateNewGameState();
        }
    }, [isTwoTeamCommitted, isConnected, game, currentTeam, address, signMessageAsync, setIsTwoTeamCommitted, fetchGameData, isNewStateRecalculatedRef]);

    const handleReady = () => {
        const sendMoves = async () => {
            // Set state to committing
            setGameSubmissionState(GameSubmissionState.COMMITTING);

            isNewStateRecalculatedRef.current = false;

            const signature = await authUserWithSignature(address!, signMessageAsync);

            try {
                const response = await fetch('/api/game/commit-game-actions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        game_id: Number(game!.gameId),
                        moves: game!.playerMoves,
                        team_enum: currentTeam?.enum == TeamEnum.TEAM1 ? 1 : 2,
                        team_id: Number(currentTeam?.teamId),
                        wallet_address: address,
                        signature: signature.signature,
                        message: signature.message
                    })
                });

                if (!response.ok) {
                    const data = await response.json();
                    console.log('Failed to commit move', data);
                    throw new Error('Failed to commit move');
                }

                const data = await response.json();

                console.log('Move committed successfully:', data);

                localStorage.setItem('commitedActions', JSON.stringify(game!.playerMoves));

                if (data.isTwoTeamCommited) {
                    console.log('Two team commited, calculating new game state...');
                    setGameSubmissionState(GameSubmissionState.WAITING_FOR_CALCULATION);
                    clearSelection();
                    setIsTwoTeamCommitted(true);
                    setLastMoveAt(Math.floor(Date.now() / 1000));
                } else {
                    setGameSubmissionState(GameSubmissionState.WAITING_FOR_OPPONENT);

                    clearSelection();
                    game!.commitMove(currentTeam!.enum);
                    setLastMoveAt(Math.floor(Date.now() / 1000));
                }

            } catch (error) {
                console.error('Error committing move:', error);
                toast.error('Failed to commit move. Please try again.');
                // Reset state on error
                setGameSubmissionState(GameSubmissionState.IDLE);
                return;
            }
        }

        console.log('game.playerMoves', game!.playerMoves);
        if (game!.playerMoves.length == 0) {
            console.log('No moves to commit');
            toast.error('No moves to commit');
            return;
        }

        sendMoves();
    }

    return {
        gameSubmissionState,
        setGameSubmissionState,
        secondsAfterLastMove,
        setSecondsAfterLastMove,
        handleReady
    };
}

