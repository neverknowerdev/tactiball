// app/api/waiting-rooms/check-active/route.ts
// Check if a team has an active waiting room

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { waitingRooms } from '@/db/schema';
import { and, eq, gt, inArray, or } from 'drizzle-orm';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const teamId = searchParams.get('team_id');
        
        if (!teamId) {
            return NextResponse.json(
                { success: false, error: 'Missing required parameter: team_id' },
                { status: 400 }
            );
        }

        const parsedTeamId = Number(teamId);
        const now = new Date();

        // Check for any active room (open, full, or starting) that hasn't expired
        // Check both as host and as guest
        const [activeRoom] = await db
            .select({
                id: waitingRooms.id,
                status: waitingRooms.status,
            })
            .from(waitingRooms)
            .where(
                and(
                    or(
                        eq(waitingRooms.hostTeamId, parsedTeamId),
                        eq(waitingRooms.guestTeamId, parsedTeamId)
                    ),
                    inArray(waitingRooms.status, ['open', 'full', 'starting']),
                    gt(waitingRooms.expiresAt, now)
                )
            )
            .limit(1);

        return NextResponse.json({
            success: true,
            hasActiveRoom: !!activeRoom,
            activeRoom: activeRoom || null
        });

    } catch (error) {
        console.error('Error checking active room:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
