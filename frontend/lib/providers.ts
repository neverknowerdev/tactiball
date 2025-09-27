import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

// Create a public client for reading contract data
export const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.RPC_URL || 'https://mainnet.base.org')
});

// Utility function to wait for transaction receipt
export function waitForTransactionReceipt(hash: string) {
    return publicClient.waitForTransactionReceipt({
        hash: hash as `0x${string}`,
        confirmations: 0,
        pollingInterval: 200
    });
}