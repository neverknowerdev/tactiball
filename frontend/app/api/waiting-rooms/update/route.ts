// app/api/waiting-rooms/update/route.ts
// Update an existing waiting room's settings

import { NextRequest, NextResponse } from 'next/server';
import { createWriteClient } from '@/lib/supabase';
import { checkAuthSignatureAndMessage } from '@/lib/auth';

const supabase = createWriteClient();

export async function POST(request: NextRequest) {
    try {
        const {
            room_id,
            minimum_elo_rating,
            wallet_address,
            signature,
            message
        } = await request.json();

        // Validate required fields
        if (!room_id || !wallet_address || !signature || !message) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Validate signature
        const { isValid, error: authError } = await checkAuthSignatureAndMessage(
            signature,
            message,
            wallet_address
        );

        if (!isValid) {
            return NextResponse.json(
                { success: false, error: authError },
                { status: 401 }
            );
        }

        // Get the waiting room
        const { data: room, error: roomError } = await supabase
            .from('waiting_rooms')
            .select('id, host_team_id, status, guest_team_id, expires_at')
            .eq('id', room_id)
            .single();

        if (roomError || !room) {
            return NextResponse.json(
                { success: false, error: 'Waiting room not found' },
                { status: 404 }
            );
        }

        // Verify the wallet owns the host team
        const { data: team, error: teamError } = await supabase
            .from('teams')
            .select('id, primary_wallet')
            .eq('id', room.host_team_id)
            .single();

        if (teamError || !team) {
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

        const now = new Date().toISOString();
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

        // Update the waiting room
        const { data: updatedRoom, error: updateError } = await supabase
            .from('waiting_rooms')
            .update({
                minimum_elo_rating: minimum_elo_rating ?? 0,
                updated_at: now
            })
            .eq('id', room_id)
            .select()
            .single();

        if (updateError) {
            console.error('Error updating waiting room:', updateError);
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