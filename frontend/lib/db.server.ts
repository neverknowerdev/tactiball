'use server';

import { db } from '@/lib/database';
import { games } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { GameFetchResult, GameInfo } from '@/lib/db.types';

export async function getGameFromDBServer(gameId: string): Promise<GameFetchResult> {
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

