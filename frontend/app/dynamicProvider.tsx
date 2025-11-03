'use client';

import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';
import { ReactNode } from 'react';
import { chain } from '@/config/chains';

export function DynamicProvider({ children }: { children: ReactNode }) {
  return (
    <DynamicContextProvider
      settings={{
        environmentId: process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID || '',
        walletConnectors: [EthereumWalletConnectors],
        overrides: {
          evmNetworks: [
            {
              blockExplorerUrls: chain.blockExplorers?.default?.url ? [chain.blockExplorers.default.url] : [],
              chainId: chain.id,
              iconUrls: [],
              name: chain.name,
              nativeCurrency: chain.nativeCurrency,
              networkId: chain.id,
              rpcUrls: [
                {
                  http: Array.isArray(chain.rpcUrls.default.http) 
                    ? chain.rpcUrls.default.http 
                    : [chain.rpcUrls.default.http as string],
                },
              ],
            },
          ],
        },
      }}
    >
      {children}
    </DynamicContextProvider>
  );
}

