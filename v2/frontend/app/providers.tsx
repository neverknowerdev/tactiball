'use client';

import { useState, type ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { base } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MiniKitProvider } from '@coinbase/onchainkit/minikit';
import { wagmiConfig } from '@/lib/wagmi';
import { SessionProvider } from './session';

// OnchainKit (wallet button, Basenames) reuses this wagmi config, which lists
// every sign-in chain (Base and Robinhood Chain, mainnet and testnet).
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <MiniKitProvider apiKey={process.env.NEXT_PUBLIC_CDP_CLIENT_API_KEY} chain={base}>
          <SessionProvider>{children}</SessionProvider>
        </MiniKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
