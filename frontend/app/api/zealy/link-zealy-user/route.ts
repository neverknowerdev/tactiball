import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/database";
import { teams } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { zealyUserId, walletAddress } = body;

    // Authentication is handled by Next.js middleware
    // walletAddress is already validated by middleware
    // Sentry user context is set in middleware

    if (!zealyUserId) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required field: zealyUserId",
        },
        { status: 400 },
      );
    }

    const [team] = await db
      .select({
        id: teams.id,
        name: teams.name,
        zealy_user_id: teams.zealyUserId,
        primary_wallet: teams.primaryWallet,
      })
      .from(teams)
      .where(eq(teams.primaryWallet, walletAddress))
      .limit(1);

    if (!team) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No team found. Please create a team at play.tactiball.fun first!",
        },
        { status: 404 },
      );
    }

    await db
      .update(teams)
      .set({ zealyUserId: zealyUserId })
      .where(eq(teams.primaryWallet, walletAddress));

    console.log(`✅ Successfully linked Zealy user ${zealyUserId} to team ${team.name} (${walletAddress})`);

    return NextResponse.json(
      {
        success: true,
        message: "Successfully linked Zealy account",
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