import { createConfig, http } from 'wagmi';
import { coinbaseWallet, injected } from 'wagmi/connectors';
import { walletChains } from '@/lib/chains';

// The canister checks plain ECDSA signatures, so smart-contract wallets
// (Coinbase Smart Wallet, Safe) can't sign in yet: Coinbase Wallet is limited
// to its EOA mode.
export const wagmiConfig = createConfig({
  chains: walletChains,
  connectors: [injected(), coinbaseWallet({ appName: 'TactiBall', preference: { options: 'eoaOnly' } })],
  transports: Object.fromEntries(walletChains.map((c) => [c.id, http()])) as Record<(typeof walletChains)[number]['id'], ReturnType<typeof http>>,
  ssr: true,
});
