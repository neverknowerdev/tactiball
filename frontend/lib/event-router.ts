import { createHmac } from 'crypto';
import { WebSocketBroadcastingService, BroadcastMessage } from './ably';
import { Game, TeamEnum } from './game';
import { AbiDecoder, DecodedEvent } from './contract';
import { WebhookEvent } from './webhook';
import { db, type Database } from '@/lib/database';
import { teams, games, messages } from '@/db/schema';
import { eq, inArray, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { DatabaseError } from 'pg';

(BigInt.prototype as any).toJSON = function () {
    return this.toString()
}

// Main event router function
export async function processEventRouter(webhookEvent: WebhookEvent): Promise<{ success: boolean; error?: string }> {
    try {
        console.log('Processing event router for webhook:', webhookEvent.webhookId);

        // Get environment variables
        const ablyApiKey = process.env.ABLY_BROADCASTING_API_KEY;
        if (!ablyApiKey) {
            throw new Error('Missing ABLY_BROADCASTING_API_KEY environment variable');
        }

        // Create Supabase client with service role key for admin operations
        const database = db;

        // Create WebSocket service with Ably
        const wsService = new WebSocketBroadcastingService(ablyApiKey);

        console.log('logs received', webhookEvent.event.data.block.logs.length);

        try {
            // Process each log in the block
            for (const log of webhookEvent.event.data.block.logs) {
                console.log('process log', log);

                // Decode the event data using the ABI decoder
                const decodedData = AbiDecoder.decodeEventData(log.data, log.topics);

                console.log('decodedData', decodedData);

                // Save event to messages table - only process if this is the first time
                const messageRecord = await saveEventToMessages(
                    database,
                    decodedData,
                    webhookEvent.event.data.block.timestamp,
                    Number(webhookEvent.event.data.block.number),
                    log.transaction.hash,
                    Number(log.index)
                );

                // Only process the event if the message was successfully inserted (first time processing)
                if (!messageRecord) {
                    console.log(`Event already processed, skipping: ${decodedData.eventName}`);
                    continue;
                }

                await processLog(database, wsService, decodedData, webhookEvent.event.data.block.timestamp);

                // Mark the message as processed
                await markMessageAsProcessed(database, messageRecord.id);
            }

            return { success: true };

        } finally {
            // Always close the Ably connection
            await wsService.close();
        }

    } catch (error: unknown) {
        console.error('Error processing event router:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: errorMessage };
    }
}

async function processLog(database: Database, wsService: WebSocketBroadcastingService, eventLog: DecodedEvent, timestamp: number) {
    try {
        console.log('eventLog', eventLog);
        console.log(`Processing event for the first time: ${eventLog.eventName}`);

        switch (eventLog.eventName) {
            case 'TeamCreated':
                await handleTeamCreated(eventLog, database, wsService, timestamp);
                break;
            case 'TeamNameChanged':
                await handleTeamNameChanged(eventLog, database, wsService, timestamp);
                break;
            case 'GameRequestCreated':
                await handleGameRequestCreated(eventLog, database, wsService, timestamp);
                break;
            case 'GameRequestCancelled':
                await handleGameRequestCancelled(eventLog, database, wsService, timestamp);
                break;
            case 'GameStarted':
                await handleGameStarted(eventLog, database, wsService, timestamp);
                break;
            case 'gameActionCommitted':
                await handleGameActionCommitted(eventLog, database, wsService, timestamp);
                break;
            case 'NewGameState':
                await handleNewGameState(eventLog, database, wsService, timestamp);
                break;
            case 'GameFinished':
                await handleGameFinished(eventLog, database, wsService, timestamp);
                break;
            case 'GameStateError':
                await handleGameStateError(eventLog, database, wsService, timestamp);
                break;
            case 'GoalScored':
                await handleGoalScored(eventLog, database, wsService, timestamp);
                break;
            case 'EloUpdated':
                await handleEloUpdated(eventLog, database, wsService, timestamp);
                break;
            default:
                console.log(`Unknown event: ${eventLog.eventName}`);
        }
    } catch (error) {
        console.error(`Error processing log with signature ${eventLog.eventName}:`, error);
    }
}

async function saveEventToMessages(database: Database, eventLog: DecodedEvent, timestamp: number, blockNumber: number, transactionHash: string, logIndex: number) {
    if (!blockNumber || !transactionHash || !logIndex) {
        console.error('Missing required arguments to save event to messages');
        throw new Error('Missing required arguments to save event to messages');
    }

    try {
        const [inserted] = await database
            .insert(messages)
            .values({
                blockNumber: Number(blockNumber),
                transactionHash,
                logIndex: Number(logIndex),
                timestamp: new Date(timestamp * 1000),
                eventName: eventLog.eventName,
                args: eventLog.args || {}
            })
            .returning();

        if (!inserted) {
            return null;
        }

        console.log(`Event saved to messages: ${eventLog.eventName} (ID: ${inserted.id})`);
        return inserted;
    } catch (error) {
        if (error instanceof DatabaseError && error.code === '23505') {
            console.log('Message is skipped due to constraint - already processed');
            return null;
        }
        console.error('Error in saveEventToMessages:', error);
        return null;
    }
}

async function markMessageAsProcessed(database: Database, messageId: number) {
    try {
        await database
            .update(messages)
            .set({
                isProcessed: true,
                processedAt: new Date()
            })
            .where(eq(messages.id, messageId));

        console.log(`Message ${messageId} marked as processed at ${new Date().toISOString()}`);
    } catch (error) {
        console.error('Error in markMessageAsProcessed:', error);
    }
}

// Event handlers
async function handleTeamCreated(decodedData: DecodedEvent, database: Database, wsService: WebSocketBroadcastingService, timestamp: number) {
    const { teamId, owner, name, country } = AbiDecoder.getTypedArgs(decodedData);

    console.log('teamId', teamId);
    console.log('owner', owner);
    console.log('name', name);
    console.log('country', country);

    await database
        .insert(teams)
        .values({
            id: teamId,
            primaryWallet: owner,
            name,
            country,
            eloRating: 10000,
            createdAt: new Date(timestamp * 1000)
        })
        .onConflictDoNothing({ target: teams.id });

    console.log(`Team created: ${teamId} - ${name}`);
}

async function handleTeamNameChanged(decodedData: DecodedEvent, database: Database, wsService: WebSocketBroadcastingService, timestamp: number) {
    const { teamId, oldName, newName } = AbiDecoder.getTypedArgs(decodedData);

    // Update database
    await database
        .update(teams)
        .set({ name: newName })
        .where(eq(teams.id, teamId));

    // Broadcast to team channel
    await wsService.broadcastToTeam(teamId, {
        type: 'TEAM_NAME_CHANGED',
        team_id: teamId,
        old_name: oldName,
        new_name: newName,
        timestamp: timestamp * 1000
    });
}

async function handleGameRequestCreated(decodedData: DecodedEvent, database: Database, wsService: WebSocketBroadcastingService, timestamp: number) {
    const { gameRequestId, team1id, team2id } = AbiDecoder.getTypedArgs(decodedData);
    console.log('gameRequestId', gameRequestId, 'team1id', team1id, 'team2id', team2id);

    // Get both teams' info in a single query
    const teamsData = await database
        .select({
            id: teams.id,
            name: teams.name,
            country: teams.country,
            primary_wallet: teams.primaryWallet,
            active_game_id: teams.activeGameId,
            elo_rating: teams.eloRating,
            game_request_id: teams.gameRequestId
        })
        .from(teams)
        .where(inArray(teams.id, [team1id, team2id]));

    const team1Data = teamsData.find((team: typeof teamsData[0]) => team.id === team1id);
    const team2Data = teamsData.find((team: typeof teamsData[0]) => team.id === team2id);

    // Broadcast to team channel
    await wsService.broadcastToGameTeams(Number(team1id), Number(team2id), {
        type: 'GAME_REQUEST_CREATED',
        game_request_id: gameRequestId,
        team1_id: team1id,
        team2_id: team2id,
        team1_info: team1Data,
        team2_info: team2Data,
        timestamp: timestamp * 1000
    });

    console.log(`Game request created: ${gameRequestId}`);
}

async function handleGameRequestCancelled(decodedData: DecodedEvent, database: Database, wsService: WebSocketBroadcastingService, timestamp: number) {
    const { gameRequestId, team1id, team2id } = AbiDecoder.getTypedArgs(decodedData);

    // Broadcast to both team channels
    await wsService.broadcastToGameTeams(team1id, team2id, {
        type: 'GAME_REQUEST_CANCELLED',
        request_id: gameRequestId,
        team1_id: team1id,
        team2_id: team2id,
        timestamp: timestamp * 1000
    });

    console.log(`Game request cancelled: ${gameRequestId}`);
}

async function handleGameStarted(decodedData: DecodedEvent, database: Database, wsService: WebSocketBroadcastingService, timestamp: number) {
    const { gameId, team1id, team2id, teamWithBall } = AbiDecoder.getTypedArgs(decodedData);

    // Broadcast to both team channels
    await wsService.broadcastToGameTeams(team1id, team2id, {
        type: 'GAME_STARTED',
        game_id: gameId,
        team1_id: team1id,
        team2_id: team2id,
        team_with_ball: teamWithBall,
        timestamp: timestamp * 1000
    });

    // Broadcast to game channel
    await wsService.broadcastToGame(gameId, {
        type: 'GAME_STARTED',
        game_id: gameId,
        team1_id: team1id,
        team2_id: team2id,
        team_with_ball: teamWithBall,
        timestamp: timestamp * 1000
    });

    // Get team data from database
    const teamsData = await database
        .select({
            id: teams.id,
            name: teams.name,
            elo_rating: teams.eloRating,
            country: teams.country,
            primary_wallet: teams.primaryWallet
        })
        .from(teams)
        .where(inArray(teams.id, [team1id, team2id]));

    const team1Data = teamsData.find((team: typeof teamsData[0]) => team.id === team1id);
    const team2Data = teamsData.find((team: typeof teamsData[0]) => team.id === team2id);

    if (!team1Data || !team2Data) {
        console.error('Could not find team data');
        throw new Error('Team data not found');
    }

    const game = new Game(0);
    const firstHistoryItem = getFirstHistoryItem("2-2-1", teamWithBall);

    // Insert new game into database
    try {
        await database
            .insert(games)
            .values({
                id: gameId,
                team1: team1id,
                team2: team2id,
                createdAt: new Date(timestamp * 1000),
                lastMoveAt: null,
                status: 'active',
                movesMade: 0,
                team1Info: {
                    elo_rating_old: 0,
                    elo_rating_new: 0,
                    elo_rating_diff: 0,
                    name: team1Data.name,
                    wallet: team1Data.primary_wallet,
                    formation: "2-2-1",
                    country: team1Data.country,
                },
                team2Info: {
                    elo_rating_old: 0,
                    elo_rating_new: 0,
                    elo_rating_diff: 0,
                    name: team2Data.name,
                    wallet: team2Data.primary_wallet,
                    formation: "2-2-1",
                    country: team2Data.country,
                },
                history: [firstHistoryItem]
            });
    } catch (error) {
        if (error instanceof DatabaseError && error.code === '23505') {
            console.log('Game already exists');
            return;
        }
        console.error('Error inserting game:', error);
        throw error;
    }

    await database
        .update(teams)
        .set({ activeGameId: gameId })
        .where(inArray(teams.id, [team1id, team2id]));

    console.log(`Game started: ${gameId}`);
}

async function handleGameActionCommitted(decodedData: DecodedEvent, database: Database, wsService: WebSocketBroadcastingService, timestamp: number) {
    const { gameId, timestamp: gameActionTimestamp } = AbiDecoder.getTypedArgs(decodedData);

    // Broadcast to game channel
    await wsService.broadcastToGame(gameId, {
        type: 'GAME_ACTION_COMMITTED',
        game_id: gameId,
        timestamp: gameActionTimestamp
    });

    console.log(`Game action committed: ${gameId} at ${timestamp}`);
}

async function handleNewGameState(decodedData: DecodedEvent, database: Database, wsService: WebSocketBroadcastingService, timestamp: number) {
    const { gameId, stateType, time, clashRandomNumbers, team1Actions, team2Actions, boardState } = AbiDecoder.getTypedArgs(decodedData);
    const ballPosition = boardState.ballPosition;
    const ballOwner = boardState.ballOwner;


    const historyItem = {
        team1_positions: boardState.team1PlayerPositions,
        team2_positions: boardState.team2PlayerPositions,
        ball_position: ballPosition,
        ball_owner: ballOwner,
        clash_random_numbers: clashRandomNumbers,
        team1_moves: team1Actions,
        team2_moves: team2Actions,
        type: stateType,
    };
    // Use the updateGame function to fetch from contract and update database
    // Call newGameState SQL function to reset game state
    await database.execute(sql`
        SELECT public.new_game_state(${gameId}, ${JSON.stringify(historyItem)}::jsonb)
    `);

    // Broadcast to game channel
    await wsService.broadcastToGame(gameId, {
        type: 'NEW_GAME_STATE',
        game_id: gameId,
        time: time,
        state_type: stateType,
        new_state: historyItem,
        clash_random_numbers: clashRandomNumbers,
        team1_actions: team1Actions,
        team2_actions: team2Actions,
        board_state: boardState,
        ball_position: ballPosition,
        ball_owner: ballOwner,
        timestamp: timestamp
    });

    console.log(`New game state: ${gameId} at ${time}`);
    console.log(`Latest history item: ${JSON.stringify(historyItem)}`);
}

async function handleGameFinished(decodedData: DecodedEvent, database: Database, wsService: WebSocketBroadcastingService, timestamp: number) {
    const { gameId, winner, finishReason } = AbiDecoder.getTypedArgs(decodedData);

    // Broadcast to game channel
    await wsService.broadcastToGame(gameId, {
        type: 'GAME_FINISHED',
        game_id: gameId,
        winner: winner,
        finish_reason: finishReason,
        timestamp: timestamp
    });

    // Determine status based on finish reason
    const status = finishReason === 0 ? 'finished' : 'finished_by_timeout';

    const [game] = await database
        .select()
        .from(games)
        .where(eq(games.id, gameId))
        .limit(1);

    if (!game) {
        throw new Error(`Game ${gameId} not found`);
    }

    let winnerTeamId = null;
    if (winner == 1) {
        winnerTeamId = game.team1;
    } else if (winner == 2) {
        winnerTeamId = game.team2;
    }

    // Update active_game_id to null for both teams
    await database
        .update(teams)
        .set({ activeGameId: null })
        .where(
            and(
                inArray(teams.id, [game.team1!, game.team2!]),
                eq(teams.activeGameId, gameId)
            )
        );

    await database
        .update(games)
        .set({ status: status as any, winner: winnerTeamId })
        .where(eq(games.id, gameId));

    // Also broadcast to team channels
    await wsService.broadcastToGameTeams(game.team1, game.team2, {
        type: 'GAME_FINISHED',
        game_id: gameId,
        winner: winner,
        winner_team_id: winnerTeamId,
        finish_reason: finishReason,
        status: status,
        timestamp: timestamp
    });

    console.log(`Game finished: ${gameId}, winner: ${winner}, reason: ${finishReason}`);
}

async function handleGameStateError(decodedData: DecodedEvent, database: Database, wsService: WebSocketBroadcastingService, timestamp: number) {
    const { gameId, causedByTeam, errorType, errorMsg } = AbiDecoder.getTypedArgs(decodedData);

    console.log(`Handling GameStateError event for game ${gameId}, caused by team ${causedByTeam}, error: ${errorMsg}`);

    try {
        // Get game info to find team channels
        const [game] = await database
            .select({
                team1: games.team1,
                team2: games.team2
            })
            .from(games)
            .where(eq(games.id, gameId))
            .limit(1);

        if (!game) {
            console.error('Error fetching game info');
            return;
        }

        // Broadcast error to game channel
        const gameChannel = `game_${gameId}`;

        const message: BroadcastMessage = {
            type: 'GAME_STATE_ERROR',
            game_id: gameId,
            caused_by_team: causedByTeam,
            error_type: errorType,
            error_msg: errorMsg,
            timestamp: timestamp
        };

        // Broadcast to game channel and both team channels
        await wsService.broadcastToMultiple([gameChannel], message);
        console.log(`GameStateError event handled successfully for game ${gameId}`);

    } catch (error) {
        console.error('Error handling GameStateError event:', error);
    }
}

async function handleGoalScored(decodedData: DecodedEvent, database: Database, wsService: WebSocketBroadcastingService, timestamp: number) {
    const { gameId, scoringTeam } = AbiDecoder.getTypedArgs(decodedData);

    console.log(`Goal scored: ${gameId} by team ${scoringTeam}`);

    if (!scoringTeam) {
        console.error('Invalid team:', scoringTeam);
        return;
    }

    if (!gameId) {
        console.error('Invalid gameId:', gameId);
        return;
    }

    // Get game info to find team channels
    const [gameInfo] = await database
        .select({
            team1: games.team1,
            team2: games.team2,
            team1_score: games.team1Score,
            team2_score: games.team2Score
        })
        .from(games)
        .where(eq(games.id, gameId))
        .limit(1);

    if (!gameInfo) {
        console.error('Error fetching game info');
        return;
    }

    let updateData: { team1Score?: number; team2Score?: number } | undefined;
    if (scoringTeam === 1) {
        if (gameInfo.team1_score === null) {
            gameInfo.team1_score = 0;
        }
        updateData = { team1Score: Number(gameInfo.team1_score) + 1 };
    } else if (scoringTeam === 2) {
        if (gameInfo.team2_score === null) {
            gameInfo.team2_score = 0;
        }
        updateData = { team2Score: Number(gameInfo.team2_score) + 1 };
    }

    // Update score in database based on which team scored
    if (updateData) {
        await database
            .update(games)
            .set(updateData)
            .where(eq(games.id, gameId));
    }

    console.log(`Updated score for game ${gameId}`);

    // Broadcast to game channel
    await wsService.broadcastToGame(gameId, {
        type: 'GOAL_SCORED',
        game_id: gameId,
        teamEnum: scoringTeam,
        timestamp: timestamp
    });
}

async function handleEloUpdated(decodedData: DecodedEvent, database: Database, wsService: WebSocketBroadcastingService, timestamp: number) {
    const { teamId, gameId, eloRating } = AbiDecoder.getTypedArgs(decodedData);

    console.log(`Elo updated: ${teamId} to ${eloRating}`);

    await database.execute(sql`
        SELECT public.update_elo_rating(${teamId}, ${gameId}, ${eloRating})
    `);
}

function isValidSignatureForStringBody(
    body: string,
    signature: string,
): boolean {
    const signingKey = process.env.ALCHEMY_SIGNING_KEY || '';

    if (signingKey === '') {
        throw new Error('Missing ALCHEMY_SIGNING_KEY environment variable');
    }
    const hmac = createHmac("sha256", signingKey);
    hmac.update(body, "utf8");
    const digest = hmac.digest("hex");
    return signature === digest;
}


function getFirstHistoryItem(formation: string, teamWithBall: number) {
    const game = new Game(0);
    game.newGame(0, teamWithBall === 1 ? TeamEnum.TEAM1 : TeamEnum.TEAM2)

    return game.history[0]
}