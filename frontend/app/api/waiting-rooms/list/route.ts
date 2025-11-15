// app/api/waiting-rooms/list/route.ts
// List public waiting rooms + user's own private rooms

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { waitingRooms, teams } from '@/db/schema';
import { and, eq, gt, or, desc } from 'drizzle-orm';

type WaitingRoom = {
    id: string;
    host_team_id: string;
    guest_team_id: string | null;
    created_at: string;
    status: string;
    room_type: string;
    expires_at: string;
    host_team: {
        id: string;
        name: string;
        elo_rating: number;
        country: string;
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
        const sortedRooms = rooms.sort((a: WaitingRoom, b: WaitingRoom) => {
            if (!a.guest_team_id && b.guest_team_id) return -1;
            if (a.guest_team_id && !b.guest_team_id) return 1;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
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