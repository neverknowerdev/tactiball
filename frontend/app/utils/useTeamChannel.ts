import { useEffect } from 'react';
import { subscribeToTeamChannel, unsubscribeFromTeamChannel } from '@/lib/ably';

export function useTeamChannel(
  teamId: number | undefined,
  isConnected: boolean,
  address: string | undefined
) {
  useEffect(() => {
    if (teamId && isConnected && address) {
      const connectToTeam = async () => {
        try {
          await subscribeToTeamChannel(teamId);
          console.log(`Connected to team ${teamId} channel`);
        } catch (error) {
          console.error('Failed to connect to team channel:', error);
        }
      };

      connectToTeam();

      // Cleanup function to disconnect when component unmounts or team changes
      return () => {
        unsubscribeFromTeamChannel();
      };
    }
  }, [teamId, isConnected, address]);
}