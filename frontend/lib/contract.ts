import { type Address } from 'viem';
import gameArtifact from '../../artifacts/contracts/Game.sol/ChessBallGame.json';
import { publicClient } from './providers';
import { createAnonClient } from './supabase';

export const CONTRACT_ADDRESS = '0x739b4fc0DD8B592Da1F5216b1DcB19C77EE77dB3' as Address;
// Import the ABI from the web3-functions directory
export const CONTRACT_ABI = gameArtifact.abi as any[];

// GameInfo structure that describes Game in DB
export interface GameInfo {
    id: number;
    created_at: string;
    last_move_at: string | null;
    last_move_team: number | null;
    team1: number;
    team2: number;
    status: 'active' | 'finished' | 'finished_by_timeout';
    moves_made: number;
    team1_moves: any[];
    team2_moves: any[];
    winner: number | null;
    history: any[];
    team1_info: Record<string, any>;
    team2_info: Record<string, any>;
    team1_score: number;
    team2_score: number;
    history_ipfs_cid: string | null;
    is_verified: boolean;
}

// Custom error types for better error handling
export type GameFetchResult = {
    success: true;
    data: GameInfo | any; // Can be GameInfo (from DB) or contract data
} | {
    success: false;
    error: 'GAME_NOT_FOUND' | 'CONTRACT_ERROR' | 'NETWORK_ERROR';
    message: string;
};

export async function getGameFromDB(gameId: string): Promise<GameFetchResult> {
    const supabase = createAnonClient();
    const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single();

    if (error) {
        console.error('Error fetching game from DB:', error);
        return {
            success: false,
            error: 'GAME_NOT_FOUND',
            message: 'Failed to fetch game data from DB'
        };
    }

    return {
        success: true,
        data: data as GameInfo
    };
}



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

        console.log('Raw game data from contract:', gameData);

        if (!gameData) {
            console.log('No game data returned from contract');
            return {
                success: false,
                error: 'GAME_NOT_FOUND',
                message: 'Game not found or failed to fetch from contract'
            };
        }

        return {
            success: true,
            data: gameData
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
