import { createWalletClient, createPublicClient, http, type Hex, type Address } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { createClient } from 'redis';

const redis = await createClient().connect();

// Create a public client for reading contract data
export const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.RPC_URL || 'https://mainnet.base.org')
});

// Create wallet client for sending transactions
export function createRelayerClient() {
    const privateKey = process.env.RELAYER_PRIVATE_KEY;
    if (!privateKey) {
        throw new Error('RELAYER_PRIVATE_KEY environment variable is required');
    }

    const account = privateKeyToAccount(privateKey as Hex);

    return createWalletClient({
        account,
        chain: base,
        transport: http(process.env.RPC_URL || 'https://mainnet.base.org'),
    });
}

// Redis-based nonce management for relayer
export async function getNextRelayerNonce(account: Hex): Promise<bigint> {
    const nonceKey = `relayer_nonce:${account}`;

    try {
        // Use Redis INCR for atomic increment
        const nonceStr = await redis.incr(nonceKey);
        const nonce = Number(nonceStr);

        // If this is the first time (nonce === 1), get the current nonce from blockchain
        if (nonce === 1) {
            const blockchainNonce = await publicClient.getTransactionCount({
                address: account,
                blockTag: 'pending'
            });

            // Set the nonce to blockchain nonce + 1
            await redis.set(nonceKey, Number(blockchainNonce) + 1);
            return BigInt(blockchainNonce as number);
        }

        return BigInt(nonce - 1); // Redis INCR returns the new value, so subtract 1
    } catch (error) {
        console.error('Error getting next relayer nonce:', error);
        throw new Error(`Failed to get next nonce: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Helper function to get current gas prices with buffer
export async function getGasConfig() {
    try {
        const feeData = await publicClient.estimateFeesPerGas();

        // Add 20% buffer to gas price for faster confirmation
        const gasPrice = feeData.gasPrice ? BigInt(Math.ceil(Number(feeData.gasPrice) * 1.2)) : undefined;

        // For EIP-1559 transactions (Base supports this)
        const maxFeePerGas = feeData.maxFeePerGas ? BigInt(Math.ceil(Number(feeData.maxFeePerGas) * 1.2)) : undefined;
        const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ? BigInt(Math.ceil(Number(feeData.maxPriorityFeePerGas) * 1.2)) : undefined;

        return {
            gasPrice,
            maxFeePerGas,
            maxPriorityFeePerGas
        };
    } catch (error) {
        console.error('Error getting gas config:', error);
        throw new Error(`Failed to get gas configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Reset nonce counter (useful for testing or if nonce gets out of sync)
export async function resetRelayerNonce(account: Hex): Promise<void> {
    const nonceKey = `relayer_nonce:${account}`;

    try {
        // Get current nonce from blockchain
        const blockchainNonce = await publicClient.getTransactionCount({
            address: account,
            blockTag: 'pending'
        });

        // Reset to blockchain nonce
        await redis.set(nonceKey, Number(blockchainNonce));
        console.log(`Reset nonce for ${account} to ${blockchainNonce}`);
    } catch (error) {
        console.error('Error resetting relayer nonce:', error);
        throw new Error(`Failed to reset nonce: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Get current nonce without incrementing (for debugging)
export async function getCurrentRelayerNonce(account: Hex): Promise<bigint> {
    const nonceKey = `relayer_nonce:${account}`;

    try {
        const nonceStr = await redis.get(nonceKey);
        const nonce = nonceStr !== null ? Number(nonceStr) : null;

        if (nonce === null) {
            // No nonce stored, get from blockchain
            const blockchainNonce = await publicClient.getTransactionCount({
                address: account,
                blockTag: 'pending'
            });
            return BigInt(blockchainNonce as number);
        }

        return BigInt(nonce);
    } catch (error) {
        console.error('Error getting current relayer nonce:', error);
        throw new Error(`Failed to get current nonce: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Generic function to send transactions with retry logic
export async function sendTransactionWithRetry(request: any, maxRetries: number = 3): Promise<Address> {
    const relayerClient = createRelayerClient();
    const accountAddress = relayerClient.account.address;
    console.log('Sending transaction for account:', accountAddress);

    // Get current gas configuration
    const gasConfig = await getGasConfig();
    console.log('Gas config:', gasConfig);

    // Get next nonce for relayer
    const nonce = await getNextRelayerNonce(accountAddress);
    console.log('Using nonce:', nonce.toString());

    // Add gas configuration and nonce to the transaction request
    const transactionRequest = {
        ...request,
        ...gasConfig,
        nonce
    };

    let hash: string;
    let retryCount = 0;
    let baseGasPrice = gasConfig.gasPrice;

    while (retryCount < maxRetries) {
        try {
            // Increase gas price for retries
            if (retryCount > 0) {
                const multiplier = 1 + (retryCount * 0.5); // 150%, 200%, 250%
                transactionRequest.gasPrice = baseGasPrice ? BigInt(Math.ceil(Number(baseGasPrice) * multiplier)) : undefined;
                console.log(`Retry ${retryCount} with gas price:`, transactionRequest.gasPrice?.toString());
            }

            hash = await relayerClient.writeContract(transactionRequest);
            console.log('Transaction sent successfully. Transaction hash:', hash);
            return hash as `0x${string}`;
        } catch (error: any) {
            retryCount++;
            console.error(`Transaction attempt ${retryCount} failed:`, error.message);

            if (error.message?.includes('replacement transaction underpriced') && retryCount < maxRetries) {
                // Wait a bit before retry to let the previous transaction settle
                await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                continue;
            }

            throw error;
        }
    }

    throw new Error('Failed to commit transaction after maximum retries');
}

export function waitForTransactionReceipt(hash: string) {
    return publicClient.waitForTransactionReceipt({
        hash: hash as `0x${string}`,
        confirmations: 0,
        pollingInterval: 200
    });
}