import { Game, TeamEnum, GameAction, ValidationError, GameState, GameStateType, deserializeMoves } from "@/lib/game";
import { BoardState, GameInfo } from "@/lib/contract";
import { decodeSymmetricKey, decodeData, bufferToBigint } from "@/lib/encrypting";

/**
 * Attempts to decode moves with temporal fallback logic
 * First tries with movesMade, then with movesMade-1 if the first attempt fails
 * @param encryptedMovesBuffer - The encrypted moves buffer
 * @param movesMade - The current movesMade value
 * @param symmetricKey - The symmetric key for decryption
 * @param teamEnum - The team enum for deserialization
 * @returns Decoded and deserialized moves
 */
function decodeMovesWithTemporalFallback(
    encryptedMovesBuffer: Buffer,
    movesMade: number,
    symmetricKey: string,
    teamEnum: TeamEnum
): GameAction[] {
    try {
        // First attempt: try with current movesMade
        console.log(`🔓 Attempting to decode moves with movesMade=${movesMade}`);
        const decryptedBuffer = decodeData(encryptedMovesBuffer, movesMade, symmetricKey);
        const decryptedBigInt = bufferToBigint(decryptedBuffer);
        const decryptedString = decryptedBigInt.toString();

        // Check if the decrypted data matches expected format
        if (decryptedString.startsWith('1') && decryptedString.length >= 11 && decryptedString.length <= 61) {
            console.log(`✅ Successfully decoded moves with movesMade=${movesMade}`);
            return deserializeMoves(decryptedString, teamEnum);
        } else {
            console.log(`⚠️  Decrypted data doesn't match expected format with movesMade=${movesMade}`);
            throw new Error('Invalid decrypted data format');
        }
    } catch (error) {
        console.log(`❌ Failed to decode with movesMade=${movesMade}, trying movesMade-1`);

        // Second attempt: try with movesMade-1
        if (movesMade > 0) {
            try {
                const fallbackMovesMade = movesMade - 1;
                console.log(`🔓 Attempting to decode moves with movesMade=${fallbackMovesMade} (fallback)`);
                const decryptedBuffer = decodeData(encryptedMovesBuffer, fallbackMovesMade, symmetricKey);
                const decryptedBigInt = bufferToBigint(decryptedBuffer);
                const decryptedString = decryptedBigInt.toString();

                // Check if the decrypted data matches expected format
                if (decryptedString.startsWith('1') && decryptedString.length >= 11 && decryptedString.length <= 61) {
                    console.log(`✅ Successfully decoded moves with movesMade=${fallbackMovesMade} (fallback)`);
                    return deserializeMoves(decryptedString, teamEnum);
                } else {
                    console.log(`⚠️  Decrypted data doesn't match expected format with movesMade=${fallbackMovesMade}`);
                    throw new Error('Invalid decrypted data format in fallback');
                }
            } catch (fallbackError) {
                console.error(`❌ Both attempts failed. Original error: ${(error as Error).message}, Fallback error: ${(fallbackError as Error).message}`);
                throw new Error(`Failed to decode moves with both movesMade=${movesMade} and movesMade=${movesMade - 1}. This might indicate corrupted data or incorrect symmetric key.`);
            }
        } else {
            console.error(`❌ Cannot try fallback with movesMade=${movesMade} (already at minimum)`);
            throw error;
        }
    }
}

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

    // console.log('symmetricKey', symmetricKey);

    // Convert the encrypted moves from hex string to Buffer and decrypt them with temporal fallback
    console.log(`🔓 Decoding moves for game ${gameInfo.gameId} with movesMade=${gameInfo.gameState.movesMade}`);

    const team1MovesEncryptedHex = gameInfo.gameState.team1MovesEncrypted.toString();
    const team1MovesEncryptedBuffer = Buffer.from(team1MovesEncryptedHex.slice(2), 'hex'); // Remove '0x' prefix
    const team1Moves = decodeMovesWithTemporalFallback(
        team1MovesEncryptedBuffer,
        gameInfo.gameState.movesMade,
        symmetricKey,
        TeamEnum.TEAM1
    );

    const team2MovesEncryptedHex = gameInfo.gameState.team2MovesEncrypted.toString();
    const team2MovesEncryptedBuffer = Buffer.from(team2MovesEncryptedHex.slice(2), 'hex'); // Remove '0x' prefix
    const team2Moves = decodeMovesWithTemporalFallback(
        team2MovesEncryptedBuffer,
        gameInfo.gameState.movesMade,
        symmetricKey,
        TeamEnum.TEAM2
    );

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