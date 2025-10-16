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

export function getSubaccountAddress(connections: any) {
    const baseAccountConnection = connections.find(
        (connection: any) => connection.connector.type === 'baseAccount'
    );

    if (!baseAccountConnection) {
        console.warn('No baseAccount connector found');
        return null;
    }

    const accounts = baseAccountConnection.accounts;

    if (!accounts || accounts.length < 2) {
        console.warn('BaseAccount connection does not have subaccount (need at least 2 accounts)');
        return null;
    }

    return accounts[1];
}

export async function walletSendCalls(provider: any, calls: { to: string, data: string, value: string }[], from: string) {
    const callsId = await provider.request({
        method: 'wallet_sendCalls',
        params: [{
            version: "2.0",
            atomicRequired: true,
            chainId: `0x${base.id.toString(16)}`, // Convert chainId to hex
            from,
            calls: calls.map(call => ({
                to: call.to,
                data: call.data,
                value: call.value ? `0x${BigInt(call.value).toString(16)}` : '0x0',
            })),
            // capabilities: { paymasterUrl: process.env.NEXT_PUBLIC_COINBASE_PAYMASTER_RPC_URL },
        }]
    });

    return callsId;
}