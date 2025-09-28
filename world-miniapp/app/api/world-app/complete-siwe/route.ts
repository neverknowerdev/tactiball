// app/api/world-app/complete-siwe/route.ts
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";

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

// Simple SIWE message verification function
async function verifySiweMessage(
  payload: MiniAppWalletAuthSuccessPayload,
  expectedNonce: string,
): Promise<{ isValid: boolean; error?: string }> {
  try {
    const { message, signature, address } = payload;

    // Verify the nonce is in the message
    if (!message.includes(`Nonce: ${expectedNonce}`)) {
      return {
        isValid: false,
        error: "Nonce mismatch in message",
      };
    }

    // Verify the address is in the message
    if (!message.includes(address)) {
      return {
        isValid: false,
        error: "Address mismatch in message",
      };
    }

    // Verify the signature
    const isValidSignature = await verifyMessage({
      address: address as `0x${string}`,
      message: message,
      signature: signature as `0x${string}`,
    });

    if (!isValidSignature) {
      return {
        isValid: false,
        error: "Invalid signature",
      };
    }

    // Check expiration time
    const expirationMatch = message.match(/Expiration Time: (.+)/);
    if (expirationMatch) {
      const expirationTime = new Date(expirationMatch[1]);
      if (expirationTime < new Date()) {
        return {
          isValid: false,
          error: "Message has expired",
        };
      }
    }

    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      error: `Verification failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    const { payload, nonce } = (await req.json()) as IRequestPayload;

    // Verify the nonce matches what we stored in the cookie
    const cookieStore = await cookies();
    const storedNonce = cookieStore.get("chessball_world_siwe")?.value;
    if (!storedNonce || nonce !== storedNonce) {
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

    try {
      const validMessage = await verifySiweMessage(payload, nonce);

      if (!validMessage.isValid) {
        return NextResponse.json(
          {
            status: "error",
            isValid: false,
            message: validMessage.error || "Signature verification failed",
          },
          { status: 400 },
        );
      }

      return NextResponse.json({
        status: "success",
        isValid: true,
        walletAddress: payload.address,
        message: "Authentication successful",
      });
    } catch (error: any) {
      console.error("SIWE verification error:", error);
      return NextResponse.json(
        {
          status: "error",
          isValid: false,
          message: error.message || "Verification failed",
        },
        { status: 500 },
      );
    }
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
