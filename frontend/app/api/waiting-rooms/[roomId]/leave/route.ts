// app/api/waiting-rooms/[roomId]/leave/route.ts
// Leave a waiting room

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { waitingRooms } from '@/db/schema';
import { eq } from 'drizzle-orm';

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

        const [room] = await db
            .select({
                id: waitingRooms.id,
                host_team_id: waitingRooms.hostTeamId,
                guest_team_id: waitingRooms.guestTeamId
            })
            .from(waitingRooms)
            .where(eq(waitingRooms.id, numericRoomId))
            .limit(1);

        if (!room) {
            return NextResponse.json(
                { success: false, error: 'Room not found' },
                { status: 404 }
            );
        }

        // Check if user is host or guest
        if (room.host_team_id === team_id) {
            // Host is leaving, cancel the room
            const [updated] = await db
                .update(waitingRooms)
                .set({ status: 'cancelled' })
                .where(eq(waitingRooms.id, numericRoomId))
                .returning({ id: waitingRooms.id });

            if (!updated) {
                return NextResponse.json(
                    { success: false, error: 'Failed to cancel room' },
                    { status: 500 }
                );
            }

            return NextResponse.json({
                success: true,
                message: 'Room cancelled'
            });
        } else if (room.guest_team_id === team_id) {
            // Guest is leaving, remove them and reopen room
            const [updated] = await db
                .update(waitingRooms)
                .set({
                    guestTeamId: null,
                    status: 'open'
                })
                .where(eq(waitingRooms.id, numericRoomId))
                .returning({ id: waitingRooms.id });

            if (!updated) {
                return NextResponse.json(
                    { success: false, error: 'Failed to leave room' },
                    { status: 500 }
                );
            }

            return NextResponse.json({
                success: true,
                message: 'Left room successfully'
            });
        } else {
            return NextResponse.json(
                { success: false, error: 'You are not in this room' },
                { status: 400 }
            );
        }

    } catch (error) {
        console.error('Error leaving waiting room:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}