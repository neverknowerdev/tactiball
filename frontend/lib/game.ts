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

export enum GameStateType {
    START_POSITIONS = 'startPositions',
    MOVE = 'move',
    GOAL_TEAM1 = 'goal_team1',
    GOAL_TEAM2 = 'goal_team2'
}

export enum GameStatus {
    ACTIVE = 'ACTIVE',
    FINISHED = 'FINISHED',
    FINISHED_BY_TIMEOUT = 'FINISHED_BY_TIMEOUT'
}

export enum PlayerType {
    GOALKEEPER = 'goalkeeper',
    DEFENDER = 'defender',
    MIDFIELDER = 'midfielder',
    FORWARD = 'forward'
}

export const FIELD_WIDTH = 15;
export const FIELD_HEIGHT = 11;

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
    playerType: PlayerType;
    key(): string;
}

export interface Team {
    id: number;
    teamId: number;
    enum: TeamEnum;
    name: string;
    color: string;
    score: number;
    players: TeamPlayer[];
    isCommittedMove: boolean;
}

export interface GameState {
    team1Moves: GameAction[];
    team2Moves: GameAction[];
    team1PlayerPositions: Position[];
    team2PlayerPositions: Position[];
    ballPosition: Position;
    ballOwner: TeamEnum | null;
    type: GameStateType;
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
    lastMoveAt: number | null;
    playerMoves: GameAction[];

    status: GameStatus;
}

export class Game implements GameType {
    public gameId: number;
    public history: GameState[];
    public team1: Team;
    public team2: Team;
    public playerMoves: GameAction[];

    public ball: Ball;

    public createdAt: number;
    public lastMoveAt: number | null;
    public status: GameStatus;

    constructor(gameId: number) {
        this.gameId = gameId;

        this.history = [];
        this.team1 = { id: 1, teamId: 0, enum: TeamEnum.TEAM1, name: 'Team 1', color: 'red', score: 0, players: [], isCommittedMove: false };
        this.team2 = { id: 2, teamId: 0, enum: TeamEnum.TEAM2, name: 'Team 2', color: 'blue', score: 0, players: [], isCommittedMove: false };
        this.ball = { position: { x: 0, y: 0 }, oldPosition: null, ownerTeam: null };
        this.createdAt = Date.now();
        this.lastMoveAt = null;
        this.status = GameStatus.ACTIVE;
        this.playerMoves = [];
        const playerTypeByIndex = function (index: number) {
            if (index == 0) {
                return PlayerType.GOALKEEPER;
            }
            if (index == 1 || index == 2) {
                return PlayerType.DEFENDER;
            }
            if (index == 3 || index == 4) {
                return PlayerType.MIDFIELDER;
            }
            if (index == 5) {
                return PlayerType.FORWARD;
            }
            return PlayerType.DEFENDER;
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
        this.status = GameStatus.ACTIVE;

        this.ball.position = { x: 8, y: 5 };

        fillStartPositions(this.team1, this.team2, this.ball, teamWithBall);
        this.saveState(fillState(this.team1, this.team2, this.ball, GameStateType.START_POSITIONS));
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
        console.log('changeBallOwner', newOwner?.key());
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

    calculateNewState(randomNumbers: number[] = []): { newState: GameState, rendererStates: GameState[] } {
        // Create new state based on current team and ball positions
        if (!this.team1.isCommittedMove || !this.team2.isCommittedMove) {
            throw new Error('Not all team committed their moves');
        }
        if (this.playerMoves.length == 0) {
            throw new Error('No moves to calculate new state');
        }

        // restore last state
        this.restoreState(this.history[this.history.length - 1]);

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

        let randomNumberIndex = 0;
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
                    const stateType = goalForTeam == TeamEnum.TEAM1 ? GameStateType.GOAL_TEAM2 : GameStateType.GOAL_TEAM1;
                    if (goalForTeam == TeamEnum.TEAM1) {
                        this.team2.score++;
                    } else {
                        this.team1.score++;
                    }

                    const goalState = fillState(this.team1, this.team2, this.ball, stateType);
                    rendererStates.push(goalState);
                    this.saveState(goalState);

                    fillStartPositions(this.team1, this.team2, this.ball, goalForTeam);
                    rendererStates.push(fillState(this.team1, this.team2, this.ball, GameStateType.START_POSITIONS));
                    break;
                }
            }

            // if moved ball - check for potential clash
            if (isBallChangedPosition) {
                const team1Player = this.team1.players.find(player => isPosEquals(player.position, this.ball.position));
                const team2Player = this.team2.players.find(player => isPosEquals(player.position, this.ball.position));

                const ballOwner = this.ball.ownerTeam;

                if (team1Player && team2Player) {
                    // now we have a clash
                    // for now it will resolve simple - ball win a team who not owner ball previously.
                    const player1MoveType = playerMoveType[team1Player.key()];
                    const player2MoveType = playerMoveType[team2Player.key()];
                    const predefinedRandomNumber = randomNumbers.length > 0 ? randomNumbers[randomNumberIndex] : null;
                    if (predefinedRandomNumber) {
                        randomNumberIndex++;
                    }
                    const { winner: newBallOwner, randomNumber } = resolveClash(team1Player, player1MoveType, team2Player, player2MoveType, predefinedRandomNumber);

                    console.log('resolveClash newBallOwner', newBallOwner);

                    // Find the player from the winning team
                    const winningPlayer = newBallOwner === TeamEnum.TEAM1 ? team1Player : team2Player;

                    if (randomNumber) {
                        randomNumbers.push(randomNumber);
                    }

                    this.changeBallOwner(winningPlayer);
                    delete playerPaths["ball"];
                } else if (team1Player || team2Player) {
                    // check for new owner of a ball
                    if (team1Player) {
                        this.changeBallOwner(team1Player);

                        // if ball is owner by opposite team player - ball is not moving further anymore
                        if (ballOwner == TeamEnum.TEAM2) {
                            delete playerPaths["ball"];
                        }
                    } else if (team2Player) {
                        this.changeBallOwner(team2Player);

                        // if ball is owner by opposite team player - ball is not moving further anymore
                        if (ballOwner == TeamEnum.TEAM1) {
                            delete playerPaths["ball"];
                        }
                    }
                }
            }

            rendererStates.push(fillState(this.team1, this.team2, this.ball, GameStateType.MOVE));


            // TODO: check if penalty
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

        const finalState = rendererStates[rendererStates.length - 1];
        console.log('finalState', finalState);
        console.log('states', rendererStates);
        finalState.team1Moves = this.playerMoves.filter(move => move.teamEnum === TeamEnum.TEAM1);
        finalState.team2Moves = this.playerMoves.filter(move => move.teamEnum === TeamEnum.TEAM2);

        if (randomNumbers.length > 0) {
            finalState.clashRandomResults = randomNumbers;
        }

        this.saveState(finalState);

        this.playerMoves = [];

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
            player.oldPosition = null;

            if (state.ballPosition && isPosEquals(state.ballPosition, player.position)) {
                this.changeBallOwner(player);
            }
        });

        this.team2.players.forEach(player => {
            player.position = state.team2PlayerPositions[player.id];
            player.oldPosition = null;
            if (state.ballPosition && isPosEquals(state.ballPosition, player.position)) {
                this.changeBallOwner(player);
            }
        });

        this.ball.position = state.ballPosition;
        this.ball.oldPosition = null;
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

function resolveClash(team1Player: TeamPlayer, team1MoveType: MoveType, team2Player: TeamPlayer, team2MoveType: MoveType, predefinedRandomNumber: number | null): { winner: TeamEnum, randomNumber: number | null } {
    console.log('resolveClash', team1Player.key(), team1MoveType, team2Player.key(), team2MoveType);
    if (team1Player.ball && team2MoveType == MoveType.TACKLE) {
        console.log('team2Player win cauze of tackle');
        return { winner: TeamEnum.TEAM2, randomNumber: 0 };
    }

    if (team2Player.ball && team1MoveType == MoveType.TACKLE) {
        console.log('team1Player win cauze of tacke');
        return { winner: TeamEnum.TEAM1, randomNumber: 0 };
    }

    const random = predefinedRandomNumber ? predefinedRandomNumber : Math.floor(Math.random() * 100);
    console.log('random win', random);
    return { winner: random < 50 ? TeamEnum.TEAM1 : TeamEnum.TEAM2, randomNumber: predefinedRandomNumber ? null : random };
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

function fillState(team1: Team, team2: Team, ball: Ball, type: GameStateType = GameStateType.MOVE): GameState {
    const state: GameState = {
        team1PlayerPositions: team1.players.map(player => player.position),
        team2PlayerPositions: team2.players.map(player => player.position),
        ballPosition: ball.position,
        ballOwner: ball.ownerTeam || null,
        type: type,
        clashRandomResults: [],
        team1Moves: [],
        team2Moves: []
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
        team1.players[1].playerType = PlayerType.DEFENDER;
        team1.players[1].position = { x: 4, y: 2 };
        team1.players[2].playerType = PlayerType.DEFENDER;
        team1.players[2].position = { x: 4, y: 8 };
        team1.players[3].playerType = PlayerType.MIDFIELDER;
        team1.players[3].position = { x: 6, y: 3 };
        team1.players[4].playerType = PlayerType.MIDFIELDER;
        team1.players[4].position = { x: 6, y: 7 };
        team1.players[5].playerType = PlayerType.FORWARD;
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

export function toMoveType(moveType: number): MoveType {
    if (moveType === 0) return MoveType.PASS;
    if (moveType === 1) return MoveType.TACKLE;
    if (moveType === 2) return MoveType.RUN;
    if (moveType === 3) return MoveType.SHOT;
    return MoveType.PASS;
}

export function toPosition(x: number, y: number): Position {
    return { x: x, y: y };
}

export function toGameStatus(status: number): GameStatus {
    if (status === 1) return GameStatus.ACTIVE;
    if (status === 2) return GameStatus.FINISHED;
    if (status === 3) return GameStatus.FINISHED_BY_TIMEOUT;
    throw new Error(`Invalid game status: ${status}`);
}

export function toTeamEnum(team: number): TeamEnum | null {
    if (!team) return null;
    if (team === 0) return null;
    if (team === 1) return TeamEnum.TEAM1;
    if (team === 2) return TeamEnum.TEAM2;
    throw new Error(`Invalid team: ${team}`);
}

// Convert MoveType to a single digit for serialization
function moveTypeToNumber(moveType: MoveType): number {
    switch (moveType) {
        case MoveType.PASS:
            return 0;
        case MoveType.TACKLE:
            return 1;
        case MoveType.RUN:
            return 2;
        case MoveType.SHOT:
            return 3;
        default:
            return 0; // Default to PASS if unknown
    }
}

// Serialize an array of GameAction objects to a uint256-compatible string
// Format: Starts with '1', followed by 10 digits per move (playerId, moveType, oldPos.x, oldPos.y, newPos.x, newPos.y)
export function serializeMoves(gameActions: GameAction[]): string {
    if (gameActions.length < 1 || gameActions.length > 6) {
        throw new Error('Number of moves must be between 1 and 6');
    }

    let result = '1'; // Leading 1 to indicate start of data

    for (const action of gameActions) {
        // Ensure values are within expected ranges
        if (action.playerId < 0 || action.playerId > 9) {
            throw new Error(`Invalid playerId: ${action.playerId}`);
        }
        const moveTypeDigit = moveTypeToNumber(action.moveType);
        if (action.oldPosition.x < 0 || action.oldPosition.x > 99 ||
            action.oldPosition.y < 0 || action.oldPosition.y > 99 ||
            action.newPosition.x < 0 || action.newPosition.x > 99 ||
            action.newPosition.y < 0 || action.newPosition.y > 99) {
            throw new Error(`Position values out of range for move by player ${action.playerId}`);
        }

        // Format each position component to two digits
        const oldX = Math.floor(action.oldPosition.x).toString().padStart(2, '0');
        const oldY = Math.floor(action.oldPosition.y).toString().padStart(2, '0');
        const newX = Math.floor(action.newPosition.x).toString().padStart(2, '0');
        const newY = Math.floor(action.newPosition.y).toString().padStart(2, '0');

        // Combine into 10-digit sequence
        result += `${action.playerId}${moveTypeDigit}${oldX}${oldY}${newX}${newY}`;
    }

    return result;
}

// Deserialize a uint256-compatible string back to an array of GameAction objects
export function deserializeMoves(serializedMoves: string, teamEnum: TeamEnum): GameAction[] {
    // Check if the string starts with '1' and has valid length (11 to 61 digits)
    if (!serializedMoves.startsWith('1') || serializedMoves.length < 11 || serializedMoves.length > 61) {
        throw new Error('Invalid serialized moves format: must start with 1 and have 11 to 61 digits');
    }

    // Extract the moves data after the leading '1'
    const movesData = serializedMoves.slice(1);
    const numMoves = Math.floor(movesData.length / 10);
    if (movesData.length % 10 !== 0) {
        throw new Error('Invalid serialized moves length: must be divisible by 10 after leading 1');
    }

    const gameActions: GameAction[] = [];
    for (let i = 0; i < numMoves; i++) {
        const moveChunk = movesData.slice(i * 10, (i + 1) * 10);
        if (moveChunk.length !== 10) {
            throw new Error(`Invalid move data at index ${i}: incomplete chunk`);
        }

        // Parse each part of the 10-digit chunk
        const playerId = parseInt(moveChunk[0], 10);
        const moveTypeDigit = parseInt(moveChunk[1], 10);
        const oldX = parseInt(moveChunk.slice(2, 4), 10);
        const oldY = parseInt(moveChunk.slice(4, 6), 10);
        const newX = parseInt(moveChunk.slice(6, 8), 10);
        const newY = parseInt(moveChunk.slice(8, 10), 10);

        // Reconstruct GameAction
        const moveType = toMoveType(moveTypeDigit);
        const action: GameAction = {
            playerId,
            teamEnum: teamEnum, // Placeholder; teamEnum needs to be determined from context or additional data
            moveType,
            oldPosition: { x: oldX, y: oldY },
            newPosition: { x: newX, y: newY },
            playerKey: () => `${playerId}` // Placeholder; adjust based on actual key format
        };

        gameActions.push(action);
    }

    return gameActions;
}

// Convert gameEvent.new_state to GameState format
export function convertEventStateToGameState(eventState: any): GameState {
    // Convert moves to GameAction format
    const convertMoves = (moves: any[]): GameAction[] => {
        if (!moves || !Array.isArray(moves)) return [];
        return moves.map((move: any) => ({
            playerId: move.playerId || move.player_id || 0,
            teamEnum: move.teamEnum || (move.team_enum === 1 ? TeamEnum.TEAM1 : TeamEnum.TEAM2),
            moveType: move.moveType || move.move_type || MoveType.RUN,
            oldPosition: move.oldPosition || move.old_position || { x: 0, y: 0 },
            newPosition: move.newPosition || move.new_position || { x: 0, y: 0 },
            playerKey: () => `${move.playerId || move.player_id || 0}`
        }));
    };

    return {
        team1Moves: convertMoves(eventState.team1_moves),
        team2Moves: convertMoves(eventState.team2_moves),
        team1PlayerPositions: eventState.team1_positions || [],
        team2PlayerPositions: eventState.team2_positions || [],
        ballPosition: eventState.ball_position || { x: 0, y: 0 },
        ballOwner: eventState.ball_owner === 1 ? TeamEnum.TEAM1 :
            eventState.ball_owner === 2 ? TeamEnum.TEAM2 : null,
        type: eventState.type === 1 ? GameStateType.MOVE :
            eventState.type === 0 ? GameStateType.START_POSITIONS :
                eventState.type === 2 ? GameStateType.GOAL_TEAM1 :
                    eventState.type === 3 ? GameStateType.GOAL_TEAM2 : GameStateType.MOVE,
        clashRandomResults: eventState.clash_random_numbers || []
    };
}