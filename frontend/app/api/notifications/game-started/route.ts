import { NextRequest, NextResponse } from 'next/server';
import { getFidFromWallet } from '@/lib/notification';
import { sendFrameNotification } from '@/lib/notification-client';
import { createWriteClient } from '@/lib/supabase';

const supabase = createWriteClient();

export async function POST(request: NextRequest) {
  try {
    const { gameId, team1Id, team2Id } = await request.json();

    if (!gameId || !team1Id || !team2Id) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get team information
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('id, name, primary_wallet')
      .in('id', [team1Id, team2Id]);

    if (teamsError || !teams || teams.length !== 2) {
      console.error('Error fetching teams for notification:', teamsError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch teams' },
        { status: 500 }
      );
    }

    const team1 = teams.find(t => t.id === team1Id);
    const team2 = teams.find(t => t.id === team2Id);

    // Notify the guest (team2) when game starts
    if (team2?.primary_wallet) {
      try {
        const guestFid = await getFidFromWallet(team2.primary_wallet);
        if (guestFid) {
          const hostTeamName = team1?.name || 'Your opponent';
          
          await sendFrameNotification({
            fid: guestFid,
            title: 'Game Started!',
            body: `${hostTeamName} has started the game. It's your turn!`,
            targetUrl: `${process.env.NEXT_PUBLIC_URL || ''}/game/${gameId}`,
            notificationId: `game-started-${gameId}-${team2Id}`,
          });
        }
      } catch (notificationError) {
        console.error('Error sending game started notification to guest:', notificationError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in game-started notification endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

