import { NextRequest, NextResponse } from 'next/server';
import { type Address, BaseError, ContractFunctionRevertedError } from 'viem';
import { createRelayerClient, publicClient } from '@/lib/providers';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/lib/contract';
import { base } from 'viem/chains';
import { checkAuthSignatureAndMessage } from '@/lib/auth';

interface StartGameRequest {
    walletAddress: string;
    signature: string;
    message: string;
    gameRequestId: number;
}

export async function POST(request: NextRequest) {
    try {
        const { game_request_id, signature, message, wallet_address } = await request.json();

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

        const relayerClient = createRelayerClient();

        // Simulate the transaction first using publicClient
        const simulation = await publicClient.simulateContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'startGameRelayer',
            args: [wallet_address as Address, game_request_id],
            chain: base,
            account: relayerClient.account
        });



        const result = await relayerClient.writeContract(simulation.request);

        const receipt = await publicClient.waitForTransactionReceipt({
            hash: result
        });

        console.log('Starting game with relayer:', {
            wallet_address,
            game_request_id,
            transactionHash: receipt.transactionHash
        });

        return NextResponse.json({
            success: true,
            message: 'Game started successfully',
            data: {
                gameId: receipt.transactionHash, // Using transaction hash as temporary ID
                game_request_id,
                status: 'active',
                startTime: new Date().toISOString(),
                transactionHash: receipt.transactionHash
            }
        });

    } catch (error) {
        console.error('Error starting game:', error);

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
                            { success: false, error: 'Only the invited team can start the game', errorName: errorName },
                            { status: 400 }
                        );
                    case 'TeamAlreadyHasActiveGame':
                        return NextResponse.json(
                            { success: false, error: 'One or both teams already have an active game', errorName: errorName },
                            { status: 400 }
                        );
                    default:
                        return NextResponse.json(
                            { success: false, error: 'Failed to start game', errorName: errorName },
                            { status: 400 }
                        );
                        break;
                }
            }
        }

        // Provide user-friendly error messages
        let errorMessage = 'Failed to start game';
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
