import { type Address, decodeEventLog } from 'viem';
import gameArtifact from '../../artifacts/contracts/Game.sol/ChessBallGame.json';
import { publicClient } from './providers';
import { Position } from './game';

export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as Address || process.env.NEXT_PUBLIC_TESTNET_CONTRACT_ADDRESS as Address;
//  || (process.env.ENV == 'prod' ? '0x5582A4C5a7e1d1997189774Cb1785aCb3d1E063d' as Address : '0x4385EBE9D693b205fdf5CCB552E912e0bf9B533c' as Address)
// Import the ABI from the web3-functions directory
export const CONTRACT_ABI = gameArtifact.abi as any[];

export const RELAYER_ADDRESS = process.env.NEXT_PUBLIC_RELAYER_ADDRESS as Address || process.env.NEXT_PUBLIC_TESTNET_RELAYER_ADDRESS as Address;
//  || (process.env.ENV == 'prod' ? '0xc510350904b2fD01D9af92342f49a3c7aEC47739' as Address : '0x9B8af95247a68cE5dc38361D4A03f56bD8463D3f' as Address);

export interface DecodedEvent {
    eventName: string;
    args: Record<string, any>;
}

interface GameState {
    movesMade: number;
    lastMoveAt: number;
    team1MovesEncrypted: bigint;
    team2MovesEncrypted: bigint;
    lastMoveTeam: number;
    team1score: number;
    team2score: number;
}

interface TeamInfo {
    teamId: number;
    eloRating: number;
    eloRatingNew: number;
    formation: number;
}

export interface BoardState {
    team1PlayerPositions: Position[];
    team2PlayerPositions: Position[];
    ballPosition: Position;
    ballOwner: number;
}

// GameInfo structure that describes Game in DB
export interface GameInfo {
    gameId: number;
    createdAt: number;
    gameState: GameState;
    lastBoardState: BoardState;
    team1: TeamInfo;
    team2: TeamInfo;
    status: number;
    winner: number;
    historyIPFS: string;
    isVerified: boolean;
    encryptedKey: string; // Changed from ephemeralPublicKey to encryptedKey (bytes)
    gameEngineVersion: number;
}

// Custom error types for better error handling
export type GameFetchResult = {
    success: true;
    data: GameInfo;
} | {
    success: false;
    error: 'GAME_NOT_FOUND' | 'CONTRACT_ERROR' | 'NETWORK_ERROR';
    message: string;
};

/**
 * Fetch game data from the smart contract
 * @param gameId - The ID of the game to fetch
 * @returns Promise<GameFetchResult> - The game data or error information
 */
export async function getGameFromContract(gameId: string): Promise<GameFetchResult> {
    try {
        console.log('Fetching game data from contract for game ID:', gameId);

        // Call the getGame function on the smart contract
        const gameData = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'getGame',
            args: [BigInt(gameId)]
        });

        if (!gameData) {
            console.log('No game data returned from contract');
            return {
                success: false,
                error: 'GAME_NOT_FOUND',
                message: 'Game not found or failed to fetch from contract'
            };
        }

        const gameInfo = gameData as unknown as GameInfo;

        console.log('Raw game data from contract:', gameInfo);

        // Additional validation to ensure gameInfo has required properties
        if (!gameInfo || typeof gameInfo !== 'object') {
            console.log('Invalid game data structure returned from contract');
            return {
                success: false,
                error: 'GAME_NOT_FOUND',
                message: 'Invalid game data structure returned from contract'
            };
        }

        // Check for required properties
        if (gameInfo.gameId === undefined || gameInfo.gameId === null) {
            console.log('Game ID is missing from contract data');
            return {
                success: false,
                error: 'GAME_NOT_FOUND',
                message: 'Game ID is missing from contract data'
            };
        }

        return {
            success: true,
            data: gameInfo
        };
    } catch (error: any) {
        console.error('Error fetching game from contract:', error);

        // Check if the error is due to the game not existing
        if (error.message && (
            error.message.includes('DoesNotExist') ||
            error.message.includes('execution reverted') ||
            error.message.includes('Game does not exist')
        )) {
            return {
                success: false,
                error: 'GAME_NOT_FOUND',
                message: 'Game not found'
            };
        }

        // Check if it's a network/contract error
        if (error.message && (
            error.message.includes('network') ||
            error.message.includes('timeout') ||
            error.message.includes('connection')
        )) {
            return {
                success: false,
                error: 'NETWORK_ERROR',
                message: 'Network error occurred while fetching game data'
            };
        }

        // Generic contract error
        return {
            success: false,
            error: 'CONTRACT_ERROR',
            message: 'Failed to fetch game data from contract'
        };
    }
}


export class AbiDecoder {
    static decodeEventData(logData: any, topics: any): DecodedEvent {
        const decoded = decodeEventLog({
            abi: CONTRACT_ABI,
            data: logData,
            topics: topics
        });
        console.log('decoded', decoded);
        return decoded as DecodedEvent;
    }

    /**
     * Universal method to decode event args with automatic number conversion
     * @param decodedData - The decoded event data from decodeEventData
     * @returns Object with args converted to appropriate types
     */
    static decodeArgsWithTypes(decodedData: DecodedEvent) {
        const convertedArgs: any = {};

        // Convert all args to appropriate types
        for (const [key, value] of Object.entries(decodedData.args)) {
            // Convert BigInt to Number for numeric values
            if (typeof value === 'bigint') {
                convertedArgs[key] = Number(value);
            }
            // Convert string numbers to actual numbers if they look like numbers
            else if (typeof value === 'string' && /^\d+$/.test(value)) {
                convertedArgs[key] = Number(value);
            }
            // Keep other types as is
            else {
                convertedArgs[key] = value;
            }
        }

        return convertedArgs;
    }

    /**
     * Helper method to get typed args for specific event types
     * @param decodedData - The decoded event data
     * @returns Typed args object
     */
    static getTypedArgs<T = any>(decodedData: DecodedEvent): T {
        return this.decodeArgsWithTypes(decodedData) as T;
    }
}
