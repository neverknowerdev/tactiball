import { useState, useEffect, useCallback } from 'react';

export function useTeamInfo(address: string | undefined, isConnected: boolean) {
  const [teamInfo, setTeamInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const savedTeam = localStorage.getItem('userTeam');
      if (savedTeam) {
        setTeamInfo(JSON.parse(savedTeam));
      }
    } catch (error) {
      console.error('Error loading team from localStorage:', error);
    }
  }, []);

  const fetchTeamInfo = useCallback(async (walletAddress: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/get-team-info?wallet=${walletAddress}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('teamInfo', data);

      if (data.is_found) {
        setTeamInfo(data.team);
        localStorage.setItem('user_team_id', data.team.id);
        localStorage.setItem('userTeam', JSON.stringify(data.team));
      } else {
        setTeamInfo(null);
        localStorage.removeItem('user_team_id');
      }
    } catch (err) {
      console.error('Error fetching team info:', err);
      setError('Failed to fetch team information');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch team info when wallet connects
  useEffect(() => {
    if (isConnected && address) {
      fetchTeamInfo(address);
    } else {
      setTeamInfo(null);
      setError(null);
    }
  }, [isConnected, address, fetchTeamInfo]);

  return { teamInfo, loading, error, fetchTeamInfo };
}