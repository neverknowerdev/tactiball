import { Game, TeamEnum, GameAction, ValidationError, GameState, GameStateType, deserializeMoves } from "@/lib/game";
import { BoardState, GameInfo } from "@/lib/contract";
import { decodeSymmetricKey, decodeData, bufferToBigint } from "@/lib/encrypting";

export function processGameMoves(gameInfo: GameInfo) {
    // Validate gameInfo structure
    if (!gameInfo) {
        throw new Error('GameInfo is null or undefined');
    }

    if (!gameInfo.gameId) {
        throw new Error('GameInfo.gameId is null or undefined');
    }

    if (!gameInfo.lastBoardState) {
        throw new Error('GameInfo.lastBoardState is null or undefined');
    }

    if (!gameInfo.gameState) {
        throw new Error('GameInfo.gameState is null or undefined');
    }

    let game = new Game(gameInfo.gameId)
    // Convert lastBoardState from contract to GameState format
    const lastBoardState: GameState = convertLastBoardStateToGameState(gameInfo.lastBoardState);
    game.saveState(lastBoardState)

    const gameEnginePrivateKey = process.env.GAME_ENGINE_PRIVATE_KEY || process.env.TESTNET_GAME_ENGINE_PRIVATE_KEY;
    if (!gameEnginePrivateKey) {
        throw new Error('GAME_ENGINE_PRIVATE_KEY is not set');
    }

    // Decrypt the symmetric key using the game engine's private key
    // Convert hex string (from contract bytes) to Buffer for decryption
    const encryptedKeyBuffer = Buffer.from(gameInfo.encryptedKey.slice(2), 'hex'); // Remove '0x' prefix
    const symmetricKey = decodeSymmetricKey(encryptedKeyBuffer, gameEnginePrivateKey);

    console.log('symmetricKey', symmetricKey);

    // Convert the encrypted moves from hex string to Buffer and decrypt them
    const team1MovesEncryptedHex = gameInfo.gameState.team1MovesEncrypted.toString();
    const team1MovesEncryptedBuffer = Buffer.from(team1MovesEncryptedHex.slice(2), 'hex'); // Remove '0x' prefix
    const team1MovesDecryptedBuffer = decodeData(team1MovesEncryptedBuffer, gameInfo.gameState.movesMade, symmetricKey);
    const team1MovesDecryptedBigInt = bufferToBigint(team1MovesDecryptedBuffer);
    const team1Moves = deserializeMoves(team1MovesDecryptedBigInt.toString(), TeamEnum.TEAM1);

    const team2MovesEncryptedHex = gameInfo.gameState.team2MovesEncrypted.toString();
    const team2MovesEncryptedBuffer = Buffer.from(team2MovesEncryptedHex.slice(2), 'hex'); // Remove '0x' prefix
    const team2MovesDecryptedBuffer = decodeData(team2MovesEncryptedBuffer, gameInfo.gameState.movesMade, symmetricKey);
    const team2MovesDecryptedBigInt = bufferToBigint(team2MovesDecryptedBuffer);
    const team2Moves = deserializeMoves(team2MovesDecryptedBigInt.toString(), TeamEnum.TEAM2);

    team1Moves.forEach((action: GameAction) => {
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
    team2Moves.forEach((action: GameAction) => {
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
    console.log('newState', newState);

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
        team1Actions: team1Moves,
        team2Actions: team2Moves,
        ballPosition: game.ball.position,
        newState: newState,
        boardState: convertGameStateToBoardState(newState),
        ballOwner: game.ball.ownerTeam,
        history: game.history,
        clashRandomResults: newState.clashRandomResults
    }

    console.log('gameResult', gameResult);

    return gameResult;
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

function convertGameStateToBoardState(historyItem: GameState): BoardState {
    return {
        team1PlayerPositions: historyItem.team1PlayerPositions,
        team2PlayerPositions: historyItem.team2PlayerPositions,
        ballPosition: historyItem.ballPosition,
        ballOwner: historyItem.ballOwner === TeamEnum.TEAM1 ? 1 :
            historyItem.ballOwner === TeamEnum.TEAM2 ? 2 :
                0,
    }
}