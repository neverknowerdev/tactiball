// Chains players can sign in from. The canister decides which are enabled
// (`get_settings().chains`); this file only knows how to show and switch to them.

import { defineChain } from 'viem';
import { base, baseSepolia } from 'viem/chains';

const eth = { name: 'Ether', symbol: 'ETH', decimals: 18 } as const;

// RPC endpoints are only used when a wallet needs to add the chain.
export const robinhood = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: eth,
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL || 'https://rpc.chain.robinhood.com'] } },
});

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: eth,
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL || 'https://rpc.testnet.chain.robinhood.com'] } },
  testnet: true,
});

export const walletChains = [base, robinhood, baseSepolia, robinhoodTestnet] as const;

const STYLE: Record<string, { short: string; className: string }> = {
  '8453': { short: 'Base', className: 'bg-[#0052ff] text-white' },
  '84532': { short: 'Base Sepolia', className: 'bg-[#4d7cff] text-white' },
  '4663': { short: 'Robinhood', className: 'bg-[#00c805] text-black' },
  '46630': { short: 'Robinhood Testnet', className: 'bg-[#5cd65f] text-black' },
};

/** Badge label and Tailwind classes for a CAIP-2 chain id like "eip155:8453". */
export function chainBadge(caip2: string): { label: string; className: string } {
  const id = caip2.split(':')[1] ?? '';
  const style = STYLE[id];
  return { label: style?.short ?? caip2, className: style?.className ?? 'bg-gray-500 text-white' };
}

export function chainName(chainId: number): string {
  return walletChains.find((c) => c.id === chainId)?.name ?? `chain ${chainId}`;
}
