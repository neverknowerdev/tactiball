export enum TeamEnum {
    TEAM1 = 'team1',
    TEAM2 = 'team2'
}

const FIELD_WIDTH = 15;
const FIELD_HEIGHT = 11;

const DISTANCE_PASS = 3;
const DISTANCE_SHOT = 4;
const DISTANCE_MOVE = 2;
const DISTANCE_TACKLE = 1;

export interface Ball {
    position: { x: number, y: number };
    ownerTeam: TeamEnum | null;
}

export interface Position {
    x: number,
    y: number
}

export interface TeamPlayer {
    team: Team;
    position: Position;
    ball: Ball | null;
    playerType: 'goalkeeper' | 'field_player';
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
            this.team1.players[i] = {
                team: this.team1,
                position: { x: 0, y: 0, },
                ball: null,
                playerType: i == 0 ? 'goalkeeper' : 'field_player'
            }
        }

        for (let i = 0; i < 6; i++) {
            this.team2.players[i] = {
                team: this.team2,
                position: { x: 0, y: 0, },
                ball: null,
                playerType: i == 0 ? 'goalkeeper' : 'field_player'
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
}