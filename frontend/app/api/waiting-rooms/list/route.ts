// app/api/waiting-rooms/list/route.ts
// Get list of all open waiting rooms

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
    try {
        // Get query parameters
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '20');
        const offset = parseInt(searchParams.get('offset') || '0');

        // Fetch open waiting rooms with host team info
        const { data: rooms, error } = await supabase
            .from('waiting_rooms')
            .select(`
                *,
                host_team:teams!host_team_id (
                    id,
                    name,
                    elo_rating,
                    country
                )
            `)
            .eq('status', 'open')
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            console.error('Error fetching waiting rooms:', error);
            return NextResponse.json(
                { success: false, error: 'Failed to fetch waiting rooms' },
                { status: 500 }
            );
        }

        // Sort rooms: unfulfilled rooms first
        const sortedRooms = rooms.sort((a, b) => {
            // Unfulfilled (no guest) rooms first
            if (!a.guest_team_id && b.guest_team_id) return -1;
            if (a.guest_team_id && !b.guest_team_id) return 1;
            // Then by creation time (newest first)
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
