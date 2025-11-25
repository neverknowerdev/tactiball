// app/api/cron/cleanup-rooms/route.ts

import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/database';
import { and, eq, lt } from 'drizzle-orm';

const { waitingRooms } = schema;

export async function POST(request: Request) {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Mark expired rooms
    await db
        .update(waitingRooms)
        .set({ status: 'expired' })
        .where(
            and(
                eq(waitingRooms.status, 'open'),
                lt(waitingRooms.expiresAt, new Date())
            )
        );

    return NextResponse.json({ success: true });
}