import { NextRequest, NextResponse } from 'next/server';
import { getFidFromWallet } from '@/lib/notification';
import { sendFrameNotification } from '@/lib/notification-client';
import { createWriteClient } from '@/lib/supabase';

const supabase = createWriteClient();

export async function POST(request: NextRequest) {
  try {
    const { gameId, winner, team1Id, team2Id } = await request.json();

    if (!gameId || team1Id === undefined || team2Id === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get team information and game details
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

    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('team1_score, team2_score, status')
      .eq('id', gameId)
      .single();

    if (gameError) {
      console.error('Error fetching game for notification:', gameError);
    }

    const team1 = teams.find(t => t.id === team1Id);
    const team2 = teams.find(t => t.id === team2Id);
    const team1Score = game?.team1_score ?? 0;
    const team2Score = game?.team2_score ?? 0;

    // Determine winner message
    let winnerTeamId: number | null = null;
    if (winner === 1) {
      winnerTeamId = team1Id;
    } else if (winner === 2) {
      winnerTeamId = team2Id;
    }

    // Send notifications to both players
    const notifications = [];

    // Notify team1
    if (team1?.primary_wallet) {
      const team1Fid = await getFidFromWallet(team1.primary_wallet);
      if (team1Fid) {
        const isWinner = winnerTeamId === team1Id;
        const isDraw = winnerTeamId === null;
        const opponentName = team2?.name || 'Opponent';
        
        let title: string;
        let body: string;
        
        if (isDraw) {
          title = 'Game Finished - Draw!';
          body = `Game ended in a draw: ${team1Score}-${team2Score} vs ${opponentName}`;
        } else if (isWinner) {
          title = 'You Won! 🎉';
          body = `Congratulations! You beat ${opponentName} ${team1Score}-${team2Score}`;
        } else {
          title = 'Game Finished';
          body = `You lost to ${opponentName} ${team1Score}-${team2Score}. Better luck next time!`;
        }

        notifications.push(
          sendFrameNotification({
            fid: team1Fid,
            title,
            body,
            targetUrl: `${process.env.NEXT_PUBLIC_URL || ''}/game/${gameId}`,
            notificationId: `game-finished-${gameId}-${team1Id}`,
          })
        );
      }
    }

    // Notify team2
    if (team2?.primary_wallet) {
      const team2Fid = await getFidFromWallet(team2.primary_wallet);
      if (team2Fid) {
        const isWinner = winnerTeamId === team2Id;
        const isDraw = winnerTeamId === null;
        const opponentName = team1?.name || 'Opponent';
        
        let title: string;
        let body: string;
        
        if (isDraw) {
          title = 'Game Finished - Draw!';
          body = `Game ended in a draw: ${team2Score}-${team1Score} vs ${opponentName}`;
        } else if (isWinner) {
          title = 'You Won! 🎉';
          body = `Congratulations! You beat ${opponentName} ${team2Score}-${team1Score}`;
        } else {
          title = 'Game Finished';
          body = `You lost to ${opponentName} ${team2Score}-${team1Score}. Better luck next time!`;
        }

        notifications.push(
          sendFrameNotification({
            fid: team2Fid,
            title,
            body,
            targetUrl: `${process.env.NEXT_PUBLIC_URL || ''}/game/${gameId}`,
            notificationId: `game-finished-${gameId}-${team2Id}`,
          })
        );
      }
    }

    // Send all notifications in parallel
    await Promise.allSettled(notifications);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in game-finished notification endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

