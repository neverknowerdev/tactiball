import { GameState, GameAction, MoveType } from "@/lib/game";


// Database Game type based on the games table schema
export type DBGame = {
    id: number;
    created_at: string;
    last_move_at: string | null;
    last_move_team: number | null;
    team1: number;
    team2: number;
    status: 'active' | 'finished' | 'finished_by_timeout';
    moves_made: number;
    team1_moves: GameAction[];
    team2_moves: GameAction[];
    winner: number | null;
    history: GameState[];
    team1_info: Record<string, any>;
    team2_info: Record<string, any>;
    team1_score: number;
    team2_score: number;
    history_ipfs_cid: string | null;
    is_verified: boolean;
};

export function toContractMove(move: string): number {
    if (move === "pass") return 0;
    if (move === "tackle") return 1;
    if (move === "run") return 2;
    if (move === "shot") return 3;
    return -1;
}

export function toGameEngineMove(move: string): MoveType {
    if (move === "pass") return MoveType.PASS;
    if (move === "tackle") return MoveType.TACKLE;
    if (move === "run") return MoveType.RUN;
    if (move === "shot") return MoveType.SHOT;
    return MoveType.PASS;
}

export function toTeamEnum(team: string | null): number {
    if (team === null) return 0;
    if (team === "team1") return 1;
    if (team === "team2") return 2;
    return -1;
}

export function toContractStateType(stateType: string): number {
    switch (stateType) {
        case "startPositions":
            return 0; // START_POSITIONS
        case "move":
            return 1; // MOVE
        case "goal_team1":
            return 2; // GOAL_TEAM1
        case "goal_team2":
            return 3; // GOAL_TEAM2
        default:
            return 0; // Default to START_POSITIONS
    }
}

