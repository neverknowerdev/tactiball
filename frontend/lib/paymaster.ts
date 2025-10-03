"use server";
import { createPublicClient, createWalletClient, http, type Hex, encodeFunctionData } from "viem";
import { baseSepoliaPreconf } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { CONTRACT_ABI } from "./contrac

const COINBASE_PAYMASTER_RPC_URL =
  process.env.COINBASE_PAYMASTER_RPC_URL ||
  process.env.TESTNET_COINBASE_PAYMASTER_RPC_URL;
const FLASHBLOCKS_RPC_URL =
  process.env.FLASHBLOCKS_RPC_URL || process.env.TESTNET_FLASHBLOCKS_RPC_URL;
const RELAYER_PRIVATE_KEY =
  process.env.RELAYER_PRIVATE_KEY || process.env.TESTNET_RELAYER_PRIVATE_KEY;

/// Optimized Flashblocks configuration
const FLASHBLOCKS_POLLING_INTERVAL = 200;
const DIRECT_TX_TIMEOUT = 10000;
const MAX_RETRIES = 2;
const INTER_TRANSACTION_DELAY = 800; // Optimal delay between transactions

let _preconfClient: ReturnType<typeof createPublicClient> | null = null;
let _walletClient: ReturnType<typeof createWalletClient> | null = null;

function getPreconfClient() {
  if (!_preconfClient) {
    _preconfClient = createPublicClient({
      chain: baseSepoliaPreconf,
      transport: http(FLASHBLOCKS_RPC_URL, {
        timeout: DIRECT_TX_TIMEOUT,
        retryCount: 3,
        retryDelay: 200,
      }),
      pollingInterval: FLASHBLOCKS_POLLING_INTERVAL,
      cacheTime: 0,
    });
  }
  return _preconfClient;
}

function getWalletClient() {
  if (!_walletClient) {
    const account = privateKeyToAccount(RELAYER_PRIVATE_KEY as Hex);
    _walletClient = createWalletClient({
      account,
      chain: baseSepoliaPreconf,
      transport: http(FLASHBLOCKS_RPC_URL, {
        timeout: DIRECT_TX_TIMEOUT,
        retryCount: 3,
        retryDelay: 200,
      }),
    });
  }
  return _walletClient;
}

/**
 * Always get fresh nonce to prevent conflicts
 */
async function getCurrentNonce() {
  const preconfClient = getPreconfClient();
  const walletClient = getWalletClient();
  
  return await preconfClient.getTransactionCount({
    address: walletClient.account.address,
    blockTag: 'pending'
  });
}

/**
 * Send transaction with Flashblocks optimization
 */
export async function sendTransaction(request: {
  address: Hex;
  functionName: string;
  args: any[];
  retryCount?: number;
}) {
  const start = performance.now();
  const retryCount = request.retryCount ?? 0;
  
  const walletClient = getWalletClient();
  const preconfClient = getPreconfClient();

  const data = encodeFunctionData({
    abi: CONTRACT_ABI,
    functionName: request.functionName,
    args: request.args,
  });

  try {
    const nonce = await getCurrentNonce();
    
    const hash = await walletClient.sendTransaction({
      to: request.address,
      data,
      chain: baseSepoliaPreconf,
      nonce,
    });

    const receipt = await preconfClient.waitForTransactionReceipt({
      hash,
      confirmations: 0,
      pollingInterval: FLASHBLOCKS_POLLING_INTERVAL,
      timeout: DIRECT_TX_TIMEOUT,
    });

    const duration = performance.now() - start;
    
    return {
      receipt,
      duration,
      hash: receipt.transactionHash,
      success: true,
      retryCount,
    };
  } catch (error: any) {
    const duration = performance.now() - start;
    
    // Retry logic for transient errors
    if (retryCount < MAX_RETRIES) {
      const shouldRetry = 
        error.message?.includes('replacement') ||
        error.message?.includes('nonce') ||
        error.message?.includes('timeout') ||
        error.message?.includes('underpriced');
      
      if (shouldRetry) {
        await new Promise(resolve => setTimeout(resolve, 300 * (retryCount + 1)));
        return sendTransaction({
          ...request,
          retryCount: retryCount + 1
        });
      }
    }
    
    return {
      error: error.message,
      duration,
      hash: null,
      success: false,
      retryCount,
    };
  }
}

/**
 * Send multiple transactions with optimal spacing
 */
export async function sendSequentialTransactions(requests: Array<{
  address: Hex;
  functionName: string;
  args: any[];
}>) {
  const start = performance.now();
  const results = [];
  
  for (let i = 0; i < requests.length; i++) {
    const result = await sendTransaction(requests[i]);
    results.push(result);
    
    // Optimal delay between transactions
    if (i < requests.length - 1) {
      await new Promise(resolve => setTimeout(resolve, INTER_TRANSACTION_DELAY));
    }
  }
  
  const duration = performance.now() - start;
  
  return {
    results,
    duration,
    hashes: results.map(r => r.hash).filter(Boolean),
    successCount: results.filter(r => r.success).length,
  };
}

/**
 * Batch transactions for high-throughput scenarios
 */
export async function sendBatchTransactions(requests: Array<{
  address: Hex;
  functionName: string;
  args: any[];
}>, batchSize: number = 3) {
  const batches = [];
  for (let i = 0; i < requests.length; i += batchSize) {
    batches.push(requests.slice(i, i + batchSize));
  }

  const allResults = [];
  
  for (const batch of batches) {
    const batchResults = await sendSequentialTransactions(batch);
    allResults.push(...batchResults.results);
    
    // Delay between batches
    if (batches.indexOf(batch) < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  const successfulResults = allResults.filter(r => r.success);
  
  return {
    results: allResults,
    successCount: successfulResults.length,
    totalCount: allResults.length,
    averageLatency: successfulResults.reduce((sum, r) => sum + r.duration, 0) / successfulResults.length,
  };
}

export async function warmupClients() {
  const start = performance.now();
  await Promise.all([getPreconfClient(), getWalletClient()]);
  return performance.now() - start;
}