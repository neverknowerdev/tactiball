'use client';

import { useState, useEffect } from 'react';
import { Game, TeamEnum, TeamPlayer, MoveType, isPosEquals, Team } from '@/lib/game';
import './game.css';

// Cell type enum
enum CellType {
    FIELD_MARGIN = 'field_margin',
    FIELD_CELL = 'field_cell'
}

// Cell state type definition
type CellState = {
    position: { x: number, y: number };
    highlighted: boolean;
    type: CellType;
};

const FIELD_WIDTH = 17;
const FIELD_HEIGHT = 11;

export default function GamePage() {
    const [game, setGame] = useState<Game | null>(null);
    const [cellStates, setCellStates] = useState<CellState[][]>([]);
    const [selectedPlayer, setSelectedPlayer] = useState<TeamPlayer | null>(null);
    const [currentMode, setCurrentMode] = useState<MoveType | null>(null);
    const [availableModes, setAvailableModes] = useState<MoveType[]>([]);
    const [modeIndex, setModeIndex] = useState<number>(0);
    const [currentTeam, setCurrentTeam] = useState<Team | null>(null);

    useEffect(() => {
        if (game == null || game?.ball == null) {
            return;
        }
    }, [game, game?.ball]);


    useEffect(() => {
        // Initialize a new game
        const newGame = new Game(1);
        newGame.newGame(1, TeamEnum.TEAM1);
        setCurrentTeam(newGame.team1);
        setGame(newGame);

        const generateCellStates = (): CellState[][] => {
            const cells: CellState[][] = [];

            for (let x = 0; x < FIELD_WIDTH; x++) {
                const colCells: CellState[] = [];
                for (let y = 0; y < FIELD_HEIGHT; y++) {
                    // Determine if this is a field margin or field cell
                    const isMargin = x === 0 || x === FIELD_WIDTH - 1;
                    const type: CellType = isMargin ? CellType.FIELD_MARGIN : CellType.FIELD_CELL;

                    // Determine if cell should be highlighted (for now, we can add logic later)
                    const highlighted = false;

                    colCells.push({
                        position: { x: x, y: y },
                        highlighted,
                        type
                    });
                }
                cells.push(colCells);
            }

            return cells;
        };

        setCellStates(generateCellStates());
    }, []);


    if (!game) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-xl">Loading game...</div>
            </div>
        );
    }

    const onCellClick = (cell: CellState) => {
        // Find what's at this cell position
        const team1Player = game.team1.players.find(p =>
            isPosEquals(p.position, cell.position)
        );
        const team2Player = game.team2.players.find(p =>
            isPosEquals(p.position, cell.position)
        );

        if (selectedPlayer != null && cell.highlighted) {
            handleEmptyCellClick(cell);
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
            handleEmptyCellClick(cell);
            return;
        }
    }

    const handlePlayerClick = (player: TeamPlayer) => {
        // Only allow moves for the current user's team
        if (player.team.enum !== currentTeam?.enum) {
            // Show a brief visual feedback that it's not their turn
            alert(`It's ${currentTeam?.name}'s turn!`);
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

    const handleReady = () => {
        if (currentTeam?.enum === TeamEnum.TEAM1) {
            // Switch to Team 2's turn
            game.commitMove(currentTeam!.enum);
            setCurrentTeam(game.team2);
            clearSelection();
        } else {
            // Both teams have finished their turns, calculate new state
            game.commitMove(currentTeam!.enum);
            setCurrentTeam(game.team1);
            clearSelection();

            game.calculateNewState();
        }
    }

    const determineAvailableModes = (player: TeamPlayer): MoveType[] => {
        const playerTeam = player.team;
        // Determine which team the player belongs to
        const playerTeamEnum = playerTeam.id === 1 ? TeamEnum.TEAM1 : TeamEnum.TEAM2;
        const teamHasBall = game.ball.ownerTeam === playerTeamEnum;
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
        const available = game.calculateAvailableCells(player!, mode);
        updateCellHighlights(available);
    }

    const handleEmptyCellClick = (cell: CellState) => {
        // Check if this is an available cell for the selected player
        if (selectedPlayer && cellStates[cell.position.x][cell.position.y].highlighted) {
            game.doPlayerMove(selectedPlayer, currentMode!, selectedPlayer.position, { x: cell.position.x, y: cell.position.y });
        } else {
            // Clicked on an invalid cell, clear selection
        }
        clearSelection();
    }

    const restorePlayerState = (player: TeamPlayer) => {
        game.undoPlayerMove(player);

        // Clear selection
        clearSelection();
    }

    const clearSelection = () => {
        setSelectedPlayer(null);
        setCurrentMode(null);
        setAvailableModes([]);
        setModeIndex(0);
        clearCellHighlights();
    }

    const updateCellHighlights = (availablePositions: { x: number, y: number }[]) => {
        const newCellStates = cellStates.map(row =>
            row.map(cell => ({
                ...cell,
                highlighted: availablePositions.some(pos => isPosEquals(pos, cell.position))
            }))
        );
        setCellStates(newCellStates);
    }

    const clearCellHighlights = () => {
        const newCellStates = cellStates.map(row =>
            row.map(cell => ({
                ...cell,
                highlighted: false
            }))
        );
        setCellStates(newCellStates);
    }

    const isHasOldState = (player: TeamPlayer) => {
        return player.oldPosition != null;
    }

    const isHasOldStateBall = () => {
        return game.ball.oldPosition != null;
    }

    return (
        <div className="min-h-screen bg-green-100 p-4">
            <div className="max-w-6xl mx-auto">
                <h1 className="text-3xl font-bold text-center mb-6">ChessBall Game</h1>

                {/* Game Info */}
                <div className="mb-4 flex justify-between items-center">
                    <div className="flex gap-8">
                        <div className={`text-center ${currentTeam?.enum === TeamEnum.TEAM1 ? 'ring-4 ring-yellow-400 ring-opacity-75 rounded-lg p-2' : ''}`}>
                            <div className={`text-lg font-semibold text-blue-600`}>{game.team1.name}</div>
                            <div className={`text-2xl font-bold text-blue-600`}>{game.team1.score}</div>
                            {currentTeam?.enum === TeamEnum.TEAM1 && <div className="text-xs text-yellow-600 font-semibold">YOUR TURN</div>}
                        </div>
                        <div className={`text-center ${currentTeam?.enum === TeamEnum.TEAM2 ? 'ring-4 ring-yellow-400 ring-opacity-75 rounded-lg p-2' : ''}`}>
                            <div className={`text-lg font-semibold text-red-600`}>{game.team2.name}</div>
                            <div className={`text-2xl font-bold text-red-600`}>{game.team2.score}</div>
                            {currentTeam?.enum === TeamEnum.TEAM2 && <div className="text-xs text-yellow-600 font-semibold">YOUR TURN</div>}
                        </div>
                    </div>
                    <div className="text-sm text-gray-600">
                        Game ID: {game.gameId} | Status: {game.status}
                    </div>
                </div>

                {/* Chessboard-style Soccer Field */}
                <div className="field">
                    <div className="grid grid-cols-[repeat(17,1fr)] grid-rows-[repeat(11,1fr)] absolute inset-0">
                        {game.team1.players.map((player, index) => (
                            <div key={index} className={`player team1 player${player.key()} ${isHasOldState(player) ? 'action-done' : ''}`}
                                style={{
                                    gridRow: player.position.y + 1,
                                    gridColumn: player.position.x + 1
                                }} />
                        ))}
                        {game.team2.players.map((player, index) => (
                            <div key={index} className={`player team2 player${player.key()} ${isHasOldState(player) ? 'action-done' : ''}`}
                                style={{
                                    gridRow: player.position.y + 1,
                                    gridColumn: player.position.x + 1
                                }} />
                        ))}
                        <div className={`ball ${game.ball.ownerTeam != null ? game.ball.ownerTeam : ''} ${isHasOldStateBall() ? 'action-done' : ''}`} style={{
                            gridRow: game.ball.position.y + 1,
                            gridColumn: game.ball.position.x + 1
                        }} />


                        {cellStates.map((row) => (
                            row.map((cell) => (
                                <div
                                    onClick={() => {
                                        onCellClick(cell);
                                    }}
                                    key={`${cell.position.x}-${cell.position.y}`}
                                    className={`field-cell relative cell-${cell.position.x}-${cell.position.y} ${cell.highlighted ? `highlighted ${currentMode || ''}` : ''} ${cell.type === CellType.FIELD_MARGIN ? 'field_margin' : 'field_cell'}`}
                                    style={{
                                        gridRow: cell.position.y + 1,
                                        gridColumn: cell.position.x + 1
                                    }}
                                />
                            ))
                        ))}
                    </div>
                </div>

                {/* Ready Button */}
                <div className="mt-4 flex justify-center">
                    <button
                        onClick={handleReady}
                        className="px-8 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors shadow-lg"
                    >
                        Ready!
                    </button>
                </div>

                {/* Game Controls */}
                <div className="mt-6 p-4 bg-white rounded-lg shadow">
                    <h3 className="text-lg font-semibold mb-4">Game Controls</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <h4 className="font-medium mb-2">Current User</h4>
                            <div className="text-sm">
                                {currentTeam?.enum === TeamEnum.TEAM1 ? game.team1.name : game.team2.name}
                            </div>
                        </div>
                        <div>
                            <h4 className="font-medium mb-2">Ball Owner</h4>
                            <div className="text-sm">
                                {game.ball.ownerTeam ?
                                    `${game.ball.ownerTeam === TeamEnum.TEAM1 ? game.team1.name : game.team2.name}` :
                                    'No owner'
                                }
                            </div>
                        </div>
                        <div>
                            <h4 className="font-medium mb-2">Ball Position</h4>
                            <div className="text-sm">
                                X: {game.ball.position.x}, Y: {game.ball.position.y}
                            </div>
                        </div>
                    </div>

                    {/* Current Action Mode */}
                    {selectedPlayer && currentMode && (
                        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                            <h4 className="font-medium mb-2">Current Action</h4>
                            <div className="flex items-center gap-4">
                                <div className="text-sm">
                                    <span className="font-medium">Player:</span> {selectedPlayer.playerType}
                                    ({selectedPlayer.position.x}, {selectedPlayer.position.y})
                                </div>
                                <div className="text-sm">
                                    <span className="font-medium">Mode:</span> {currentMode.toUpperCase()}
                                </div>
                                <div className="text-sm">
                                    <span className="font-medium">Available Modes:</span> {availableModes.map(mode => mode.toUpperCase()).join(', ')}
                                </div>
                            </div>
                            <div className="mt-2 text-xs text-gray-600">
                                Click on the same player again to switch modes or restore previous state
                            </div>
                        </div>
                    )}

                    {/* Turn Status */}
                    <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
                        <h4 className="font-medium mb-2">Turn Status</h4>
                        <div className="text-sm">
                            <span className="font-medium">Current Turn:</span> {currentTeam?.enum === TeamEnum.TEAM1 ? game.team1.name : game.team2.name}
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                            {currentTeam?.enum === TeamEnum.TEAM1 ?
                                `${game.team1.name} is making their moves. Click "Ready!" when finished.` :
                                `${game.team2.name} is making their moves. Click "Ready!" when finished.`
                            }
                        </div>
                    </div>

                </div>

                {/* Player Positions Debug */}
                <div className="mt-4 p-4 bg-gray-100 rounded-lg">
                    <h3 className="text-lg font-semibold mb-4">Player Positions</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <h4 className="font-medium text-red-600 mb-2">{game.team1.name}</h4>
                            {game.team1.players.map((player, index) => (
                                <div key={index} className="text-sm mb-1">
                                    {player.playerType}: ({player.position.x}, {player.position.y})
                                    {player.ball && ' [Has Ball]'}
                                </div>
                            ))}
                        </div>
                        <div>
                            <h4 className="font-medium text-blue-600 mb-2">{game.team2.name}</h4>
                            {game.team2.players.map((player, index) => (
                                <div key={index} className="text-sm mb-1">
                                    {player.playerType}: ({player.position.x}, {player.position.y})
                                    {player.ball && ' [Has Ball]'}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
} 