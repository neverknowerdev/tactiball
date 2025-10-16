import { createBaseAccountSDK } from "@base-org/account";
import { base } from "viem/chains";
import { encodeFunctionData } from "viem";

const sdk = createBaseAccountSDK(
    {
        appName: 'ChessBall',
        appLogoUrl: 'https://play.chessball.fun/icon.png',
        appChainIds: [base.id],
        subAccounts: {
            funding: 'spend-permissions',
            creation: 'on-connect'
        },
        paymasterUrls: getPaymasterUrl() ? [getPaymasterUrl()!] : undefined,
    }
);

// Get paymaster URL from environment variables
function getPaymasterUrl(): string | undefined {
    const paymasterUrl = process.env.NEXT_PUBLIC_COINBASE_PAYMASTER_RPC_URL ||
        process.env.COINBASE_PAYMASTER_RPC_URL ||
        process.env.TESTNET_COINBASE_PAYMASTER_RPC_URL;

    console.log('Paymaster URL from env:', paymasterUrl);
    return paymasterUrl;
}

// Types for sub account responses
interface SubAccount {
    address: `0x${string}`;
    factory?: `0x${string}`;
    factoryData?: `0x${string}`;
}

interface GetSubAccountsResponse {
    subAccounts: SubAccount[];
}

interface WalletAddSubAccountResponse {
    address: `0x${string}`;
    factory?: `0x${string}`;
    factoryData?: `0x${string}`;
}

interface SubAccountProvider {
    provider: ReturnType<typeof sdk.getProvider>;
    subAccount: SubAccount;
    universalAddress: string;
}

/**
 * Detects if provider supports sub account functions and gets/creates a sub account
 * @returns Promise<SubAccountProvider> - Provider with sub account info
 */
export async function getSubaccountProvider(): Promise<SubAccountProvider> {
    const provider = sdk.getProvider();

    try {
        // First, ensure user is connected to their Base Account
        const accounts = await provider.request({
            method: "eth_requestAccounts",
            params: [],
        }) as string[];

        if (!accounts || accounts.length === 0) {
            throw new Error("No accounts connected. Please connect your Base Account first.");
        }

        const universalAddress = accounts[0];

        // Try to get existing sub account
        let subAccount: SubAccount | null = null;

        try {
            const response = await provider.request({
                method: 'wallet_getSubAccounts',
                params: [{
                    account: universalAddress,
                    domain: window.location.origin,
                }]
            }) as GetSubAccountsResponse;

            subAccount = response.subAccounts[0] || null;
        } catch (error) {
            console.warn("Failed to get existing sub accounts:", error);
        }

        // If no sub account exists, create one
        if (!subAccount) {
            try {
                const newSubAccount = await provider.request({
                    method: 'wallet_addSubAccount',
                    params: [{
                        account: {
                            type: 'create',
                        },
                    }]
                }) as WalletAddSubAccountResponse;

                subAccount = newSubAccount;
            } catch (error) {
                throw new Error(`Failed to create sub account: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }

        return {
            provider,
            subAccount,
            universalAddress,
        };

    } catch (error) {
        console.error("Error in getSubaccountProvider:", error);
        throw error;
    }
}

/**
 * Convenience function to get just the sub account address
 * @returns Promise<string> - The sub account address
 */
export async function getSubAccountAddress(): Promise<string> {
    const { subAccount } = await getSubaccountProvider();
    return subAccount.address;
}

/**
 * Convenience function to get accounts (universal and sub account)
 * @returns Promise<{universal: string, subAccount: string}> - Both account addresses
 */
export async function getAccounts(): Promise<{ universal: string, subAccount: string }> {
    const { universalAddress, subAccount } = await getSubaccountProvider();
    return {
        universal: universalAddress,
        subAccount: subAccount.address,
    };
}

/**
 * Send multiple calls in a batch using wallet_sendCalls (EIP-5792)
 * This is useful when you need atomic transactions or want to batch multiple operations
 * @param calls - Array of calls to execute
 * @param options - Additional options
 * @returns Promise<string> - Calls ID
 */
export async function sendCalls(
    calls: Array<{
        to: `0x${string}`;
        data: `0x${string}`;
        value?: bigint;
    }>,
    options: {
        account?: `0x${string}`;
        atomicRequired?: boolean;
        capabilities?: {
            paymasterUrl?: string;
        };
    } = {}
): Promise<string> {
    const { provider, subAccount } = await getSubaccountProvider();

    const from = options.account || subAccount.address;

    // Get paymaster URL from environment if not provided
    const paymasterUrl = options.capabilities?.paymasterUrl || getPaymasterUrl();
    console.log('sendCalls - paymasterUrl:', paymasterUrl);

    const callsId = await provider.request({
        method: 'wallet_sendCalls',
        params: [{
            version: "2.0",
            atomicRequired: options.atomicRequired ?? true,
            chainId: `0x${base.id.toString(16)}`, // Convert chainId to hex
            from,
            calls: calls.map(call => ({
                to: call.to,
                data: call.data,
                value: call.value ? `0x${call.value.toString(16)}` : '0x0',
            })),
            capabilities: paymasterUrl ? { paymasterUrl } : {},
        }]
    });

    return callsId as string;
}

/**
 * Send a single contract call using the sub account
 * @param contractAddress - The contract address to call
 * @param abi - The contract ABI
 * @param functionName - The function name to call
 * @param args - Arguments for the function
 * @param options - Additional options
 * @returns Promise<string> - Transaction hash
 */
export async function writeContractSubAccount(
    contractAddress: `0x${string}`,
    abi: any,
    functionName: string,
    args: any[] = [],
    options: {
        value?: bigint;
        account?: `0x${string}`;
        atomicRequired?: boolean;
        capabilities?: {
            paymasterUrl?: string;
        };
    } = {}
): Promise<string> {
    const { provider, subAccount } = await getSubaccountProvider();

    const from = options.account || subAccount.address;

    // Get paymaster URL from environment if not provided
    const paymasterUrl = options.capabilities?.paymasterUrl || getPaymasterUrl();
    console.log('writeContract - paymasterUrl:', paymasterUrl);
    console.log('writeContract - capabilities:', paymasterUrl ? { paymasterUrl } : {});

    console.log('writeContract - from:', from);
    console.log('writeContract - to:', contractAddress);
    // Encode the function call data
    const data = encodeFunctionData({
        abi,
        functionName,
        args,
    });

    // Send as a single call
    const callsId = await provider.request({
        method: 'wallet_sendCalls',
        params: [{
            version: "2.0",
            atomicRequired: options.atomicRequired ?? true,
            chainId: `0x${base.id.toString(16)}`, // Convert chainId to hex
            from,
            calls: [{
                to: contractAddress,
                data,
                value: options.value ? `0x${options.value.toString(16)}` : '0x0',
            }],
            capabilities: { paymasterUrl: paymasterUrl },
        }]
    });

    return callsId as string;
}

/**
 * Send ETH using the sub account
 * @param to - Recipient address
 * @param value - Amount to send in wei
 * @param options - Additional options
 * @returns Promise<string> - Transaction hash
 */
export async function sendTransaction(
    to: `0x${string}`,
    value: bigint,
    options: {
        account?: `0x${string}`;
        atomicRequired?: boolean;
        capabilities?: {
            paymasterUrl?: string;
        };
    } = {}
): Promise<string> {
    const { provider, subAccount } = await getSubaccountProvider();

    const from = options.account || subAccount.address;

    // Get paymaster URL from environment if not provided
    const paymasterUrl = options.capabilities?.paymasterUrl || getPaymasterUrl();

    const callsId = await provider.request({
        method: 'wallet_sendCalls',
        params: [{
            version: "2.0",
            atomicRequired: options.atomicRequired ?? true,
            chainId: `0x${base.id.toString(16)}`, // Convert chainId to hex
            from,
            calls: [{
                to,
                data: '0x',
                value: `0x${value.toString(16)}`,
            }],
            capabilities: { paymasterUrl: paymasterUrl },
        }]
    });

    return callsId as string;
}

/**
 * Get a viem wallet client configured for the sub account
 * This allows you to use all viem wallet client methods
 * @returns Promise<any> - Configured wallet client
 */
export async function getWalletClient(): Promise<any> {
    const { provider, subAccount } = await getSubaccountProvider();

    // Return a wallet client-like object that uses the provider
    return {
        request: provider.request.bind(provider),
        account: {
            address: subAccount.address,
            type: 'json-rpc' as const,
        },
        chain: base,
        transport: {
            type: 'json-rpc' as const,
            request: provider.request.bind(provider),
        },
    };
}

