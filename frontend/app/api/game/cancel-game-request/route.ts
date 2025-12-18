import { NextRequest, NextResponse } from 'next/server';
import { type Address, BaseError, ContractFunctionRevertedError, parseEventLogs } from 'viem';
import { publicClient } from '@/lib/providers';
import { sendTransactionWithRetry } from '@/lib/paymaster';
import { CONTRACT_ABI, CONTRACT_ADDRESS, RELAYER_ADDRESS } from '@/lib/contract';
import { base } from 'viem/chains';
import { chain } from '@/config/chains';
import { sendWebhookMessage } from '@/lib/webhook';
import { db } from '@/lib/database';
import { teams } from '@/db/schema';
import { eq } from 'drizzle-orm';

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
        const body = await request.json();
        const { game_request_id, wallet_address } = body;

        // Authentication is handled by Next.js middleware
        // wallet_address is already validated by middleware
        // Sentry user context is set in middleware

        console.log('Cancelling game request:', {
            game_request_id,
            wallet_address
        });

        // Validate required fields
        if (!game_request_id) {
            return NextResponse.json(
                { success: false, error: 'Missing required field: game_request_id' },
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

        // Get game request from contract to find team1id and team2id
        let gameRequest: { gameRequestId: bigint; team1id: bigint; team2id: bigint; createdAt: bigint };
        try {
            const result: unknown = await publicClient.readContract({
                address: CONTRACT_ADDRESS,
                abi: CONTRACT_ABI,
                functionName: 'getGameRequest',
                args: [BigInt(game_request_id)]
            });
            gameRequest = result as { gameRequestId: bigint; team1id: bigint; team2id: bigint; createdAt: bigint };
        } catch (error) {
            console.error('Error fetching game request from contract:', error);
            return NextResponse.json(
                { success: false, error: 'Game request does not exist' },
                { status: 400 }
            );
        }

        // Get user's team ID from wallet address
        let userTeamId: number | null = null;
        try {
            const userTeamIdFromContract = await publicClient.readContract({
                address: CONTRACT_ADDRESS,
                abi: CONTRACT_ABI,
                functionName: 'getTeamIdByWallet',
                args: [wallet_address as Address]
            });
            userTeamId = Number(userTeamIdFromContract);
        } catch (error) {
            console.error('Error fetching team ID from contract:', error);
            // Fallback: try to get from database
            const [team] = await db
                .select({ id: teams.id })
                .from(teams)
                .where(eq(teams.primaryWallet, wallet_address))
                .limit(1);
            if (team) {
                userTeamId = team.id;
            }
        }

        if (!userTeamId) {
            return NextResponse.json(
                { success: false, error: 'Team not found for this wallet address' },
                { status: 400 }
            );
        }

        const team1id = Number(gameRequest.team1id);
        const team2id = Number(gameRequest.team2id);

        // Check if user is either team1 or team2
        if (userTeamId !== team1id && userTeamId !== team2id) {
            return NextResponse.json(
                { success: false, error: 'You are not part of this game request' },
                { status: 403 }
            );
        }

        // Get team1's wallet address (only team1 can cancel according to contract)
        // If user is team2, we'll use team1's wallet to cancel on their behalf
        let cancelerWalletAddress = wallet_address;
        if (userTeamId === team2id) {
            // User is team2, need to get team1's wallet to cancel
            const [team1] = await db
                .select({ primaryWallet: teams.primaryWallet })
                .from(teams)
                .where(eq(teams.id, team1id))
                .limit(1);
            
            if (!team1?.primaryWallet) {
                // Fallback: try to get from contract
                try {
                    const team1DataResult: unknown = await publicClient.readContract({
                        address: CONTRACT_ADDRESS,
                        abi: CONTRACT_ABI,
                        functionName: 'getTeam',
                        args: [BigInt(team1id)]
                    });
                    const team1Data = team1DataResult as { wallet: Address };
                    cancelerWalletAddress = team1Data.wallet;
                } catch (error) {
                    console.error('Error fetching team1 wallet:', error);
                    return NextResponse.json(
                        { success: false, error: 'Failed to get team1 wallet address' },
                        { status: 500 }
                    );
                }
            } else {
                cancelerWalletAddress = team1.primaryWallet;
            }
        }

        // Simulate the transaction first using publicClient
        // Use team1's wallet address since only team1 can cancel according to contract
        const simulation = await publicClient.simulateContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'cancelGameRequestRelayer',
            args: [cancelerWalletAddress as Address, game_request_id],
            chain: chain,
            account: RELAYER_ADDRESS
        });

        const paymasterReceipt = await sendTransactionWithRetry(simulation.request);

        // const receipt = await publicClient.waitForTransactionReceipt({
        //     hash: result
        // });

        console.log('Cancelling game request with relayer:', {
            wallet_address,
            canceler_wallet_address: cancelerWalletAddress,
            user_team_id: userTeamId,
            team1id,
            team2id,
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
                        // This shouldn't happen now since we're using team1's wallet
                        // But if it does, provide a clearer error message
                        return NextResponse.json(
                            { success: false, error: 'Failed to cancel game request. Please try again.', errorName: errorName },
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
