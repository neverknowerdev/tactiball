"use client";

import { useSignMessage } from "wagmi";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useMemo } from "react";

/**
 * Hook that bridges Dynamic wallet signing with wagmi useSignMessage
 * When in miniapp, uses wagmi directly
 * When in web with Dynamic wallet, uses Dynamic's signing method
 */
export function useSignMessageBridge() {
  const { context } = useMiniKit();
  const wagmiSignMessage = useSignMessage();
  const dynamicContext = useDynamicContext();
  
  // Check if we're in miniapp
  const isMiniApp = useMemo(() => {
    return context !== null && context !== undefined;
  }, [context]);

  // In miniapp, use wagmi directly
  if (isMiniApp) {
    return {
      signMessageAsync: wagmiSignMessage.signMessageAsync,
    };
  }

  // In web: Try to use Dynamic's wallet signing
  const dynamicWallet = dynamicContext?.primaryWallet;

  // If Dynamic has a connected wallet, use its signing method
  if (dynamicWallet) {
    return {
      signMessageAsync: async (params: { message: string }) => {
        // Use Dynamic's wallet to sign the message
        // Dynamic wallets provide an EIP-1193 compatible provider
        try {
          // Get the account address from the wallet
          const address = dynamicWallet.address || (dynamicWallet as any).chainAccounts?.[0]?.address;
          
          if (!address) {
            throw new Error('No address available in Dynamic wallet');
          }

          // Dynamic EthereumWallet has getWalletClient() method that returns a viem wallet client
          // This is the recommended way to sign messages with Dynamic wallets
          try {
            console.log('Using getWalletClient() for signing');
            const walletClient = await (dynamicWallet as any).getWalletClient();
            
            if (walletClient && typeof walletClient.signMessage === 'function') {
              console.log('Got wallet client, signing message');
              // viem walletClient.signMessage takes { account, message } format
              const signature = await walletClient.signMessage({
                account: address as `0x${string}`,
                message: params.message,
              });
              console.log('Successfully signed using walletClient.signMessage()');
              return signature;
            } else {
              console.error('Wallet client does not have signMessage method:', walletClient);
            }
          } catch (walletClientError) {
            console.error('Error with getWalletClient():', walletClientError);
          }

          // Fallback: Try to get the provider from the connector
          const connector = dynamicWallet.connector;
          if (!connector) {
            throw new Error('No connector available in Dynamic wallet');
          }

          console.log('Falling back to connector methods, connector type:', connector.constructor?.name);

          // Method 2: If connector has a request method, use it directly
          if (typeof (connector as any).request === 'function') {
            console.log('Trying connector.request() for signing');
            try {
              const signature = await (connector as any).request({
                method: 'personal_sign',
                params: [params.message, address],
              });
              console.log('Successfully signed using connector.request()');
              return signature as string;
            } catch (connectorError) {
              console.error('Error with connector.request():', connectorError);
            }
          }

          // Method 3: Try connector's getProvider method
          let provider;
          if (typeof (connector as any).getProvider === 'function') {
            provider = await (connector as any).getProvider();
            console.log('Got provider from connector.getProvider()');
          } else if ((connector as any).provider) {
            provider = (connector as any).provider;
            console.log('Got provider from connector.provider');
          }

          // Method 4: Use provider's request method
          if (provider && typeof provider.request === 'function') {
            console.log('Trying provider.request() for signing');
            try {
              const signature = await provider.request({
                method: 'personal_sign',
                params: [params.message, address],
              });
              console.log('Successfully signed using provider.request()');
              return signature as string;
            } catch (providerError) {
              console.error('Error with provider.request():', providerError);
            }
          }

          console.error('All signing methods failed.');
          throw new Error('Unable to sign message with Dynamic wallet. Check console for details.');
        } catch (error) {
          console.error('Error signing message with Dynamic wallet:', error);
          throw error;
        }
      },
    };
  }

  // Otherwise, fall back to wagmi
  return {
    signMessageAsync: wagmiSignMessage.signMessageAsync,
  };
}

