// app/api/waiting-rooms/[roomId]/join/route.ts
// Join a waiting room

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { waitingRooms, teams } from '@/db/schema';
import { alias } from 'drizzle-orm/pg-core';
import { and, eq } from 'drizzle-orm';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ roomId: string }> }
) {
    try {
        // Await params in Next.js 15
        const { roomId } = await params;
        const body = await request.json();
        const { team_id, wallet_address } = body;

        // Authentication is handled by Next.js middleware
        // wallet_address is already validated by middleware
        // Sentry user context is set in middleware

        const numericRoomId = Number(roomId);
        const hostTeam = alias(teams, 'host_team');

        const [room] = await db
            .select({
                id: waitingRooms.id,
                host_team_id: waitingRooms.hostTeamId,
                guest_team_id: waitingRooms.guestTeamId,
                status: waitingRooms.status,
                expires_at: waitingRooms.expiresAt,
                minimum_elo_rating: waitingRooms.minimumEloRating
            })
            .from(waitingRooms)
            .leftJoin(hostTeam, eq(waitingRooms.hostTeamId, hostTeam.id))
            .where(
                and(
                    eq(waitingRooms.id, numericRoomId),
                    eq(waitingRooms.status, 'open')
                )
            )
            .limit(1);

        if (!room) {
            return NextResponse.json(
                { success: false, error: 'Room not found or not open' },
                { status: 404 }
            );
        }

        // Check if room has expired
        if (new Date(room.expires_at) < new Date()) {
            await db
                .update(waitingRooms)
                .set({ status: 'expired' })
                .where(eq(waitingRooms.id, numericRoomId));

            return NextResponse.json(
                { success: false, error: 'Room has expired' },
                { status: 400 }
            );
        }

        // Verify team
        const [team] = await db
            .select({
                id: teams.id,
                elo_rating: teams.eloRating,
                active_game_id: teams.activeGameId
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

        // Check if team is the host
        if (team_id === room.host_team_id) {
            return NextResponse.json(
                { success: false, error: 'Cannot join your own room' },
                { status: 400 }
            );
        }

        // Check ELO rating requirement
        if (team.elo_rating < (room.minimum_elo_rating || 0)) {
            return NextResponse.json(
                { success: false, error: 'Your ELO rating is below the minimum requirement' },
                { status: 400 }
            );
        }

        // Update room with guest team
        const [updatedRoom] = await db
            .update(waitingRooms)
            .set({
                guestTeamId: team_id,
                status: 'full'
            })
            .where(
                and(
                    eq(waitingRooms.id, numericRoomId),
                    eq(waitingRooms.status, 'open')
                )
            )
            .returning();

        if (!updatedRoom) {
            return NextResponse.json(
                { success: false, error: 'Failed to join room (may be full)' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            room: updatedRoom
        });

    } catch (error) {
        console.error('Error joining waiting room:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}