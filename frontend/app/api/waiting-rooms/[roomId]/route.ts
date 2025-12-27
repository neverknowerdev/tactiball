// app/api/waiting-rooms/[roomId]/route.ts
// Get details of a specific waiting room

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { waitingRooms, teams } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { publicClient } from '@/lib/providers';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/lib/contract';
import { chain } from '@/config/chains';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ roomId: string }> }
) {
    try {
        // Await params in Next.js 15
        const { roomId } = await params;

        const hostTeam = alias(teams, 'host_team');
        const guestTeam = alias(teams, 'guest_team');

        const [room] = await db
            .select({
                id: waitingRooms.id,
                host_team_id: waitingRooms.hostTeamId,
                guest_team_id: waitingRooms.guestTeamId,
                created_at: waitingRooms.createdAt,
                status: waitingRooms.status,
                room_type: waitingRooms.roomType,
                expires_at: waitingRooms.expiresAt,
                minimum_elo_rating: waitingRooms.minimumEloRating,
                game_request_id: waitingRooms.gameRequestId,
                host_team: {
                    id: hostTeam.id,
                    name: hostTeam.name,
                    elo_rating: hostTeam.eloRating,
                    country: hostTeam.country,
                    primary_wallet: hostTeam.primaryWallet
                },
                guest_team: {
                    id: guestTeam.id,
                    name: guestTeam.name,
                    elo_rating: guestTeam.eloRating,
                    country: guestTeam.country,
                    primary_wallet: guestTeam.primaryWallet
                }
            })
            .from(waitingRooms)
            .leftJoin(hostTeam, eq(waitingRooms.hostTeamId, hostTeam.id))
            .leftJoin(guestTeam, eq(waitingRooms.guestTeamId, guestTeam.id))
            .where(eq(waitingRooms.id, Number(roomId)))
            .limit(1);

        if (!room) {
            return NextResponse.json(
                { success: false, error: 'Room not found' },
                { status: 404 }
            );
        }

        // Validate game request exists in contract if one is stored in database
        if (room.game_request_id) {
            try {
                await publicClient.readContract({
                    address: CONTRACT_ADDRESS,
                    abi: CONTRACT_ABI,
                    functionName: 'getGameRequest',
                    args: [BigInt(room.game_request_id)]
                });
                // Game request exists in contract - all good
            } catch (error: any) {
                // Check if error is "DoesNotExist" - only clear database in that case
                const isDoesNotExist = error?.message?.includes('DoesNotExist') || 
                                      error?.shortMessage?.includes('DoesNotExist') ||
                                      error?.cause?.data?.errorName === 'DoesNotExist';
                
                if (isDoesNotExist) {
                    // Game request doesn't exist in contract - clear it from database
                    console.log(`Game request ${room.game_request_id} doesn't exist in contract, clearing from database`);
                    
                    try {
                        await db
                            .update(waitingRooms)
                            .set({
                                gameRequestId: null,
                                status: room.guest_team_id ? 'full' : 'open'
                            })
                            .where(eq(waitingRooms.id, room.id));

                        // Update the room object to reflect the cleared game request
                        room.game_request_id = null;
                        room.status = room.guest_team_id ? 'full' : 'open';
                    } catch (dbError) {
                        console.error('Error clearing game request from database:', dbError);
                        // Continue anyway - we'll try again on next fetch
                    }
                } else {
                    // Other error (network, etc.) - log but don't clear database
                    console.error('Error checking game request in contract:', error);
                }
            }
        }

        return NextResponse.json({
            success: true,
            room
        });

    } catch (error) {
        console.error('Error fetching waiting room:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}