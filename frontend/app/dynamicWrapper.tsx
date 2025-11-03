'use client';

import { DynamicProvider } from './dynamicProvider';
import { Providers } from './providers';
import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core';
import { useMiniKit } from '@coinbase/onchainkit/minikit';
import { ReactNode, useMemo } from 'react';

/**
 * Minimal DynamicProvider for miniapp - provides context without full initialization
 */
function MinimalDynamicProvider({ children }: { children: ReactNode }) {
  // Provide a minimal DynamicContextProvider to prevent useDynamicContext errors
  // This prevents errors in miniapp where we don't need Dynamic functionality
  return (
    <DynamicContextProvider
      settings={{
        environmentId: '', // Empty ID for miniapp (won't initialize)
        walletConnectors: [],
      }}
    >
      {children}
    </DynamicContextProvider>
  );
}

export function DynamicWrapper({ children }: { children: ReactNode }) {
  const { context } = useMiniKit();
  const isMiniApp = useMemo(() => {
    return context !== null && context !== undefined;
  }, [context]);

  // Always provide DynamicProvider to prevent useDynamicContext errors
  // Use minimal provider for miniapp, full provider for web
  if (isMiniApp) {
    // In miniapp, use minimal provider to prevent errors
    return <MinimalDynamicProvider>{children}</MinimalDynamicProvider>;
  }

  // For web, wrap with OnchainKitProvider (for wagmi) and DynamicProvider (for wallet)
  return (
    <Providers>
      <DynamicProvider>{children}</DynamicProvider>
    </Providers>
  );
}

