'use client';

import { useState, useEffect } from 'react';
import { Game, TeamEnum, TeamPlayer, MoveType } from '@/lib/game/game';
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
    player: TeamEnum | null;
    type: CellType;
};

// Player state type for storing old states
type PlayerState = {
    position: { x: number, y: number } | null;
    ball: { x: number, y: number } | null;
};

const FIELD_WIDTH = 17;
const FIELD_HEIGHT = 11;

export default function GamePage() {
    const [game, setGame] = useState<Game | null>(null);
    const [cellStates, setCellStates] = useState<CellState[][]>([]);
    const [currentTeam, setCurrentTeam] = useState<TeamEnum | null>(null);
    const [selectedPlayer, setSelectedPlayer] = useState<TeamPlayer | null>(null);
    const [currentMode, setCurrentMode] = useState<MoveType | null>(null);
    const [availableModes, setAvailableModes] = useState<MoveType[]>([]);
    const [modeIndex, setModeIndex] = useState<number>(0);
    const [oldStates, setOldStates] = useState<Map<string, PlayerState>>(new Map());

    // useEffect(() => {
    //     if (game == null || game?.team1.players == null || game?.team2.players == null) {
    //         return;
    //     }

    //     for (const player of game?.team1.players!) {
    //         cellStates[player.position.x][player.position.y].player = TeamEnum.TEAM1;
    //     }
    //     for (const player of game?.team2.players!) {
    //         cellStates[player.position.x][player.position.y].player = TeamEnum.TEAM2;
    //     }
    //     setCellStates(cellStates);
    // }, [game?.team1.players, game?.team2.players]);

    useEffect(() => {
        if (game == null || game?.ball == null) {
            return;
        }

        console.log(game.ball);
    }, [game?.ball]);


    useEffect(() => {
        // Initialize a new game
        const newGame = new Game(1);
        newGame.newGame(1, TeamEnum.TEAM1);
        setCurrentTeam(TeamEnum.TEAM1);
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
                        player: null,
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
        console.log('clicked', cell);

        // Find what's at this cell position
        const team1Player = game.team1.players.find(p =>
            p.position.x == cell.position.x && p.position.y == cell.position.y
        );
        const team2Player = game.team2.players.find(p =>
            p.position.x == cell.position.x && p.position.y == cell.position.y
        );

        console.log('team1Player', team1Player);
        console.log('team2Player', team2Player);

        if (selectedPlayer != null && cell.highlighted) {
            console.log('Clicked on highlighted cell:', cell);
            handleEmptyCellClick(cell);
            return;
        }

        // console.log('selectedPlayer', selectedPlayer);
        // if (selectedPlayer != null && (selectedPlayer.team != team1Player?.team || selectedPlayer.team != team2Player?.team)) {
        //     console.log('Clicked on cell when has selectedPlayer cell:', cell);
        //     handleEmptyCellClick(cell);
        //     return;
        // }

        if (team1Player) {
            console.log('Clicked on Team 1 player:', team1Player);
            // Handle team 1 player click
            handlePlayerClick(team1Player);
            return;
        }
        if (team2Player) {
            console.log('Clicked on Team 2 player:', team2Player);
            // Handle team 2 player click
            handlePlayerClick(team2Player);
            return;
        }

        if (!team1Player && !team2Player) {
            console.log('Clicked on empty cell:', cell);
            // Handle empty cell click
            handleEmptyCellClick(cell);
            return;
        }
    }

    const handlePlayerClick = (player: TeamPlayer) => {
        if (selectedPlayer && selectedPlayer === player) {
            switchToNextMode();
            return;
        }

        if (oldStates.has(player.key())) {
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

        console.log('available modes', modes);
        return modes;
    }

    const switchToNextMode = () => {
        const nextIndex = (modeIndex + 1) % availableModes.length;
        switchToMode(nextIndex, selectedPlayer!, availableModes);
    }

    const switchToMode = (index: number, player: TeamPlayer, modes: MoveType[]) => {
        console.log('switching to mode', index, modes);
        if (index >= modes.length) return;

        const mode = modes[index];

        console.log('switching to mode', index, mode);
        setCurrentMode(mode);
        setModeIndex(index);

        // Calculate available cells based on the mode
        const available = game.calculateAvailableCells(player!, mode);
        console.log('highlighting cells', available);
        updateCellHighlights(available);
    }

    const handleEmptyCellClick = (cell: CellState) => {
        // Check if this is an available cell for the selected player
        if (selectedPlayer && cellStates[cell.position.x][cell.position.y].highlighted) {
            if (currentMode === MoveType.RUN || currentMode === MoveType.TACKLE) {
                movePlayer(selectedPlayer, { x: cell.position.x, y: cell.position.y });
            } else if (currentMode === MoveType.PASS) {
                passBall(selectedPlayer, { x: cell.position.x, y: cell.position.y });
            }
            clearSelection();
        } else {
            // Clicked on an invalid cell, clear selection
            clearSelection();
        }
    }

    const movePlayer = (player: TeamPlayer, newPosition: { x: number, y: number }) => {
        const newState = {
            position: { ...player.position },
            ball: player.ball ? { x: player.ball.position.x, y: player.ball.position.y } : null
        };
        oldStates.set(player.key(), newState);

        if (newState.ball) {
            oldStates.set("ball", newState);
        }

        // Update player position
        player.position = newPosition;

        // If player had the ball, move the ball too
        if (player.ball) {
            game.ball.position = newPosition;
        }

        console.log(`Moved player to position: (${newPosition.x}, ${newPosition.y})`);
    }

    const passBall = (player: TeamPlayer, targetPosition: { x: number, y: number }) => {
        oldStates.set(player.key(), {
            position: null,
            ball: { x: player!.ball!.position.x, y: player!.ball!.position.y }
        });
        oldStates.set("ball", oldStates.get(player.key())!);

        console.log('old states', oldStates);

        // Transfer ball ownership
        player.ball = null;
        game.ball.ownerTeam = null;
        game.ball.position = targetPosition;

        console.log(`Passed ball to player at position: (${targetPosition.x}, ${targetPosition.y})`);
    }

    const restorePlayerState = (player: TeamPlayer) => {
        const oldState = oldStates.get(player.key());
        if (!oldState) {
            console.log(`No old state found for player ${player.key()}`);
            return;
        }

        if (oldState.position) {
            // Restore the player's position and ball state
            player.position = { ...oldState.position };
        }
        if (oldState.ball) {
            oldStates.delete("ball");
            player.ball = {
                position: { x: oldState.ball.x, y: oldState.ball.y },
                ownerTeam: player.team.id === 1 ? TeamEnum.TEAM1 : TeamEnum.TEAM2
            }
            game.ball.ownerTeam = player.team.id === 1 ? TeamEnum.TEAM1 : TeamEnum.TEAM2;
            game.ball.position = oldState.ball;
        }
        // Update game state
        // updateGameState();

        oldStates.delete(player.key());

        // Clear selection
        clearSelection();

        console.log(`Restored state for player ${player.key()}:`, oldState);
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
                highlighted: availablePositions.some(pos => pos.x === cell.position.x && pos.y === cell.position.y)
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
        return oldStates.has(player.key());
    }

    const isHasOldStateBall = () => {
        return oldStates.has("ball");
    }

    return (
        <div className="min-h-screen bg-green-100 p-4">
            <div className="max-w-6xl mx-auto">
                <h1 className="text-3xl font-bold text-center mb-6">ChessBall Game</h1>

                {/* Game Info */}
                <div className="mb-4 flex justify-between items-center">
                    <div className="flex gap-8">
                        <div className="text-center">
                            <div className="text-lg font-semibold text-red-600">{game.team1.name}</div>
                            <div className="text-2xl font-bold">{game.team1.score}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-lg font-semibold text-blue-600">{game.team2.name}</div>
                            <div className="text-2xl font-bold">{game.team2.score}</div>
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
                            <div key={index} className={`player team1 player${index + 1} ${isHasOldState(player) ? 'action-done' : ''}`}
                                style={{
                                    gridRow: player.position.y + 1,
                                    gridColumn: player.position.x + 1
                                }} />
                        ))}
                        {game.team2.players.map((player, index) => (
                            <div key={index} className={`player team2 player${index + 1} ${isHasOldState(player) ? 'action-done' : ''}`}
                                style={{
                                    gridRow: player.position.y + 1,
                                    gridColumn: player.position.x + 1
                                }} />
                        ))}
                        <div className={`ball ${game.ball.ownerTeam != null ? game.ball.ownerTeam : ''} ${isHasOldStateBall() ? 'action-done' : ''}`} style={{
                            gridRow: game.ball.position.y + 1,
                            gridColumn: game.ball.position.x + 1
                        }} />


                        {cellStates.map((row, rowIndex) => (
                            row.map((cell, colIndex) => (
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

                {/* Game Controls */}
                <div className="mt-6 p-4 bg-white rounded-lg shadow">
                    <h3 className="text-lg font-semibold mb-4">Game Controls</h3>
                    <div className="grid grid-cols-2 gap-4">
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