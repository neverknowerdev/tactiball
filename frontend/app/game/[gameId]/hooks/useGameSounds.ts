import { useRef, useEffect } from 'react';

// Sound file paths - sounds should be placed in /public/sounds/
// Download sounds from Mixkit (free, no attribution required):
// - Move sound: https://mixkit.co/free-sound-effects/click/ (choose a subtle click/tap)
// - Goal sound: https://mixkit.co/free-sound-effects/game/ (choose a celebration/coin sound)
// - Game end: https://mixkit.co/free-sound-effects/game/ (choose a victory/level complete sound)
const SOUND_PATHS = {
    move: '/sounds/move.wav',
    goal: '/sounds/goal.wav',
    gameEnd: '/sounds/game-end.wav'
};

interface UseGameSoundsProps {
    enabled?: boolean;
}

export function useGameSounds({ enabled = true }: UseGameSoundsProps = {}) {
    const moveSoundRef = useRef<HTMLAudioElement | null>(null);
    const goalSoundRef = useRef<HTMLAudioElement | null>(null);
    const gameEndSoundRef = useRef<HTMLAudioElement | null>(null);

    // Preload sounds
    useEffect(() => {
        if (!enabled) return;

        // Create audio elements
        moveSoundRef.current = new Audio(SOUND_PATHS.move);
        goalSoundRef.current = new Audio(SOUND_PATHS.goal);
        gameEndSoundRef.current = new Audio(SOUND_PATHS.gameEnd);

        // Preload sounds
        [moveSoundRef.current, goalSoundRef.current, gameEndSoundRef.current].forEach(audio => {
            audio.preload = 'auto';
            audio.volume = 0.6; // Set volume to 60%
            // Handle errors gracefully (e.g., if sound file doesn't exist)
            audio.addEventListener('error', (e) => {
                console.warn('Sound file failed to load:', audio.src);
            });
        });

        // Cleanup on unmount
        return () => {
            [moveSoundRef.current, goalSoundRef.current, gameEndSoundRef.current].forEach(audio => {
                if (audio) {
                    audio.pause();
                    audio.src = '';
                }
            });
        };
    }, [enabled]);

    const playMoveSound = () => {
        if (!enabled || !moveSoundRef.current) return;
        try {
            moveSoundRef.current.currentTime = 0; // Reset to start
            moveSoundRef.current.play().catch(err => {
                console.warn('Failed to play move sound:', err);
            });
        } catch (error) {
            console.warn('Error playing move sound:', error);
        }
    };

    const playGoalSound = () => {
        if (!enabled || !goalSoundRef.current) return;
        try {
            goalSoundRef.current.currentTime = 0; // Reset to start
            goalSoundRef.current.play().catch(err => {
                console.warn('Failed to play goal sound:', err);
            });
        } catch (error) {
            console.warn('Error playing goal sound:', error);
        }
    };

    const playGameEndSound = () => {
        if (!enabled || !gameEndSoundRef.current) return;
        try {
            gameEndSoundRef.current.currentTime = 0; // Reset to start
            gameEndSoundRef.current.play().catch(err => {
                console.warn('Failed to play game end sound:', err);
            });
        } catch (error) {
            console.warn('Error playing game end sound:', error);
        }
    };

    return {
        playMoveSound,
        playGoalSound,
        playGameEndSound
    };
}

