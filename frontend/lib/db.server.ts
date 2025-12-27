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
        // Try to select all columns including team1_moves and team2_moves
        // If those columns don't exist, we'll catch the error and retry without them
        let game;
        try {
            game = await db
            .select()
                .from(games)
                .where(eq(games.id, numericId))
                .limit(1);
        } catch (selectError: any) {
            // If the error is about missing columns, try selecting without team1_moves/team2_moves
            if (selectError?.message?.includes('team1_moves') || selectError?.message?.includes('team2_moves') || 
                selectError?.code === '42703') {
                console.warn('team1_moves/team2_moves columns not found, selecting without them');
                const [gameResult] = await db
                    .select({
                        id: games.id,
                        createdAt: games.createdAt,
                        lastMoveAt: games.lastMoveAt,
                        lastMoveTeam: games.lastMoveTeam,
                        team1: games.team1,
                        team2: games.team2,
                        status: games.status,
                        movesMade: games.movesMade,
                        winner: games.winner,
                        history: games.history,
                        team1Info: games.team1Info,
                        team2Info: games.team2Info,
                        team1Score: games.team1Score,
                        team2Score: games.team2Score,
                        historyIpfsCid: games.historyIpfsCid,
                        isVerified: games.isVerified
                    })
            .from(games)
            .where(eq(games.id, numericId))
            .limit(1);

                // Add null for missing columns to match expected interface
                game = gameResult ? [{
                    ...gameResult,
                    team1Moves: null,
                    team2Moves: null
                }] : [];
            } else {
                throw selectError;
            }
        }

        const [gameData] = game || [];

        if (!gameData) {
            return {
                success: false,
                error: 'GAME_NOT_FOUND',
                message: 'Game not found'
            };
        }

        return {
            success: true,
            data: gameData as unknown as GameInfo
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

