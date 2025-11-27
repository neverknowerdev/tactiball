// ============================================================================
// API Route: app/api/zealy/check-zealy-link/route.ts
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/database";
import { teams } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    let walletAddress;

    // Check if request has a body
    const contentType = req.headers.get("content-type");

    if (!contentType || !contentType.includes("application/json")) {
      console.error("Invalid content-type:", contentType);
      return NextResponse.json(
        {
          isLinked: false,
          error: "Content-Type must be application/json",
        },
        { status: 400 },
      );
    }

    // Clone the request to safely read the body
    const clonedReq = req.clone();
    let body;

    try {
      const text = await clonedReq.text();
      console.log("Request body text:", text);

      if (!text || text.trim() === '') {
        console.error("Empty request body");
        return NextResponse.json(
          {
            isLinked: false,
            error: "Request body is empty",
          },
          { status: 400 },
        );
      }

      body = JSON.parse(text);
      walletAddress = body.walletAddress;
    } catch (jsonError) {
      console.error("Error parsing request body:", jsonError);
      return NextResponse.json(
        {
          isLinked: false,
          error: "Invalid JSON in request body",
        },
        { status: 400 },
      );
    }

    if (!walletAddress) {
      console.error("No wallet address in body:", body);
      return NextResponse.json(
        {
          isLinked: false,
          error: "No wallet address provided",
        },
        { status: 400 },
      );
    }

    const [team] = await db
      .select({ zealy_user_id: teams.zealyUserId })
      .from(teams)
      .where(eq(teams.primaryWallet, walletAddress.toLowerCase()))
      .limit(1);

    const isLinked = !!(team && team.zealy_user_id);

    console.log(`Zealy link check for ${walletAddress}: ${isLinked ? 'linked' : 'not linked'}`);

    return NextResponse.json(
      {
        isLinked,
        zealyUserId: team?.zealy_user_id || null,
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      {
        isLinked: false,
        error: "Internal server error",
      },
      { status: 500 },
    );
  }
}