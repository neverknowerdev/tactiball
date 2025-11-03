import { useEffect } from 'react';
import { ReadonlyURLSearchParams } from 'next/navigation';

export function useRoomInvite(
  searchParams: ReadonlyURLSearchParams,
  isConnected: boolean,
  address: string | undefined,
  teamInfo: any,
  setSelectedRoomId: (roomId: number | null) => void
) {
  useEffect(() => {
    const roomParam = searchParams.get('room');

    if (roomParam && isConnected && address && teamInfo) {
      const roomId = parseInt(roomParam);

      if (!isNaN(roomId)) {
        console.log('Auto-opening room from invite:', roomId);

        // Clear the room parameter from URL
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);

        // Open the room
        setSelectedRoomId(roomId);
      }
    }
  }, [searchParams, isConnected, address, teamInfo, setSelectedRoomId]);
}