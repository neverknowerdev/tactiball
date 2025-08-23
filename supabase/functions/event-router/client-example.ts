// Client example for connecting to Ably channels
// This shows how to receive real-time updates from the contract events function

import Ably from 'ably'

// Initialize Ably client
const ably = new Ably.Realtime('your-ably-api-key')

// Example: Subscribe to team updates
function subscribeToTeamUpdates(teamId: number) {
    const teamChannel = ably.channels.get(`team_${teamId}`)

    teamChannel.subscribe('game-event', (message) => {
        const data = message.data
        console.log(`Team ${teamId} update:`, data)

        switch (data.type) {
            case 'TEAM_CREATED':
                console.log(`Team ${data.teamId} created: ${data.name}`)
                break
            case 'GAME_STARTED':
                console.log(`Team ${teamId} started game ${data.gameId}`)
                break
            case 'GAME_FINISHED':
                console.log(`Team ${teamId} finished game ${data.gameId}`)
                break
            default:
                console.log(`Unknown event type: ${data.type}`)
        }
    })

    return teamChannel
}

// Example: Subscribe to game updates
function subscribeToGameUpdates(gameId: number) {
    const gameChannel = ably.channels.get(`game_${gameId}`)

    gameChannel.subscribe('game-event', (message) => {
        const data = message.data
        console.log(`Game ${gameId} update:`, data)

        switch (data.type) {
            case 'GAME_STARTED':
                console.log(`Game ${gameId} started between teams ${data.team1Id} and ${data.team2Id}`)
                break
            case 'GAME_ACTION_COMMITTED':
                console.log(`Game ${gameId} action committed at ${new Date(data.timestamp)}`)
                break
            case 'NEW_GAME_STATE':
                console.log(`Game ${gameId} new state at time ${data.time}`)
                break
            case 'GAME_FINISHED':
                console.log(`Game ${gameId} finished. Winner: ${data.winner}, Reason: ${data.finishReason}`)
                break
            default:
                console.log(`Unknown event type: ${data.type}`)
        }
    })

    return gameChannel
}

// Example: Subscribe to general game requests
function subscribeToGameRequests() {
    const generalChannel = ably.channels.get('game_requests')

    generalChannel.subscribe('game-event', (message) => {
        const data = message.data
        console.log('Game request update:', data)

        if (data.type === 'GAME_REQUEST_CREATED') {
            console.log(`New game request created: ${data.requestId}`)
        }
    })

    return generalChannel
}

// Example: Subscribe to multiple channels
function subscribeToAllUpdates(teamId: number, gameId: number) {
    const teamChannel = subscribeToTeamUpdates(teamId)
    const gameChannel = subscribeToGameUpdates(gameId)
    const generalChannel = subscribeToGameRequests()

    // Return channels for cleanup
    return {
        teamChannel,
        gameChannel,
        generalChannel,
        cleanup: () => {
            teamChannel.unsubscribe()
            gameChannel.unsubscribe()
            generalChannel.unsubscribe()
        }
    }
}

// Example usage
const subscriptions = subscribeToAllUpdates(123, 456)

// Cleanup when done
// subscriptions.cleanup()

// Example: Handle connection state
ably.connection.on('connected', () => {
    console.log('Connected to Ably')
})

ably.connection.on('disconnected', () => {
    console.log('Disconnected from Ably')
})

ably.connection.on('failed', () => {
    console.log('Failed to connect to Ably')
})

// Example: Error handling
ably.connection.on('failed', (error) => {
    console.error('Ably connection failed:', error)
})

// Example: Reconnection
ably.connection.on('disconnected', () => {
    console.log('Disconnected, attempting to reconnect...')
})

ably.connection.on('connected', () => {
    console.log('Reconnected to Ably')
})
