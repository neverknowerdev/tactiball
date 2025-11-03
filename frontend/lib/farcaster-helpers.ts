/**
 * Helper functions for Farcaster/FID operations
 */

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;

/**
 * Get wallet addresses from FID using Neynar API
 */
export async function getWalletsFromFid(fid: number): Promise<string[]> {
  if (!NEYNAR_API_KEY) {
    console.warn("NEYNAR_API_KEY not set, cannot fetch wallet from FID");
    return [];
  }

  try {
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`,
      {
        headers: {
          "api_key": NEYNAR_API_KEY,
        },
      }
    );

    if (!response.ok) {
      console.error(`Neynar API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const user = data.users?.[0];
    
    if (!user) {
      return [];
    }

    // Extract verified addresses first, then custody address
    const wallets: string[] = [];
    
    // Add verified addresses
    if (user.verified_addresses?.eth_addresses) {
      wallets.push(...user.verified_addresses.eth_addresses);
    }
    
    // Add custody address if available
    if (user.custody_address) {
      wallets.push(user.custody_address);
    }

    return wallets.map((w: string) => w.toLowerCase());
  } catch (error) {
    console.error("Error fetching wallets from FID:", error);
    return [];
  }
}

