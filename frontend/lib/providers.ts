import { createPublicClient, createWalletClient, http, type Hex } from 'viem';
import { base, basePreconf } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { CONTRACT_ABI } from './contract';
import { getNextRelayerNonce } from './paymaster';

// Create a public client for reading contract data
export const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.RPC_URL || 'https://mainnet.base.org')
});

// Create a direct wallet client for fallback transactions (without paymaster)
export async function createDirectWalletClient() {
    const privateKey = process.env.RELAYER_PRIVATE_KEY;
    if (!privateKey) {
        throw new Error('RELAYER_PRIVATE_KEY environment variable is required');
    }

    const account = privateKeyToAccount(privateKey as Hex);

    return createWalletClient({
        account,
        chain: basePreconf,
        transport: http(process.env.FLASHBLOCKS_RPC_URL),
    });
}

// Create flashblocks client for faster confirmations
const flashblocksClient = createPublicClient({
    chain: basePreconf,
    transport: http(process.env.FLASHBLOCKS_RPC_URL),
    pollingInterval: 100,
});

// Send direct transaction to smart contract without paymaster (fallback method)
export async function sendDirectTransaction(request: any, maxRetries: number = 3): Promise<any> {
    const walletClient = await createDirectWalletClient();
    const accountAddress = walletClient.account?.address;

    console.log('Sending direct transaction from relayer address:', accountAddress);
    console.log('Transaction will NOT be sponsored by paymaster (fallback mode)');
    console.log('Using flashblocks client for transaction processing');

    let retryCount = 0;

    while (retryCount < maxRetries) {
        try {
            // Get current nonce for the account
            const nonce = await getNextRelayerNonce(accountAddress as Hex);

            // Estimate gas for the transaction
            const gasEstimate = await flashblocksClient.estimateContractGas({
                address: request.address,
                abi: CONTRACT_ABI,
                functionName: request.functionName,
                args: request.args,
                account: accountAddress,
            });

            // Add 20% buffer to gas estimate
            const gasLimit = (gasEstimate * BigInt(120)) / BigInt(100);

            // Get current gas price
            const gasPrice = await flashblocksClient.getGasPrice();

            console.log('Sending direct transaction with gas limit:', gasLimit.toString());
            console.log('Gas price:', gasPrice.toString());

            // Send the transaction directly
            const txHash = await walletClient.writeContract({
                address: request.address,
                abi: CONTRACT_ABI,
                functionName: request.functionName,
                args: request.args,
                gas: gasLimit,
                gasPrice: gasPrice,
                nonce: Number(nonce),
                account: accountAddress,
            });

            console.log('Direct transaction sent successfully. Transaction hash:', txHash);

            // Wait for transaction receipt
            const receipt = await flashblocksClient.waitForTransactionReceipt({
                hash: txHash,
                confirmations: 0,
                pollingInterval: 100,
            });

            console.log('Direct transaction confirmed');
            return {
                receipt,
                logs: receipt.logs,
            };

        } catch (error: any) {
            retryCount++;
            console.error(`Direct transaction attempt ${retryCount} failed:`, error.message);

            // Don't retry for certain errors
            if (error.message?.includes('insufficient funds') ||
                error.message?.includes('execution reverted') ||
                error.message?.includes('nonce too low') ||
                error.message?.includes('nonce too high')) {
                console.error('Direct transaction failed with non-retryable error:', error.message);
                throw error;
            }

            if (retryCount < maxRetries) {
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                continue;
            }

            throw error;
        }
    }

    throw new Error('Failed to send direct transaction after maximum retries');
}

// Utility function to wait for transaction receipt
export function waitForTransactionReceipt(hash: string) {
    return publicClient.waitForTransactionReceipt({
        hash: hash as `0x${string}`,
        confirmations: 0,
        pollingInterval: 200
    });
}