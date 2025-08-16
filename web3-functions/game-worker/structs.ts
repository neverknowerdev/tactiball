// ============================================================================
// GAME WORKER STRUCTS AND MAPPINGS
// ============================================================================

import { MoveType, GameState, GameAction, Position, TeamPlayer, Team, TeamEnum } from '../../frontend/src/lib/game';

// Constants for enum values to match Solidity contract
export const CONTRACT_ENUMS = {
    TEAM: {
        TEAM1: 1,
        TEAM2: 2,
        NONE: 0
    },
    STATE_TYPE: {
        START_POSITIONS: 0,
        MOVE: 1,
        GOAL: 2
    },
    MOVE_TYPE: {
        PASS: 0,
        TACKLE: 1,
        RUN: 2,
        SHOT: 3
    },
    GAME_STATUS: {
        NONE: 0,
        ACTIVE: 1,
        FINISHED: 2,
        FINISHED_BY_TIMEOUT: 3
    },
    ERROR_TYPE: {
        UNSPECIFIED: 0,
        MOVE_VALIDATION_ERROR: 1
    }
} as const;

// Type definitions for better type safety
// Using GameState from game library instead of TSGameState
export type TSGameState = GameState;

// Smart contract GameAction structure
export interface ContractGameAction {
    playerId: bigint | number;
    moveType: number; // MoveType as uint8
    oldPosition: { x: number; y: number };
    newPosition: { x: number; y: number };
}

// Smart contract GameState structure
export interface ContractGameState {
    team1Positions: Array<{ x: number; y: number }>;
    team2Positions: Array<{ x: number; y: number }>;
    ballPosition: { x: number; y: number };
    ballOwner: number; // TeamEnum as uint8
    clashRandomResults: number[];
    stateType: number; // StateType as uint8
}

// Smart contract TeamInfo structure
export interface ContractTeamInfo {
    teamId: bigint | number;
    score: number;
    eloRating: bigint | number;
    eloRatingNew: bigint | number;
    formation: number; // TeamFormation as uint8
    actions: ContractGameAction[];
}

// TypeScript TeamInfo structure (simplified for web3 function use)
export interface TSTeamInfo {
    teamId: number;
    score: number;
    eloRating: number;
    eloRatingNew: number;
    formation: string; // TeamFormation as string
    actions: GameAction[];
}

// Smart contract GameInfo structure (complete game data from getGame)
export interface ContractGameInfo {
    gameId: bigint | number;
    createdAt: bigint | number;
    lastMoveAt: bigint | number;
    lastMoveTeam: number; // TeamEnum as uint8
    team1: ContractTeamInfo;
    team2: ContractTeamInfo;
    history: ContractGameState[];
    status: number; // GameStatus as uint8
    movesMade: number;
    winner: number; // TeamEnum as uint8
}

// TypeScript GameInfo structure (simplified for web3 function use)
export interface TSGameInfo {
    gameId: number;
    createdAt: number;
    lastMoveAt: number;
    lastMoveTeam: string; // TeamEnum as string
    team1: TSTeamInfo;
    team2: TSTeamInfo;
    history: GameState[];
    status: string; // GameStatus as string
    movesMade: number;
    winner: string; // TeamEnum as string
}

// TypeScript GameAction structure (simplified for web3 function use)
// Using GameAction from game library instead of TSGameAction

// Mapper function to convert smart contract GameState to TypeScript format
export function mapContractGameStateToTS(contractGameState: ContractGameState): TSGameState {
    // Helper function to convert BigInt positions to regular numbers
    const convertPosition = (pos: any) => ({
        x: Number(pos.x),
        y: Number(pos.y)
    });

    const convertPositions = (positions: any[]) => positions.map(convertPosition);

    return {
        team1PlayerPositions: convertPositions(contractGameState.team1Positions),
        team2PlayerPositions: convertPositions(contractGameState.team2Positions),
        ballPosition: convertPosition(contractGameState.ballPosition),
        ballOwner: contractGameState.ballOwner === CONTRACT_ENUMS.TEAM.TEAM1 ? "team1" :
            contractGameState.ballOwner === CONTRACT_ENUMS.TEAM.TEAM2 ? "team2" : null,
        type: contractGameState.stateType === CONTRACT_ENUMS.STATE_TYPE.START_POSITIONS ? "startPositions" :
            contractGameState.stateType === CONTRACT_ENUMS.STATE_TYPE.MOVE ? "move" :
                contractGameState.stateType === CONTRACT_ENUMS.STATE_TYPE.GOAL ? "goal" : "startPositions",
        clashRandomResults: contractGameState.clashRandomResults
    };
}

// Mapper function to convert TypeScript game state to smart contract format
export function mapGameStateToContract(tsGameState: TSGameState): ContractGameState {
    // Validate and provide defaults for required fields
    if (!tsGameState.team1PlayerPositions || !tsGameState.team2PlayerPositions) {
        throw new Error("Player positions are required");
    }

    if (!tsGameState.ballPosition) {
        throw new Error("Ball position is required");
    }

    return {
        team1Positions: tsGameState.team1PlayerPositions,
        team2Positions: tsGameState.team2PlayerPositions,
        ballPosition: tsGameState.ballPosition,
        ballOwner: tsGameState.ballOwner === "team1" ? CONTRACT_ENUMS.TEAM.TEAM1 : tsGameState.ballOwner === "team2" ? CONTRACT_ENUMS.TEAM.TEAM2 : CONTRACT_ENUMS.TEAM.NONE,
        clashRandomResults: tsGameState.clashRandomResults || [],
        stateType: tsGameState.type === "startPositions" ? CONTRACT_ENUMS.STATE_TYPE.START_POSITIONS :
            tsGameState.type === "move" ? CONTRACT_ENUMS.STATE_TYPE.MOVE :
                tsGameState.type === "goal" ? CONTRACT_ENUMS.STATE_TYPE.GOAL :
                    CONTRACT_ENUMS.STATE_TYPE.START_POSITIONS
    };
}

// Mapper function to convert smart contract GameAction to TypeScript format
export function mapContractActionToTS(contractAction: ContractGameAction): GameAction {
    // Helper function to convert BigInt positions to regular numbers
    const convertPosition = (pos: any) => ({
        x: Number(pos.x),
        y: Number(pos.y)
    });

    return {
        playerId: Number(contractAction.playerId),
        teamEnum: TeamEnum.TEAM1, // Default to TEAM1, will be overridden by the actual team
        moveType: getMoveTypeEnum(Number(contractAction.moveType)),
        oldPosition: convertPosition(contractAction.oldPosition),
        newPosition: convertPosition(contractAction.newPosition)
    };
}

// Mapper function to convert TypeScript GameAction to smart contract format
export function mapTSActionToContract(tsAction: GameAction): ContractGameAction {
    return {
        playerId: tsAction.playerId,
        moveType: getMoveTypeNumber(tsAction.moveType),
        oldPosition: tsAction.oldPosition,
        newPosition: tsAction.newPosition
    };
}

// Helper function to convert MoveType enum number to MoveType enum
function getMoveTypeEnum(moveTypeNumber: number): MoveType {
    switch (moveTypeNumber) {
        case CONTRACT_ENUMS.MOVE_TYPE.PASS:
            return MoveType.PASS;
        case CONTRACT_ENUMS.MOVE_TYPE.TACKLE:
            return MoveType.TACKLE;
        case CONTRACT_ENUMS.MOVE_TYPE.RUN:
            return MoveType.RUN;
        case CONTRACT_ENUMS.MOVE_TYPE.SHOT:
            return MoveType.SHOT;
        default:
            return MoveType.PASS; // Default fallback
    }
}

// Helper function to convert MoveType enum to number
function getMoveTypeNumber(moveType: MoveType): number {
    switch (moveType) {
        case MoveType.PASS:
            return CONTRACT_ENUMS.MOVE_TYPE.PASS;
        case MoveType.TACKLE:
            return CONTRACT_ENUMS.MOVE_TYPE.TACKLE;
        case MoveType.RUN:
            return CONTRACT_ENUMS.MOVE_TYPE.RUN;
        case MoveType.SHOT:
            return CONTRACT_ENUMS.MOVE_TYPE.SHOT;
        default:
            return CONTRACT_ENUMS.MOVE_TYPE.PASS; // Default fallback
    }
}

// Helper function to convert TeamEnum string to contract enum number
export function getTeamEnumNumber(teamEnum: string): number {
    switch (teamEnum) {
        case 'team1':
            return CONTRACT_ENUMS.TEAM.TEAM1;
        case 'team2':
            return CONTRACT_ENUMS.TEAM.TEAM2;
        default:
            return CONTRACT_ENUMS.TEAM.NONE;
    }
}

// Mapper function to convert smart contract GameInfo to TypeScript format
export function mapContractGameInfoToTS(contractGameInfo: ContractGameInfo): TSGameInfo {
    return {
        gameId: Number(contractGameInfo.gameId),
        createdAt: Number(contractGameInfo.createdAt),
        lastMoveAt: Number(contractGameInfo.lastMoveAt),
        lastMoveTeam: Number(contractGameInfo.lastMoveTeam) === CONTRACT_ENUMS.TEAM.TEAM1 ? "team1" :
            Number(contractGameInfo.lastMoveTeam) === CONTRACT_ENUMS.TEAM.TEAM2 ? "team2" : "none",
        team1: mapContractTeamInfoToTS(contractGameInfo.team1, TeamEnum.TEAM1),
        team2: mapContractTeamInfoToTS(contractGameInfo.team2, TeamEnum.TEAM2),
        history: contractGameInfo.history.map(mapContractGameStateToTS),
        status: getGameStatusString(Number(contractGameInfo.status)),
        movesMade: Number(contractGameInfo.movesMade),
        winner: Number(contractGameInfo.winner) === CONTRACT_ENUMS.TEAM.TEAM1 ? "team1" :
            Number(contractGameInfo.winner) === CONTRACT_ENUMS.TEAM.TEAM2 ? "team2" : "none"
    };
}

// Helper function to convert GameStatus enum number to string
function getGameStatusString(gameStatusNumber: number): string {
    switch (gameStatusNumber) {
        case CONTRACT_ENUMS.GAME_STATUS.NONE:
            return "none";
        case CONTRACT_ENUMS.GAME_STATUS.ACTIVE:
            return "active";
        case CONTRACT_ENUMS.GAME_STATUS.FINISHED:
            return "finished";
        case CONTRACT_ENUMS.GAME_STATUS.FINISHED_BY_TIMEOUT:
            return "finishedByTimeout";
        default:
            return "none";
    }
}

// Mapper function to convert smart contract TeamInfo to TypeScript format
export function mapContractTeamInfoToTS(contractTeamInfo: ContractTeamInfo, teamEnum: TeamEnum): TSTeamInfo {
    return {
        teamId: Number(contractTeamInfo.teamId),
        score: Number(contractTeamInfo.score),
        eloRating: Number(contractTeamInfo.eloRating),
        eloRatingNew: Number(contractTeamInfo.eloRatingNew),
        formation: getTeamFormationString(Number(contractTeamInfo.formation)),
        actions: contractTeamInfo.actions.map(action => ({
            ...mapContractActionToTS(action),
            teamEnum: teamEnum
        }))
    };
}

// Helper function to convert TeamFormation enum number to string
function getTeamFormationString(formationNumber: number): string {
    switch (formationNumber) {
        case 0: // TeamFormation.DEFAULT
            return "default";
        case 1: // TeamFormation.DEFENSIVE
            return "defensive";
        case 2: // TeamFormation.OFFENSIVE
            return "offensive";
        default:
            return "default"; // Default fallback
    }
}
