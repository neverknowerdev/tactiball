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
    GOAL_TEAM2 = 'goal_team2',
    PENALTY = 'penalty'
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
    
    // Penalty tracking
    private isPenaltyMode: boolean = false;
    private penaltyTeam: TeamEnum | null = null;
    private consecutiveBallControlMoves: { [key: string]: number } = {}; // playerKey -> consecutive moves

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

    // Check if a team has 3 or more players in a vertical row
    private checkVerticalRowPenalty(team: Team): boolean {
        const positionsByX: { [x: number]: number[] } = {};
        
        // Group players by x coordinate
        for (const player of team.players) {
            const x = player.position.x;
            if (!positionsByX[x]) {
                positionsByX[x] = [];
            }
            positionsByX[x].push(player.position.y);
        }

        // Check if any x coordinate has 3 or more players
        for (const x in positionsByX) {
            if (positionsByX[x].length >= 3) {
                return true;
            }
        }

        return false;
    }

    // Check if a player has controlled the ball for more than 15 consecutive moves
    private checkConsecutiveBallControlPenalty(): { shouldPenalty: boolean, team: TeamEnum | null } {
        // Get the last state to check ball owner history
        if (this.history.length === 0) {
            return { shouldPenalty: false, team: null };
        }

        const lastState = this.history[this.history.length - 1];
        if (!lastState.ballOwner) {
            return { shouldPenalty: false, team: null };
        }

        // Find which player has the ball in the last state
        let lastPlayerWithBall: string | null = null;
        if (lastState.ballOwner === TeamEnum.TEAM1) {
            for (let j = 0; j < lastState.team1PlayerPositions.length; j++) {
                if (isPosEquals(lastState.team1PlayerPositions[j], lastState.ballPosition)) {
                    lastPlayerWithBall = `1_${j}`;
                    break;
                }
            }
        } else if (lastState.ballOwner === TeamEnum.TEAM2) {
            for (let j = 0; j < lastState.team2PlayerPositions.length; j++) {
                if (isPosEquals(lastState.team2PlayerPositions[j], lastState.ballPosition)) {
                    lastPlayerWithBall = `2_${j}`;
                    break;
                }
            }
        }

        if (!lastPlayerWithBall) {
            return { shouldPenalty: false, team: null };
        }

        // Track consecutive moves by same player with ball
        let consecutiveCount = 1; // Count the last state

        // Go through history backwards to find consecutive ball control
        for (let i = this.history.length - 2; i >= 0; i--) {
            const state = this.history[i];
            
            // Skip START_POSITIONS states (reset count)
            if (state.type === GameStateType.START_POSITIONS) {
                break;
            }

            // Find which player had the ball in this state
            let playerWithBall: string | null = null;
            if (state.ballOwner === TeamEnum.TEAM1) {
                for (let j = 0; j < state.team1PlayerPositions.length; j++) {
                    if (isPosEquals(state.team1PlayerPositions[j], state.ballPosition)) {
                        playerWithBall = `1_${j}`;
                        break;
                    }
                }
            } else if (state.ballOwner === TeamEnum.TEAM2) {
                for (let j = 0; j < state.team2PlayerPositions.length; j++) {
                    if (isPosEquals(state.team2PlayerPositions[j], state.ballPosition)) {
                        playerWithBall = `2_${j}`;
                        break;
                    }
                }
            }

            // Check if same player has ball
            if (playerWithBall === lastPlayerWithBall && state.ballOwner === lastState.ballOwner) {
                consecutiveCount++;
                if (consecutiveCount >= 15) {
                    return { shouldPenalty: true, team: lastState.ballOwner };
                }
            } else {
                // Different player or no ball owner, stop counting
                break;
            }
        }

        return { shouldPenalty: false, team: null };
    }

    // Check if a player didn't move the ball at all (no ball movement moves)
    // This penalty triggers when the team that had the ball at the start of the turn
    // makes moves, but the player with the ball doesn't make any move
    private checkNoBallMovementPenalty(): { shouldPenalty: boolean, team: TeamEnum | null } {
        if (this.history.length === 0) {
            return { shouldPenalty: false, team: null };
        }

        const lastState = this.history[this.history.length - 1];
        if (!lastState.ballOwner) {
            return { shouldPenalty: false, team: null };
        }

        // Find which player has the ball in the last state (before moves are processed)
        let playerWithBallId: number | null = null;
        if (lastState.ballOwner === TeamEnum.TEAM1) {
            for (let i = 0; i < lastState.team1PlayerPositions.length; i++) {
                if (isPosEquals(lastState.team1PlayerPositions[i], lastState.ballPosition)) {
                    playerWithBallId = i;
                    break;
                }
            }
        } else {
            for (let i = 0; i < lastState.team2PlayerPositions.length; i++) {
                if (isPosEquals(lastState.team2PlayerPositions[i], lastState.ballPosition)) {
                    playerWithBallId = i;
                    break;
                }
            }
        }

        if (playerWithBallId === null) {
            return { shouldPenalty: false, team: null };
        }

        // Check if the player with the ball made a move
        const ballPlayerMove = this.playerMoves.find(move => 
            move.teamEnum === lastState.ballOwner && 
            move.playerId === playerWithBallId
        );

        // Get all moves by the team that had the ball at the start
        const teamMoves = this.playerMoves.filter(move => move.teamEnum === lastState.ballOwner);

        // Penalty triggers only if:
        // 1. Team that had the ball made moves, AND
        // 2. The player who had the ball didn't make any move at all (didn't move the ball)
        // Note: This means the team made other moves but the ball carrier didn't move
        if (teamMoves.length > 0 && !ballPlayerMove) {
            return { shouldPenalty: true, team: lastState.ballOwner };
        }

        return { shouldPenalty: false, team: null };
    }

    // Set up penalty positions
    // For left goal: goalkeeper at {6,2}, attacker at {6,3}, target cells {4,1}, {6,1}, {8,1}
    // For right goal: mirror positions appropriately
    private setupPenaltyPositions(penaltyTeam: TeamEnum) {
        const attackingTeam = penaltyTeam === TeamEnum.TEAM1 ? this.team1 : this.team2;
        const defendingTeam = penaltyTeam === TeamEnum.TEAM1 ? this.team2 : this.team1;

        // Determine which goal to use (left or right)
        // Left goal is Team1's goal (x=0), right goal is Team2's goal (x=16)
        // Team that gets penalty attacks the opponent's goal
        const isLeftGoal = penaltyTeam === TeamEnum.TEAM2; // Team2 gets penalty, attacks left goal
        
        if (isLeftGoal) {
            // Left goal penalty setup (Team2 attacking Team1's goal)
            defendingTeam.players[0].position = { x: 6, y: 2 }; // goalkeeper at center of goal
            
            // Find a player from attacking team to be the penalty taker (preferably forward)
            const penaltyTaker = attackingTeam.players.find(p => p.playerType === PlayerType.FORWARD) || attackingTeam.players[5];
            penaltyTaker.position = { x: 6, y: 3 }; // attacker in front of goalkeeper
            this.ball.position = { x: 6, y: 3 };
            this.ball.ownerTeam = attackingTeam.enum;
            this.changeBallOwner(penaltyTaker);
            
            // Move other players out of the way (to safe positions)
            let playerIndex = 0;
            for (const player of attackingTeam.players) {
                if (player.id !== penaltyTaker.id) {
                    player.position = { x: 8 + playerIndex, y: 5 };
                    playerIndex++;
                }
            }
            
            playerIndex = 0;
            for (const player of defendingTeam.players) {
                if (player.id !== 0) { // not goalkeeper
                    player.position = { x: 8 + playerIndex, y: 3 + playerIndex % 3 };
                    playerIndex++;
                }
            }
        } else {
            // Right goal penalty setup (Team1 attacking Team2's goal)
            // Mirror the positions: goalkeeper at {10, 2}, attacker at {10, 3}
            defendingTeam.players[0].position = { x: 10, y: 2 }; // goalkeeper at center of goal
            
            const penaltyTaker = attackingTeam.players.find(p => p.playerType === PlayerType.FORWARD) || attackingTeam.players[5];
            penaltyTaker.position = { x: 10, y: 3 }; // attacker in front of goalkeeper
            this.ball.position = { x: 10, y: 3 };
            this.ball.ownerTeam = attackingTeam.enum;
            this.changeBallOwner(penaltyTaker);
            
            // Move other players out of the way
            let playerIndex = 0;
            for (const player of attackingTeam.players) {
                if (player.id !== penaltyTaker.id) {
                    player.position = { x: 8 - playerIndex, y: 5 };
                    playerIndex++;
                }
            }
            
            playerIndex = 0;
            for (const player of defendingTeam.players) {
                if (player.id !== 0) { // not goalkeeper
                    player.position = { x: 8 - playerIndex, y: 3 + playerIndex % 3 };
                    playerIndex++;
                }
            }
        }
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

        // Check for penalties BEFORE processing moves (only if not already in penalty mode)
        // Note: Vertical row penalty is checked AFTER moves are processed
        if (!this.isPenaltyMode) {
            // Check consecutive ball control penalty (based on history)
            const consecutiveCheck = this.checkConsecutiveBallControlPenalty();
            if (consecutiveCheck.shouldPenalty && consecutiveCheck.team) {
                this.isPenaltyMode = true;
                this.penaltyTeam = consecutiveCheck.team;
                this.setupPenaltyPositions(consecutiveCheck.team);
                const penaltyState = fillState(this.team1, this.team2, this.ball, GameStateType.PENALTY);
                this.saveState(penaltyState);
                // Don't process moves - just return the penalty state
                this.team1.isCommittedMove = false;
                this.team2.isCommittedMove = false;
                this.playerMoves = [];
                return { newState: penaltyState, rendererStates: [penaltyState] };
            } else {
                // Check no ball movement penalty (based on current moves)
                const noBallMovementCheck = this.checkNoBallMovementPenalty();
                if (noBallMovementCheck.shouldPenalty && noBallMovementCheck.team) {
                    this.isPenaltyMode = true;
                    this.penaltyTeam = noBallMovementCheck.team;
                    this.setupPenaltyPositions(noBallMovementCheck.team);
                    const penaltyState = fillState(this.team1, this.team2, this.ball, GameStateType.PENALTY);
                    this.saveState(penaltyState);
                    // Don't process moves - just return the penalty state
                    this.team1.isCommittedMove = false;
                    this.team2.isCommittedMove = false;
                    this.playerMoves = [];
                    return { newState: penaltyState, rendererStates: [penaltyState] };
                }
            }
        }

        const validationError = this.validateMoves();
        if (validationError) {
            throw validationError;
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
                    // Reset penalty mode after goal (new start positions)
                    this.isPenaltyMode = false;
                    this.penaltyTeam = null;
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
        }

        // Check for vertical row penalty AFTER moves are processed (based on final positions)
        // Only check the team that currently has the ball
        // Only trigger if vertical row is NEW (wasn't present in previous state)
        if (!this.isPenaltyMode && this.ball.ownerTeam && this.history.length > 0) {
            const teamWithBall = this.ball.ownerTeam === TeamEnum.TEAM1 ? this.team1 : this.team2;
            const hasVerticalRowNow = this.checkVerticalRowPenalty(teamWithBall);
            
            if (hasVerticalRowNow) {
                // Check if vertical row existed in previous state
                const lastState = this.history[this.history.length - 1];
                const previousPositions = this.ball.ownerTeam === TeamEnum.TEAM1 
                    ? lastState.team1PlayerPositions 
                    : lastState.team2PlayerPositions;
                
                // Check if vertical row existed before
                const positionsByX: { [x: number]: number[] } = {};
                for (let i = 0; i < previousPositions.length; i++) {
                    const x = previousPositions[i].x;
                    if (!positionsByX[x]) {
                        positionsByX[x] = [];
                    }
                    positionsByX[x].push(previousPositions[i].y);
                }
                
                let hadVerticalRowBefore = false;
                for (const x in positionsByX) {
                    if (positionsByX[x].length >= 3) {
                        hadVerticalRowBefore = true;
                        break;
                    }
                }
                
                // Only trigger penalty if vertical row is NEW (didn't exist before)
                if (!hadVerticalRowBefore) {
                    this.isPenaltyMode = true;
                    this.penaltyTeam = this.ball.ownerTeam;
                    this.setupPenaltyPositions(this.ball.ownerTeam);
                    const penaltyState = fillState(this.team1, this.team2, this.ball, GameStateType.PENALTY);
                    rendererStates.push(penaltyState);
                    this.saveState(penaltyState);
                    // Reset penalty mode will happen after this turn
                }
            }
        }

        // Reset penalty mode after a shot or pass (ball movement) OR after penalty was just set up
        // If we're in penalty mode and moves were processed, reset it after this turn
        if (this.isPenaltyMode && rendererStates.length > 0) {
            const hasBallMovement = this.playerMoves.some(move => 
                move.moveType === MoveType.PASS || move.moveType === MoveType.SHOT
            );
            // Reset penalty mode if ball was moved, or if this was the turn that set up the penalty
            if (hasBallMovement || rendererStates.some(state => state.type === GameStateType.PENALTY)) {
                this.isPenaltyMode = false;
                this.penaltyTeam = null;
            }
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

    validateMoves(): ValidationError | null {
        const destinationMap: { [key: string]: boolean } = {};
        
        // In penalty mode, player with ball can only PASS or SHOT, cannot RUN
        if (this.isPenaltyMode && this.penaltyTeam) {
            const penaltyTeam = this.penaltyTeam === TeamEnum.TEAM1 ? this.team1 : this.team2;
            const playerWithBall = penaltyTeam.players.find(p => p.ball);
            
            if (playerWithBall) {
                const ballPlayerMove = this.playerMoves.find(move => 
                    move.teamEnum === this.penaltyTeam && 
                    move.playerId === playerWithBall.id
                );
                
                if (ballPlayerMove && ballPlayerMove.moveType !== MoveType.PASS && ballPlayerMove.moveType !== MoveType.SHOT) {
                    return new ValidationError(
                        ballPlayerMove.teamEnum,
                        ballPlayerMove.playerId,
                        ballPlayerMove,
                        'In penalty mode, player with ball can only PASS or SHOT, cannot RUN or TACKLE'
                    );
                }
            }
        }
        
        // check that all moves are valid
        for (const move of this.playerMoves) {
            const availablePath = this.calculatePath(move.oldPosition, move.newPosition, move.moveType);

            const allowedCells = move.moveType == MoveType.TACKLE ? [...availablePath, move.oldPosition] : availablePath;

            if (!allowedCells.some(cell => isPosEquals(cell, move.newPosition))) {
                return new ValidationError(
                    move.teamEnum,
                    move.playerId,
                    move,
                    `Move is not valid for player ${move.playerId}, team ${move.teamEnum}, type ${move.moveType}`
                );
            }

            const playerKey = move.moveType == MoveType.PASS || move.moveType == MoveType.SHOT ? "ball" : move.playerKey();
            const key = `${playerKey}_${move.newPosition.x}_${move.newPosition.y}`;
            if (destinationMap[key]) {
                return new ValidationError(
                    move.teamEnum,
                    move.playerId,
                    move,
                    'Cannot move two players from the same team to the same position'
                );
            }

            destinationMap[key] = true;
        }
        return null;
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
                    eventState.type === 3 ? GameStateType.GOAL_TEAM2 :
                        eventState.type === 4 ? GameStateType.PENALTY : GameStateType.MOVE,
        clashRandomResults: eventState.clash_random_numbers || []
    };
}