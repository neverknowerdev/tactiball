import { NextRequest, NextResponse } from 'next/server';
import { type Address, BaseError, ContractFunctionRevertedError, parseEventLogs } from 'viem';
import { publicClient } from '@/lib/providers';
import { sendTransactionWithRetry } from '@/lib/paymaster';
import { CONTRACT_ABI, CONTRACT_ADDRESS, RELAYER_ADDRESS } from '@/lib/contract';
import { base } from 'viem/chains';
import { chain } from '@/config/chains';
import { sendWebhookMessage } from '@/lib/webhook';
import { db } from '@/lib/database';
import { waitingRooms } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

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
        const { team1_id, team2_id, wallet_address } = body;

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

        const gameRequestId = paymasterReceipt.receipt.transactionHash;

        console.log('Creating game request with relayer:', {
            wallet_address,
            team1_id,
            team2_id,
            transactionHash: gameRequestId
        });

        // Check if this game request came from a waiting room
        try {
            const [room] = await db
                .select({ id: waitingRooms.id })
                .from(waitingRooms)
                .where(
                    and(
                        eq(waitingRooms.hostTeamId, team1_id),
                        eq(waitingRooms.guestTeamId, team2_id),
                        eq(waitingRooms.status, 'full')
                    )
                )
                .limit(1);

            if (room) {
                await db
                    .update(waitingRooms)
                    .set({
                        gameRequestId: gameRequestId,
                        status: 'starting'
                    })
                    .where(eq(waitingRooms.id, room.id));

                console.log('Updated waiting room:', room.id);
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
                transactionHash: gameRequestId
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
                    default:
                        return NextResponse.json(
                            { success: false, error: 'Failed to create game request', errorName: errorName },
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