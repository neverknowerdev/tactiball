import type { GameFetchResult } from '@/lib/db.types';

export type { GameInfo, GameFetchResult } from '@/lib/db.types';

type GameError = Extract<GameFetchResult, { success: false }>;

export async function getGameFromDB(gameId: string): Promise<GameFetchResult> {
    if (!gameId) {
        return {
            success: false,
            error: 'GAME_NOT_FOUND',
            message: 'Invalid game id'
        };
    }

    try {
        const response = await fetch(`/api/game/${gameId}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            },
            cache: 'no-store'
        });

        if (!response.ok) {
            const errorBody = await response.json().catch(() => null);
            return {
                success: false,
                error: (errorBody?.error as GameError['error']) ?? 'DB_ERROR',
                message: errorBody?.message ?? 'Failed to fetch game data from DB'
            };
        }

        const data = await response.json() as GameFetchResult;
        return data;
    } catch (error) {
        console.error('Error fetching game via API:', error);
        return {
            success: false,
            error: 'DB_ERROR',
            message: 'Failed to fetch game data from DB'
        };
    }
}