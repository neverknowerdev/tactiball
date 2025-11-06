// app/api/cron/cleanup-rooms/route.ts

import { NextResponse } from 'next/server';
import { createWriteClient } from '@/lib/supabase';

const supabase = createWriteClient();

export async function POST(request: Request) {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Mark expired rooms
    const { error } = await supabase
        .from('waiting_rooms')
        .update({ status: 'expired' })
        .eq('status', 'open')
        .lt('expires_at', new Date().toISOString());

    if (error) {
        console.error('Error cleaning up rooms:', error);
        return NextResponse.json({ error: 'Failed to cleanup' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}