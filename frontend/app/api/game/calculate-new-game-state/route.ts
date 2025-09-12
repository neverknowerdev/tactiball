import { NextRequest, NextResponse } from 'next/server';
import { checkAuthSignatureAndMessage } from '@/lib/auth';
import { publicClient } from '@/lib/providers';
import { sendTransactionWithRetry } from '@/lib/paymaster';
import { CONTRACT_ADDRESS, CONTRACT_ABI, RELAYER_ADDRESS } from '@/lib/contract';
import { base } from 'viem/chains';
import { processGameMoves } from './process-game-moves';
import { toContractStateType, toContractMove, toTeamEnum } from './types';
import { GameAction } from '@/lib/game';
import { sendWebhookMessage } from '@/lib/webhook';
import { parseEventLogs } from 'viem';
import { getGameFromContract } from '@/lib/contract';

interface CommitGameActionsRequest {
    game_id: string;
    team_id: string;
    team_enum: number; // 1 for team1, 2 for team2
    wallet_address: string;
    signature: string;
    message: string;
}

(BigInt.prototype as any).toJSON = function () {
    return this.toString()
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

        const gameInfo = await getGameFromContract(body.game_id);
        if (!gameInfo.success) {
            return NextResponse.json(
                { error: 'Game not found', errorName: 'GAME_NOT_FOUND' },
                { status: 404 }
            );
        }

        if (gameInfo.data.gameState.team1MovesEncrypted === BigInt(0) || gameInfo.data.gameState.team2MovesEncrypted === BigInt(0)) {
            return NextResponse.json(
                { error: 'Game state cannot be calculated', errorName: 'GAME_STATE_CANNOT_BE_CALCULATED' },
                { status: 400 }
            );
        }

        // Check if both teams have submitted moves
        if (BigInt(gameInfo.data.gameState.team1MovesEncrypted) === BigInt(0)) {
            return NextResponse.json(
                { error: 'Moves for team1 is not commited', errorName: 'MOVES_NOT_COMMITTED' },
                { status: 400 }
            );
        }

        if (BigInt(gameInfo.data.gameState.team2MovesEncrypted) === BigInt(0)) {
            return NextResponse.json(
                { error: 'Moves for team2 is not committed', errorName: 'MOVES_NOT_COMMITTED' },
                { status: 400 }
            );
        }

        console.log('team1MovesEncrypted', gameInfo.data.gameState.team1MovesEncrypted, typeof gameInfo.data.gameState.team1MovesEncrypted, gameInfo.data.gameState.team1MovesEncrypted === BigInt(0));
        console.log('team2MovesEncrypted', gameInfo.data.gameState.team2MovesEncrypted, typeof gameInfo.data.gameState.team2MovesEncrypted, gameInfo.data.gameState.team2MovesEncrypted === BigInt(0));

        const gameResult = processGameMoves(gameInfo.data);

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
            args: [gameInfo.data.gameId, contractStateType, gameResult.clashRandomResults, contractTeam1Actions, contractTeam2Actions, gameResult.boardState],
            chain: base,
            account: RELAYER_ADDRESS
        });

        // Execute newGameState transaction
        const paymasterReceipt = await sendTransactionWithRetry(newGameStateRequest);
        console.log('New game state committed. Transaction hash:', paymasterReceipt.receipt.transactionHash);

        const logs = parseEventLogs({
            abi: CONTRACT_ABI,
            logs: paymasterReceipt.logs,
        });

        await sendWebhookMessage(logs);

        return NextResponse.json({
            success: true,
            message: 'Game state calculated successfully',
            gameId: body.game_id,
            teamEnum: body.team_enum,
            transactionHash: paymasterReceipt.receipt.transactionHash,
        });
    } catch (error) {
        console.error('Error calculating game state:', error);
        return NextResponse.json(
            { error: 'Error calculating game state', errorName: 'ERROR_CALCULATING_GAME_STATE' },
            { status: 500 }
        );
    }
}