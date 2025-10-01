"use server";
import { createPaymasterClient } from "viem/account-abstraction";
import { createWalletClient, createPublicClient, http, type Hex } from "viem";
import { basePreconf } from "viem/chains";
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

// OPTIMIZATION: Aggressive polling for flashblocks
const FLASHBLOCKS_POLLING_INTERVAL = 50; // 50ms for ultra-fast confirmation
const FLASHBLOCKS_TIMEOUT = 5000; // 5 second timeout

function getCoinbasePaymasterRpcUrl() {
  if (!COINBASE_PAYMASTER_RPC_URL) {
    throw new Error(
      "COINBASE_PAYMASTER_RPC_URL environment variable is required",
    );
  }
  return COINBASE_PAYMASTER_RPC_URL;
}

// OPTIMIZATION: Create persistent clients to avoid recreation overhead
let _flashblocksClient: ReturnType<typeof createPublicClient> | null = null;
let _smartAccount: Awaited<ReturnType<typeof toCoinbaseSmartAccount>> | null =
  null;
let _bundlerClient: Awaited<ReturnType<typeof createBundlerClient>> | null =
  null;

function getFlashblocksClient() {
  if (!_flashblocksClient) {
    _flashblocksClient = createPublicClient({
      chain: basePreconf,
      transport: http(FLASHBLOCKS_RPC_URL, {
        // OPTIMIZATION: Configure HTTP transport for speed
        timeout: FLASHBLOCKS_TIMEOUT,
        retryCount: 2,
        retryDelay: 100,
      }),
      pollingInterval: FLASHBLOCKS_POLLING_INTERVAL,
      // OPTIMIZATION: Batch requests when possible
      batch: {
        multicall: {
          batchSize: 1024,
          wait: 0, // Don't wait to batch - send immediately
        },
      },
    });
  }
  return _flashblocksClient;
}

// OPTIMIZATION: Cache smart account to avoid recreation
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

// OPTIMIZATION: Cache bundler client
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
    }),
    chain: basePreconf,
    paymaster: createPaymasterClient({
      transport: http(getCoinbasePaymasterRpcUrl(), {
        timeout: FLASHBLOCKS_TIMEOUT,
      }),
    }),
  });

  return _bundlerClient;
}

// Legacy function for backward compatibility
export async function createRelayerClient() {
  const smartAccount = await createSmartAccount();

  return createWalletClient({
    account: smartAccount,
    chain: basePreconf,
    transport: http(FLASHBLOCKS_RPC_URL, {
      timeout: FLASHBLOCKS_TIMEOUT,
    }),
  });
}

// Redis-based nonce management (kept same, but using cached client)
export async function getNextRelayerNonce(account: Hex): Promise<bigint> {
  const nonceKey = `relayer_nonce:${account}`;

  try {
    if (!redis) {
      throw new Error(
        "Redis client not available - check REDIS_URL and REDIS_TOKEN environment variables",
      );
    }

    const nonceStr = await redis.incr(nonceKey);
    const nonce = Number(nonceStr);

    if (nonce === 1) {
      const client = getFlashblocksClient();
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
    throw new Error(
      `Failed to get next nonce: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function resetRelayerNonce(account: Hex): Promise<void> {
  const nonceKey = `relayer_nonce:${account}`;

  try {
    if (!redis) {
      throw new Error(
        "Redis client not available - check REDIS_URL and REDIS_TOKEN environment variables",
      );
    }

    const client = getFlashblocksClient();
    const blockchainNonce = await client.getTransactionCount({
      address: account,
      blockTag: "pending",
    });

    await redis.set(nonceKey, Number(blockchainNonce));
    console.log(`Reset nonce for ${account} to ${blockchainNonce}`);
  } catch (error) {
    console.error("Error resetting relayer nonce:", error);
    throw new Error(
      `Failed to reset nonce: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function getCurrentRelayerNonce(account: Hex): Promise<bigint> {
  const nonceKey = `relayer_nonce:${account}`;

  try {
    if (!redis) {
      throw new Error(
        "Redis client not available - check REDIS_URL and REDIS_TOKEN environment variables",
      );
    }

    const nonceStr = await redis.get(nonceKey);
    const nonce = nonceStr !== null ? Number(nonceStr) : null;

    if (nonce === null) {
      const client = getFlashblocksClient();
      const blockchainNonce = await client.getTransactionCount({
        address: account,
        blockTag: "pending",
      });
      return BigInt(blockchainNonce as number);
    }

    return BigInt(nonce);
  } catch (error) {
    console.error("Error getting current relayer nonce:", error);
    throw new Error(
      `Failed to get current nonce: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

// OPTIMIZATION: Enhanced transaction sending with detailed timing
export async function sendTransactionWithRetry(
  request: any,
  maxRetries: number = 2, // Reduced retries since flashblocks is fast
): Promise<UserOperationReceipt> {
  const startTime = performance.now();

  const bundlerClient = await createRelayerBundlerClient();
  const smartAccount = await createSmartAccount();
  const accountAddress = smartAccount.address;

  const setupTime = performance.now() - startTime;
  console.log(`⚡ Client setup: ${setupTime.toFixed(2)}ms`);

  // Convert the contract call request to a UserOperation call
  const call = {
    abi: CONTRACT_ABI,
    functionName: request.functionName,
    to: request.address,
    args: request.args,
  };

  let userOpHash: string;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      // OPTIMIZATION: Measure send time
      const sendStart = performance.now();

      userOpHash = await bundlerClient.sendUserOperation({
        account: smartAccount,
        calls: [call],
      });

      const sendTime = performance.now() - sendStart;
      console.log(
        `⚡ UserOp sent: ${sendTime.toFixed(2)}ms | Hash: ${userOpHash.slice(0, 10)}...`,
      );

      // OPTIMIZATION: Measure receipt wait time with aggressive polling
      const receiptStart = performance.now();

      const receipt = await bundlerClient.waitForUserOperationReceipt({
        hash: userOpHash as `0x${string}`,
        pollingInterval: FLASHBLOCKS_POLLING_INTERVAL,
        timeout: FLASHBLOCKS_TIMEOUT,
      });

      const receiptTime = performance.now() - receiptStart;
      const totalTime = performance.now() - startTime;

      console.log(`⚡ Receipt received: ${receiptTime.toFixed(2)}ms`);
      console.log(`🎯 Total time: ${totalTime.toFixed(2)}ms`);
      console.log(`💰 Sponsored by Coinbase Paymaster: YES`);

      return receipt;
    } catch (error: any) {
      retryCount++;
      const errorTime = performance.now() - startTime;
      console.error(
        `❌ Attempt ${retryCount} failed (${errorTime.toFixed(2)}ms):`,
        error.message,
      );

      // Don't retry for certain errors
      if (
        error.message?.includes("insufficient funds") ||
        error.message?.includes("execution reverted") ||
        error.message?.includes("paymaster") ||
        error.message?.includes("sponsor")
      ) {
        throw error;
      }

      if (
        error.message?.includes("replacement transaction underpriced") &&
        retryCount < maxRetries
      ) {
        // Minimal wait before retry
        await new Promise((resolve) => setTimeout(resolve, 200 * retryCount));
        continue;
      }

      // Timeout errors - might want to retry
      if (error.message?.includes("timeout") && retryCount < maxRetries) {
        console.log(`⏱️ Timeout, retrying with extended timeout...`);
        continue;
      }

      throw error;
    }
  }

  throw new Error("Failed to commit UserOperation after maximum retries");
}

// OPTIMIZATION: Fast receipt confirmation with flashblocks
export async function waitForPaymasterTransactionReceipt(
  hash: string | UserOperationReceipt,
) {
  const startTime = performance.now();

  const txHash = typeof hash === "string" ? hash : hash.receipt.transactionHash;
  console.log(`⏳ Waiting for final confirmation: ${txHash.slice(0, 10)}...`);

  const client = getFlashblocksClient();
  const receipt = await client.waitForTransactionReceipt({
    hash: txHash as `0x${string}`,
    confirmations: 0, // Flashblocks provides instant finality
    pollingInterval: FLASHBLOCKS_POLLING_INTERVAL,
    timeout: FLASHBLOCKS_TIMEOUT,
  });

  const confirmTime = performance.now() - startTime;
  console.log(`✅ Final confirmation: ${confirmTime.toFixed(2)}ms`);

  return receipt;
}

// OPTIMIZATION: Parallel transaction sending for commit + calculate
export async function sendParallelTransactions(
  commitRequest: any,
  calculateRequest: any,
): Promise<{
  commitReceipt: UserOperationReceipt;
  calculateReceipt: UserOperationReceipt;
}> {
  const startTime = performance.now();
  console.log(`🚀 Starting parallel transactions...`);

  try {
    // Send both transactions in parallel
    const [commitReceipt, calculateReceipt] = await Promise.all([
      sendTransactionWithRetry(commitRequest),
      sendTransactionWithRetry(calculateRequest),
    ]);

    const totalTime = performance.now() - startTime;
    console.log(
      `🎉 Both transactions completed in parallel: ${totalTime.toFixed(2)}ms`,
    );

    return { commitReceipt, calculateReceipt };
  } catch (error) {
    console.error(`❌ Parallel transaction failed:`, error);
    throw error;
  }
}

// OPTIMIZATION: Batch multiple calls into a single UserOp
export async function sendBatchedTransaction(
  requests: Array<{ address: Hex; functionName: string; args: any[] }>,
): Promise<UserOperationReceipt> {
  const startTime = performance.now();
  console.log(
    `📦 Starting batched transaction with ${requests.length} calls...`,
  );

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
    calls, // Multiple calls in one UserOp
  });

  const sendTime = performance.now() - sendStart;
  console.log(`⚡ Batched UserOp sent: ${sendTime.toFixed(2)}ms`);

  const receiptStart = performance.now();
  const receipt = await bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash as `0x${string}`,
    pollingInterval: FLASHBLOCKS_POLLING_INTERVAL,
    timeout: FLASHBLOCKS_TIMEOUT,
  });

  const receiptTime = performance.now() - receiptStart;
  const totalTime = performance.now() - startTime;

  console.log(`⚡ Batched receipt: ${receiptTime.toFixed(2)}ms`);
  console.log(`🎯 Total batched time: ${totalTime.toFixed(2)}ms`);

  return receipt;
}
