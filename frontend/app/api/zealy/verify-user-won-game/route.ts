// ============================================================================
// FILE: app/api/zealy/verify-user-won-game/route.ts
// Verify if user has won at least one game today
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { teams, games } from '@/db/schema';
import { eq, or, and, gte } from 'drizzle-orm';

const ZEALY_API_KEY = process.env.ZEALY_API_KEY;

export async function POST(req: NextRequest) {
  if (!ZEALY_API_KEY) {
    throw new Error("ZEALY_API_KEY is not set");
  }

  try {
    // Verify API key from Zealy
    const apiKey = req.headers.get('x-api-key');
    if (apiKey !== ZEALY_API_KEY) {
      console.error('Invalid API key received');
      return NextResponse.json({
        message: 'Invalid API key'
      }, { status: 400 });
    }

    const body = await req.json();
    const {
      userId,
      communityId,
      subdomain,
      questId,
      requestId,
      accounts
    } = body;

    // Get the Zealy Connect identifier (wallet address)
    let zealyConnectIdentifier = accounts?.['zealy-connect'];
    if (!zealyConnectIdentifier) {
      return NextResponse.json({
        message: 'Account not connected. Please connect your TactiBall account first by clicking the Connect button in the quest!'
      }, { status: 400 });
    }

    console.log("typeof zealyConnectIdentifier", typeof zealyConnectIdentifier);
    zealyConnectIdentifier = String(zealyConnectIdentifier).replace(/"/g, '').trim();
    console.log('zealyConnectIdentifier', zealyConnectIdentifier);
    const [team] = await db
      .select({
        id: teams.id,
        name: teams.name,
        primary_wallet: teams.primaryWallet,
        zealy_user_id: teams.zealyUserId
      })
      .from(teams)
      .where(eq(teams.primaryWallet, zealyConnectIdentifier))
      .limit(1);

    if (!team) {
      return NextResponse.json({
        message: `No TactiBall team found for this account. Please create a team at play.tactiball.fun first!`
      }, { status: 400 });
    }

    // Verify the Zealy user ID matches or set it if not set
    if (team.zealy_user_id && team.zealy_user_id !== userId) {
      return NextResponse.json({
        message: `Account mismatch detected. Please reconnect your account.`
      }, { status: 400 });
    }

    // Update zealy_user_id if not set
    if (!team.zealy_user_id) {
      await db
        .update(teams)
        .set({ zealyUserId: userId })
        .where(eq(teams.id, team.id));
    }

    // Get today's start time (00:00:00 UTC)
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    // Query for games won today - using correct column names from schema
    const wonGames = await db
      .select({ id: games.id })
      .from(games)
      .where(
        and(
          eq(games.status, 'finished'),
          eq(games.winner, team.id),
          gte(games.createdAt, todayStart),
          or(eq(games.team1, team.id), eq(games.team2, team.id))
        )
      )
      .limit(1);

    if (wonGames.length === 0) {
      return NextResponse.json({
        message: `No games won today. Win at least one game at play.tactiball.fun to complete this quest!`
      }, { status: 400 });
    }

    // Quest completed successfully!
    return NextResponse.json({
      message: `✅ Quest completed! Team ${team.name} has won a game today! 🏆`
    }, { status: 200 });

  } catch (error: any) {
    console.error('Unexpected error in Zealy verification:', error);
    return NextResponse.json({
      message: 'An unexpected error occurred. Please try again later.'
    }, { status: 400 });
  }
}