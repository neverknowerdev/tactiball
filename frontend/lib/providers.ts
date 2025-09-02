import { createWalletClient, createPublicClient, http, type Hex } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

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
        transport: http(process.env.RPC_URL || 'https://mainnet.base.org')
    });
}