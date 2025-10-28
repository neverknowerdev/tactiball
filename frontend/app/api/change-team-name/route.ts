import { NextRequest, NextResponse } from 'next/server';
import { type Address, parseEventLogs } from 'viem';
import { publicClient } from '@/lib/providers';
import { sendTransactionWithRetry } from '@/lib/paymaster';
import { CONTRACT_ABI, CONTRACT_ADDRESS, RELAYER_ADDRESS } from '@/lib/contract';
import { chain } from '@/config/chains';
import { checkAuthSignatureAndMessage } from '@/lib/auth';
import { BaseError, ContractFunctionRevertedError } from 'viem';
import { sendWebhookMessage } from '@/lib/webhook';

interface ChangeTeamNameRequest {
    walletAddress: string;
    signature: string;
    message: string;
    newTeamName: string;
}

(BigInt.prototype as any).toJSON = function () {
    return this.toString()
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const body: ChangeTeamNameRequest = await req.json();
        const { walletAddress, signature, message, newTeamName } = body;

        // Log the received data to console
        console.log('=== API RECEIVED AUTHENTICATION DATA ===');
        console.log('Wallet Address:', walletAddress);
        console.log('Signature:', signature);
        console.log('Message:', message);
        console.log('New Team Name:', newTeamName);
        console.log('Timestamp:', new Date().toISOString());
        console.log('=====================================');

        // Validate input data
        if (!walletAddress || !newTeamName) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Validate wallet address format (basic check)
        if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
            return NextResponse.json(
                { success: false, error: 'Invalid wallet address format' },
                { status: 400 }
            );
        }

        // Validate team name length
        const trimmedName = newTeamName.trim();
        if (trimmedName.length === 0 || trimmedName.length > 100) {
            return NextResponse.json(
                { success: false, error: 'Team name must be between 1 and 100 characters' },
                { status: 400 }
            );
        }

        // Validate signature and message
        if (!signature || !message) {
            return NextResponse.json(
                { success: false, error: 'Signature and message are required' },
                { status: 400 }
            );
        }

        const { isValid, error, timestamp, expiresAt } = await checkAuthSignatureAndMessage(
            signature,
            message,
            walletAddress
        );

        if (!isValid) {
            return NextResponse.json(
                { success: false, error: error },
                { status: 401 }
            );
        }

        console.log('Simulating transaction...');

        // Simulate the transaction first using publicClient
        const simulation = await publicClient.simulateContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'changeTeamNameRelayer',
            args: [walletAddress as Address, trimmedName],
            chain: chain,
            account: RELAYER_ADDRESS
        });

        console.log('Simulation successful, sending transaction...');

        const paymasterReceipt = await sendTransactionWithRetry(simulation.request);

        console.log('Transaction successful, parsing logs...');

        const logs = parseEventLogs({
            abi: CONTRACT_ABI,
            logs: paymasterReceipt.logs,
        });

        console.log('Parsed event logs:', JSON.stringify(logs, null, 2));

        // Send webhook to update database
        await sendWebhookMessage(logs);

        console.log('Team name change with relayer:', {
            walletAddress,
            newTeamName: trimmedName,
            contractAddress: CONTRACT_ADDRESS
        });

        console.log('Transaction sent successfully:', paymasterReceipt.receipt.transactionHash);

        return NextResponse.json({
            success: true,
            message: 'Team name changed successfully',
            transactionHash: paymasterReceipt.receipt.transactionHash,
            logs: logs
        });

    } catch (error) {
        console.error('Error in change-team-name API:', error);

        if (error instanceof BaseError) {
            console.log("Error is a BaseError");
            const revertError = error.walk(err => err instanceof ContractFunctionRevertedError);

            if (revertError instanceof ContractFunctionRevertedError) {
                console.log("Revert error found:", revertError);
                const errorName = revertError.data?.errorName ?? '';
                console.log("Error name:", errorName);

                // Handle custom validation errors from contract
                switch (errorName) {
                    case 'DoesNotExist':
                        return NextResponse.json(
                            {
                                success: false,
                                error: 'Team does not exist. Please create a team first.',
                                errorName: errorName
                            },
                            { status: 404 }
                        );

                    case 'CreateTeam_NameIsRequired':
                        return NextResponse.json(
                            {
                                success: false,
                                error: 'Team name cannot be empty',
                                errorName: errorName
                            },
                            { status: 400 }
                        );

                    case 'ChangeTeamName_NotTeamOwner':
                        return NextResponse.json(
                            {
                                success: false,
                                error: 'You are not the owner of this team',
                                errorName: errorName
                            },
                            { status: 403 }
                        );

                    case 'ChangeTeamName_SameNameProvided':
                        return NextResponse.json(
                            {
                                success: false,
                                error: 'New name must be different from current name',
                                errorName: errorName
                            },
                            { status: 400 }
                        );

                    case 'CreateTeam_TeamNameAlreadyExists':
                        return NextResponse.json(
                            {
                                success: false,
                                error: 'This team name is already taken. Please choose a different name.',
                                errorName: errorName
                            },
                            { status: 409 }
                        );

                    case 'OnlyRelayerCanCall':
                        return NextResponse.json(
                            {
                                success: false,
                                error: 'Unauthorized relayer',
                                errorName: errorName
                            },
                            { status: 403 }
                        );

                    default:
                        // Log unknown errors for debugging
                        console.error('Unknown contract error:', errorName);
                        return NextResponse.json(
                            {
                                success: false,
                                error: `Contract error: ${errorName || 'Unknown error'}`,
                                errorName: errorName
                            },
                            { status: 400 }
                        );
                }
            }
        }

        // Provide more specific error messages for blockchain-related errors
        let errorMessage = 'Internal server error';
        let statusCode = 500;

        if (error instanceof Error) {
            if (error.message.includes('insufficient funds')) {
                errorMessage = 'Insufficient funds for transaction';
                statusCode = 402;
            } else if (error.message.includes('nonce')) {
                errorMessage = 'Transaction nonce error. Please try again.';
                statusCode = 500;
            } else if (error.message.includes('gas')) {
                errorMessage = 'Gas estimation error. Please try again.';
                statusCode = 500;
            } else if (error.message.includes('User rejected') || error.message.includes('user rejected')) {
                errorMessage = 'Transaction was cancelled by user';
                statusCode = 400;
            } else if (error.message.includes('Signature verification failed')) {
                errorMessage = 'Signature verification failed. Please sign the message again.';
                statusCode = 401;
            } else {
                errorMessage = `Error: ${error.message}`;
            }
        }

        return NextResponse.json(
            { success: false, error: errorMessage },
            { status: statusCode }
        );
    }
}