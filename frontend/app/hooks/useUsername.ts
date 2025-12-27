import { useState, useEffect, useCallback } from 'react';
import { getName } from "@coinbase/onchainkit/identity";
import { base } from 'viem/chains';
import { useMiniKit } from "@coinbase/onchainkit/minikit";

export function useUsername(address: string | undefined, isConnected: boolean) {
  const [username, setUsername] = useState<string | null>(null);
  const { context } = useMiniKit();

  const fetchUsername = useCallback(async (walletAddress: string) => {
    console.log('fetchUsername', walletAddress);

    // Check if username is available in context
    if (context?.user?.username) {
      setUsername(context?.user?.username);
      return;
    }

    // Check localStorage cache
    const savedUsername = localStorage.getItem('user_basename');
    const savedAddress = localStorage.getItem('user_address');
    if (savedAddress && savedAddress === walletAddress.toLowerCase()) {
      setUsername(savedUsername);
      return;
    }

    try {
      let nameResult = await getName({ address: walletAddress as `0x${string}`, chain: base });
      console.log('nameResult', nameResult);
      
      // Trim .eth and .base suffixes if present
      if (nameResult && typeof nameResult === 'string') {
        nameResult = nameResult.replace(/\.eth$/i, '').replace(/\.base$/i, '');
        setUsername(nameResult);
      } else {
        // Fallback to shortened address if no name found
        nameResult = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
        setUsername(nameResult);
      }

      localStorage.setItem('user_basename', nameResult);
      localStorage.setItem('user_address', walletAddress.toLowerCase());
    } catch (error) {
      console.error('Error fetching username:', error);
      // Fallback to shortened address on error
      setUsername(`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`);
    }
  }, [context]);

  useEffect(() => {
    if (isConnected && address) {
      fetchUsername(address);
    } else {
      setUsername(null);
    }
  }, [isConnected, address, fetchUsername]);

  return { username };
}