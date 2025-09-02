import { NextRequest, NextResponse } from 'next/server';
import { checkAuthSignatureAndMessage } from '@/lib/auth';
import { publicClient, createRelayerClient } from '@/lib/providers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '@/lib/contract';
import { base } from 'viem/chains';
import { addToGameHistory, getGame } from './db';
import { processGameMoves } from './process-game-moves';
import { toContractStateType, toContractMove, toTeamEnum } from './types';
import { GameAction } from '@/lib/game';

interface CommitGameActionsRequest {
    game_id: string;
    team_id: string;
    team_enum: number; // 1 for team1, 2 for team2
    wallet_address: string;
    signature: string;
    message: string;
}

export async function POST(request: NextRequest) {
    try {
        const body: CommitGameActionsRequest = await request.json();

        // Validate required fields
        if (!body.game_id || !body.team_id || !body.team_enum || !body.wallet_address || !body.signature || !body.message) {
            return NextResponse.json(
                { error: 'Missing required fields', errorName: 'MISSING_FIELDS' },
                { status: 400 }
            );
        }

        // Validate team enum
        if (body.team_enum !== 1 && body.team_enum !== 2) {
            return NextResponse.json(
                { error: 'Invalid team enum. Must be 1 (team1) or 2 (team2)', errorName: 'INVALID_TEAM_ENUM' },
                { status: 400 }
            );
        }

        // Authenticate user
        const isAuthenticated = await checkAuthSignatureAndMessage(
            body.wallet_address,
            body.signature,
            body.message
        );

        if (!isAuthenticated) {
            return NextResponse.json(
                { error: 'Authentication failed', errorName: 'AUTH_FAILED' },
                { status: 401 }
            );
        }

        console.log('Processing game actions commit for game:', body.game_id);
        console.log('Team:', body.team_enum === 1 ? 'Team 1' : 'Team 2');

        const gameInfo = await getGame(body.game_id);
        if (!gameInfo) {
            return NextResponse.json(
                { error: 'Game not found', errorName: 'GAME_NOT_FOUND' },
                { status: 404 }
            );
        }

        if (gameInfo.team1_moves.length === 0 || gameInfo.team2_moves.length === 0) {
            return NextResponse.json(
                { error: 'Game state cannot be calculated', errorName: 'GAME_STATE_CANNOT_BE_CALCULATED' },
                { status: 400 }
            );
        }

        const relayerClient = createRelayerClient();

        const gameResult = processGameMoves(gameInfo);

        const contractStateType = toContractStateType(gameResult.stateType)
        const contractTeam1Actions = gameResult.team1Actions.map((action: GameAction) => ({
            playerId: action.playerId,
            moveType: toContractMove(action.moveType),
            oldPosition: action.oldPosition,
            newPosition: action.newPosition,
            teamEnum: toTeamEnum(action.teamEnum)
        }))
        const contractTeam2Actions = gameResult.team2Actions.map((action: GameAction) => ({
            playerId: action.playerId,
            moveType: toContractMove(action.moveType),
            oldPosition: action.oldPosition,
            newPosition: action.newPosition,
            teamEnum: toTeamEnum(action.teamEnum)
        }))

        // Call newGameState on smart contract to update game state
        const { request: newGameStateRequest } = await publicClient.simulateContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'newGameState',
            args: [gameInfo.id, contractStateType, gameResult.clashRandomResults, contractTeam1Actions, contractTeam2Actions, gameResult.ballPosition, toTeamEnum(gameResult.ballOwner)],
            chain: base,
            account: relayerClient.account
        });

        await addToGameHistory(body.game_id, gameInfo.history, gameResult.statesToSend);

        // Execute newGameState transaction
        const hash = await relayerClient.writeContract(newGameStateRequest);
        console.log('New game state committed. Transaction hash:', hash);

        // Wait for transaction confirmation
        const receipt = await publicClient.waitForTransactionReceipt({ hash: hash });

        return NextResponse.json({
            success: true,
            message: 'Game state calculated successfully',
            gameId: body.game_id,
            teamEnum: body.team_enum,
            transactionHash: hash,
        });
    } catch (error) {
        console.error('Error calculating game state:', error);
        return NextResponse.json(
            { error: 'Error calculating game state', errorName: 'ERROR_CALCULATING_GAME_STATE' },
            { status: 500 }
        );
    }
}