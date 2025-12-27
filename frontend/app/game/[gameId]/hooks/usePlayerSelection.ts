import { useState } from 'react';
import { Game, TeamPlayer, MoveType, isPosEquals, TeamEnum } from '@/lib/game';
import { CellState } from '../types';

interface UsePlayerSelectionProps {
    game: Game | null;
    currentTeam: any;
    updateCellHighlights: (positions: { x: number, y: number }[]) => void;
    clearCellHighlights: () => void;
}

export function usePlayerSelection({
    game,
    currentTeam,
    updateCellHighlights,
    clearCellHighlights
}: UsePlayerSelectionProps) {
    const [selectedPlayer, setSelectedPlayer] = useState<TeamPlayer | null>(null);
    const [currentMode, setCurrentMode] = useState<MoveType | null>(null);
    const [availableModes, setAvailableModes] = useState<MoveType[]>([]);
    const [modeIndex, setModeIndex] = useState<number>(0);

    const determineAvailableModes = (player: TeamPlayer): MoveType[] => {
        const playerTeam = player.team;
        // Determine which team the player belongs to
        const playerTeamEnum = playerTeam.id === 1 ? TeamEnum.TEAM1 : TeamEnum.TEAM2;
        const teamHasBall = game!.ball.ownerTeam === playerTeamEnum;
        const playerHasBall = player.ball !== null;

        let modes: MoveType[] = [];

        if (teamHasBall && playerHasBall) {
            // Player's team has ball and player has ball: pass, run
            modes = [MoveType.RUN, MoveType.PASS];
        } else if (teamHasBall && !playerHasBall) {
            // Player's team has ball but player doesn't: run, tackle
            modes = [MoveType.RUN, MoveType.TACKLE];
        } else {
            // Player's team doesn't have ball: run, tackle
            modes = [MoveType.RUN, MoveType.TACKLE];
        }

        return modes;
    }

    const switchToNextMode = () => {
        const nextIndex = (modeIndex + 1) % availableModes.length;
        switchToMode(nextIndex, selectedPlayer!, availableModes);
    }

    const switchToMode = (index: number, player: TeamPlayer, modes: MoveType[]) => {
        if (index >= modes.length) return;

        const mode = modes[index];

        setCurrentMode(mode);
        setModeIndex(index);

        // Calculate available cells based on the mode
        const available = game!.calculateAvailableCells(player!, mode);
        updateCellHighlights(available);
    }

    const handlePlayerClick = (player: TeamPlayer) => {
        // Only allow moves for the current user's team
        if (player.team.enum !== currentTeam?.enum) {
            // Show a brief visual feedback that it's not their turn
            alert(`You cannot move opponent's player!`);
            return;
        }

        if (selectedPlayer && selectedPlayer === player) {
            switchToNextMode();
            return;
        }

        if (player.oldPosition != null) {
            restorePlayerState(player);
            return;
        }

        // Select the player and determine available modes
        setSelectedPlayer(player);
        const modes = determineAvailableModes(player);
        setAvailableModes(modes);
        setModeIndex(0);

        // Start with the first mode
        switchToMode(0, player, modes);
    }

    const handleEmptyCellClick = (cell: CellState, cellStates: CellState[][]) => {
        // Check if this is an available cell for the selected player
        if (selectedPlayer && cellStates[cell.position.x][cell.position.y].highlighted) {
            game!.doPlayerMove(selectedPlayer, currentMode!, selectedPlayer.position, { x: cell.position.x, y: cell.position.y });
        }
        clearSelection();
    }

    const restorePlayerState = (player: TeamPlayer) => {
        game!.undoPlayerMove(player);
        clearSelection();
    }

    const clearSelection = () => {
        setSelectedPlayer(null);
        setCurrentMode(null);
        setAvailableModes([]);
        setModeIndex(0);
        clearCellHighlights();
    }

    const onCellClick = (cell: CellState, cellStates: CellState[][]) => {
        // Find what's at this cell position
        if (!game) return;

        const team1Player = game.team1.players.find(p =>
            isPosEquals(p.position, cell.position)
        );
        const team2Player = game.team2.players.find(p =>
            isPosEquals(p.position, cell.position)
        );

        if (selectedPlayer != null && cell.highlighted) {
            handleEmptyCellClick(cell, cellStates);
            return;
        }

        if (team1Player && team2Player) {
            if (currentTeam?.enum === team1Player.team.enum) {
                handlePlayerClick(team1Player);
            } else {
                handlePlayerClick(team2Player);
            }
            return;
        }

        if (team1Player) {
            // Handle team 1 player click
            handlePlayerClick(team1Player);
            return;
        }
        if (team2Player) {
            // Handle team 2 player click
            handlePlayerClick(team2Player);
            return;
        }

        if (!team1Player && !team2Player) {
            // Handle empty cell click
            handleEmptyCellClick(cell, cellStates);
            return;
        }
    }

    return {
        selectedPlayer,
        currentMode,
        availableModes,
        modeIndex,
        handlePlayerClick,
        handleEmptyCellClick,
        restorePlayerState,
        clearSelection,
        onCellClick
    };
}

