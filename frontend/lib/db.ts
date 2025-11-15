import { db } from '@/lib/database';
import { games } from '@/db/schema';
import { eq } from 'drizzle-orm';


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
    data: GameInfo;
} | {
    success: false;
    error: 'GAME_NOT_FOUND' | 'DB_ERROR';
    message: string;
};

export async function getGameFromDB(gameId: string): Promise<GameFetchResult> {
    const numericId = Number(gameId);
    if (Number.isNaN(numericId)) {
        return {
            success: false,
            error: 'GAME_NOT_FOUND',
            message: 'Invalid game id'
        };
    }

    try {
        const [game] = await db
            .select()
            .from(games)
            .where(eq(games.id, numericId))
            .limit(1);

        if (!game) {
            return {
                success: false,
                error: 'GAME_NOT_FOUND',
                message: 'Game not found'
            };
        }

        return {
            success: true,
            data: game as GameInfo
        };
    } catch (error) {
        console.error('Error fetching game from DB:', error);
        return {
            success: false,
            error: 'DB_ERROR',
            message: 'Failed to fetch game data from DB'
        };
    }
}