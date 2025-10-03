"use server";
import { createPaymasterClient } from "viem/account-abstraction";
import { createPublicClient, createWalletClient, http, type Hex, encodeFunctionData } from "viem";
import { baseSepolia, baseSepoliaPreconf } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { toCoinbaseSmartAccount } from "viem/account-abstraction";
import { createBundlerClient } from "viem/account-abstraction";
import { redis } from "./redis";
import { UserOperationReceipt } from "viem/account-abstraction";
import { CONTRACT_ABI } from "./contract";

const COINBASE_PAYMASTER_RPC_URL =
  process.env.COINBASE_PAYMASTER_RPC_URL ||
  process.env.TESTNET_COINBASE_PAYMASTER_RPC_URL;
const FLASHBLOCKS_RPC_URL =
  process.env.FLASHBLOCKS_RPC_URL || process.env.TESTNET_FLASHBLOCKS_RPC_URL;
const RELAYER_PRIVATE_KEY =
  process.env.RELAYER_PRIVATE_KEY || process.env.TESTNET_RELAYER_PRIVATE_KEY;

// CRITICAL: Flashblocks stream every 200ms, so polling should match this
const FLASHBLOCKS_POLLING_INTERVAL = 200;
// Increased timeout for UserOp bundling + inclusion (bundlers add overhead)
const FLASHBLOCKS_TIMEOUT = 10000;
// For direct transaction waits (non-UserOp), use shorter timeout
const DIRECT_TX_TIMEOUT = 3000;

function getCoinbasePaymasterRpcUrl() {
  if (!COINBASE_PAYMASTER_RPC_URL) {
    throw new Error("COINBASE_PAYMASTER_RPC_URL environment variable is required");
  }
  return COINBASE_PAYMASTER_RPC_URL;
}

let _flashblocksClient: ReturnType<typeof createPublicClient> | null = null;
let _flashblocksPreconfClient: ReturnType<typeof createPublicClient> | null = null;
let _walletClient: ReturnType<typeof createWalletClient> | null = null;
let _smartAccount: Awaited<ReturnType<typeof toCoinbaseSmartAccount>> | null = null;
let _bundlerClient: Awaited<ReturnType<typeof createBundlerClient>> | null = null;
let _paymasterClient: ReturnType<typeof createPaymasterClient> | null = null;

/**
 * Creates a Flashblocks-aware client for preconfirmations
 * Uses baseSepoliaPreconf which automatically applies 'pending' block tag
 */
function getFlashblocksPreconfClient() {
  if (!_flashblocksPreconfClient) {
    _flashblocksPreconfClient = createPublicClient({
      chain: baseSepoliaPreconf, // CRITICAL: This chain auto-applies 'pending' tag
      transport: http(FLASHBLOCKS_RPC_URL, {
        timeout: DIRECT_TX_TIMEOUT,
        retryCount: 2,
        retryDelay: 100,
        fetchOptions: {
          keepalive: true,
        },
      }),
      pollingInterval: FLASHBLOCKS_POLLING_INTERVAL, // 200ms to match Flashblocks
      batch: {
        multicall: {
          batchSize: 2048,
          wait: 0,
        },
      },
      cacheTime: 0,
    });
  }
  return _flashblocksPreconfClient;
}

/**
 * Creates a wallet client for direct EOA transactions
 */
function getFlashblocksWalletClient() {
  if (!_walletClient) {
    const privateKey = RELAYER_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("RELAYER_PRIVATE_KEY environment variable is required");
    }

    const account = privateKeyToAccount(privateKey as Hex);

    _walletClient = createWalletClient({
      account,
      chain: baseSepoliaPreconf,
      transport: http(FLASHBLOCKS_RPC_URL, {
        timeout: DIRECT_TX_TIMEOUT,
        retryCount: 2,
        retryDelay: 100,
        fetchOptions: {
          keepalive: true,
        },
      }),
    });
  }
  return _walletClient;
}

/**
 * Standard Flashblocks client for UserOp operations
 */
function getFlashblocksClient() {
  if (!_flashblocksClient) {
    _flashblocksClient = createPublicClient({
      chain: baseSepolia,
      transport: http(FLASHBLOCKS_RPC_URL, {
        timeout: FLASHBLOCKS_TIMEOUT,
        retryCount: 2,
        retryDelay: 100,
        fetchOptions: {
          keepalive: true,
        },
      }),
      pollingInterval: FLASHBLOCKS_POLLING_INTERVAL, // 200ms
      batch: {
        multicall: {
          batchSize: 2048,
          wait: 0,
        },
      },
      cacheTime: 0,
    });
  }
  return _flashblocksClient;
}

function getPaymasterClient() {
  if (!_paymasterClient) {
    _paymasterClient = createPaymasterClient({
      transport: http(getCoinbasePaymasterRpcUrl(), {
        timeout: 5000,
        retryCount: 2,
        retryDelay: 100,
        fetchOptions: {
          keepalive: true,
        },
      }),
    });
  }
  return _paymasterClient;
}

export async function createSmartAccount() {
  if (_smartAccount) {
    return _smartAccount;
  }

  const privateKey = RELAYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("RELAYER_PRIVATE_KEY environment variable is required");
  }

  const owner = privateKeyToAccount(privateKey as Hex);
  const client = getFlashblocksClient();

  _smartAccount = await toCoinbaseSmartAccount({
    client,
    owners: [owner],
    version: "1.1",
  });

  return _smartAccount;
}

export async function createRelayerBundlerClient() {
  if (_bundlerClient) {
    return _bundlerClient;
  }

  const smartAccount = await createSmartAccount();

  _bundlerClient = createBundlerClient({
    account: smartAccount,
    client: getFlashblocksClient(),
    transport: http(FLASHBLOCKS_RPC_URL, {
      timeout: FLASHBLOCKS_TIMEOUT,
      retryCount: 2,
      retryDelay: 100,
      fetchOptions: {
        keepalive: true,
      },
    }),
    chain: baseSepolia,
    paymaster: getPaymasterClient(),
  });

  return _bundlerClient;
}

// Redis nonce management
export async function getNextRelayerNonce(account: Hex): Promise<bigint> {
  const nonceKey = `relayer_nonce:${account}`;

  try {
    if (!redis) {
      throw new Error("Redis client not available");
    }

    const nonceStr = await redis.incr(nonceKey);
    const nonce = Number(nonceStr);

    if (nonce === 1) {
      const client = getFlashblocksPreconfClient();
      // Use pending tag for most current nonce
      const blockchainNonce = await client.getTransactionCount({
        address: account,
        blockTag: "pending",
      });

      await redis.set(nonceKey, Number(blockchainNonce) + 1);
      return BigInt(blockchainNonce as number);
    }

    return BigInt(nonce - 1);
  } catch (error) {
    console.error("Error getting next relayer nonce:", error);
    throw new Error(`Failed to get next nonce: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function resetRelayerNonce(account: Hex): Promise<void> {
  const nonceKey = `relayer_nonce:${account}`;

  try {
    if (!redis) {
      throw new Error("Redis client not available");
    }

    const client = getFlashblocksPreconfClient();
    const blockchainNonce = await client.getTransactionCount({
      address: account,
      blockTag: "pending",
    });

    await redis.set(nonceKey, Number(blockchainNonce));
    console.log(`Reset nonce for ${account} to ${blockchainNonce}`);
  } catch (error) {
    console.error("Error resetting relayer nonce:", error);
    throw new Error(`Failed to reset nonce: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function getCurrentRelayerNonce(account: Hex): Promise<bigint> {
  const nonceKey = `relayer_nonce:${account}`;

  try {
    if (!redis) {
      throw new Error("Redis client not available");
    }

    const nonceStr = await redis.get(nonceKey);
    const nonce = nonceStr !== null ? Number(nonceStr) : null;

    if (nonce === null) {
      const client = getFlashblocksPreconfClient();
      const blockchainNonce = await client.getTransactionCount({
        address: account,
        blockTag: "pending",
      });
      return BigInt(blockchainNonce as number);
    }

    return BigInt(nonce);
  } catch (error) {
    console.error("Error getting current relayer nonce:", error);
    throw new Error(`Failed to get current nonce: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Send UserOperation with Flashblocks optimization
 * Note: UserOps have inherent bundler overhead (typically 1-3s)
 * For sub-second confirmations, use direct EOA transactions instead
 */
export async function sendTransactionWithRetry(
  request: any,
  maxRetries: number = 2,
): Promise<UserOperationReceipt> {
  const startTime = performance.now();

  const bundlerClient = await createRelayerBundlerClient();
  const smartAccount = await createSmartAccount();

  const setupTime = performance.now() - startTime;
  console.log(`⚡ Setup: ${setupTime.toFixed(1)}ms`);

  const call = {
    abi: CONTRACT_ABI,
    functionName: request.functionName,
    to: request.address,
    args: request.args,
  };

  let retryCount = 0;

  while (retryCount <= maxRetries) {
    try {
      const sendStart = performance.now();

      const userOpHash = await bundlerClient.sendUserOperation({
        account: smartAccount,
        calls: [call],
      });

      const sendTime = performance.now() - sendStart;
      console.log(`⚡ UserOp Sent: ${sendTime.toFixed(1)}ms | ${userOpHash.slice(0, 10)}...`);

      const receiptStart = performance.now();

      const receipt = await bundlerClient.waitForUserOperationReceipt({
        hash: userOpHash as `0x${string}`,
        pollingInterval: FLASHBLOCKS_POLLING_INTERVAL,
        timeout: FLASHBLOCKS_TIMEOUT,
      });

      const receiptTime = performance.now() - receiptStart;
      const totalTime = performance.now() - startTime;

      console.log(`⚡ UserOp Receipt: ${receiptTime.toFixed(1)}ms`);
      console.log(`🎯 Total UserOp Time: ${totalTime.toFixed(1)}ms`);
      console.log(`📝 Tx Hash: ${receipt.receipt.transactionHash}`);

      // Now wait for the actual transaction preconfirmation using Flashblocks
      const preconfStart = performance.now();
      const preconfClient = getFlashblocksPreconfClient();

      try {
        await preconfClient.waitForTransactionReceipt({
          hash: receipt.receipt.transactionHash as `0x${string}`,
          confirmations: 0, // 0 confirmations = accept preconfirmation
          pollingInterval: FLASHBLOCKS_POLLING_INTERVAL,
          timeout: DIRECT_TX_TIMEOUT,
        });

        const preconfTime = performance.now() - preconfStart;
        console.log(`⚡ Flashblocks Preconf: ${preconfTime.toFixed(1)}ms`);
      } catch (preconfError) {
        console.log(`⚠️ Preconf already confirmed (tx was too fast!)`);
      }

      return receipt;
    } catch (error: any) {
      retryCount++;
      console.error(`❌ Attempt ${retryCount} failed:`, error.message);

      if (
        error.message?.includes("insufficient funds") ||
        error.message?.includes("execution reverted") ||
        error.message?.includes("paymaster") ||
        retryCount > maxRetries
      ) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  throw new Error("Failed to commit UserOperation after retries");
}

/**
 * Parallel UserOp execution with proper delays
 * Note: For true parallel execution, consider using separate smart accounts
 */
export async function sendParallelTransactions(
  commitRequest: any,
  calculateRequest: any,
): Promise<{
  commitReceipt: UserOperationReceipt;
  calculateReceipt: UserOperationReceipt;
}> {
  const startTime = performance.now();
  console.log(`🚀 Parallel UserOp dispatch...`);

  const bundlerClient = await createRelayerBundlerClient();
  const smartAccount = await createSmartAccount();

  const call1 = {
    abi: CONTRACT_ABI,
    functionName: commitRequest.functionName,
    to: commitRequest.address,
    args: commitRequest.args,
  };

  const call2 = {
    abi: CONTRACT_ABI,
    functionName: calculateRequest.functionName,
    to: calculateRequest.address,
    args: calculateRequest.args,
  };

  // Send first UserOp
  const sendStart1 = performance.now();
  const userOpHash1 = await bundlerClient.sendUserOperation({
    account: smartAccount,
    calls: [call1],
  });
  console.log(`⚡ Sent #1: ${(performance.now() - sendStart1).toFixed(1)}ms | ${userOpHash1.slice(0, 10)}...`);

  // Wait 400ms for bundler to process first UserOp before sending second
  // This prevents nonce conflicts and bundler issues
  await new Promise(resolve => setTimeout(resolve, 400));

  // Send second UserOp
  const sendStart2 = performance.now();
  const userOpHash2 = await bundlerClient.sendUserOperation({
    account: smartAccount,
    calls: [call2],
  });
  console.log(`⚡ Sent #2: ${(performance.now() - sendStart2).toFixed(1)}ms | ${userOpHash2.slice(0, 10)}...`);

  // Wait for both receipts in parallel
  const [commitReceipt, calculateReceipt] = await Promise.all([
    bundlerClient.waitForUserOperationReceipt({
      hash: userOpHash1 as `0x${string}`,
      pollingInterval: FLASHBLOCKS_POLLING_INTERVAL,
      timeout: FLASHBLOCKS_TIMEOUT,
    }),
    bundlerClient.waitForUserOperationReceipt({
      hash: userOpHash2 as `0x${string}`,
      pollingInterval: FLASHBLOCKS_POLLING_INTERVAL,
      timeout: FLASHBLOCKS_TIMEOUT,
    }),
  ]);

  const totalTime = performance.now() - startTime;
  console.log(`🎉 Parallel complete: ${totalTime.toFixed(1)}ms`);

  return { commitReceipt, calculateReceipt };
}

/**
 * Batched UserOp - most efficient for multiple operations
 */
export async function sendBatchedTransaction(
  requests: Array<{ address: Hex; functionName: string; args: any[] }>,
): Promise<UserOperationReceipt> {
  const startTime = performance.now();
  console.log(`📦 Batching ${requests.length} calls into single UserOp...`);

  const bundlerClient = await createRelayerBundlerClient();
  const smartAccount = await createSmartAccount();

  const calls = requests.map((req) => ({
    abi: CONTRACT_ABI,
    functionName: req.functionName,
    to: req.address,
    args: req.args,
  }));

  const sendStart = performance.now();
  const userOpHash = await bundlerClient.sendUserOperation({
    account: smartAccount,
    calls,
  });

  const sendTime = performance.now() - sendStart;
  console.log(`⚡ Batch sent: ${sendTime.toFixed(1)}ms`);

  const receipt = await bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash as `0x${string}`,
    pollingInterval: FLASHBLOCKS_POLLING_INTERVAL,
    timeout: FLASHBLOCKS_TIMEOUT,
  });

  const totalTime = performance.now() - startTime;
  console.log(`🎯 Batch total: ${totalTime.toFixed(1)}ms`);

  return receipt;
}

/**
 * Direct EOA transaction - FASTEST with Flashblocks (sub-second)
 * Use this instead of UserOps when you need true 200ms confirmations
 */
export async function sendDirectTransaction(request: any) {
  const startTime = performance.now();
  console.log(`⚡ Direct transaction (no UserOp overhead)...`);

  const walletClient = getFlashblocksWalletClient();
  const preconfClient = getFlashblocksPreconfClient();

  // Encode the function call
  const data = encodeFunctionData({
    abi: CONTRACT_ABI,
    functionName: request.functionName,
    args: request.args,
  });

  const sendStart = performance.now();
  const hash = await walletClient.sendTransaction({
    to: request.address,
    data,
    chain: baseSepoliaPreconf,
  });

  const sendTime = performance.now() - sendStart;
  console.log(`⚡ Tx sent: ${sendTime.toFixed(1)}ms | ${hash.slice(0, 10)}...`);

  const receiptStart = performance.now();
  const receipt = await preconfClient.waitForTransactionReceipt({
    hash,
    confirmations: 0, // Accept preconfirmation
    pollingInterval: FLASHBLOCKS_POLLING_INTERVAL,
    timeout: DIRECT_TX_TIMEOUT,
  });

  const receiptTime = performance.now() - receiptStart;
  const totalTime = performance.now() - startTime;

  console.log(`⚡ Preconf: ${receiptTime.toFixed(1)}ms`);
  console.log(`🎯 Total: ${totalTime.toFixed(1)}ms`);

  return receipt;
}

export async function warmupClients() {
  console.log("🔥 Warming up clients...");
  const start = performance.now();

  await Promise.all([
    createSmartAccount(),
    createRelayerBundlerClient(),
    getFlashblocksClient(),
    getFlashblocksPreconfClient(),
    getFlashblocksWalletClient(),
    getPaymasterClient(),
  ]);

  console.log(`🔥 Warmup complete: ${(performance.now() - start).toFixed(1)}ms`);
}