import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'
import { AbiDecoder, CONTRACT_ABI, DecodedEvent } from './abi-decoder.ts'
import { WebSocketService, BroadcastMessage } from './websocket-service.ts'

// Event types from smart contract

Deno.serve(async (req: Request) => {
    try {
        // Parse the incoming webhook payload directly
        const webhookEvent: WebhookEvent = await req.json()

        console.log('webhookEvent', webhookEvent)

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
}

async function handleTeamCreated(decodedData: DecodedEvent, supabase: any, wsService: WebSocketService, timestamp: number) {
    const { teamId, owner, name, country } = decodedData.args

    console.log('teamId', teamId)
    console.log('owner', owner)
    console.log('name', name)
    console.log('country', country)

    // Insert new team into database with basic info first
    const { data, error } = await supabase
        .from('teams')
        .insert({
            id: Number(teamId),
            primary_wallet: owner,
            name: name,
            country: Number(country),
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
    const { gameRequestId, team1Id, team2Id } = decodedData.args

    // Broadcast to team channel
    await wsService.broadcastToGameTeams(team1Id, team2Id, {
        type: 'GAME_REQUEST_CREATED',
        teamId: Number(team1Id),
        team2Id: Number(team2Id),
        timestamp: timestamp * 1000
    });

    console.log(`Game request created: ${gameRequestId}`)
}

async function handleGameRequestCancelled(decodedData: DecodedEvent, supabase: any, wsService: WebSocketService, timestamp: number) {
    const { gameRequestId, team1Id, team2Id } = decodedData.args

    // Broadcast to both team channels
    await wsService.broadcastToGameTeams(team1Id, team2Id, {
        type: 'GAME_REQUEST_CANCELLED',
        requestId: gameRequestId,
        team1Id: Number(team1Id),
        team2Id: Number(team2Id),
        timestamp: timestamp * 1000
    })

    console.log(`Game request cancelled: ${gameRequestId}`)
}

async function handleGameStarted(decodedData: DecodedEvent, supabase: any, wsService: WebSocketService, timestamp: number) {
    const { gameId, team1Id, team2Id, teamWithBall } = decodedData.args

    // Broadcast to both team channels
    await wsService.broadcastToGameTeams(team1Id, team2Id, {
        type: 'GAME_STARTED',
        gameId: gameId,
        team1Id: Number(team1Id),
        team2Id: Number(team2Id),
        teamWithBall: Number(teamWithBall),
        timestamp: timestamp * 1000
    })

    // Broadcast to game channel
    await wsService.broadcastToGame(gameId, {
        type: 'GAME_STARTED',
        gameId: gameId,
        team1Id: team1Id,
        team2Id: team2Id,
        teamWithBall: teamWithBall,
        timestamp: timestamp * 1000
    })


    // Insert new game into database
    const { data, error } = await supabase
        .from('games')
        .insert({
            id: gameId,
            team1: Number(team1Id),
            team2: Number(team2Id),
            created_at: new Date(timestamp * 1000).toISOString(),
            last_move_at: null,
            status: 'active',
            moves_made: 0,
            team1_info: {
                eloRatingOld: 0,
                eloRatingNew: 0,
                eloRatingDiff: 0,
                formation: "2-2-1",
                score: 0,
                hasMadeMove: false
            },
            team2_info: {
                eloRatingOld: 0,
                eloRatingNew: 0,
                eloRatingDiff: 0,
                formation: "2-2-1",
                score: 0,
                hasMadeMove: false
            },
            history: []
        })
        .select()

    if (error) {
        console.error('Error inserting game:', error)
        throw error
    }

    // Update teams with active game
    await supabase
        .from('teams')
        .update({ active_game_id: Number(gameId) })
        .in('id', [Number(team1Id), Number(team2Id)])

    console.log(`Game started: ${gameId}`)
}

async function handleGameActionCommitted(decodedData: DecodedEvent, supabase: any, wsService: WebSocketService, timestamp: number) {
    const { gameId, timestamp: gameActionTimestamp } = decodedData.args

    // Broadcast to game channel
    await wsService.broadcastToGame(gameId, {
        type: 'GAME_ACTION_COMMITTED',
        gameId: gameId,
        timestamp: Number(gameActionTimestamp)
    })

    console.log(`Game action committed: ${gameId} at ${timestamp}`)
}

async function handleNewGameState(decodedData: DecodedEvent, supabase: any, wsService: WebSocketService, timestamp: number) {
    const { gameId, time } = decodedData.args

    // Broadcast to game channel
    await wsService.broadcastToGame(Number(gameId), {
        type: 'NEW_GAME_STATE_NOTIFICATION',
        gameId: Number(gameId),
        time: Number(time),
        timestamp: timestamp
    })

    // Get game record from database
    const { data: game, error: fetchError } = await supabase
        .from('games')
        .select('*')
        .eq('id', Number(gameId))
        .single()

    if (fetchError) {
        console.error('Error fetching game:', fetchError)
        throw fetchError
    }

    try {
        // Use the updateGame function to fetch from contract and update database
        const smartContractGame = await updateGame(Number(gameId), supabase, timestamp)

        // Get the latest game state from history
        const latestState = smartContractGame.history[smartContractGame.history.length - 1]

        // Broadcast to game channel
        await wsService.broadcastToGame(Number(gameId), {
            type: 'NEW_GAME_STATE',
            gameId: Number(gameId),
            time: Number(time),
            newState: latestState,
            timestamp: timestamp
        })

        console.log(`New game state: ${gameId} at ${time}, moves: ${smartContractGame.movesMade}, scores: ${smartContractGame.team1.score}-${smartContractGame.team2.score}`)

    } catch (contractError) {
        console.error(`Error getting game state from contract for game ${gameId}:`, contractError)
    }
}

async function handleGameFinished(decodedData: DecodedEvent, supabase: any, wsService: WebSocketService, timestamp: number) {
    const { gameId, winner, finishReason } = decodedData.args

    // Broadcast to game channel
    await wsService.broadcastToGame(Number(gameId), {
        type: 'GAME_FINISHED',
        gameId: Number(gameId),
        winner: winner,
        finishReason: finishReason,
        timestamp: timestamp
    })

    // Determine status based on finish reason
    const status = finishReason === 0 ? 'finished' : 'finished_by_timeout'

    // Get game record from database
    const { data: game, error: fetchError } = await supabase
        .from('games')
        .select('*')
        .eq('id', Number(gameId))
        .single()

    if (fetchError) {
        console.error('Error fetching game:', fetchError)
        throw fetchError
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

    // Use the updateGame function to fetch from contract and update database
    const smartContractGame = await updateGame(Number(gameId), supabase, timestamp)

    // Also broadcast to team channels
    await wsService.broadcastToGameTeams(game.team1, game.team2, {
        type: 'GAME_FINISHED',
        gameId: gameId,
        winner: winner,
        finishReason: finishReason,
        status: status,
        timestamp: timestamp
    })

    console.log(`Game finished: ${gameId}, winner: ${winner}, reason: ${finishReason}`)
}

async function handleGameStateError(decodedData: DecodedEvent, supabase: any, wsService: WebSocketService, timestamp: number) {
    const { gameId, causedByTeam, errorType, errorMsg } = decodedData.args

    console.log(`Handling GameStateError event for game ${gameId}, caused by team ${causedByTeam}, error: ${errorMsg}`)

    try {
        // Get game info to find team channels
        const { data: game, error } = await supabase
            .from('games')
            .select('team1, team2')
            .eq('id', Number(gameId))
            .single()

        if (error) {
            console.error('Error fetching game info:', error)
            return
        }

        // Broadcast error to game channel
        const gameChannel = `game_${Number(gameId)}`

        const message: BroadcastMessage = {
            type: 'GAME_STATE_ERROR',
            gameId: Number(gameId),
            causedByTeam: Number(causedByTeam),
            errorType: Number(errorType),
            errorMsg: errorMsg,
            timestamp: timestamp
        }

        // Broadcast to game channel and both team channels
        await wsService.broadcastToMultiple([gameChannel], message)
        console.log(`GameStateError event handled successfully for game ${gameId}`)

    } catch (error) {
        console.error('Error handling GameStateError event:', error)
    }
}


/**
 * Maps smart contract Game struct to database-friendly format
 */
function mapContractGameToDatabase(gameData: any, time: number, timestamp: number) {
    return {
        gameId: Number(gameData.gameId),
        createdAt: Number(gameData.createdAt),
        lastMoveAt: Number(gameData.lastMoveAt),
        lastMoveTeam: Number(gameData.lastMoveTeam),
        team1: {
            teamId: Number(gameData.team1.teamId),
            score: Number(gameData.team1.score),
            eloRating: Number(gameData.team1.eloRating),
            eloRatingNew: Number(gameData.team1.eloRatingNew),
            formation: Number(gameData.team1.formation),
            actions: gameData.team1.actions.map((action: any) => ({
                playerId: Number(action.playerId),
                moveType: Number(action.moveType),
                oldPosition: {
                    x: Number(action.oldPosition.x),
                    y: Number(action.oldPosition.y)
                },
                newPosition: {
                    x: Number(action.newPosition.x),
                    y: Number(action.newPosition.y)
                }
            }))
        },
        team2: {
            teamId: Number(gameData.team2.teamId),
            score: Number(gameData.team2.score),
            eloRating: Number(gameData.team2.eloRating),
            eloRatingNew: Number(gameData.team2.eloRatingNew),
            formation: Number(gameData.team2.formation),
            actions: gameData.team2.actions.map((action: any) => ({
                playerId: Number(action.playerId),
                moveType: Number(action.moveType),
                oldPosition: {
                    x: Number(action.oldPosition.x),
                    y: Number(action.oldPosition.y)
                },
                newPosition: {
                    x: Number(action.newPosition.x),
                    y: Number(action.newPosition.y)
                }
            }))
        },
        history: gameData.history.map((state: any) => ({
            team1Positions: state.team1Positions.map((pos: any) => ({
                x: Number(pos.x),
                y: Number(pos.y)
            })),
            team2Positions: state.team2Positions.map((pos: any) => ({
                x: Number(pos.x),
                y: Number(pos.y)
            })),
            ballPosition: {
                x: Number(state.ballPosition.x),
                y: Number(state.ballPosition.y)
            },
            ballOwner: Number(state.ballOwner),
            clashRandomResults: state.clashRandomResults.map((result: any) => Number(result)),
            stateType: Number(state.stateType)
        })),
        status: Number(gameData.status),
        movesMade: Number(gameData.movesMade),
        winner: gameData.winner ? Number(gameData.winner) : null
    }
}


/**
 * Fetches game data from smart contract, maps it, and updates the database
 * Returns the mapped game data for further use
 */
async function updateGame(gameId: number, supabase: any, timestamp: number) {
    const contractAddress = Deno.env.get('CONTRACT_ADDRESS')
    if (!contractAddress) {
        throw new Error('Missing CONTRACT_ADDRESS environment variable')
    }

    // Create contract instance to call getGame function
    const { createPublicClient, http, parseAbiItem } = await import('https://esm.sh/viem@2.0.0')
    const { base } = await import('https://esm.sh/viem@2.0.0/chains')

    // Get RPC URL from environment variable
    const rpcUrl = Deno.env.get('RPC_URL')
    if (!rpcUrl) {
        throw new Error('Missing RPC_URL environment variable')
    }

    const publicClient = createPublicClient({
        chain: base,
        transport: http(rpcUrl)
    })

    // Call getGame function on smart contract
    const gameData = await publicClient.readContract({
        address: contractAddress as `0x${string}`,
        abi: [CONTRACT_ABI],
        functionName: 'getGame',
        args: [BigInt(gameId)]
    })

    if (!gameData) {
        throw new Error(`Failed to get game data from contract for game ${gameId}`)
    }

    // Map smart contract game state to database structure
    const smartContractGame = mapContractGameToDatabase(gameData, timestamp, timestamp)

    // Get current game record from database
    const { data: game, error: fetchError } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single()

    if (fetchError) {
        console.error('Error fetching game:', fetchError)
        throw fetchError
    }

    // Update game record with new state and scores
    const { error: updateError } = await supabase
        .from('games')
        .update({
            moves_made: smartContractGame.movesMade,
            team1_score: smartContractGame.team1.score,
            team2_score: smartContractGame.team2.score,
            winner: smartContractGame.winner,
            status: smartContractGame.status === 1 ? 'active' :
                smartContractGame.status === 2 ? 'finished' :
                    smartContractGame.status === 3 ? 'finished_by_timeout' : 'active',
            history: smartContractGame.history,
            last_move_at: new Date(timestamp * 1000).toISOString()
        })
        .eq('id', gameId)

    if (updateError) {
        console.error('Error updating game:', updateError)
        throw updateError
    }

    return smartContractGame
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