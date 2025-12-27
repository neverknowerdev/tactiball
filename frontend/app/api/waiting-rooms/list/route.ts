// app/api/waiting-rooms/list/route.ts
// List public waiting rooms + user's own private rooms

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { waitingRooms, teams } from '@/db/schema';
import { and, eq, gt, or, desc } from 'drizzle-orm';

type WaitingRoom = {
    id: number;
    host_team_id: number;
    guest_team_id: number | null;
    created_at: Date | null;
    status: string | null;
    room_type: string | null;
    expires_at: Date | null;
    minimum_elo_rating: number | null;
    host_team: {
        id: number;
        name: string | null;
        elo_rating: number | null;
        country: number | null;
    };
};

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '20');
        const offset = parseInt(searchParams.get('offset') || '0');
        const teamId = searchParams.get('team_id');
        const parsedTeamId = teamId ? Number(teamId) : null;
        const now = new Date();

        const visibilityCondition = parsedTeamId
            ? or(
                eq(waitingRooms.roomType, 'public'),
                and(
                    eq(waitingRooms.roomType, 'private'),
                    eq(waitingRooms.hostTeamId, parsedTeamId)
                )
            )
            : eq(waitingRooms.roomType, 'public');

        const rooms = await db
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
                    id: teams.id,
                    name: teams.name,
                    elo_rating: teams.eloRating,
                    country: teams.country
                }
            })
            .from(waitingRooms)
            .innerJoin(teams, eq(waitingRooms.hostTeamId, teams.id))
            .where(
                and(
                    eq(waitingRooms.status, 'open'),
                    gt(waitingRooms.expiresAt, now),
                    visibilityCondition
                )
            )
            .orderBy(desc(waitingRooms.createdAt))
            .limit(limit)
            .offset(offset);

        // Sort rooms: empty rooms first, then by creation date
        const sortedRooms = rooms.sort((a, b) => {
            if (!a.guest_team_id && b.guest_team_id) return -1;
            if (a.guest_team_id && !b.guest_team_id) return 1;
            const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
            const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
            return bTime - aTime;
        });

        return NextResponse.json({
            success: true,
            rooms: sortedRooms,
            total: rooms.length
        });

    } catch (error) {
        console.error('Error in list waiting rooms:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}