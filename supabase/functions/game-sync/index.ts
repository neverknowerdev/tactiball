import { CONTRACT_ADDRESS, CONTRACT_ABI, AbiDecoder } from './abi-decoder.ts'
import { decodeEventLog, createPublicClient, http } from 'npm:viem@latest'
import { Game, GameState, GameStatus, TeamEnum, toGameStatus, toMoveType, toPosition, toTeamEnum } from './game.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'
import { base } from 'npm:viem/chains'

// Basescan API configuration
const BASESCAN_API_URL = 'https://api.basescan.org/api'
const API_KEY = Deno.env.get('BASESCAN_API_KEY') || 'YourApiKeyToken' // Get free API key from basescan.org

// NewGameState event topic (first topic is the event signature)
const NEW_GAME_STATE_TOPIC = '0xd5cf60e2827f0d74d283cf833034fca22e78825b9162d20f59c47e545579966f'

BigInt.prototype.toJSON = function () {
    return Number(this);
};

// Function to fetch NewGameState events from Basescan API
async function fetchNewGameStateEvents(game_id: number) {
    const gameIdHex = '0x' + BigInt(game_id).toString(16).padStart(64, '0')
    console.log(`Game ID in hex: ${gameIdHex}`)
    try {
        const url = new URL(BASESCAN_API_URL)
        url.searchParams.set('module', 'logs')
        url.searchParams.set('action', 'getLogs')
        url.searchParams.set('address', CONTRACT_ADDRESS)
        url.searchParams.set('topic0', NEW_GAME_STATE_TOPIC)
        url.searchParams.set('topic1', gameIdHex)
        url.searchParams.set('fromBlock', '0')
        url.searchParams.set('toBlock', 'latest')
        url.searchParams.set('apikey', API_KEY)

        console.log(`Fetching events from Basescan: ${url.toString()}`)

        const response = await fetch(url.toString())
        const data = await response.json()

        if (data.status !== '1') {
            console.error('Basescan API error:', data.message)
            return []
        }

        // Decode the raw log data
        const events = data.result.map((log: any) => {
            try {
                // Decode the event log using viem
                const decoded = decodeEventLog({
                    abi: CONTRACT_ABI,
                    data: log.data,
                    topics: log.topics
                })

                console.log('Decoded event:', decoded)

                // Extract the decoded arguments
                const args = decoded.args as any

                return {
                    blockNumber: log.blockNumber,
                    transactionHash: log.transactionHash,
                    logIndex: log.logIndex,
                    gameId: args.gameId?.toString() || parseInt(log.topics[1], 16).toString(),
                    stateType: args.stateType?.toString() || '0',
                    time: args.time?.toString() || '0',
                    clashRandomNumbers: args.clashRandomNumbers || [],
                    team1Actions: args.team1Actions || [],
                    team2Actions: args.team2Actions || [],
                    ballPosition: args.ballPosition || { x: 0, y: 0 },
                    ballOwner: args.ballOwner?.toString() || '0'
                }
            } catch (decodeError) {
                console.error('Error decoding event log:', decodeError)
                console.log('Raw log data:', log)

                // Fallback to basic parsing if decoding fails
                return {
                    blockNumber: log.blockNumber,
                    transactionHash: log.transactionHash,
                    logIndex: log.logIndex,
                    gameId: parseInt(log.topics[1], 16).toString(),
                    stateType: '0',
                    time: '0',
                    clashRandomNumbers: [],
                    team1Actions: [],
                    team2Actions: [],
                    ballPosition: { x: 0, y: 0 },
                    ballOwner: '0'
                }
            }
        })

        return events
    } catch (error) {
        console.error('Error fetching events from Basescan:', error)
        return []
    }
}

Deno.serve(async (req: Request) => {
    try {
        const body = await req.json()
        const { game_id } = body

        if (!game_id) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Missing game_id parameter'
            }), {
                headers: { 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        console.log(`Syncing game ${game_id}...`)

        // 1. Get current game info from smart contract
        const publicClient = createPublicClient({
            chain: base,
            transport: http(Deno.env.get('RPC_URL') || Deno.env.get('TESTNET_RPC_URL') || 'https://mainnet.base.org')
        })

        const gameInfo = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'getGame',
            args: [BigInt(game_id)]
        })

        console.log('Game info from contract:', gameInfo)

        // 2. Fetch all NewGameState events for this game using Basescan API
        const allEvents = await fetchNewGameStateEvents(game_id)

        if (allEvents.length === 0) {
            return new Response(JSON.stringify({
                success: false,
                error: 'GAME_NOT_FOUND',
                message: 'No NewGameState events found for this game'
            }), {
                headers: { 'Content-Type': 'application/json' },
                status: 404,
            })
        }

        const game = new Game(game_id)
        game.newGame(game_id, TeamEnum.TEAM1)

        allEvents.forEach((event) => {
            console.log('processing event', event)
            event.team1Actions.forEach((action: any) => {
                const player = game.team1.players[action.playerId]
                game.doPlayerMove(player, toMoveType(action.moveType), toPosition(Number(action.oldPosition.x), Number(action.oldPosition.y)), toPosition(Number(action.newPosition.x), Number(action.newPosition.y)))
            })
            game.commitMove(TeamEnum.TEAM1)

            console.log('team1 commited moves')
            event.team2Actions.forEach((action: any) => {
                const player = game.team2.players[action.playerId]
                game.doPlayerMove(player, toMoveType(action.moveType), toPosition(Number(action.oldPosition.x), Number(action.oldPosition.y)), toPosition(Number(action.newPosition.x), Number(action.newPosition.y)))
            })
            game.commitMove(TeamEnum.TEAM2)
            console.log('team2 commited moves')

            console.log('calculating new state')
            if (event.clashRandomNumbers.length > 0) {
                console.log('clash random numbers', event.clashRandomNumbers)
            }

            game.calculateNewState(event.clashRandomNumbers)
            console.log('new state calculated')
        })

        console.log('all moves processed', game.history.length);

        console.log(`Found ${allEvents.length} NewGameState events for game ${game_id}`)

        console.log('saving to DB..')


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

        // Get game from DB
        const { data: gameData, error: gameError } = await supabase
            .from('games')
            .select('*')
            .eq('id', game_id)
            .single();

        if (gameError) {
            throw new Error(`Error fetching game from DB: ${gameError.message}`);
        }

        if (!gameData) {
            throw new Error(`Game ${game_id} not found in DB`);
        }

        // [{"moveType": "pass", "playerId": 3, "teamEnum": "team2", "newPosition": {"x": 0, "y": 4}, "oldPosition": {"x": 2, "y": 2}}]
        let isTeamMovesCorrect = true;
        // if (gameData.team1_moves.length > 0) {
        //     try {
        //         gameData.team1_moves.forEach((move: any) => {
        //             game.doPlayerMove(game.team1.players[move.playerId], move.moveType, toPosition(Number(move.oldPosition.x), Number(move.oldPosition.y)), toPosition(Number(move.newPosition.x), Number(move.newPosition.y)))
        //         })
        //         game.commitMove(TeamEnum.TEAM1)
        //     } catch (error) {
        //         isTeamMovesCorrect = false;
        //         console.error('Error processing team1 moves:', error)
        //     }
        // }
        // if (gameData.team2_moves.length > 0) {
        //     try {
        //         gameData.team2_moves.forEach((move: any) => {
        //             game.doPlayerMove(game.team2.players[move.playerId], move.moveType, toPosition(Number(move.oldPosition.x), Number(move.oldPosition.y)), toPosition(Number(move.newPosition.x), Number(move.newPosition.y)))
        //         })
        //         game.commitMove(TeamEnum.TEAM2)
        //     } catch (error) {
        //         isTeamMovesCorrect = false;
        //         console.error('Error processing team2 moves:', error)
        //     }
        // }

        const winnerTeamEnum = toTeamEnum(Number(gameInfo.winner))

        const updateData = {
            history: game.history,
            team1_score: gameInfo.gameState.team1Score,
            team2_score: gameInfo.gameState.team2Score,
            status: toGameStatus(Number(gameInfo.status)).toString().toLowerCase(),
            winner: winnerTeamEnum === TeamEnum.TEAM1 ? gameInfo.team1.teamId : winnerTeamEnum === TeamEnum.TEAM2 ? gameInfo.team2.teamId : null,
            moves_made: gameInfo.gameState.movesMade,
            team1_moves: isTeamMovesCorrect ? gameData.team1_moves : [],
            team2_moves: isTeamMovesCorrect ? gameData.team2_moves : [],
            last_move_at: new Date(Number(gameInfo.gameState.lastMoveAt)).toISOString(),
        }

        console.log('updateData', updateData)

        console.log('saving to DB..')
        const { data, error } = await supabase
            .from('games')
            .update(updateData)
            .eq('id', game_id)
            .select();

        if (error) {
            throw new Error(error.message);
        }

        console.log('saved to DB..')

        return new Response(JSON.stringify({
            success: true,
            gameId: game_id,
            history: game.history,
            historySize: game.history.length
        }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error) {
        console.error('Error syncing game:', error)
        return new Response(JSON.stringify({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'Failed to sync game data from smart contract: ' + (error instanceof Error ? error.message : 'Unknown error'),
            stacktrace: error instanceof Error ? error.stack : 'No stack trace available'
        }), {
            headers: { 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})