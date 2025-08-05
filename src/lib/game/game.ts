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
    position: { x: number, y: number };
    ownerTeam: TeamEnum | null;
}

export interface Position {
    x: number,
    y: number
}

export interface TeamPlayer {
    id: number;
    team: Team;
    position: Position;
    ball: Ball | null;
    playerType: 'goalkeeper' | 'field_player';
    key(): string;
}

export interface Team {
    id: number;
    name: string;
    color: string;
    score: number;
    players: TeamPlayer[];
}

export interface GameState {
    team1PlayerPositions: Position[];
    team2PlayerPositions: Position[];
    ballPosition: Position;
    ballOwnerTeam: TeamEnum | null;
    type: 'startPositions' | 'move' | 'goal';
}

export interface GameType {
    gameId: number;
    state: GameState;
    newState: GameState | null;
    history: GameState[];

    team1: Team;
    team2: Team;

    ball: Ball;

    createdAt: number;

    status: 'WAITING' | 'ACTIVE' | 'FINISHED';
}

export class Game implements GameType {
    public gameId: number;
    public state: GameState;
    public newState: GameState | null;
    public history: GameState[];
    public team1: Team;
    public team2: Team;

    public ball: Ball;

    public createdAt: number;
    public status: 'WAITING' | 'ACTIVE' | 'FINISHED';

    constructor(gameId: number) {
        this.gameId = gameId;
        this.newState = null;
        this.state = {
            team1PlayerPositions: [],
            team2PlayerPositions: [],
            ballPosition: { x: 0, y: 0, },
            ballOwnerTeam: null,
            type: 'startPositions'
        };

        this.history = [];
        this.team1 = { id: 1, name: 'Team 1', color: 'red', score: 0, players: [] };
        this.team2 = { id: 2, name: 'Team 2', color: 'blue', score: 0, players: [] };
        this.ball = { position: { x: 0, y: 0 }, ownerTeam: null };
        this.createdAt = Date.now();
        this.status = 'WAITING';

        for (let i = 0; i < 6; i++) {
            const playerKey = `1_${i}`;
            this.team1.players[i] = {
                id: i,
                team: this.team1,
                position: { x: 0, y: 0, },
                ball: null,
                playerType: i == 0 ? 'goalkeeper' : 'field_player',
                key: () => playerKey
            }
        }

        for (let i = 0; i < 6; i++) {
            const playerKey = `2_${i}`;
            this.team2.players[i] = {
                id: i,
                team: this.team2,
                position: { x: 0, y: 0, },
                ball: null,
                playerType: i == 0 ? 'goalkeeper' : 'field_player',
                key: () => playerKey
            }
        }
    }

    newGame(gameId: number, teamWithBall: TeamEnum) {
        this.gameId = gameId;
        this.status = 'ACTIVE';

        this.ball.position = { x: 8, y: 5 };

        if (teamWithBall === TeamEnum.TEAM1) {
            this.state.ballOwnerTeam = TeamEnum.TEAM1;

            this.ball.ownerTeam = TeamEnum.TEAM1;

            this.team1.players[0].position = { x: 1, y: 5 }; // goalkeeper
            this.team1.players[1].position = { x: 4, y: 2 };
            this.team1.players[2].position = { x: 4, y: 8 };
            this.team1.players[3].position = { x: 6, y: 3 };
            this.team1.players[4].position = { x: 6, y: 7 };
            this.team1.players[5].position = { x: 8, y: 5 };
            this.team1.players[5].ball = this.ball;

            this.team2.players[0].position = { x: 15, y: 5 }; // goalkeeper
            this.team2.players[1].position = { x: 12, y: 2 };
            this.team2.players[2].position = { x: 12, y: 8 };
            this.team2.players[3].position = { x: 10, y: 2 };
            this.team2.players[4].position = { x: 10, y: 5 };
            this.team2.players[5].position = { x: 10, y: 8 };
        } else {
            this.ball.ownerTeam = TeamEnum.TEAM2;

            this.team1.players[0].position = { x: 1, y: 5 }; // goalkeeper
            this.team1.players[1].position = { x: 4, y: 2 };
            this.team1.players[2].position = { x: 4, y: 8 };
            this.team1.players[3].position = { x: 6, y: 2 };
            this.team1.players[4].position = { x: 6, y: 8 };
            this.team1.players[5].position = { x: 6, y: 5 };

            this.team2.players[0].position = { x: 15, y: 5 }; // goalkeeper
            this.team2.players[1].position = { x: 12, y: 2 };
            this.team2.players[2].position = { x: 12, y: 8 };
            this.team2.players[3].position = { x: 10, y: 3 };
            this.team2.players[5].position = { x: 10, y: 7 };
            this.team2.players[4].position = { x: 8, y: 5 };
            this.team2.players[4].ball = this.ball;
        }
    }

    makeMove(player: TeamPlayer, newPosition: Position) {
        if (player.playerType === 'goalkeeper') {
            this.state.ballOwnerTeam = null;
            this.ball.ownerTeam = null;
            this.ball.position = newPosition;
        }
    }

    // call this when you finished your move and waiting for other players to commit their moves
    commitNewPosition(team: Team) {
        // save it in memory + send to smart-contract
    }

    // call it when two players committed their moves
    calculateNewState() {

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
                if (this.isPositionOccupied(cell, player.team)) {
                    continue;
                }
                availableCells.push(cell);
            }
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
            if (player.position.x === position.x && player.position.y === position.y) {
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

function isPositionInGates(position: Position): boolean {
    return (position.x == 0 && position.y >= 3 && position.y <= 7) || (position.x == 16 && position.y >= 3 && position.y <= 7);
}