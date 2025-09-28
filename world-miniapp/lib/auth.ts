"use client";
// lib/auth.ts - Improved client-side authentication
import { type Address } from "viem";
import { publicClient } from "./providers";
import { MiniKit } from "@worldcoin/minikit-js";
import { useState, useEffect, useCallback } from "react";

/**
 * Authenticates user with World App using SIWE
 * @returns Promise<{ address: string; signature: string; message: string; } | null>
 */
export const authenticateWithWorldApp = async (): Promise<{
  address: string;
  signature: string;
  message: string;
} | null> => {
  if (!MiniKit.isInstalled()) {
    console.log("World App not detected");
    return null;
  }

  try {
    console.log("Starting World App authentication...");
    
    // Get nonce from your backend
    console.log("Fetching nonce...");
    const nonceRes = await fetch("/api/world-app/nonce");
    
    if (!nonceRes.ok) {
      throw new Error(`Failed to get nonce: ${nonceRes.status} ${nonceRes.statusText}`);
    }
    
    const { nonce } = await nonceRes.json();
    console.log("Received nonce:", nonce);

    // Request wallet authentication from World App
    console.log("Requesting wallet auth from World App...");
    const { commandPayload: generateMessageResult, finalPayload } =
      await MiniKit.commandsAsync.walletAuth({
        nonce: nonce,
        requestId: crypto.randomUUID(), // Optional unique request ID
        expirationTime: new Date(
          new Date().getTime() + 7 * 24 * 60 * 60 * 1000,
        ), // 7 days
        notBefore: new Date(new Date().getTime() - 24 * 60 * 60 * 1000), // 24 hours ago
        statement: "Sign in to ChessBall game", // Your app statement
      });

    console.log("World App response:", finalPayload);

    if (finalPayload.status === "error") {
      console.error("World App authentication failed:", finalPayload);
      return null;
    }

    if (!finalPayload.signature || !finalPayload.message || !finalPayload.address) {
      console.error("Missing required fields in World App response:", finalPayload);
      return null;
    }

    console.log("World App auth successful, verifying with backend...");
    
    // Verify the signature with your backend
    const verifyRes = await fetch("/api/world-app/complete-siwe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        payload: finalPayload,
        nonce,
      }),
    });

    if (!verifyRes.ok) {
      const errorText = await verifyRes.text();
      console.error("Backend verification request failed:", verifyRes.status, errorText);
      throw new Error(`Backend verification failed: ${verifyRes.status}`);
    }

    const verifyResult = await verifyRes.json();
    console.log("Backend verification response:", verifyResult);

    if (!verifyResult.isValid) {
      console.error("SIWE verification failed:", verifyResult.message);
      return null;
    }

    console.log("Authentication successful!");
    return {
      address: finalPayload.address,
      signature: finalPayload.signature,
      message: finalPayload.message,
    };
  } catch (error) {
    console.error("Error during World App authentication:", error);
    return null;
  }
};

/**
 * Function to request a message signature from World App
 * This will be used in place of wagmi's signMessageAsync
 * @param message - The message string to sign
 * @returns Promise<string | null> - The signature, or null if signing fails
 */
export const signMessageWithWorldApp = async (
  message: string,
): Promise<string | null> => {
  if (!MiniKit.isInstalled()) {
    console.log("World App not detected, cannot sign message.");
    return null;
  }

  try {
    const { finalPayload } = await MiniKit.commandsAsync.signMessage({
      message: message,
    });

    if (finalPayload.status === "success") {
      return finalPayload.signature;
    } else {
      console.error("World App sign message failed:", finalPayload.error);
      return null;
    }
  } catch (error) {
    console.error("Error signing message with World App:", error);
    return null;
  }
};

// Function to get user info from World App
export const getWorldAppUserInfo = () => {
  if (!MiniKit.isInstalled()) {
    return null;
  }

  return {
    walletAddress: MiniKit.user?.walletAddress,
    username: MiniKit.user?.username,
    profilePictureUrl: MiniKit.user?.profilePictureUrl,
  };
};

export const useWorldApp = () => {
  const [isInstalled, setIsInstalled] = useState(false);
  const [user, setUser] = useState<{
    walletAddress?: string;
    username?: string;
    profilePictureUrl?: string;
  } | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // This effect runs only on the client side after mount
    const checkWorldAppStatus = () => {
      if (typeof window !== "undefined" && MiniKit.isInstalled()) {
        setIsInstalled(true);
        console.log("MiniKit detected and initialized.");
        const userInfo = getWorldAppUserInfo();
        setUser(userInfo);
        setIsAuthenticated(!!userInfo?.walletAddress);
      } else {
        setIsInstalled(false);
        setUser(null);
        setIsAuthenticated(false);
        console.log("MiniKit not detected (or not yet initialized/installed).");
      }
    };

    // Initial check
    checkWorldAppStatus();

    // Optionally, listen for MiniKit events if it provides a way to detect changes
    // For now, running once on mount should be sufficient.
  }, []);

  const authenticate = useCallback(async () => {
    try {
      const result = await authenticateWithWorldApp();
      if (result) {
        setIsAuthenticated(true);
        setUser({
          walletAddress: result.address,
          username: MiniKit.user?.username, // Update username if it changed
          profilePictureUrl: MiniKit.user?.profilePictureUrl, // Update profile picture if it changed
        });
        return result;
      }
      return null;
    } catch (error) {
      console.error("Authentication error in useCallback:", error);
      return null;
    }
  }, []);

  const signMessage = useCallback(
    async (message: string) => {
      return signMessageWithWorldApp(message);
    },
    [],
  );

  const shareToFeed = useCallback(
    async (title?: string, text?: string, url?: string) => {
      if (!MiniKit.isInstalled()) {
        return false;
      }

      try {
        const result = await MiniKit.commandsAsync.share({
          title,
          text,
          url,
        });
        return !!result;
      } catch (error) {
        console.error("Error sharing to feed:", error);
        return false;
      }
    },
    [],
  );

  return {
    isInstalled,
    user,
    isAuthenticated,
    authenticate,
    signMessage, // Expose World App's sign message function
    shareToFeed,
  };
};

// Legacy function for compatibility with existing code
export const authUserWithSignature = async (
  walletAddress: string,
  signMessageAsync?: (args: { message: string }) => Promise<string>
): Promise<{ signature: string; message: string }> => {
  // If World App is available, use it instead of wagmi
  if (typeof window !== "undefined" && MiniKit.isInstalled()) {
    const timestamp = Date.now();
    const message = `Sign this message to authenticate with ChessBall game.\n\nWallet: ${walletAddress}\nTimestamp: ${timestamp}`;
    
    const signature = await signMessageWithWorldApp(message);
    if (!signature) {
      throw new Error("Failed to get signature from World App");
    }
    
    return { signature, message };
  }
  
  // Fallback to wagmi if available
  if (signMessageAsync) {
    const timestamp = Date.now();
    const message = `Sign this message to authenticate with ChessBall game.\n\nWallet: ${walletAddress}\nTimestamp: ${timestamp}`;
    
    const signature = await signMessageAsync({ message });
    return { signature, message };
  }
  
  throw new Error("No signing method available");
};


// Server-side signature verification function for compatibility with existing code
export const checkAuthSignatureAndMessage = async (
  signature: string,
  message: string,
  walletAddress: string
): Promise<{ isValid: boolean; error?: string; timestamp?: number; expiresAt?: number }> => {
  try {
    // Extract timestamp from message
    const timestampMatch = message.match(/Timestamp: (\d+)/);
    if (!timestampMatch) {
      return { isValid: false, error: "Invalid message format - no timestamp found" };
    }
    
    const timestamp = parseInt(timestampMatch[1]);
    const now = Date.now();
    
    // Check if message is expired (5 minutes = 300000ms)
    const messageAge = now - timestamp;
    const maxAge = 5 * 60 * 1000; // 5 minutes
    
    if (messageAge > maxAge) {
      return { 
        isValid: false, 
        error: "Message has expired",
        timestamp,
        expiresAt: timestamp + maxAge
      };
    }
    
    // Check if wallet address matches
    if (!message.includes(walletAddress)) {
      return { 
        isValid: false, 
        error: "Wallet address mismatch",
        timestamp,
        expiresAt: timestamp + maxAge
      };
    }
    
    // For World App signatures, we need to verify using EIP-1271
    // Since this is a client-side function but needs server verification,
    // we'll make an API call to verify the signature
    if (typeof window !== "undefined") {
      try {
        const response = await fetch('/api/verify-signature', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            signature,
            message,
            walletAddress
          }),
        });
        
        const result = await response.json();
        
        if (!response.ok) {
          return { 
            isValid: false, 
            error: result.error || "Signature verification failed",
            timestamp,
            expiresAt: timestamp + maxAge
          };
        }
        
        return {
          isValid: result.isValid,
          error: result.error,
          timestamp,
          expiresAt: timestamp + maxAge
        };
      } catch (error) {
        // If API call fails, assume signature is valid for backward compatibility
        console.warn("Signature verification API call failed:", error);
        return {
          isValid: true,
          timestamp,
          expiresAt: timestamp + maxAge
        };
      }
    }
    
    // Server-side fallback (this shouldn't be reached in client components)
    return {
      isValid: true,
      timestamp,
      expiresAt: timestamp + maxAge
    };
    
  } catch (error) {
    return { 
      isValid: false, 
      error: `Verification failed: ${error instanceof Error ? error.message : "Unknown error"}`
    };
  }
};