import { BoardState } from "@/lib/contract";
import { GameAction, GameState, TeamEnum, ValidationError } from "@/lib/game";
import { GameStateType, Game } from "@/lib/game";


export function validateMoves(boardState: BoardState, moves: GameAction[]): ValidationError | null {
    const gameState: GameState = convertLastBoardStateToGameState(boardState);

    const game = new Game(0);
    game.saveState(gameState);
    game.restoreState(gameState);

    // Validate each move
    for (const move of moves) {
        const player = game.team1.players.find(player => player.id === move.playerId);
        if (!player) {
            throw new ValidationError(
                TeamEnum.TEAM1,
                move.playerId,
                move,
                `Player ${move.playerId} not found`
            );
        }

        game.doPlayerMove(player, move.moveType, move.oldPosition, move.newPosition);
    }

    game.commitMove(moves[0].teamEnum);
    const validationError = game.validateMoves();
    if (validationError) {
        return validationError;
    }

    return null;
}

function convertLastBoardStateToGameState(lastBoardState: BoardState): GameState {
    return {
        team1Moves: [],
        team2Moves: [],
        team1PlayerPositions: lastBoardState.team1PlayerPositions,
        team2PlayerPositions: lastBoardState.team2PlayerPositions,
        ballPosition: lastBoardState.ballPosition,
        ballOwner: lastBoardState.ballOwner === 1 ? TeamEnum.TEAM1 :
            lastBoardState.ballOwner === 2 ? TeamEnum.TEAM2 :
                lastBoardState.ballOwner === 0 ? null : null,
        type: GameStateType.MOVE,
        clashRandomResults: []
    }
}