import { NextRequest, NextResponse } from 'next/server';
import { type Address, BaseError, ContractFunctionRevertedError, parseEventLogs } from 'viem';
import { publicClient } from '@/lib/providers';
import { sendTransactionWithRetry } from '@/lib/paymaster';
import { CONTRACT_ABI, CONTRACT_ADDRESS, RELAYER_ADDRESS } from '@/lib/contract';
import { base } from 'viem/chains';
import { chain } from '@/config/chains';
import { checkAuthSignatureAndMessage } from '@/lib/auth';
import { sendWebhookMessage } from '@/lib/webhook';
import { WebSocketBroadcastingService } from '@/lib/ably';

interface CancelGameRequestRequest {
    walletAddress: string;
    signature: string;
    message: string;
    gameRequestId: number;
}

(BigInt.prototype as any).toJSON = function () {
    return this.toString()
}

export async function POST(request: NextRequest) {
    try {
        const { game_request_id, signature, message, wallet_address, approve_guest_cancellation } = await request.json();

        console.log('Cancelling game request:', {
            game_request_id,
            signature,
            message,
            wallet_address,
            approve_guest_cancellation
        });

        // Validate required fields
        if (!game_request_id || !signature || !message || !wallet_address) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Validate wallet address format
        if (!/^0x[a-fA-F0-9]{40}$/.test(wallet_address)) {
            return NextResponse.json(
                { success: false, error: 'Invalid wallet address format' },
                { status: 400 }
            );
        }

        // Validate game request ID
        if (game_request_id <= 0) {
            return NextResponse.json(
                { success: false, error: 'Invalid game request ID' },
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

        // Get game request from contract to determine team1 and team2
        const gameRequest = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'getGameRequest',
            args: [BigInt(game_request_id)]
        }) as unknown as { gameRequestId: bigint; team1id: bigint; team2id: bigint; createdAt: bigint };

        if (!gameRequest || gameRequest.createdAt === BigInt(0)) {
            return NextResponse.json(
                { success: false, error: 'Game request does not exist' },
                { status: 400 }
            );
        }

        const team1id = Number(gameRequest.team1id);
        const team2id = Number(gameRequest.team2id);

        // Get user's team ID from wallet
        const userTeamId = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'getTeamIdByWallet',
            args: [wallet_address as Address]
        }) as unknown as bigint;

        const userTeamIdNum = Number(userTeamId);

        console.log('Game request details:', {
            team1id,
            team2id,
            userTeamId: userTeamIdNum,
            isHost: userTeamIdNum === team1id,
            isGuest: userTeamIdNum === team2id,
            approve_guest_cancellation
        });

        // If user is guest (team2) and not approving guest cancellation, broadcast cancellation request to host
        if (userTeamIdNum === team2id && !approve_guest_cancellation) {
            // Guest wants to cancel - notify host via WebSocket
            const ablyApiKey = process.env.ABLY_BROADCASTING_API_KEY;
            if (!ablyApiKey) {
                return NextResponse.json(
                    { success: false, error: 'WebSocket service not configured' },
                    { status: 500 }
                );
            }

            const wsService = new WebSocketBroadcastingService(ablyApiKey);
            
            // Broadcast to host (team1) that guest wants to cancel
            await wsService.broadcastToTeam(team1id, {
                type: 'GUEST_CANCELLATION_REQUEST',
                game_request_id: game_request_id,
                team1id: team1id,
                team2id: team2id,
                guest_team_id: team2id,
                timestamp: Date.now()
            });

            await wsService.close();

            return NextResponse.json({
                success: true,
                message: 'Cancellation request sent to host',
                data: {
                    game_request_id,
                    status: 'cancellation_requested',
                    requires_host_approval: true
                }
            });
        }

        // If user is guest (team2) trying to approve cancellation, this is invalid
        if (userTeamIdNum === team2id && approve_guest_cancellation) {
            return NextResponse.json(
                { success: false, error: 'Only the host can approve guest cancellation requests' },
                { status: 403 }
            );
        }

        // If user is not team1 (host), they cannot cancel directly
        if (userTeamIdNum !== team1id) {
            return NextResponse.json(
                { success: false, error: 'Only the host can cancel this game request' },
                { status: 403 }
            );
        }

        // User is host (team1) - proceed with cancellation
        const cancelWallet = wallet_address;

        // Simulate the transaction first using publicClient
        const simulation = await publicClient.simulateContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'cancelGameRequestRelayer',
            args: [cancelWallet as Address, game_request_id],
            chain: chain,
            account: RELAYER_ADDRESS
        });

        const paymasterReceipt = await sendTransactionWithRetry(simulation.request);

        // const receipt = await publicClient.waitForTransactionReceipt({
        //     hash: result
        // });

        console.log('Cancelling game request with relayer:', {
            wallet_address,
            game_request_id,
            transactionHash: paymasterReceipt.receipt.transactionHash
        });

        const logs = parseEventLogs({
            abi: CONTRACT_ABI,
            logs: paymasterReceipt.logs,
        });

        await sendWebhookMessage(logs);

        return NextResponse.json({
            success: true,
            message: 'Game request cancelled successfully',
            data: {
                game_request_id,
                status: 'cancelled',
                transactionHash: paymasterReceipt.receipt.transactionHash
            }
        });

    } catch (error) {
        console.error('Error cancelling game request:', error);

        if (error instanceof BaseError) {
            const revertError = error.walk(err => err instanceof ContractFunctionRevertedError)
            if (revertError instanceof ContractFunctionRevertedError) {
                const errorName = revertError.data?.errorName ?? '';
                console.log("Contract error:", errorName);

                // Handle custom validation errors from contract
                switch (errorName) {
                    case 'DoesNotExist':
                        return NextResponse.json(
                            { success: false, error: 'Game request does not exist', errorName: errorName },
                            { status: 400 }
                        );
                    case 'GameOwnerShouldCall':
                        return NextResponse.json(
                            { success: false, error: 'Only the game request owner can cancel it', errorName: errorName },
                            { status: 400 }
                        );
                    case 'GameRequestNotExpired':
                        return NextResponse.json(
                            { success: false, error: 'Game request cannot be cancelled yet (wait 1 minute)', errorName: errorName },
                            { status: 400 }
                        );
                    default:
                        return NextResponse.json(
                            { success: false, error: 'Failed to cancel game request', errorName: errorName },
                            { status: 400 }
                        );
                        break;
                }
            }
        }

        // Provide user-friendly error messages
        let errorMessage = 'Failed to cancel game request';
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
