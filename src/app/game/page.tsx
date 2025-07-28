'use client';

import { useState, useEffect } from 'react';
import { Game, TeamEnum } from '@/lib/game/game';
import './game.css';

// Cell type enum
enum CellType {
    FIELD_MARGIN = 'field_margin',
    FIELD_CELL = 'field_cell'
}

// Cell state type definition
type CellState = {
    x: number;
    y: number;
    highlighted: boolean;
    player: TeamEnum | null;
    type: CellType;
};

const FIELD_WIDTH = 17;
const FIELD_HEIGHT = 11;

export default function GamePage() {
    const [game, setGame] = useState<Game | null>(null);
    const [cellStates, setCellStates] = useState<CellState[][]>([]);

    useEffect(() => {
        if (game == null || game?.team1.players == null || game?.team2.players == null) {
            return;
        }

        // for (const player of game?.team1.players!) {
        //     cellStates[player.position.y][player.position.x].player = TeamEnum.TEAM1;
        // }
        // for (const player of game?.team2.players!) {
        //     cellStates[player.position.y][player.position.x].player = TeamEnum.TEAM2;
        // }
        setCellStates(cellStates);
    }, [game?.team1.players, game?.team2.players]);

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
                        x: x,
                        player: null,
                        y: y,
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
            p.position.x === cell.x && p.position.y === cell.y
        );
        const team2Player = game.team2.players.find(p =>
            p.position.x === cell.x && p.position.y === cell.y
        );
        const hasBall = game.ball.position.x === cell.x && game.ball.position.y === cell.y;

        if (team1Player) {
            console.log('Clicked on Team 1 player:', team1Player);
            // Handle team 1 player click
        }
        if (team2Player) {
            console.log('Clicked on Team 2 player:', team2Player);
            // Handle team 2 player click
        }
        if (hasBall) {
            console.log('Clicked on ball at position:', cell);
            // Handle ball click
        }
        if (!team1Player && !team2Player && !hasBall) {
            console.log('Clicked on empty cell:', cell);
            // Handle empty cell click
        }
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
                            <div key={index} className={`player team1 player${index + 1}`}
                                style={{
                                    gridRow: player.position.y + 1,
                                    gridColumn: player.position.x + 1
                                }} />
                        ))}
                        {game.team2.players.map((player, index) => (
                            <div key={index} className={`player team2 player${index + 1}`}
                                style={{
                                    gridRow: player.position.y + 1,
                                    gridColumn: player.position.x + 1
                                }} />
                        ))}
                        <div className={`ball ${game.ball.ownerTeam === TeamEnum.TEAM1 ? 'team1' : 'team2'}`} style={{
                            gridRow: game.ball.position.y + 1,
                            gridColumn: game.ball.position.x + 1
                        }} />


                        {cellStates.map((row, rowIndex) => (
                            row.map((cell, colIndex) => (
                                <div
                                    onClick={() => {
                                        onCellClick(cell);
                                    }}
                                    key={`${cell.x}-${cell.y}`}
                                    className={`field-cell relative cell-${cell.x}-${cell.y} ${cell.highlighted ? 'highlighted' : ''} ${cell.type === CellType.FIELD_MARGIN ? 'field_margin' : 'field_cell'}`}
                                    style={{
                                        gridRow: cell.y + 1,
                                        gridColumn: cell.x + 1
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