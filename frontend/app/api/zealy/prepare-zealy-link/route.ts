// ============================================================================
// FILE 3: app/api/prepare-zealy-link/route.ts
// Called when user clicks "Connect to Zealy" button IN YOUR APP
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { db } from "@/lib/database";
import { teams } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const { walletAddress, signature, message } = await req.json();

    if (!walletAddress || !signature || !message) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields",
        },
        { status: 400 },
      );
    }

    // Verify wallet signature
    let isValidSignature = false;
    try {
      isValidSignature = await verifyMessage({
        address: walletAddress as `0x${string}`,
        message: message,
        signature: signature as `0x${string}`,
      });
    } catch (err) {
      console.error("Signature verification error:", err);
      return NextResponse.json(
        {
          success: false,
          error: "Invalid signature format",
        },
        { status: 401 },
      );
    }

    if (!isValidSignature) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid wallet signature",
        },
        { status: 401 },
      );
    }

    const [team] = await db
      .select({
        id: teams.id,
        name: teams.name,
        primary_wallet: teams.primaryWallet,
        zealy_user_id: teams.zealyUserId,
      })
      .from(teams)
      .where(eq(teams.primaryWallet, walletAddress))
      .limit(1);

    if (!team) {
      return NextResponse.json(
        {
          success: false,
          error: "No team found for this wallet. Please create a team first!",
        },
        { status: 404 },
      );
    }

    // Optional: Store a temporary session or log the attempt
    // This helps track which users are trying to connect

    return NextResponse.json(
      {
        success: true,
        message: "Ready to connect to Zealy",
        team: {
          id: team.id,
          name: team.name,
          hasZealyLinked: !!team.zealy_user_id,
        },
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal server error",
      },
      { status: 500 },
    );
  }
}
