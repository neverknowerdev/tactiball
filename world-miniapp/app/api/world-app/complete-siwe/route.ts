// app/api/world-app/complete-siwe/route.ts
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, hashMessage, isAddress } from "viem";
import { worldchain } from "viem/chains";

// Types for World App SIWE payload
interface MiniAppWalletAuthSuccessPayload {
  status: "success";
  message: string;
  signature: string;
  address: string;
  version: number;
}

interface IRequestPayload {
  payload: MiniAppWalletAuthSuccessPayload;
  nonce: string;
}

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

// SIWE message verification function for Safe wallets
async function verifySiweMessage(
  payload: MiniAppWalletAuthSuccessPayload,
  expectedNonce: string,
): Promise<{ isValid: boolean; error?: string }> {
  try {
    const { message, signature, address } = payload;

    console.log("=== SIWE Verification Debug ===");
    console.log("Expected nonce:", expectedNonce);
    console.log("Address:", address);
    console.log("Message:", message);
    console.log("Signature:", signature);

    // Verify the nonce is in the message
    const noncePattern = `Nonce: ${expectedNonce}`;
    if (!message.includes(noncePattern)) {
      console.log("Nonce verification failed");
      return {
        isValid: false,
        error: "Nonce mismatch in message",
      };
    }
    console.log("✓ Nonce verification passed");

    // Verify the address is in the message (case-insensitive)
    const addressLower = address.toLowerCase();
    const messageLower = message.toLowerCase();
    if (!messageLower.includes(addressLower)) {
      console.log("Address verification failed");
      return {
        isValid: false,
        error: "Address mismatch in message",
      };
    }
    console.log("✓ Address verification passed");

    // Check expiration time
    const expirationMatch = message.match(/Expiration Time: (.+)/);
    if (expirationMatch) {
      const expirationTime = new Date(expirationMatch[1]);
      const currentTime = new Date();
      console.log("Expiration time:", expirationTime);
      console.log("Current time:", currentTime);
      if (expirationTime < currentTime) {
        return {
          isValid: false,
          error: "Message has expired",
        };
      }
    }
    console.log("✓ Expiration check passed");

    // Verify the address is a valid Ethereum address
    if (!isAddress(address)) {
      return {
        isValid: false,
        error: "Invalid Ethereum address",
      };
    }

    // Hash the message for EIP-1271 verification
    const messageHash = hashMessage(message);
    console.log("Message hash:", messageHash);

    // Verify signature using EIP-1271 (Safe wallet standard)
    console.log("Verifying Safe wallet signature using EIP-1271...");
    const isValidSignature = await verifyEIP1271Signature(
      address,
      messageHash,
      signature,
    );

    console.log("EIP-1271 signature verification:", isValidSignature);

    if (isValidSignature) {
      console.log("✓ EIP-1271 signature verification passed");
      return { isValid: true };
    }

    return {
      isValid: false,
      error: "Invalid signature",
    };
  } catch (error) {
    console.error("Verification error details:", error);
    return {
      isValid: false,
      error: `Verification failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("Received request body:", JSON.stringify(body, null, 2));

    const { payload, nonce } = body as IRequestPayload;

    if (!payload || !nonce) {
      console.log("Missing payload or nonce");
      return NextResponse.json(
        {
          status: "error",
          isValid: false,
          message: "Missing required fields: payload and nonce",
        },
        { status: 400 },
      );
    }

    // Verify the nonce matches what we stored in the cookie
    const cookieStore = await cookies();
    const storedNonce = cookieStore.get("chessball_world_siwe")?.value;

    console.log("Stored nonce:", storedNonce);
    console.log("Received nonce:", nonce);
    console.log("Nonces match:", storedNonce === nonce);

    if (!storedNonce || nonce !== storedNonce) {
      console.log("Nonce mismatch - stored:", storedNonce, "received:", nonce);
      return NextResponse.json(
        {
          status: "error",
          isValid: false,
          message: "Invalid nonce - please try again",
        },
        { status: 400 },
      );
    }

    // Clear the nonce cookie after use (one-time use)
    cookieStore.set("chessball_world_siwe", "", {
      expires: new Date(0),
      httpOnly: true,
    });

    // Check payload status
    if (payload.status !== "success") {
      console.log("Payload status is not success:", payload.status);
      return NextResponse.json(
        {
          status: "error",
          isValid: false,
          message: "Authentication payload indicates failure",
        },
        { status: 400 },
      );
    }

    const validMessage = await verifySiweMessage(payload, nonce);

    if (!validMessage.isValid) {
      console.log("SIWE message validation failed:", validMessage.error);
      return NextResponse.json(
        {
          status: "error",
          isValid: false,
          message: validMessage.error || "Signature verification failed",
        },
        { status: 400 },
      );
    }

    console.log("SIWE verification successful for address:", payload.address);
    return NextResponse.json({
      status: "success",
      isValid: true,
      walletAddress: payload.address,
      message: "Authentication successful",
    });
  } catch (error) {
    console.error("Request processing error:", error);
    return NextResponse.json(
      {
        status: "error",
        isValid: false,
        message: "Invalid request format",
      },
      { status: 400 },
    );
  }
}
