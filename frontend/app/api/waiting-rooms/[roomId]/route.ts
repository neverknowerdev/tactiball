// app/api/waiting-rooms/[roomId]/route.ts
// Get details of a specific waiting room

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { waitingRooms, teams } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ roomId: string }> }
) {
    try {
        // Await params in Next.js 15
        const { roomId } = await params;

        const hostTeam = alias(teams, 'host_team');
        const guestTeam = alias(teams, 'guest_team');

        const [room] = await db
            .select({
                id: waitingRooms.id,
                host_team_id: waitingRooms.hostTeamId,
                guest_team_id: waitingRooms.guestTeamId,
                created_at: waitingRooms.createdAt,
                status: waitingRooms.status,
                room_type: waitingRooms.roomType,
                expires_at: waitingRooms.expiresAt,
                minimum_elo_rating: waitingRooms.minimumEloRating,
                host_team: {
                    id: hostTeam.id,
                    name: hostTeam.name,
                    elo_rating: hostTeam.eloRating,
                    country: hostTeam.country,
                    primary_wallet: hostTeam.primaryWallet
                },
                guest_team: {
                    id: guestTeam.id,
                    name: guestTeam.name,
                    elo_rating: guestTeam.eloRating,
                    country: guestTeam.country,
                    primary_wallet: guestTeam.primaryWallet
                }
            })
            .from(waitingRooms)
            .leftJoin(hostTeam, eq(waitingRooms.hostTeamId, hostTeam.id))
            .leftJoin(guestTeam, eq(waitingRooms.guestTeamId, guestTeam.id))
            .where(eq(waitingRooms.id, Number(roomId)))
            .limit(1);

        if (!room) {
            return NextResponse.json(
                { success: false, error: 'Room not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            room
        });

    } catch (error) {
        console.error('Error fetching waiting room:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}