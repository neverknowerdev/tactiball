import { useState, useEffect, useRef, useCallback } from 'react';
import { Game, GameState, GameAction, TeamEnum } from '@/lib/game';

/**
 * Calculate rendererStates by replaying moves from a previous state
 */
function calculateRendererStates(
    gameId: number,
    previousState: GameState,
    team1Actions: GameAction[],
    team2Actions: GameAction[],
    clashRandomResults: number[] = []
): GameState[] {
    // Create a temporary game instance
    const tempGame = new Game(gameId);
    
    // Initialize the game with a dummy team (will be overridden by restoreState)
    // We need to check if previous state has ball owner to initialize properly
    const ballOwner = previousState.ballOwner || TeamEnum.TEAM1;
    tempGame.newGame(gameId, ballOwner);
    
    // Load all history up to previous state
    // For now, just save and restore the previous state
    tempGame.saveState(previousState);
    tempGame.restoreState(previousState);
    
    // Apply team1 moves
    team1Actions.forEach((action: GameAction) => {
        const player = tempGame.team1.players.find(p => p.id === action.playerId);
        if (player) {
            tempGame.doPlayerMove(player, action.moveType, action.oldPosition, action.newPosition, false);
        }
    });
    tempGame.commitMove(TeamEnum.TEAM1);
    
    // Apply team2 moves
    team2Actions.forEach((action: GameAction) => {
        const player = tempGame.team2.players.find(p => p.id === action.playerId);
        if (player) {
            tempGame.doPlayerMove(player, action.moveType, action.oldPosition, action.newPosition, false);
        }
    });
    tempGame.commitMove(TeamEnum.TEAM2);
    
    // Calculate new state with rendererStates
    const { rendererStates } = tempGame.calculateNewState(clashRandomResults);
    
    return rendererStates;
}

interface UseMoveAnimationProps {
    animationDuration?: number; // Duration per step in milliseconds
    onAnimationComplete?: () => void;
}

interface AnimationState {
    isAnimating: boolean;
    currentStep: number;
    rendererStates: GameState[] | null;
    animatedState: GameState | null;
}

/**
 * Hook to animate through rendererStates
 */
export function useMoveAnimation({ 
    animationDuration = 300,
    onAnimationComplete 
}: UseMoveAnimationProps = {}) {
    const [animationState, setAnimationState] = useState<AnimationState>({
        isAnimating: false,
        currentStep: 0,
        rendererStates: null,
        animatedState: null
    });
    
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const onCompleteRef = useRef(onAnimationComplete);
    
    // Update ref when callback changes
    useEffect(() => {
        onCompleteRef.current = onAnimationComplete;
    }, [onAnimationComplete]);
    
    // Start animation with rendererStates
    const startAnimation = useCallback((
        gameId: number,
        previousState: GameState,
        team1Actions: GameAction[],
        team2Actions: GameAction[],
        clashRandomResults: number[] = []
    ) => {
        // Calculate rendererStates
        const rendererStates = calculateRendererStates(
            gameId,
            previousState,
            team1Actions,
            team2Actions,
            clashRandomResults
        );
        
        if (rendererStates.length === 0) {
            // No animation needed
            if (onCompleteRef.current) {
                onCompleteRef.current();
            }
            return;
        }
        
        // Start animation from first step
        setAnimationState({
            isAnimating: true,
            currentStep: 0,
            rendererStates,
            animatedState: rendererStates[0]
        });
    }, []);
    
    // Animation effect
    useEffect(() => {
        if (!animationState.isAnimating || !animationState.rendererStates) {
            return;
        }
        
        const { rendererStates, currentStep } = animationState;
        
        if (currentStep >= rendererStates.length - 1) {
            // Animation complete
            setAnimationState(prev => ({
                ...prev,
                isAnimating: false
            }));
            
            if (onCompleteRef.current) {
                onCompleteRef.current();
            }
            
            return;
        }
        
        // Set up interval for next step
        intervalRef.current = setTimeout(() => {
            setAnimationState(prev => ({
                ...prev,
                currentStep: prev.currentStep + 1,
                animatedState: prev.rendererStates![prev.currentStep + 1]
            }));
        }, animationDuration);
        
        // Cleanup
        return () => {
            if (intervalRef.current) {
                clearTimeout(intervalRef.current);
            }
        };
    }, [animationState.isAnimating, animationState.currentStep, animationState.rendererStates, animationDuration]);
    
    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (intervalRef.current) {
                clearTimeout(intervalRef.current);
            }
        };
    }, []);
    
    // Stop animation
    const stopAnimation = useCallback(() => {
        if (intervalRef.current) {
            clearTimeout(intervalRef.current);
            intervalRef.current = null;
        }
        setAnimationState({
            isAnimating: false,
            currentStep: 0,
            rendererStates: null,
            animatedState: null
        });
    }, []);
    
    return {
        isAnimating: animationState.isAnimating,
        animatedState: animationState.animatedState,
        startAnimation,
        stopAnimation
    };
}

