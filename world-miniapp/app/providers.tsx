// app/providers.tsx
'use client';

import { MiniKitProvider } from '@worldcoin/minikit-js/minikit-provider';
import { MiniKit, MiniKitInstallErrorCodes } from '@worldcoin/minikit-js'; 
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { base } from 'viem/chains';
import { http, createConfig } from 'wagmi';
import { coinbaseWallet } from 'wagmi/connectors';
import { ReactNode, useEffect, useState } from 'react';

interface ProvidersProps {
  children: ReactNode;
}

// Move config creation outside component to prevent recreation
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 60 * 1000,
    },
  },
});

const wagmiConfig = createConfig({
  chains: [base],
  connectors: [
    coinbaseWallet({
      appName: "ChessBall",
      preference: "smartWalletOnly",
    }),
  ],
  transports: {
    [base.id]: http(),
  },
  ssr: true, // Add this
});

export function Providers({ children }: ProvidersProps) {
  const [mounted, setMounted] = useState(false);
  const [miniKitInitialized, setMiniKitInitialized] = useState(false);
  const [miniKitInstallError, setMiniKitInstallError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);

    if (typeof window !== "undefined" && !miniKitInitialized) {
      try {
        const installResult = MiniKit.install(process.env.NEXT_PUBLIC_WORLD_APP_ID); // Replace with your actual World App ID
        if (installResult.success) {
          setMiniKitInitialized(true);
          console.log("MiniKit installed successfully!");
        } else {
          setMiniKitInstallError(`MiniKit installation failed: ${installResult.errorMessage}`);
          console.error("MiniKit installation failed:", installResult.errorMessage, installResult.errorCode);
        }
      } catch (error) {
        setMiniKitInstallError(`Error during MiniKit installation: ${error instanceof Error ? error.message : "Unknown error"}`);
        console.error("Error during MiniKit installation:", error);
      }
    }
  }, [miniKitInitialized]); 

  

  // Show loading until mounted
  if (!mounted) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 font-sans mini-app-theme">
        <div className="flex flex-col items-center">
          <img src="/logo-white.png" alt="ChessBall Logo" className="h-42" />
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mt-4"></div>
          <p className="text-sm text-gray-400 mt-2">Loading...</p>
        </div>
      </div>
    );
  }

  if (miniKitInstallError && !MiniKit.isInstalled()) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 font-sans mini-app-theme text-red-500">
        <p>Error loading MiniApp: {miniKitInstallError}</p>
        <p>Please ensure you are using the latest World App version.</p>
        <p>If you are not in World App, some features may not be available.</p>
      </div>
    );
  }

  return (
    <MiniKitProvider>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <OnchainKitProvider
            apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
            chain={base}
            config={{
              appearance: {
                mode: 'auto',
                theme: 'default',
              },
            }}
          >
            {children}
          </OnchainKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </MiniKitProvider>
  );
}