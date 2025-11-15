// app/api/waiting-rooms/update/route.ts
// Update an existing waiting room's settings including room_type

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { waitingRooms, teams } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            room_id,
            room_type,
            minimum_elo_rating,
            wallet_address
        } = body;

        // Authentication is handled by Next.js middleware
        // wallet_address is already validated by middleware
        // Sentry user context is set in middleware

        // Validate required fields
        if (!room_id) {
            return NextResponse.json(
                { success: false, error: 'Missing required field: room_id' },
                { status: 400 }
            );
        }

        // Validate room_type if provided
        if (room_type && !['public', 'private'].includes(room_type)) {
            return NextResponse.json(
                { success: false, error: 'Invalid room type. Must be "public" or "private"' },
                { status: 400 }
            );
        }

        // Get the waiting room
        const [room] = await db
            .select({
                id: waitingRooms.id,
                host_team_id: waitingRooms.hostTeamId,
                status: waitingRooms.status,
                guest_team_id: waitingRooms.guestTeamId,
                expires_at: waitingRooms.expiresAt
            })
            .from(waitingRooms)
            .where(eq(waitingRooms.id, room_id))
            .limit(1);

        if (!room) {
            return NextResponse.json(
                { success: false, error: 'Waiting room not found' },
                { status: 404 }
            );
        }

        // Verify the wallet owns the host team
        const [team] = await db
            .select({
                id: teams.id,
                primary_wallet: teams.primaryWallet
            })
            .from(teams)
            .where(eq(teams.id, room.host_team_id))
            .limit(1);

        if (!team) {
            return NextResponse.json(
                { success: false, error: 'Team not found' },
                { status: 404 }
            );
        }

        if (team.primary_wallet !== wallet_address) {
            return NextResponse.json(
                { success: false, error: 'You do not own this waiting room' },
                { status: 403 }
            );
        }

        // Check if room is still open and not expired
        if (room.status !== 'open') {
            return NextResponse.json(
                { success: false, error: 'Waiting room is no longer open' },
                { status: 400 }
            );
        }

        const now = new Date();
        if (room.expires_at <= now) {
            return NextResponse.json(
                { success: false, error: 'Waiting room has expired' },
                { status: 400 }
            );
        }

        // Don't allow updates if a guest has already joined
        if (room.guest_team_id) {
            return NextResponse.json(
                { success: false, error: 'Cannot update room settings after a guest has joined' },
                { status: 400 }
            );
        }

        // Build update object
        const updateData: any = {
            updated_at: now
        };

        if (room_type !== undefined) {
            updateData.room_type = room_type;
        }

        if (minimum_elo_rating !== undefined) {
            updateData.minimum_elo_rating = minimum_elo_rating;
        }

        // Update the waiting room
        const [updatedRoom] = await db
            .update(waitingRooms)
            .set(updateData)
            .where(eq(waitingRooms.id, room_id))
            .returning();

        if (!updatedRoom) {
            console.error('Error updating waiting room: not found after update');
            return NextResponse.json(
                { success: false, error: 'Failed to update waiting room' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            room: updatedRoom
        });

    } catch (error) {
        console.error('Error in update waiting room:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}