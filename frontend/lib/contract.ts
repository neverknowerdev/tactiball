import { type Address } from 'viem';
import gameArtifact from '../../artifacts/contracts/Game.sol/ChessBallGame.json';
import { publicClient } from './providers';

export const CONTRACT_ADDRESS = '0x4d9FFa66dfb960571013e17096690EE0b13555c4' as Address;
// Import the ABI from the web3-functions directory
export const CONTRACT_ABI = gameArtifact.abi as any[];

// Custom error types for better error handling
export type GameFetchResult = {
    success: true;
    data: any;
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
