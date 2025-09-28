// app/api/verify-signature/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, hashMessage, verifyMessage, isAddress, recoverAddress } from "viem";
import { worldchain } from "viem/chains";

// Create a client for World Chain to verify EIP-1271 signatures
const worldchainClient = createPublicClient({
  chain: worldchain,
  transport: http(),
});

// EIP-1271 signature verification for Safe wallets
async function verifyEIP1271Signature(
  contractAddress: string,
  messageHash: string,
  signature: string,
): Promise<boolean> {
  try {
    const result = await worldchainClient.readContract({
      address: contractAddress as `0x${string}`,
      abi: [
        {
          name: "isValidSignature",
          type: "function",
          stateMutability: "view",
          inputs: [
            { name: "hash", type: "bytes32" },
            { name: "signature", type: "bytes" },
          ],
          outputs: [{ name: "", type: "bytes4" }],
        },
      ],
      functionName: "isValidSignature",
      args: [messageHash as `0x${string}`, signature as `0x${string}`],
    });

    // EIP-1271 magic value for valid signature
    const EIP1271_MAGIC_VALUE = "0x1626ba7e";
    return result === EIP1271_MAGIC_VALUE;
  } catch (error) {
    console.log("EIP-1271 verification failed:", error);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { signature, message, walletAddress } = await req.json();

    if (!signature || !message || !walletAddress) {
      return NextResponse.json(
        { isValid: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verify the wallet address is valid
    if (!isAddress(walletAddress)) {
      return NextResponse.json(
        { isValid: false, error: "Invalid wallet address" },
        { status: 400 }
      );
    }

    console.log("Verifying signature for:", walletAddress);
    console.log("Message:", message);
    console.log("Signature:", signature);

    // Method 1: Try standard EOA verification first
    try {
      const isValidEOA = await verifyMessage({
        address: walletAddress as `0x${string}`,
        message: message,
        signature: signature as `0x${string}`,
      });

      console.log("EOA verification result:", isValidEOA);

      if (isValidEOA) {
        return NextResponse.json({
          isValid: true,
          method: "EOA"
        });
      }
    } catch (error) {
      console.log("EOA verification failed:", error);
    }

    // Method 2: Try EIP-1271 verification for Smart Contract wallets (World App)
    try {
      const messageHash = hashMessage(message);
      const isValidEIP1271 = await verifyEIP1271Signature(
        walletAddress,
        messageHash,
        signature
      );

      console.log("EIP-1271 verification result:", isValidEIP1271);

      if (isValidEIP1271) {
        return NextResponse.json({
          isValid: true,
          method: "EIP-1271"
        });
      }
    } catch (error) {
      console.log("EIP-1271 verification failed:", error);
    }

    // Method 3: Try manual recovery (fallback)
    try {
      const messageHash = hashMessage(message);
      const recoveredAddress = await recoverAddress({
        hash: messageHash,
        signature: signature as `0x${string}`,
      });

      const isValidRecovery = recoveredAddress.toLowerCase() === walletAddress.toLowerCase();
      console.log("Manual recovery result:", isValidRecovery);
      console.log("Recovered address:", recoveredAddress);

      if (isValidRecovery) {
        return NextResponse.json({
          isValid: true,
          method: "Manual Recovery"
        });
      }
    } catch (error) {
      console.log("Manual recovery failed:", error);
    }

    return NextResponse.json({
      isValid: false,
      error: "All signature verification methods failed"
    });

  } catch (error) {
    console.error("Signature verification error:", error);
    return NextResponse.json(
      { isValid: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}