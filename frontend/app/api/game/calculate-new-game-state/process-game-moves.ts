import { Game, TeamEnum, GameAction, ValidationError, GameState, GameStateType } from "@/lib/game";
import { DBGame } from "./types";

export function processGameMoves(gameInfo: DBGame) {
    let game = new Game(gameInfo.id)
    game.saveState(gameInfo.history[gameInfo.history.length - 1])

    gameInfo.team1_moves.forEach((action: GameAction) => {
        // Find the player by ID in team1
        const player = game.team1.players.find(player => player.id === action.playerId);
        if (!player) {
            throw new ValidationError(
                TeamEnum.TEAM1,
                action.playerId,
                action,
                `Player ${action.playerId} not found`
            );
        }

        game.doPlayerMove(player, action.moveType, action.oldPosition, action.newPosition, false);
    });
    game.commitMove(TeamEnum.TEAM1);

    // Convert and process team2 actions
    gameInfo.team2_moves.forEach((action: GameAction) => {
        // Find the player by ID in team2
        const player = game.team2.players.find(player => player.id === action.playerId);
        if (!player) {
            throw new ValidationError(
                TeamEnum.TEAM2,
                action.playerId,
                action,
                `Player ${action.playerId} not found`
            );
        }

        game.doPlayerMove(player, action.moveType, action.oldPosition, action.newPosition, false);
    });

    game.commitMove(TeamEnum.TEAM2);

    const { newState, rendererStates } = game.calculateNewState();

    let statesToSend: GameState[] = [];

    let stateType: GameStateType = GameStateType.MOVE;

    rendererStates.forEach((state: GameState) => {
        if (state.type === GameStateType.GOAL_TEAM1 || state.type === GameStateType.GOAL_TEAM2) {
            stateType = state.type;
            statesToSend.push(state);
        }
    });
    statesToSend.push(newState);

    const gameResult = {
        statesToSend,
        gameId: game.gameId,
        stateType,
        team1Actions: gameInfo.team1_moves,
        team2Actions: gameInfo.team2_moves,
        ballPosition: game.ball.position,
        ballOwner: game.ball.ownerTeam,
        history: gameInfo.history,
        clashRandomResults: newState.clashRandomResults
    }

    return gameResult;
}