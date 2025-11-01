import { useEffect } from 'react';
import { toast } from "react-toastify";

export function useGameEvents(
    teamInfo: any,
    setShowLobby: (open: boolean) => void,
    setIsGameRequestModalOpen: (open: boolean) => void,
    setGameRequestData: (data: any) => void
) {
    useEffect(() => {
        const handleGameEvent = (event: CustomEvent) => {
            const gameEvent = event.detail;
            console.log('Received game event on page level:', gameEvent);

            if (gameEvent.type === 'GAME_REQUEST_CREATED') {
                console.log('GAME_REQUEST_CREATED event received:', gameEvent);
                setShowLobby(false);
                setIsGameRequestModalOpen(true);
                setGameRequestData({
                    game_request_id: gameEvent.game_request_id,
                    team1_info: gameEvent.team1_info,
                    team2_info: gameEvent.team2_info,
                });
            } else if (gameEvent.type === 'GAME_REQUEST_CANCELLED') {
                console.log('GAME_REQUEST_CANCELLED event received:', gameEvent);
                setShowLobby(false);
                setIsGameRequestModalOpen(false);
                setGameRequestData(null);

                toast.error(`Game request ${gameEvent.game_request_id} cancelled!`, {
                    position: "top-center",
                    autoClose: 3000,
                });
            } else if (gameEvent.type === 'GAME_STARTED') {
                console.log('GAME_STARTED event received:', gameEvent);

                // Check if this event is relevant to the current user's team
                if (gameEvent.team1_id === teamInfo?.id || gameEvent.team2_id === teamInfo?.id) {
                    console.log('Game started for current team:', gameEvent);

                    const gameUrl = `/game/${gameEvent.game_id}/`;
                    console.log('Redirecting to game:', gameUrl);
                    window.location.href = gameUrl;
                }
            }
        };

        window.addEventListener('game-event', handleGameEvent as EventListener);

        return () => {
            window.removeEventListener('game-event', handleGameEvent as EventListener);
        };
    }, [teamInfo, setShowLobby, setIsGameRequestModalOpen, setGameRequestData]);
}