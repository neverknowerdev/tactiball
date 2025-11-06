import { useCallback, useEffect } from 'react';
import { toast } from "react-toastify";
import { chain as configuredChain } from '@/config/chains';

// Network name mapping
const getNetworkName = (chainId: number): string => {
  const networks: { [key: number]: string } = {
    1: 'Ethereum Mainnet',
    3: 'Ropsten Testnet',
    4: 'Rinkeby Testnet',
    5: 'Goerli Testnet',
    10: 'Optimism',
    42: 'Kovan Testnet',
    56: 'BSC Mainnet',
    97: 'BSC Testnet',
    137: 'Polygon Mainnet',
    80001: 'Polygon Mumbai',
    8453: 'Base Mainnet',
    84532: 'Base Sepolia',
    11155111: 'Sepolia Testnet',
  };
  return networks[chainId] || `Unknown Network (Chain ID: ${chainId})`;
};

export function useChainManager(chainId: number, switchChain: any) {
  const switchToConfiguredChain = useCallback(async () => {
    if (chainId !== configuredChain.id) {
      try {
        console.log(`🔄 Switching from ${getNetworkName(chainId)} to ${getNetworkName(configuredChain.id)}`);
        await switchChain({ chainId: configuredChain.id });
        console.log(`✅ Successfully switched to ${getNetworkName(configuredChain.id)}`);
      } catch (error) {
        console.error('❌ Failed to switch chain:', error);
        toast.error(`Failed to switch to ${getNetworkName(configuredChain.id)}. Please switch manually.`, {
          position: "top-center",
          autoClose: 5000,
        });
      }
    }
  }, [chainId, switchChain]);

  useEffect(() => {
    switchToConfiguredChain();
  }, [switchToConfiguredChain]);
}