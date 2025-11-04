import { useState, useEffect } from 'react';
import { Game, GameStateType } from '@/lib/game';

interface UseHistoryNavigationProps {
    game: Game | null;
}

export function useHistoryNavigation({ game }: UseHistoryNavigationProps) {
    const [currentHistoryIndex, setCurrentHistoryIndex] = useState<number>(0);

    useEffect(() => {
        if (game && game.history.length > 0) {
            // Set current history index to the latest state
            setCurrentHistoryIndex(game.history.length - 1);
        }
    }, [game]);

    const goToHistoryIndex = (index: number, clearSelection: () => void) => {
        if (!game || index < 0 || index >= game!.history.length) return;

        setCurrentHistoryIndex(index);
        game!.restoreState(game!.history[index]);

        // Clear any current selection when navigating history
        clearSelection();
    }

    const goToPreviousState = (clearSelection: () => void) => {
        if (currentHistoryIndex > 0) {
            goToHistoryIndex(currentHistoryIndex - 1, clearSelection);
        }
    }

    const goToNextState = (clearSelection: () => void) => {
        if (game && currentHistoryIndex < game!.history.length - 1) {
            goToHistoryIndex(currentHistoryIndex + 1, clearSelection);
        }
    }

    const goToLatestState = (clearSelection: () => void) => {
        if (game) {
            goToHistoryIndex(game!.history.length - 1, clearSelection);
        }
    }

    const getHistoryDescription = (index: number): string => {
        if (!game || index >= game!.history.length) return '';

        const state = game.history[index];
        if (index == 0) return 'Initial Positions';
        if (state.type == GameStateType.GOAL_TEAM1) return `Goal! ${game.team1.name}`;
        if (state.type == GameStateType.GOAL_TEAM2) return `Goal! ${game.team2.name}`;
        if (state.type == GameStateType.MOVE) return `Move ${index + 1}`;
        return `State ${index}`;
    }

    return {
        currentHistoryIndex,
        setCurrentHistoryIndex,
        goToHistoryIndex,
        goToPreviousState,
        goToNextState,
        goToLatestState,
        getHistoryDescription
    };
}

