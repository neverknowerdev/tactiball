"use client";

import { useAccount } from "wagmi";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useMemo } from "react";

/**
 * Hook that bridges Dynamic wallet state with wagmi useAccount
 * When in miniapp, uses wagmi directly
 * When in web, uses Dynamic's wallet state if available, otherwise falls back to wagmi
 */
export function useWalletConnection() {
  const { context } = useMiniKit();
  const wagmiAccount = useAccount();
  
  // Always call useDynamicContext (React rules of hooks - must be unconditional)
  // Provider is always rendered (either full or minimal)
  const dynamicContext = useDynamicContext();
  
  // Check if we're in miniapp
  const isMiniApp = useMemo(() => {
    return context !== null && context !== undefined;
  }, [context]);

  // In miniapp, use wagmi directly (OnChainKit handles it)
  // Dynamic context exists but is not initialized, so primaryWallet will be null
  if (isMiniApp) {
    return wagmiAccount;
  }

  // In web: Try to use Dynamic's wallet state
  // primaryWallet will be null/undefined if not connected or not in DynamicProvider
  const dynamicWallet = dynamicContext?.primaryWallet;

  // If Dynamic has a connected wallet, use its state
  if (dynamicWallet) {
    const walletAddress = dynamicWallet.address || (dynamicWallet as any).chainAccounts?.[0]?.address;
    
    if (walletAddress) {
      console.log('Dynamic wallet address:', walletAddress);
      console.log('Dynamic wallet object:', dynamicWallet);
      console.log('Dynamic wallet address type:', typeof walletAddress);
      
      return {
        ...wagmiAccount,
        address: walletAddress as `0x${string}`,
        isConnected: true,
        isConnecting: false,
        isDisconnected: false,
        status: "connected" as const,
      };
    } else {
      console.warn('Dynamic wallet found but no address available:', dynamicWallet);
    }
  }

  // Otherwise, fall back to wagmi
  return wagmiAccount;
}

