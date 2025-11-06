import { useState, useEffect } from 'react';
import { Game } from '@/lib/game';
import { getGameFromDB } from '@/lib/db';
import { getGameFromContract } from '@/lib/contract';
import { toGameStatus, GameState, GameStateType, TeamEnum } from '@/lib/game';

export function useGameData(gameId: string) {
    const [game, setGame] = useState<Game | null>(null);
    const [currentTeam, setCurrentTeam] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastMoveAt, setLastMoveAt] = useState<number | null>(null);
    const [isTwoTeamCommitted, setIsTwoTeamCommitted] = useState(false);

    const fetchGameFromSmartContract = async (game: Game): Promise<Game> => {
        const contractGameData = await getGameFromContract(gameId);
        if (!contractGameData.success) {
            throw new Error('Game not found');
        }

        game.status = toGameStatus(contractGameData.data.status);

        game.team1.name = "Team Blue";
        game.team2.name = "Team Red";
        game.team1.teamId = contractGameData.data.team1.teamId;
        game.team2.teamId = contractGameData.data.team2.teamId;

        game.team1.score = contractGameData.data.gameState.team1score;
        game.team2.score = contractGameData.data.gameState.team2score;

        // Store the lastMoveAt timestamp for timeout calculations
        setLastMoveAt(Number(contractGameData.data.gameState.lastMoveAt));

        const gameState: GameState = {
            team1PlayerPositions: contractGameData.data.lastBoardState.team1PlayerPositions,
            team2PlayerPositions: contractGameData.data.lastBoardState.team2PlayerPositions,
            ballPosition: contractGameData.data.lastBoardState.ballPosition,
            ballOwner: contractGameData.data.lastBoardState.ballOwner === 1 ? TeamEnum.TEAM1 : contractGameData.data.lastBoardState.ballOwner === 2 ? TeamEnum.TEAM2 : null,
            type: GameStateType.MOVE,
            clashRandomResults: [],
            team1Moves: [],
            team2Moves: []
        }

        game.restoreState(gameState);

        console.log('contractGameData.data.gameState.team1MovesEncrypted', contractGameData.data.gameState.team1MovesEncrypted);
        console.log('contractGameData.data.gameState.team2MovesEncrypted', contractGameData.data.gameState.team2MovesEncrypted);
        if (BigInt(contractGameData.data.gameState.team1MovesEncrypted) !== BigInt(0)) {
            console.log('team1MovesCommited');
            game.team1.isCommittedMove = true;
        }
        if (BigInt(contractGameData.data.gameState.team2MovesEncrypted) !== BigInt(0)) {
            console.log('team2MovesCommited');
            game.team2.isCommittedMove = true;
        }

        return game;
    }

    const fetchGameFromDatabase = async (game: Game): Promise<Game> => {
        const dbGameData = await getGameFromDB(gameId);
        if (!dbGameData.success) {
            console.error('Error fetching game from database:', dbGameData.error);
            return game;
        }
        console.log('Contract game data:', dbGameData.data);

        game.team1.name = dbGameData.data.team1_info.name;
        game.team2.name = dbGameData.data.team2_info.name;

        const history: GameState[] = [];

        for (const state of dbGameData.data.history) {
            const gameState = {
                team1PlayerPositions: state.team1_positions,
                team2PlayerPositions: state.team2_positions,
                ballPosition: state.ball_position,
                ballOwner: state.ball_owner,
                type: (state.type == 0 ? GameStateType.START_POSITIONS : state.type == 1 ? GameStateType.MOVE : state.type == 2 ? GameStateType.GOAL_TEAM1 : GameStateType.GOAL_TEAM2) as GameStateType,
                clashRandomResults: state.clashRandomResults,
                team1Moves: state.team1_moves || [],
                team2Moves: state.team2_moves || []
            }

            history.push(gameState);
        }

        game.history = history;

        return game;
    }

    const fetchGameData = async () => {
        if (!gameId) return;

        const userTeamId = Number(localStorage.getItem('user_team_id'));
        console.log('userTeamId', userTeamId);

        try {
            setIsLoading(true);
            setError(null);

            console.log('Fetching game data for game ID:', gameId);

            let newGame = new Game(parseInt(gameId));
            newGame = await fetchGameFromSmartContract(newGame);
            console.log('newGame isCommitedMove 0', newGame.team1.isCommittedMove, newGame.team2.isCommittedMove);

            try {
                newGame = await fetchGameFromDatabase(newGame);
            } catch (err) {
                console.error('Error fetching game data from database:', err);
            }

            const isTwoTeamCommitted = newGame.team1.isCommittedMove && newGame.team2.isCommittedMove;

            console.log('newGame isCommitedMove 1', newGame.team1.isCommittedMove, newGame.team2.isCommittedMove);

            if (userTeamId) {
                const gameTeamInfo = Number(newGame.team1.teamId) === userTeamId ? newGame.team1 :
                    Number(newGame.team2.teamId) === userTeamId ? newGame.team2 : null;

                console.log('currentTeam', gameTeamInfo);
                setCurrentTeam(gameTeamInfo);

                const storedActions = localStorage.getItem('commitedActions');
                if (gameTeamInfo && gameTeamInfo!.isCommittedMove && storedActions) {
                    const commitedActionsData = JSON.parse(storedActions);

                    if (gameTeamInfo!.enum == TeamEnum.TEAM1) {
                        if (commitedActionsData.length > 0) {
                            newGame.team1.isCommittedMove = false;
                            for (const move of commitedActionsData) {
                                newGame.doPlayerMove(newGame.team1.players[move.playerId], move.moveType, move.oldPosition, move.newPosition);
                            }
                            newGame.commitMove(TeamEnum.TEAM1);
                        }
                    } else if (gameTeamInfo!.enum == TeamEnum.TEAM2) {
                        if (commitedActionsData.length > 0) {
                            newGame.team2.isCommittedMove = false;
                            for (const move of commitedActionsData) {
                                newGame.doPlayerMove(newGame.team2.players[move.playerId], move.moveType, move.oldPosition, move.newPosition);
                            }
                            newGame.commitMove(TeamEnum.TEAM2);
                        }
                    }
                }
            }

            console.log('newGame isCommitedMove 2', newGame.team1.isCommittedMove, newGame.team2.isCommittedMove);

            setGame(newGame);

            // calculating new game state
            if (newGame.team1.isCommittedMove && newGame.team2.isCommittedMove) {
                setIsTwoTeamCommitted(true);
            }

        } catch (err) {
            console.error('Error fetching game data:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch game data');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (!gameId) return;
        fetchGameData();
    }, [gameId]);

    return {
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
    };
}

