// app/api/waiting-rooms/[roomId]/start/route.ts
// Update room with game request ID and change status to 'starting'

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
        const { game_request_id } = await request.json();

        if (!game_request_id) {
            return NextResponse.json(
                { success: false, error: 'Missing game_request_id' },
                { status: 400 }
            );
        }

        // Update room status to 'starting' and add game request ID
        const [updatedRoom] = await db
            .update(waitingRooms)
            .set({
                gameRequestId: game_request_id,
                status: 'starting'
            })
            .where(eq(waitingRooms.id, Number(roomId)))
            .returning();

        if (!updatedRoom) {
            console.error('Error updating room: not found');
            return NextResponse.json(
                { success: false, error: 'Failed to update room' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            room: updatedRoom
        });

    } catch (error) {
        console.error('Error in room start:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}