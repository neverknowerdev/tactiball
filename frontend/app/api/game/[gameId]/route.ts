import { NextRequest, NextResponse } from 'next/server';
import { getGameFromDBServer } from '@/lib/db.server';

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ gameId: string }> }
) {
    const { gameId } = await params;
    const result = await getGameFromDBServer(gameId);

    if (!result.success) {
        const status = result.error === 'GAME_NOT_FOUND' ? 404 : 500;
        return NextResponse.json(result, { status });
    }

    return NextResponse.json(result);
}

