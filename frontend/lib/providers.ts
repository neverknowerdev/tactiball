"use client";

import { createPublicClient, encodeFunctionData, http } from 'viem';
import { base } from 'viem/chains';
import { sendCalls } from '@wagmi/core'
import { baseAccountConfig, getConfig } from './wagmi';
import { createBaseAccountSDK } from '@base-org/account';
import { prepareSpendCallData, requestSpendPermission } from "@base-org/account/spend-permission";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from './contract';



// Create a public client for reading contract data
export const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.RPC_URL || 'https://mainnet.base.org')
});

// const sdk = createBaseAccountSDK(baseAccountConfig);

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

    return accounts[0];
}

// export async function walletSendCalls(calls: { to: string, data: string, value: string }[]) {
//     const provider = sdk.getProvider();

//     const [universalAddress] = await provider.request({
//         method: "eth_requestAccounts",
//         params: []
//     }) as `0x${string}`[];

//     // Get sub account for universal account
//     const { subAccounts: [subAccount] } = await provider.request({
//         method: 'wallet_getSubAccounts',
//         params: [{
//             account: universalAddress as `0x${string}`,
//             domain: window.location.origin,
//         }]
//     }) as { subAccounts: { address: `0x${string}` }[] };

//     console.log('universalAddress', universalAddress);
//     console.log('subAccount', subAccount);


//     const permission = await requestSpendPermission({
//         account: subAccount.address,
//         spender: universalAddress,
//         token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base USDC
//         chainId: 8453, // or any other supported chain
//         allowance: BigInt(1_000_000),
//         periodInDays: 30,
//         provider: sdk.getProvider(),
//     });

//     console.log("Spend Permission:", permission);

//     const spendCalls = await prepareSpendCallData(
//         permission,
//         BigInt(1_000_000),
//     );

//     const allCalls = [...spendCalls, ...calls.map(call => ({
//         to: call.to as `0x${string}`,
//         data: call.data as `0x${string}`,
//         value: call.value ? BigInt(call.value) : BigInt(0),
//     }))];

//     // If your app spender account supports wallet_sendCalls, submit them in batch using wallet_sendCalls
//     // this is an example on how to do it using wallet_sendCalls in provider interface
//     await provider.request({
//         method: "wallet_sendCalls",
//         params: [
//             {
//                 chainId: `0x${base.id.toString(16)}`, // Convert chainId to hex
//                 version: "2.0",
//                 atomicRequired: true,
//                 from: universalAddress as `0x${string}`,
//                 calls: allCalls,
//             },
//         ],
//     });

//     // const permission = await requestSpendPermission({
//     //     account: "0x...",
//     //     spender: "0x...",
//     //     token: "0x...",
//     //     chainId: 8453, // or any other supported chain
//     //     allowance: 1_000_000n,
//     //     periodInDays: 30,
//     //     provider: sdk.getProvider(),
//     // });

//     // console.log("Spend Permission:", permission);

//     const callsId = await provider.request({
//         method: 'wallet_sendCalls',
//         params: [{
//             version: "2.0.0",
//             atomicRequired: true,
//             chainId: `0x${base.id.toString(16)}`, // Convert chainId to hex
//             calls: calls.map(call => ({
//                 to: call.to,
//                 data: call.data,
//                 value: call.value ? `0x${BigInt(call.value).toString(16)}` : '0x0',
//             })),
//             capabilities: { paymasterService: { url: process.env.NEXT_PUBLIC_COINBASE_PAYMASTER_RPC_URL } },
//         }]
//     });

//     return callsId;
// }

// export async function sendCallsSubaccount(address: string, calls: { to: string, abi: any, functionName: string, args: any[] }[]) {
//     const provider = sdk.getProvider()

//     return sendCalls(getConfig(), {
//         calls: calls.map(call => ({
//             abi: call.abi,
//             functionName: call.functionName,
//             args: call.args,
//             to: call.to as `0x${string}`,
//         })),
//         account: address as `0x${string}`,
//         capabilities: {
//             paymasterService: {
//                 url: process.env.NEXT_PUBLIC_COINBASE_PAYMASTER_RPC_URL as string,
//             },
//         },
//     });
// }