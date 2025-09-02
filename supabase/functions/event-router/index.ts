import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'
import { AbiDecoder, CONTRACT_ABI, CONTRACT_ADDRESS, DecodedEvent } from './abi-decoder.ts'
import { WebSocketService, BroadcastMessage } from './websocket-service.ts'
import { TeamEnum, Game } from './game.ts'
// Event types from smart contract

Deno.serve(async (req: Request) => {
    try {
        // Parse the incoming webhook payload directly
        const webhookEvent: WebhookEvent = await req.json()

        console.log('webhookEvent', JSON.stringify(webhookEvent))

        // Get environment variables
        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
        const ablyApiKey = Deno.env.get('ABLY_API_KEY')

        if (!supabaseUrl || !supabaseServiceKey) {
            throw new Error('Missing Supabase environment variables')
        }

        if (!ablyApiKey) {
            throw new Error('Missing Ably API key')
        }

        // Create Supabase client with service role key for admin operations
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // Create WebSocket service with Ably
        const wsService = new WebSocketService(ablyApiKey)

        console.log('logs received', webhookEvent.event.data.block.logs.length)

        try {
            // Process each log in the block
            for (const log of webhookEvent.event.data.block.logs) {
                console.log('process log', log)

                // Decode the event data using the ABI decoder
                const decodedData = AbiDecoder.decodeEventData(log.data, log.topics)

                console.log('decodedData', decodedData)

                await processLog(supabase, wsService, decodedData, webhookEvent.event.data.block.timestamp)
            }

            return new Response(JSON.stringify({ success: true }), {
                headers: { 'Content-Type': 'application/json' },
                status: 200,
            })

        } finally {
            // Always close the Ably connection
            await wsService.close()
        }

    } catch (error: unknown) {
        console.error('Error processing webhook:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return new Response(JSON.stringify({ error: errorMessage }), {
            headers: { 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})

async function processLog(supabase: any, wsService: WebSocketService, eventLog: DecodedEvent, timestamp: number) {
    try {

        switch (eventLog.eventName) {
            case 'TeamCreated':
                await handleTeamCreated(eventLog, supabase, wsService, timestamp)
                break
            case 'GameRequestCreated':
                await handleGameRequestCreated(eventLog, supabase, wsService, timestamp)
                break
            case 'GameRequestCancelled':
                await handleGameRequestCancelled(eventLog, supabase, wsService, timestamp)
                break
            case 'GameStarted':
                await handleGameStarted(eventLog, supabase, wsService, timestamp)
                break
            case 'gameActionCommitted':
                await handleGameActionCommitted(eventLog, supabase, wsService, timestamp)
                break
            case 'NewGameState':
                await handleNewGameState(eventLog, supabase, wsService, timestamp)
                break
            case 'GameFinished':
                await handleGameFinished(eventLog, supabase, wsService, timestamp)
                break
            case 'GameStateError':
                await handleGameStateError(eventLog, supabase, wsService, timestamp)
                break
            default:
                console.log(`Unknown event: ${eventLog.eventName}`)
        }
    } catch (error) {
        console.error(`Error processing log with signature ${eventLog.eventName}:`, error)
    }

    console.log('sleeping for 3 seconds to finish all network things..');
    // Sleep for 3 seconds to allow for any pending operations to complete
    await new Promise(resolve => setTimeout(resolve, 3000));
}

async function handleTeamCreated(decodedData: DecodedEvent, supabase: any, wsService: WebSocketService, timestamp: number) {
    const { teamId, owner, name, country } = AbiDecoder.getTypedArgs(decodedData)

    console.log('teamId', teamId)
    console.log('owner', owner)
    console.log('name', name)
    console.log('country', country)

    // Insert new team into database with basic info first
    const { data, error } = await supabase
        .from('teams')
        .insert({
            id: teamId,
            primary_wallet: owner,
            name: name,
            country: country,
            created_at: new Date(timestamp * 1000).toISOString()
        })
        .select()

    if (error) {
        console.error('Error inserting team:', error)
        throw error
    }

    console.log(`Team created: ${teamId} - ${name}`)
}

async function handleGameRequestCreated(decodedData: DecodedEvent, supabase: any, wsService: WebSocketService, timestamp: number) {
    const { gameRequestId, team1id, team2id } = AbiDecoder.getTypedArgs(decodedData);
    console.log('gameRequestId', gameRequestId, 'team1id', team1id, 'team2id', team2id)

    // Get both teams' info in a single query
    const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select('id, name, country, primary_wallet, active_game_id, elo_rating, game_request_id')
        .in('id', [team1id, team2id]);

    if (teamsError) {
        console.error('Error getting teams:', teamsError);
        throw teamsError;
    }

    const team1Data = teamsData.find((team: any) => team.id === team1id);
    const team2Data = teamsData.find((team: any) => team.id === team2id);

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

    console.log(`Game request created: ${gameRequestId}`)
}

async function handleGameRequestCancelled(decodedData: DecodedEvent, supabase: any, wsService: WebSocketService, timestamp: number) {
    const { gameRequestId, team1id, team2id } = AbiDecoder.getTypedArgs(decodedData)

    // Broadcast to both team channels
    await wsService.broadcastToGameTeams(team1id, team2id, {
        type: 'GAME_REQUEST_CANCELLED',
        request_id: gameRequestId,
        team1_id: team1id,
        team2_id: team2id,
        timestamp: timestamp * 1000
    })

    console.log(`Game request cancelled: ${gameRequestId}`)
}

async function handleGameStarted(decodedData: DecodedEvent, supabase: any, wsService: WebSocketService, timestamp: number) {
    const { gameId, team1id, team2id, teamWithBall } = AbiDecoder.getTypedArgs(decodedData)

    // Broadcast to both team channels
    await wsService.broadcastToGameTeams(team1id, team2id, {
        type: 'GAME_STARTED',
        game_id: gameId,
        team1_id: team1id,
        team2_id: team2id,
        team_with_ball: teamWithBall,
        timestamp: timestamp * 1000
    })

    // Broadcast to game channel
    await wsService.broadcastToGame(gameId, {
        type: 'GAME_STARTED',
        game_id: gameId,
        team1_id: team1id,
        team2_id: team2id,
        team_with_ball: teamWithBall,
        timestamp: timestamp * 1000
    })

    // Get team data from database
    const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select('id, name, elo_rating')
        .in('id', [team1id, team2id]);

    if (teamsError) {
        console.error('Error fetching teams:', teamsError);
        throw teamsError;
    }

    const team1Data = teamsData.find((team: any) => team.id === team1id);
    const team2Data = teamsData.find((team: any) => team.id === team2id);

    if (!team1Data || !team2Data) {
        console.error('Could not find team data');
        throw new Error('Team data not found');
    }

    const firstHistoryItem = getFirstHistoryItem("2-2-1", teamWithBall)

    // Insert new game into database
    const { data, error } = await supabase
        .from('games')
        .insert({
            id: gameId,
            team1: team1id,
            team2: team2id,
            created_at: new Date(timestamp * 1000).toISOString(),
            last_move_at: null,
            status: 'active',
            moves_made: 0,
            team1_info: {
                elo_rating_old: 0,
                elo_rating_new: 0,
                elo_rating_diff: 0,
                name: team1Data.name,
                wallet: team1Data.primary_wallet,
                formation: "2-2-1",
                country: team1Data.country,
            },
            team2_info: {
                elo_rating_old: 0,
                elo_rating_new: 0,
                elo_rating_diff: 0,
                name: team2Data.name,
                wallet: team2Data.primary_wallet,
                formation: "2-2-1",
                country: team2Data.country,
            },
            history: [firstHistoryItem]
        })
        .select()

    if (error) {
        console.error('Error inserting game:', error)
        throw error
    }

    // Update teams with active game
    await supabase
        .from('teams')
        .update({ active_game_id: gameId })
        .in('id', [team1id, team2id])

    console.log(`Game started: ${gameId}`)
}

function getFirstHistoryItem(formation: string, teamWithBall: number) {
    const game = new Game(0);
    game.newGame(0, teamWithBall === 1 ? TeamEnum.TEAM1 : TeamEnum.TEAM2)

    return game.history[0]
}

async function handleGameActionCommitted(decodedData: DecodedEvent, supabase: any, wsService: WebSocketService, timestamp: number) {
    const { gameId, timestamp: gameActionTimestamp } = AbiDecoder.getTypedArgs(decodedData)

    // Broadcast to game channel
    await wsService.broadcastToGame(gameId, {
        type: 'GAME_ACTION_COMMITTED',
        game_id: gameId,
        timestamp: gameActionTimestamp
    })

    console.log(`Game action committed: ${gameId} at ${timestamp}`)
}

async function handleNewGameState(decodedData: DecodedEvent, supabase: any, wsService: WebSocketService, timestamp: number) {
    const { gameId, stateType, time, clashRandomNumbers, team1Actions, team2Actions, ballPosition, ballOwner } = AbiDecoder.getTypedArgs(decodedData)

    // Use the updateGame function to fetch from contract and update database
    // Call newGameState SQL function to reset game state
    const { data: latestHistoryItem, error: sqlFuncError } = await supabase.rpc('newGameState', { game_id: gameId })

    if (sqlFuncError) {
        console.error('Error calling newGameState SQL function:', sqlFuncError)
        throw sqlFuncError
    }

    // Broadcast to game channel
    await wsService.broadcastToGame(gameId, {
        type: 'NEW_GAME_STATE',
        game_id: gameId,
        time: time,
        state_type: stateType,
        new_state: latestHistoryItem,
        clash_random_numbers: clashRandomNumbers,
        team1_actions: team1Actions,
        team2_actions: team2Actions,
        ball_position: ballPosition,
        ball_owner: ballOwner,
        timestamp: timestamp
    })

    console.log(`New game state: ${gameId} at ${time}`)
    console.log(`Latest history item: ${JSON.stringify(latestHistoryItem, bigintToNumber)}`)
}

async function handleGameFinished(decodedData: DecodedEvent, supabase: any, wsService: WebSocketService, timestamp: number) {
    const { gameId, winner, finishReason } = AbiDecoder.getTypedArgs(decodedData)

    // Broadcast to game channel
    await wsService.broadcastToGame(gameId, {
        type: 'GAME_FINISHED',
        game_id: gameId,
        winner: winner,
        finish_reason: finishReason,
        timestamp: timestamp
    })

    // Determine status based on finish reason
    const status = finishReason === 0 ? 'finished' : 'finished_by_timeout'

    // Get game record from database
    const { data: game, error: fetchError } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single()

    if (fetchError) {
        console.error('Error fetching game:', fetchError)
        throw fetchError
    }

    let winnerTeamId = null
    if (winner == 1) {
        winnerTeamId = game.team1
    } else if (winner == 2) {
        winnerTeamId = game.team2
    }

    // Update active_game_id to null for both teams
    const { error: updateError } = await supabase
        .from('teams')
        .update({ active_game_id: null })
        .in('id', [game.team1, game.team2])

    if (updateError) {
        console.error('Error updating teams active_game_id:', updateError)
        throw updateError
    }

    // Update game status to finished
    const { error: gameUpdateError } = await supabase
        .from('games')
        .update({ status: status, winner: winnerTeamId })
        .eq('id', gameId)

    if (gameUpdateError) {
        console.error('Error updating game status:', gameUpdateError)
        throw gameUpdateError
    }

    // Also broadcast to team channels
    await wsService.broadcastToGameTeams(game.team1, game.team2, {
        type: 'GAME_FINISHED',
        game_id: gameId,
        winner: winner,
        winner_team_id: winnerTeamId,
        finish_reason: finishReason,
        status: status,
        timestamp: timestamp
    })

    console.log(`Game finished: ${gameId}, winner: ${winner}, reason: ${finishReason}`)
}

async function handleGameStateError(decodedData: DecodedEvent, supabase: any, wsService: WebSocketService, timestamp: number) {
    const { gameId, causedByTeam, errorType, errorMsg } = AbiDecoder.getTypedArgs(decodedData)

    console.log(`Handling GameStateError event for game ${gameId}, caused by team ${causedByTeam}, error: ${errorMsg}`)

    try {
        // Get game info to find team channels
        const { data: game, error } = await supabase
            .from('games')
            .select('team1, team2')
            .eq('id', gameId)
            .single()

        if (error) {
            console.error('Error fetching game info:', error)
            return
        }

        // Broadcast error to game channel
        const gameChannel = `game_${gameId}`

        const message: BroadcastMessage = {
            type: 'GAME_STATE_ERROR',
            game_id: gameId,
            caused_by_team: causedByTeam,
            error_type: errorType,
            error_msg: errorMsg,
            timestamp: timestamp
        }

        // Broadcast to game channel and both team channels
        await wsService.broadcastToMultiple([gameChannel], message)
        console.log(`GameStateError event handled successfully for game ${gameId}`)

    } catch (error) {
        console.error('Error handling GameStateError event:', error)
    }
}

function bigintToNumber(key: string, value: any) {
    return typeof value === "bigint" ? Number(value) : value
}

// Event types from smart contract
interface WebhookEvent {
    webhookId: string
    id: string
    createdAt: string
    type: string
    event: {
        data: {
            block: {
                hash: string
                number: number
                timestamp: number
                logs: Array<{
                    data: string
                    topics: string[]
                    index: number
                    account: {
                        address: string
                    }
                    transaction: {
                        hash: string
                        nonce: number
                        index: number
                        from: {
                            address: string
                        }
                        to: {
                            address: string
                        }
                        value: string
                        gasPrice: string
                        maxFeePerGas: string
                        maxPriorityFeePerGas: string
                        gas: number
                        status: number
                        gasUsed: number
                        cumulativeGasUsed: number
                        effectiveGasPrice: string
                        createdContract: string | null
                    }
                }>
            }
        }
        sequenceNumber: string
        network: string
    }
}