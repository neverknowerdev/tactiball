// app/api/waiting-rooms/create/route.ts
// Create a new waiting room with public/private support

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { teams, waitingRooms } from '@/db/schema';
import { and, eq, gt, lte } from 'drizzle-orm';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            team_id,
            room_type,
            minimum_elo_rating,
            wallet_address
        } = body;

        // Authentication is handled by Next.js middleware
        // wallet_address is already validated by middleware
        // Sentry user context is set in middleware

        // Validate required fields
        if (!team_id) {
            return NextResponse.json(
                { success: false, error: 'Missing required field: team_id' },
                { status: 400 }
            );
        }

        // Validate room_type
        if (room_type && !['public', 'private'].includes(room_type)) {
            return NextResponse.json(
                { success: false, error: 'Invalid room type. Must be "public" or "private"' },
                { status: 400 }
            );
        }

        // Check if team exists and has no active game
        const [team] = await db
            .select({
                id: teams.id,
                active_game_id: teams.activeGameId,
                game_request_id: teams.gameRequestId,
            })
            .from(teams)
            .where(
                and(
                    eq(teams.id, team_id),
                    eq(teams.primaryWallet, wallet_address)
                )
            )
            .limit(1);

        if (!team) {
            return NextResponse.json(
                { success: false, error: 'Team not found' },
                { status: 404 }
            );
        }

        if (team.active_game_id) {
            return NextResponse.json(
                { success: false, error: 'Team already has an active game' },
                { status: 400 }
            );
        }

        // Check if team already has an open waiting room (non-expired)
        const now = new Date();
        const [existingRoom] = await db
            .select({
                id: waitingRooms.id,
                expires_at: waitingRooms.expiresAt,
            })
            .from(waitingRooms)
            .where(
                and(
                    eq(waitingRooms.hostTeamId, team_id),
                    eq(waitingRooms.status, 'open'),
                    gt(waitingRooms.expiresAt, now)
                )
            )
            .limit(1);

        if (existingRoom) {
            return NextResponse.json(
                { success: false, error: 'Team already has an open waiting room' },
                { status: 400 }
            );
        }

        // Auto-expire any old open rooms for this team
        await db
            .update(waitingRooms)
            .set({ status: 'expired' })
            .where(
                and(
                    eq(waitingRooms.hostTeamId, team_id),
                    eq(waitingRooms.status, 'open'),
                    lte(waitingRooms.expiresAt, now)
                )
            );

        // Set expiration to 24 hours from now
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        // Create waiting room
        const [room] = await db
            .insert(waitingRooms)
            .values({
                hostTeamId: team_id,
                roomType: room_type || 'public',
                minimumEloRating: minimum_elo_rating || 0,
                status: 'open',
                expiresAt,
            })
            .returning();

        return NextResponse.json({
            success: true,
            room
        });

    } catch (error) {
        console.error('Error in create waiting room:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}