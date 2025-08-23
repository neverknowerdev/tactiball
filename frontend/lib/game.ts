export enum TeamEnum {
    TEAM1 = 'team1',
    TEAM2 = 'team2'
}

export enum MoveType {
    PASS = 'pass',
    TACKLE = 'tackle',
    RUN = 'run',
    SHOT = 'shot'
}

const FIELD_WIDTH = 15;
const FIELD_HEIGHT = 11;

export const DISTANCE_PASS = 3;
export const DISTANCE_SHOT = 4;
export const DISTANCE_MOVE = 2;
export const DISTANCE_TACKLE = 1;

export interface Ball {
    position: Position;
    oldPosition: Position | null;
    ownerTeam: TeamEnum | null;
}

export interface Position {
    x: number,
    y: number
}

export class ValidationError extends Error {
    public readonly cauzedByTeam: TeamEnum;
    public readonly cauzedByPlayerId: number;
    public readonly move: GameAction;
    public readonly message: string;

    constructor(
        cauzedByTeam: TeamEnum,
        cauzedByPlayerId: number,
        move: GameAction,
        message: string
    ) {
        super(`Move validation failed for ${cauzedByTeam} player ${cauzedByPlayerId}: ${message}`);
        this.name = 'ValidationError';
        this.cauzedByTeam = cauzedByTeam;
        this.cauzedByPlayerId = cauzedByPlayerId;
        this.move = move;
        this.message = message;
    }
}

// Utility function to compare Position objects by value
export function isPosEquals(pos1: Position, pos2: Position): boolean {
    return Number(pos1.x) === Number(pos2.x) && Number(pos1.y) === Number(pos2.y);
}

export interface TeamPlayer {
    id: number;
    team: Team;
    position: Position;
    oldPosition: Position | null;
    ball: Ball | null;
    playerType: 'goalkeeper' | 'defender' | 'midfielder' | 'forward';
    key(): string;
}

export interface Team {
    id: number;
    enum: TeamEnum;
    name: string;
    color: string;
    score: number;
    players: TeamPlayer[];
    isCommittedMove: boolean;
}

export interface GameState {
    team1PlayerPositions: Position[];
    team2PlayerPositions: Position[];
    ballPosition: Position;
    ballOwner: string | null;
    type: 'startPositions' | 'move' | 'goal';
    clashRandomResults: number[];
}

export interface GameAction {
    playerId: number;
    teamEnum: TeamEnum;
    moveType: MoveType;
    oldPosition: Position;
    newPosition: Position;
    playerKey: () => string;
}

export interface GameType {
    gameId: number;
    history: GameState[];

    team1: Team;
    team2: Team;

    ball: Ball;

    createdAt: number;

    playerMoves: GameAction[];

    status: 'WAITING' | 'ACTIVE' | 'FINISHED';
}

export class Game implements GameType {
    public gameId: number;
    public history: GameState[];
    public team1: Team;
    public team2: Team;
    public playerMoves: GameAction[];

    public ball: Ball;

    public createdAt: number;
    public status: 'WAITING' | 'ACTIVE' | 'FINISHED';

    constructor(gameId: number) {
        this.gameId = gameId;

        this.history = [];
        this.team1 = { id: 1, enum: TeamEnum.TEAM1, name: 'Team 1', color: 'red', score: 0, players: [], isCommittedMove: false };
        this.team2 = { id: 2, enum: TeamEnum.TEAM2, name: 'Team 2', color: 'blue', score: 0, players: [], isCommittedMove: false };
        this.ball = { position: { x: 0, y: 0 }, oldPosition: null, ownerTeam: null };
        this.createdAt = Date.now();
        this.status = 'WAITING';
        this.playerMoves = [];

        const playerTypeByIndex = function (index: number) {
            if (index == 0) {
                return 'goalkeeper';
            }
            if (index == 1 || index == 2) {
                return 'defender';
            }
            if (index == 3 || index == 4) {
                return 'midfielder';
            }
            if (index == 5) {
                return 'forward';
            }
            return "defender";
        }

        for (let i = 0; i < 6; i++) {
            const playerKey = `1_${i}`;
            this.team1.players[i] = {
                id: i,
                team: this.team1,
                position: { x: 0, y: 0, },
                oldPosition: null,
                ball: null,
                playerType: playerTypeByIndex(i),
                key: () => playerKey
            }
        }

        for (let i = 0; i < 6; i++) {
            const playerKey = `2_${i}`;
            this.team2.players[i] = {
                id: i,
                team: this.team2,
                position: { x: 0, y: 0, },
                oldPosition: null,
                ball: null,
                playerType: playerTypeByIndex(i),
                key: () => playerKey
            }
        }
    }

    newGame(gameId: number, teamWithBall: TeamEnum) {
        this.gameId = gameId;
        this.status = 'ACTIVE';

        this.ball.position = { x: 8, y: 5 };

        fillStartPositions(this.team1, this.team2, this.ball, teamWithBall);
        this.saveState(fillState(this.team1, this.team2, this.ball, 'startPositions'));
    }

    doPlayerMove(player: TeamPlayer, type: MoveType, oldPosition: Position, newPosition: Position, render: boolean = true) {
        const alreadyDoneMove = this.playerMoves.find(move => move.playerId === player.id && move.teamEnum === player.team.enum)
        if (alreadyDoneMove) {
            throw new ValidationError(
                player.team.enum,
                player.id,
                { playerId: player.id, teamEnum: player.team.enum, moveType: type, oldPosition, newPosition, playerKey: player.key },
                'Player already made a move'
            );
        }

        this.playerMoves.push({ playerId: player.id, teamEnum: player.team.enum, moveType: type, oldPosition, newPosition, playerKey: player.key });

        if (render) {
            this._renderPlayerMove(player, type, oldPosition, newPosition);
        }
    }

    undoPlayerMove(player: TeamPlayer, render: boolean = true) {
        const index = this.playerMoves.findIndex(move => move.playerId === player.id && move.teamEnum === player.team.enum)
        if (index == -1) {
            throw new Error('Player did not make a move');
        }

        this.playerMoves.splice(index, 1);

        if (render) {
            this._renderPlayerUndoMove(player);
        }
    }

    _renderPlayerMove(player: TeamPlayer, type: MoveType, oldPosition: Position, newPosition: Position) {
        switch (type) {
            case MoveType.PASS:
                if (!player.ball) {
                    throw new Error('Player does not have a ball');
                }

                player.ball.oldPosition = player.ball.position;
                player.ball.position = newPosition;

                player.oldPosition = oldPosition;
                break;
            default:
                if (player.ball) {
                    player.ball.oldPosition = player.ball.position;
                    player.ball.position = newPosition;
                }

                player.oldPosition = oldPosition;
                player.position = newPosition;
        }

        if (this.ball.ownerTeam == player.team.enum && isPosEquals(player.position, this.ball.position)) {
            this.changeBallOwner(player);
        }
    }

    changeBallOwner(newOwner: TeamPlayer | null) {
        console.log('changeBallOwner', newOwner, this.ball.ownerTeam);
        this.team1.players.forEach(player => {
            player.ball = null;
        });
        this.team2.players.forEach(player => {
            player.ball = null;
        });

        if (newOwner) {
            newOwner.ball = this.ball;
            this.ball.ownerTeam = newOwner.team.enum;
        } else {
            this.ball.ownerTeam = null;
        }
    }

    _renderPlayerUndoMove(player: TeamPlayer) {
        if (this.ball.oldPosition && isPosEquals(this.ball.oldPosition, player.oldPosition!)) {
            this.ball.position = this.ball.oldPosition;
            this.ball.oldPosition = null;
            this.changeBallOwner(player);
        }

        player.position = player.oldPosition!;
        player.oldPosition = null;
    }

    // when two team made their moves and commited
    commitMove(player: TeamEnum) {
        const team = player === TeamEnum.TEAM1 ? this.team1 : this.team2;
        if (team.isCommittedMove) {
            throw new Error('Team already committed a move');
        }
        if (this.playerMoves.length == 0) {
            throw new Error('No moves to commit');
        }
        // search for moves for team
        const teamMoves = this.playerMoves.filter(move => move.teamEnum === team.enum);
        if (teamMoves.length == 0) {
            throw new Error('No moves to commit for current team');
        }

        team.isCommittedMove = true;
    }

    calculateNewState(): { newState: GameState, rendererStates: GameState[] } {
        // Create new state based on current team and ball positions
        if (!this.team1.isCommittedMove || !this.team2.isCommittedMove) {
            throw new Error('Not all team committed their moves');
        }

        // restore last state
        this.restoreState(this.history[this.history.length - 1]);

        const randomNumbers: number[] = [];

        // Validation part
        const destinationMap: { [key: string]: boolean } = {};
        // check that all moves are valid
        for (const move of this.playerMoves) {
            const availablePath = this.calculatePath(move.oldPosition, move.newPosition, move.moveType);

            const allowedCells = move.moveType == MoveType.TACKLE ? [...availablePath, move.oldPosition] : availablePath;

            if (!allowedCells.some(cell => isPosEquals(cell, move.newPosition))) {
                throw new ValidationError(
                    move.teamEnum,
                    move.playerId,
                    move,
                    `Move is not valid for player ${move.playerId}, team ${move.teamEnum}, type ${move.moveType}`
                );
            }

            const playerKey = move.moveType == MoveType.PASS || move.moveType == MoveType.SHOT ? "ball" : move.playerKey();
            const key = `${playerKey}_${move.newPosition.x}_${move.newPosition.y}`;
            if (destinationMap[key]) {
                throw new ValidationError(
                    move.teamEnum,
                    move.playerId,
                    move,
                    'Cannot move two players from the same team to the same position'
                );
            }

            destinationMap[key] = true;
        }

        let maxPathSize = 0;
        // calculate moves
        const playerPaths: { [key: string]: Position[] } = {};
        const playerMoveType: { [key: string]: MoveType } = {};
        for (const move of this.playerMoves) {
            let playerKey = move.playerKey();
            if (move.moveType == MoveType.PASS || move.moveType == MoveType.SHOT) {
                playerKey = "ball";
            }

            playerPaths[playerKey] = this.calculatePath(move.oldPosition, move.newPosition, move.moveType);
            playerMoveType[playerKey] = move.moveType;

            if (playerPaths[playerKey].length > maxPathSize) {
                maxPathSize = playerPaths[playerKey].length;
            }
        }

        const rendererStates: GameState[] = [];
        for (let i = 0; i < maxPathSize; i++) {
            let isBallChangedPosition = false;

            for (const player of [...this.team1.players, ...this.team2.players]) {
                if (playerPaths[player.key()] && playerPaths[player.key()].length > i) {
                    player.position = playerPaths[player.key()][i];
                    if (player.ball) {
                        isBallChangedPosition = true;
                        player.ball.position = playerPaths[player.key()][i];
                    }
                }
            }

            if (playerPaths["ball"] && playerPaths["ball"].length > i) {
                this.ball.position = playerPaths["ball"][i];
                isBallChangedPosition = true;

                // check if goal
                const goalForTeam = isGoalForTeam(this.ball.position);
                if (goalForTeam) {
                    if (goalForTeam == TeamEnum.TEAM1) {
                        this.team2.score++;
                    } else {
                        this.team1.score++;
                    }

                    rendererStates.push(fillState(this.team1, this.team2, this.ball, 'goal'));

                    fillStartPositions(this.team1, this.team2, this.ball, goalForTeam);
                    rendererStates.push(fillState(this.team1, this.team2, this.ball, 'startPositions'));
                    break;
                }
            }

            // if moved ball - check for potential clash
            if (isBallChangedPosition) {
                const team1Player = this.team1.players.find(player => isPosEquals(player.position, this.ball.position));
                const team2Player = this.team2.players.find(player => isPosEquals(player.position, this.ball.position));

                if (team1Player && team2Player) {
                    // now we have a clash
                    // for now it will resolve simple - ball win a team who not owner ball previously.
                    const player1MoveType = playerMoveType[team1Player.key()];
                    const player2MoveType = playerMoveType[team2Player.key()];
                    const { winner: newBallOwner, randomNumber } = resolveClash(team1Player, player1MoveType, team2Player, player2MoveType);

                    console.log('resolveClash newBallOwner', newBallOwner);

                    // Find the player from the winning team
                    const winningPlayer = newBallOwner === TeamEnum.TEAM1 ? team1Player : team2Player;

                    if (randomNumber > 0) {
                        randomNumbers.push(randomNumber);
                    }

                    this.changeBallOwner(winningPlayer);
                    delete playerPaths["ball"];
                } else if (team1Player || team2Player) {
                    // check for new owner of a ball
                    if (team1Player) {
                        this.changeBallOwner(team1Player);
                    } else if (team2Player) {
                        this.changeBallOwner(team2Player);
                    }
                    delete playerPaths["ball"];
                }
            }

            rendererStates.push(fillState(this.team1, this.team2, this.ball, 'move'));


            // check if penalty

        }

        // clear oldP
        this.team1.players.forEach(player => {
            player.oldPosition = null;
        });
        this.team2.players.forEach(player => {
            player.oldPosition = null;
        });
        this.ball.oldPosition = null;

        this.team1.isCommittedMove = false;
        this.team2.isCommittedMove = false;

        this.playerMoves = [];

        const finalState = rendererStates[rendererStates.length - 1];

        if (randomNumbers.length > 0) {
            finalState.clashRandomResults = randomNumbers;
        }

        this.saveState(finalState);

        console.log('finalState', finalState);
        return { newState: finalState, rendererStates: rendererStates };
    }

    saveState(state: GameState) {
        this.history.push(state);
    }

    restoreState(state: GameState) {
        this.team1.isCommittedMove = false;
        this.team2.isCommittedMove = false;

        this.team1.players.forEach(player => {
            player.position = state.team1PlayerPositions[player.id];

            if (state.ballPosition && isPosEquals(state.ballPosition, player.position)) {
                this.changeBallOwner(player);
            }
        });

        this.team2.players.forEach(player => {
            player.position = state.team2PlayerPositions[player.id];
            if (state.ballPosition && isPosEquals(state.ballPosition, player.position)) {
                this.changeBallOwner(player);
            }
        });

        this.ball.position = state.ballPosition;

    }

    // Calculate available cells for player movement
    calculateAvailableCells(player: TeamPlayer, moveType: MoveType): Position[] {
        const availableCells: Position[] = [];
        const currentPos = player.position;

        const distanceSize = this.getDistanceSize(player, moveType);

        // Define the 8 directions: top, right, bottom, left, and 4 diagonals
        const directions = [
            { dx: 0, dy: -distanceSize },   // top
            { dx: distanceSize, dy: 0 },    // right
            { dx: 0, dy: distanceSize },    // bottom
            { dx: -distanceSize, dy: 0 },   // left
            { dx: -distanceSize, dy: -distanceSize }, // top-left (diagonal)
            { dx: distanceSize, dy: -distanceSize },  // top-right (diagonal)
            { dx: -distanceSize, dy: distanceSize },  // bottom-left (diagonal)
            { dx: distanceSize, dy: distanceSize }    // bottom-right (diagonal)
        ];

        // Check each direction
        for (const direction of directions) {

            const newPos = {
                x: currentPos.x + direction.dx,
                y: currentPos.y + direction.dy
            }
            const path = this.calculatePath(currentPos, newPos, moveType);

            for (const cell of path) {
                if ((moveType == MoveType.RUN || moveType == MoveType.TACKLE) && this.isPositionOccupied(cell, player.team)) {
                    continue;
                }
                availableCells.push(cell);
            }
        }

        if (moveType == MoveType.TACKLE) {
            availableCells.push(currentPos);
        }

        return availableCells;
    }

    // Determine distance size based on player and move type
    getDistanceSize(player: TeamPlayer, moveType: MoveType): number {
        switch (moveType) {
            case MoveType.PASS:
                return DISTANCE_PASS;
            case MoveType.SHOT:
                return DISTANCE_SHOT;
            case MoveType.RUN:
                return DISTANCE_MOVE;
            case MoveType.TACKLE:
                return DISTANCE_TACKLE;
            default:
                return DISTANCE_MOVE;
        }
    }

    // Check if a position is occupied by any player
    private isPositionOccupied(position: Position, team: Team): boolean {
        for (const player of team.players) {
            if (isPosEquals(player.position, position)) {
                return true;
            }
        }

        return false;
    }

    // Calculate all cells along the path from cell A to cell B
    calculatePath(from: Position, to: Position, moveType: MoveType): Position[] {
        const path: Position[] = [];

        // Calculate the direction vector
        const dx = to.x - from.x;
        const dy = to.y - from.y;

        // Determine the step direction for each axis
        const stepX = dx === 0 ? 0 : dx > 0 ? 1 : -1;
        const stepY = dy === 0 ? 0 : dy > 0 ? 1 : -1;

        // Calculate the number of steps needed
        const steps = Math.max(Math.abs(dx), Math.abs(dy));

        // Generate all cells along the path
        for (let i = 1; i <= steps; i++) {
            const x = from.x + (stepX * i);
            const y = from.y + (stepY * i);

            // Check if the position is within field bounds

            if ((x >= 1 && x <= FIELD_WIDTH + 1 - 1 && y >= 0 && y <= FIELD_HEIGHT - 1) || ((moveType == MoveType.PASS || moveType == MoveType.SHOT) && isPositionInGates({ x, y }))) {
                path.push({ x, y });
            } else {
                // If we go out of bounds, stop
                break;
            }
        }

        return path;
    }
}

function resolveClash(team1Player: TeamPlayer, team1MoveType: MoveType, team2Player: TeamPlayer, team2MoveType: MoveType): { winner: TeamEnum, randomNumber: number } {
    console.log('resolveClash', team1Player, team1MoveType, team2Player, team2MoveType);
    if (team1Player.ball && team2MoveType == MoveType.TACKLE) {
        console.log('team2Player win cauze of tackle');
        return { winner: TeamEnum.TEAM2, randomNumber: 0 };
    }

    if (team2Player.ball && team1MoveType == MoveType.TACKLE) {
        console.log('team1Player win cauze of tacke');
        return { winner: TeamEnum.TEAM1, randomNumber: 0 };
    }

    const random = Math.random();
    console.log('random win', random);
    return { winner: random < 0.5 ? TeamEnum.TEAM1 : TeamEnum.TEAM2, randomNumber: random };
}

function isPositionInGates(position: Position): boolean {
    return (position.x == 0 && position.y >= 3 && position.y <= 7) || (position.x == 16 && position.y >= 3 && position.y <= 7);
}

function isGoalForTeam(position: Position): TeamEnum | null {
    if (position.x == 0 && position.y >= 3 && position.y <= 7) {
        return TeamEnum.TEAM1;
    }

    if (position.x == 16 && position.y >= 3 && position.y <= 7) {
        return TeamEnum.TEAM2;
    }
    return null;
}

function fillState(team1: Team, team2: Team, ball: Ball, type: 'startPositions' | 'move' | 'goal' = 'move'): GameState {
    const state: GameState = {
        team1PlayerPositions: team1.players.map(player => player.position),
        team2PlayerPositions: team2.players.map(player => player.position),
        ballPosition: ball.position,
        ballOwner: ball.ownerTeam || null,
        type: type,
        clashRandomResults: []
    }

    return state;
}

function fillStartPositions(team1: Team, team2: Team, ball: Ball, teamWithBall: TeamEnum) {
    for (const player of team1.players) {
        player.oldPosition = null;
        player.ball = null;
    }
    for (const player of team2.players) {
        player.oldPosition = null;
        player.ball = null;
    }
    ball.oldPosition = null;

    if (teamWithBall === TeamEnum.TEAM1) {
        ball.ownerTeam = team1.players[5].team.enum;

        team1.players[0].position = { x: 1, y: 5 }; // goalkeeper
        team1.players[1].playerType = 'defender';
        team1.players[1].position = { x: 4, y: 2 };
        team1.players[2].playerType = 'defender';
        team1.players[2].position = { x: 4, y: 8 };
        team1.players[3].playerType = 'midfielder';
        team1.players[3].position = { x: 6, y: 3 };
        team1.players[4].playerType = 'midfielder';
        team1.players[4].position = { x: 6, y: 7 };
        team1.players[5].playerType = 'forward';
        team1.players[5].position = { x: 8, y: 5 };
        team1.players[5].ball = ball;

        team2.players[0].position = { x: 15, y: 5 }; // goalkeeper
        team2.players[1].position = { x: 12, y: 2 };
        team2.players[2].position = { x: 12, y: 8 };
        team2.players[3].position = { x: 10, y: 2 };
        team2.players[4].position = { x: 10, y: 8 };
        team2.players[5].position = { x: 10, y: 5 };

        ball.position = team1.players[5].position;
    } else {
        ball.ownerTeam = team2.players[5].team.enum;

        team1.players[0].position = { x: 1, y: 5 }; // goalkeeper
        team1.players[1].position = { x: 4, y: 2 };
        team1.players[2].position = { x: 4, y: 8 };
        team1.players[3].position = { x: 6, y: 2 };
        team1.players[4].position = { x: 6, y: 8 };
        team1.players[5].position = { x: 6, y: 5 };

        team2.players[0].position = { x: 15, y: 5 }; // goalkeeper
        team2.players[1].position = { x: 12, y: 2 };
        team2.players[2].position = { x: 12, y: 8 };
        team2.players[3].position = { x: 10, y: 3 };
        team2.players[4].position = { x: 10, y: 7 };
        team2.players[5].position = { x: 8, y: 5 };
        team2.players[5].ball = ball;

        ball.position = team2.players[5].position;
    }
}