import type { MiniAppNotificationDetails } from "@farcaster/frame-sdk";
import { redis } from "./redis";

const notificationServiceKey =
  process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME ?? "minikit";

function getUserNotificationDetailsKey(fid: number): string {
  return `${notificationServiceKey}:user:${fid}:notifications`;
}

function getWalletToFidKey(walletAddress: string): string {
  return `${notificationServiceKey}:wallet:${walletAddress.toLowerCase()}:fid`;
}

function getFidToWalletKey(fid: number): string {
  return `${notificationServiceKey}:fid:${fid}:wallet`;
}

export async function getUserNotificationDetails(
  fid: number,
): Promise<MiniAppNotificationDetails | null> {
  if (!redis) {
    console.warn("Redis not available, cannot get notification details");
    return null;
  }

  try {
    return await redis.get<MiniAppNotificationDetails>(
      getUserNotificationDetailsKey(fid),
    );
  } catch (error) {
    console.error("Failed to get notification details:", error);
    return null;
  }
}

export async function setUserNotificationDetails(
  fid: number,
  notificationDetails: MiniAppNotificationDetails,
): Promise<void> {
  if (!redis) {
    console.warn("Redis not available, cannot set notification details");
    return;
  }

  try {
    await redis.set(getUserNotificationDetailsKey(fid), notificationDetails);
  } catch (error) {
    console.error("Failed to set notification details:", error);
    throw error; // Re-throw so webhook handler knows it failed
  }
}

export async function deleteUserNotificationDetails(
  fid: number,
): Promise<void> {
  if (!redis) {
    console.warn("Redis not available, cannot delete notification details");
    return;
  }

  try {
    await redis.del(getUserNotificationDetailsKey(fid));
  } catch (error) {
    console.error("Failed to delete notification details:", error);
    // Don't throw - deletion failures are less critical
  }
}

/**
 * Store mapping between wallet address and FID
 */
export async function setWalletToFidMapping(
  walletAddress: string,
  fid: number,
): Promise<void> {
  if (!redis) {
    console.warn("Redis not available, cannot set wallet to FID mapping");
    return;
  }

  try {
    const normalizedWallet = walletAddress.toLowerCase();
    await redis.set(getWalletToFidKey(normalizedWallet), fid);
    await redis.set(getFidToWalletKey(fid), normalizedWallet);
  } catch (error) {
    console.error("Failed to set wallet to FID mapping:", error);
    // Don't throw - mapping failures shouldn't break functionality
  }
}

/**
 * Get FID from wallet address
 */
export async function getFidFromWallet(
  walletAddress: string,
): Promise<number | null> {
  if (!redis) {
    console.warn("Redis not available, cannot get FID from wallet");
    return null;
  }

  try {
    const normalizedWallet = walletAddress.toLowerCase();
    const fid = await redis.get<number>(getWalletToFidKey(normalizedWallet));
    return fid;
  } catch (error) {
    console.error("Failed to get FID from wallet:", error);
    return null;
  }
}

/**
 * Delete wallet to FID mapping
 */
export async function deleteWalletToFidMapping(
  fid: number,
): Promise<void> {
  if (!redis) {
    console.warn("Redis not available, cannot delete wallet to FID mapping");
    return;
  }

  try {
    const wallet = await redis.get<string>(getFidToWalletKey(fid));
    if (wallet) {
      await redis.del(getWalletToFidKey(wallet));
      await redis.del(getFidToWalletKey(fid));
    }
  } catch (error) {
    console.error("Failed to delete wallet to FID mapping:", error);
    // Don't throw - deletion failures are less critical
  }
}