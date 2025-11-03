'use client';

import { DynamicProvider } from './dynamicProvider';
import { Providers } from './providers';
import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core';
import { useMiniKit } from '@coinbase/onchainkit/minikit';
import React, { ReactNode, useMemo } from 'react';

/**
 * Creates a minimal Dynamic context for miniapp
 * Always renders provider immediately to satisfy hooks, but with minimal config
 * The setState during render warning is a React dev warning, not an error
 * The app will still function correctly despite the warning
 */
function MinimalDynamicProvider({ children }: { children: ReactNode }) {
  const envId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID || '';
  
  // Always render provider immediately - hooks require it to be available
  // The setState during render warning from Dynamic SDK's SyncAuthFlow is a
  // development-only warning that doesn't break the app. In production builds,
  // this warning is typically suppressed.
  return (
    <DynamicContextProvider
      settings={{
        environmentId: envId,
        walletConnectors: [],
        // Minimal configuration to prevent full SDK initialization
        appName: 'Miniapp',
        appLogoUrl: '',
      }}
      suppressHydrationWarning={true}
    >
      {children}
    </DynamicContextProvider>
  );
}

export function DynamicWrapper({ children }: { children: ReactNode }) {
  const { context } = useMiniKit();
  
  // Check if we're in miniapp using useMemo (synchronous check, avoids setState during render)
  // This is safe because context from useMiniKit is available synchronously
  const isMiniApp = useMemo(() => {
    return context !== null && context !== undefined;
  }, [context]);

  // Always provide DynamicContextProvider to satisfy useDynamicContext calls
  // Use minimal provider for miniapp, full provider for web
  if (isMiniApp) {
    // In miniapp, use minimal provider - context available but won't fully initialize
    return <MinimalDynamicProvider>{children}</MinimalDynamicProvider>;
  }

  // For web, wrap with OnchainKitProvider (for wagmi) and DynamicProvider (for wallet)
  return (
    <Providers>
      <DynamicProvider>{children}</DynamicProvider>
    </Providers>
  );
}

