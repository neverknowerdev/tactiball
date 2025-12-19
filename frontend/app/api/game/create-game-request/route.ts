import { NextRequest, NextResponse } from 'next/server';
import { type Address, BaseError, ContractFunctionRevertedError, parseEventLogs } from 'viem';
import { publicClient } from '@/lib/providers';
import { sendTransactionWithRetry } from '@/lib/paymaster';
import { CONTRACT_ABI, CONTRACT_ADDRESS, RELAYER_ADDRESS } from '@/lib/contract';
import { base } from 'viem/chains';
import { chain } from '@/config/chains';
import { sendWebhookMessage } from '@/lib/webhook';
import { db } from '@/lib/database';
import { waitingRooms, teams } from '@/db/schema';
import { and, eq, or } from 'drizzle-orm';

interface CreateGameRequestRequest {
    wallet_address: string;
    signature: string;
    message: string;
    team1_id: number;
    team2_id: number;
}

(BigInt.prototype as any).toJSON = function () {
    return this.toString()
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { team1_id, team2_id, wallet_address, room_id } = body;

        // Authentication is handled by Next.js middleware
        // wallet_address is already validated by middleware
        // Sentry user context is set in middleware

        // Validate required fields
        if (!team1_id || !team2_id) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields: team1_id and team2_id' },
                { status: 400 }
            );
        }

        // Validate team IDs
        if (team1_id <= 0 || team2_id <= 0) {
            return NextResponse.json(
                { success: false, error: 'Invalid team IDs' },
                { status: 400 }
            );
        }

        if (team1_id === team2_id) {
            return NextResponse.json(
                { success: false, error: 'Teams cannot be the same' },
                { status: 400 }
            );
        }

        // Log the request details for debugging
        console.log('Creating game request:', {
            wallet_address,
            team1_id,
            team2_id,
            room_id
        });

        // Simulate the transaction first using publicClient
        const simulation = await publicClient.simulateContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'createGameRequestRelayer',
            args: [wallet_address as Address, team1_id, team2_id],
            chain: chain,
            account: RELAYER_ADDRESS
        });

        const paymasterReceipt = await sendTransactionWithRetry(simulation.request);

        const logs = parseEventLogs({
            abi: CONTRACT_ABI,
            logs: paymasterReceipt.logs,
        });

        await sendWebhookMessage(logs);

        // Extract gameRequestId from GameRequestCreated event
        const gameRequestCreatedEvent = logs.find(
            (log: any) => log.eventName === 'GameRequestCreated'
        ) as { eventName: string; args: { gameRequestId: bigint } } | undefined;

        if (!gameRequestCreatedEvent) {
            return NextResponse.json(
                { success: false, error: 'GameRequestCreated event not found in transaction logs' },
                { status: 500 }
            );
        }

        const gameRequestId = Number(gameRequestCreatedEvent.args.gameRequestId);

        console.log('Creating game request with relayer:', {
            wallet_address,
            team1_id,
            team2_id,
            gameRequestId,
            transactionHash: paymasterReceipt.receipt.transactionHash
        });

        // Check if this game request came from a waiting room
        // If room_id is provided, update that specific room
        // Otherwise, try to find a matching room
        try {
            let roomToUpdate = null;
            
            if (room_id) {
                // Update the specific room if room_id is provided
                const [specificRoom] = await db
                    .select({ id: waitingRooms.id })
                    .from(waitingRooms)
                    .where(eq(waitingRooms.id, Number(room_id)))
                    .limit(1);
                
                if (specificRoom) {
                    roomToUpdate = specificRoom;
                }
            } else {
                // Fallback: try to find a matching room by team IDs
                // Check for both 'full' and 'starting' status (in case previous game request was cancelled)
                const [room] = await db
                    .select({ id: waitingRooms.id })
                    .from(waitingRooms)
                    .where(
                        and(
                            eq(waitingRooms.hostTeamId, team1_id),
                            eq(waitingRooms.guestTeamId, team2_id),
                            or(
                                eq(waitingRooms.status, 'full'),
                                eq(waitingRooms.status, 'starting')
                            )
                        )
                    )
                    .limit(1);
                
                if (room) {
                    roomToUpdate = room;
                }
            }

            if (roomToUpdate) {
                await db
                    .update(waitingRooms)
                    .set({
                        gameRequestId: gameRequestId,
                        status: 'starting'
                    })
                    .where(eq(waitingRooms.id, roomToUpdate.id));

                console.log('Updated waiting room:', roomToUpdate.id);
            }
        } catch (waitingRoomError) {
            console.error('Error updating waiting room:', waitingRoomError);
        }

        return NextResponse.json({
            success: true,
            message: 'Game request created successfully',
            data: {
                gameRequestId: gameRequestId,
                team1_id,
                team2_id,
                status: 'pending',
                transactionHash: paymasterReceipt.receipt.transactionHash
            }
        });

    } catch (error) {
        console.error('Error creating game request:', error);

        if (error instanceof BaseError) {
            const revertError = error.walk(err => err instanceof ContractFunctionRevertedError)
            if (revertError instanceof ContractFunctionRevertedError) {
                const errorName = revertError.data?.errorName ?? '';
                console.log("Contract error:", errorName);

                // Handle custom validation errors from contract
                switch (errorName) {
                    case 'TeamsCannotBeSame':
                        return NextResponse.json(
                            { success: false, error: 'Teams cannot be the same', errorName: errorName },
                            { status: 400 }
                        );
                    case 'DoesNotExist':
                        return NextResponse.json(
                            { success: false, error: 'One or both teams do not exist', errorName: errorName },
                            { status: 400 }
                        );
                    case 'TeamAlreadyHasActiveGame':
                        return NextResponse.json(
                            { success: false, error: 'One or both teams already have an active game', errorName: errorName },
                            { status: 400 }
                        );
                    case 'GameRequestNotExpired':
                        return NextResponse.json(
                            { success: false, error: 'Please wait a moment before creating a new game request. Your previous request needs to expire first (about 1 minute).', errorName: errorName },
                            { status: 400 }
                        );
                    case 'GameOwnerShouldCall':
                        // This error means the wallet_address doesn't match team1's wallet in the contract
                        // The contract requires: teams[team1id].wallet == sender
                        console.error('GameOwnerShouldCall error - wallet mismatch:', {
                            wallet_address,
                            team1_id,
                            team2_id,
                            error: 'Wallet does not match team1 wallet in contract'
                        });
                        
                        // Try to get team1's wallet from contract for better error message
                        try {
                            const team1DataResult: unknown = await publicClient.readContract({
                                address: CONTRACT_ADDRESS,
                                abi: CONTRACT_ABI,
                                functionName: 'getTeam',
                                args: [BigInt(team1_id)]
                            });
                            const team1Data = team1DataResult as { wallet: Address };
                            console.error('Team1 wallet from contract:', team1Data.wallet);
                            return NextResponse.json(
                                { success: false, error: `Wallet mismatch: Your wallet (${wallet_address}) does not match team1's wallet (${team1Data.wallet}) in the contract. Only the team1 owner can create game requests.`, errorName: errorName },
                                { status: 403 }
                            );
                        } catch (lookupError) {
                            console.error('Error looking up team1 wallet:', lookupError);
                            return NextResponse.json(
                                { success: false, error: 'Only the team1 (host) owner can create game requests. Your wallet does not match team1\'s wallet in the contract.', errorName: errorName },
                                { status: 403 }
                            );
                        }
                    default:
                        return NextResponse.json(
                            { success: false, error: `Failed to create game request${errorName ? `: ${errorName}` : ''}`, errorName: errorName || 'UNKNOWN' },
                            { status: 400 }
                        );
                        break;
                }
            }
        }

        // Provide user-friendly error messages
        let errorMessage = 'Failed to create game request';
        if (error instanceof Error) {
            if (error.message.includes('insufficient funds')) {
                errorMessage = 'Insufficient funds for transaction';
            } else if (error.message.includes('User rejected')) {
                errorMessage = 'Transaction was cancelled';
            } else {
                errorMessage = `Error: ${error.message}`;
            }
        }

        return NextResponse.json(
            { success: false, error: errorMessage },
            { status: 500 }
        );
    }
}