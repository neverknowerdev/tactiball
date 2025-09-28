import { createPublicClient, createWalletClient, http, Chain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// Define Worldchain configuration since it might not be in viem/chains yet
export const worldchain: Chain = {
  id: 480, // World Chain mainnet chain ID
  name: 'World Chain',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['https://worldchain-mainnet.g.alchemy.com/public'],
    },
    public: {
      http: ['https://worldchain-mainnet.g.alchemy.com/public'],
    },
  },
  blockExplorers: {
    default: { name: 'WorldScan', url: 'https://worldscan.org' },
  },
  contracts: {
    // Add any specific contracts if needed
  },
};

// Create a public client for reading contract data on Worldchain
export const publicClient = createPublicClient({
    chain: worldchain,
    transport: http(process.env.RPC_URL || 'https://worldchain-mainnet.g.alchemy.com/public')
});

// Create wallet client for the relayer account
const relayerAccount = privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY as `0x${string}`);

export const walletClient = createWalletClient({
  account: relayerAccount,
  chain: worldchain,
  transport: http(process.env.RPC_URL || 'https://worldchain-mainnet.g.alchemy.com/public'),
});

// Utility function to wait for transaction receipt
export function waitForTransactionReceipt(hash: string) {
    return publicClient.waitForTransactionReceipt({
        hash: hash as `0x${string}`,
        confirmations: 0,
        pollingInterval: 200
    });
}

export { relayerAccount };