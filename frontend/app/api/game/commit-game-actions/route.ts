import { NextRequest, NextResponse } from 'next/server';
import { checkAuthSignatureAndMessage } from '@/lib/auth';
import { publicClient, createRelayerClient } from '@/lib/providers';
import { parseEventLogs } from 'viem';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '@/lib/contract';
import { base } from 'viem/chains';
import { saveMovesToDB } from './db';
import { GameAction, TeamEnum, MoveType } from '@/lib/game';

/**
 * Game Actions Commit Endpoint
 * 
 * This endpoint validates game actions and directly calls the smart contract
 * using commitGameActions function. It simulates the transaction first
 * to ensure it will succeed, then executes it using the relayer client.
 */

// Interface for the request body
interface CommitGameActionsRequest {
    game_id: string;
    team_id: string;
    team_enum: number; // 1 for team1, 2 for team2
    wallet_address: string;
    signature: string;
    message: string;
    moves: Array<{
        playerId: number;
        moveType: string; // 0: PASS, 1: TACKLE, 2: RUN, 3: SHOT
        oldPosition: { x: number; y: number };
        newPosition: { x: number; y: number };
    }>;
}

export async function POST(request: NextRequest) {
    try {
        const body: CommitGameActionsRequest = await request.json();

        // Validate required fields
        if (!body.game_id || !body.team_id || !body.team_enum || !body.wallet_address || !body.signature || !body.message || !body.moves) {
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

        // Validate moves array
        if (!Array.isArray(body.moves) || body.moves.length === 0) {
            return NextResponse.json(
                { error: 'Moves array must be non-empty', errorName: 'EMPTY_MOVES' },
                { status: 400 }
            );
        }

        // Validate each move
        for (const move of body.moves) {
            if (typeof move.playerId !== 'number' ||
                !move.oldPosition || !move.newPosition ||
                typeof move.oldPosition.x !== 'number' || typeof move.oldPosition.y !== 'number' ||
                typeof move.newPosition.x !== 'number' || typeof move.newPosition.y !== 'number') {
                return NextResponse.json(
                    { error: 'Invalid move data structure', errorName: 'INVALID_MOVE_DATA' },
                    { status: 400 }
                );
            }

            if (move.moveType != "pass" && move.moveType != "tackle" && move.moveType != "run" && move.moveType != "shot") {
                return NextResponse.json(
                    { error: 'Invalid move type. Must be PASS, TACKLE, RUN, SHOT', errorName: 'INVALID_MOVE_TYPE' },
                    { status: 400 }
                );
            }

            // Validate positions (assuming field dimensions)
            if (move.oldPosition.x < 0 || move.oldPosition.x > 16 || move.oldPosition.y < 0 || move.oldPosition.y > 10 ||
                move.newPosition.x < 0 || move.newPosition.x > 16 || move.newPosition.y < 0 || move.newPosition.y > 10) {
                return NextResponse.json(
                    { error: 'Invalid position coordinates', errorName: 'INVALID_POSITION' },
                    { status: 400 }
                );
            }
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
        console.log('Number of moves:', body.moves.length);

        // Map moves to contract format for relayer
        const contractMoves: GameAction[] = body.moves.map(move => ({
            playerId: move.playerId,
            moveType: move.moveType as MoveType,
            oldPosition: { x: move.oldPosition.x, y: move.oldPosition.y },
            newPosition: { x: move.newPosition.x, y: move.newPosition.y },
            teamEnum: body.team_enum === 1 ? TeamEnum.TEAM1 : TeamEnum.TEAM2,
            playerKey: () => `${body.team_enum === 1 ? '1_' : '2_'}${move.playerId}`
        }));


        // Simulate the transaction first to ensure it will succeed
        console.log('Simulating commitGameActions transaction...');
        console.log('body.wallet_address', body.wallet_address);
        console.log('body.game_id', body.game_id);
        console.log('body.team_enum', body.team_enum);
        const relayerClient = createRelayerClient();
        const { request: simulationRequest } = await publicClient.simulateContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'commitGameActionsRelayer',
            args: [body.wallet_address, body.game_id, body.team_enum],
            chain: base,
            account: relayerClient.account
        });

        console.log('Transaction simulation successful, executing...');

        // Execute the actual transaction using relayer client
        let hash = await relayerClient.writeContract(simulationRequest);

        console.log('Game actions committed successfully. Transaction hash:', hash);

        // Wait for transaction confirmation
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        // save moves to DB
        await saveMovesToDB(body.game_id, body.team_enum, contractMoves);

        const logs = parseEventLogs({
            abi: CONTRACT_ABI,
            logs: receipt.logs,
        });

        const gameActionCommittedLog = logs.find(log => log.eventName === 'gameActionCommitted');
        // two players made moves - need to calculate

        if (receipt.status === 'success') {
            return NextResponse.json({
                success: true,
                message: 'Game actions committed successfully to blockchain',
                transactionHash: hash,
                gameId: body.game_id,
                teamEnum: body.team_enum,
                movesCount: body.moves.length,
                blockNumber: Number(receipt.blockNumber),
                gasUsed: Number(receipt.gasUsed),
                isTwoTeamCommited: gameActionCommittedLog ? true : false
            });
        } else {
            return NextResponse.json(
                { error: 'Transaction failed', errorName: 'TRANSACTION_FAILED', transactionHash: hash },
                { status: 500 }
            );
        }

    } catch (error: any) {
        console.error('Error committing game actions:', error);

        // Handle specific contract errors
        if (error.message?.includes('GameDoesNotExist')) {
            return NextResponse.json(
                { error: 'Game does not exist', errorName: 'GAME_DOES_NOT_EXIST' },
                { status: 400 }
            );
        }

        if (error.message?.includes('TeamNotInGame')) {
            return NextResponse.json(
                { error: 'Team is not part of this game', errorName: 'TEAM_NOT_IN_GAME' },
                { status: 400 }
            );
        }

        if (error.message?.includes('NotTeamTurn')) {
            return NextResponse.json(
                { error: 'Not your team\'s turn', errorName: 'NOT_TEAM_TURN' },
                { status: 400 }
            );
        }

        if (error.message?.includes('InvalidMove')) {
            return NextResponse.json(
                { error: 'Invalid move detected', errorName: 'INVALID_MOVE' },
                { status: 400 }
            );
        }

        if (error.message?.includes('GameAlreadyFinished')) {
            return NextResponse.json(
                { error: 'Game is already finished', errorName: 'GAME_ALREADY_FINISHED' },
                { status: 400 }
            );
        }

        // Generic error response
        return NextResponse.json(
            {
                error: 'Failed to commit game actions',
                errorName: 'COMMIT_FAILED',
                details: error.message || 'Unknown error occurred'
            },
            { status: 500 }
        );
    }
}
