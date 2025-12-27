// app/api/waiting-rooms/[roomId]/cancel-game-request/route.ts
// UI-only cancellation of game request (no contract interaction)

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { waitingRooms, teams } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { checkAuthSignatureAndMessage } from '@/lib/auth';
import { WebSocketBroadcastingService } from '@/lib/ably';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ roomId: string }> }
) {
    try {
        const { roomId } = await params;
        const { wallet_address, signature, message } = await request.json();

        // Validate required fields
        if (!wallet_address || !signature || !message) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Validate signature and message
        const { isValid, error } = await checkAuthSignatureAndMessage(signature, message, wallet_address);
        if (!isValid) {
            return NextResponse.json(
                { success: false, error: error },
                { status: 401 }
            );
        }

        // Get the room
        const [room] = await db
            .select({
                id: waitingRooms.id,
                hostTeamId: waitingRooms.hostTeamId,
                guestTeamId: waitingRooms.guestTeamId,
                gameRequestId: waitingRooms.gameRequestId,
                status: waitingRooms.status
            })
            .from(waitingRooms)
            .where(eq(waitingRooms.id, Number(roomId)))
            .limit(1);

        if (!room) {
            return NextResponse.json(
                { success: false, error: 'Room not found' },
                { status: 404 }
            );
        }

        // Verify user is either host or guest
        const [hostTeam] = await db
            .select({ primaryWallet: teams.primaryWallet })
            .from(teams)
            .where(eq(teams.id, room.hostTeamId))
            .limit(1);

        const [guestTeam] = room.guestTeamId ? await db
            .select({ primaryWallet: teams.primaryWallet })
            .from(teams)
            .where(eq(teams.id, room.guestTeamId))
            .limit(1) : [null];

        const isHost = hostTeam?.primaryWallet?.toLowerCase() === wallet_address.toLowerCase();
        const isGuest = guestTeam?.primaryWallet?.toLowerCase() === wallet_address.toLowerCase();

        if (!isHost && !isGuest) {
            return NextResponse.json(
                { success: false, error: 'You are not a participant in this room' },
                { status: 403 }
            );
        }

        // Get the cancelling user's team info for the message
        const cancellingTeamId = isHost ? room.hostTeamId : (room.guestTeamId || null);
        if (!cancellingTeamId) {
            return NextResponse.json(
                { success: false, error: 'Invalid room state' },
                { status: 400 }
            );
        }
        const [cancellingTeam] = await db
            .select({ name: teams.name, id: teams.id })
            .from(teams)
            .where(eq(teams.id, cancellingTeamId))
            .limit(1);

        // Clear game request from database
        await db
            .update(waitingRooms)
            .set({
                gameRequestId: null,
                status: room.guestTeamId ? 'full' : 'open'
            })
            .where(eq(waitingRooms.id, room.id));

        // Broadcast cancellation to both teams via WebSocket
        const ablyApiKey = process.env.ABLY_BROADCASTING_API_KEY;
        if (ablyApiKey && room.hostTeamId && room.guestTeamId) {
            const wsService = new WebSocketBroadcastingService(ablyApiKey);
            
            // Broadcast to both teams
            await wsService.broadcastToGameTeams(Number(room.hostTeamId), Number(room.guestTeamId), {
                type: 'GAME_REQUEST_UI_CANCELLED',
                room_id: room.id,
                cancelled_by_team_id: cancellingTeamId,
                cancelled_by_team_name: cancellingTeam?.name || 'Player',
                timestamp: Date.now()
            });

            await wsService.close();
        }

        return NextResponse.json({
            success: true,
            message: 'Game request cancelled',
            data: {
                cancelled_by: cancellingTeam?.name || 'Player',
                cancelled_by_team_id: cancellingTeamId
            }
        });

    } catch (error) {
        console.error('Error cancelling game request:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
