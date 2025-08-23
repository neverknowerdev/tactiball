// WebSocket broadcasting service using Ably
// This service handles broadcasting messages to different channels

import Ably from 'https://esm.sh/ably@1.2.0'

export interface BroadcastMessage {
    type: string
    timestamp: number
    [key: string]: any
}

export class WebSocketService {
    private ably: Ably.Realtime

    constructor(ablyApiKey: string) {
        this.ably = new Ably.Realtime(ablyApiKey)
    }

    /**
     * Broadcast a message to a specific team channel
     */
    async broadcastToTeam(teamId: number, message: BroadcastMessage): Promise<void> {
        try {
            const channel = `team_${teamId}`
            await this.broadcastToChannel(channel, message)
            console.log(`Broadcasted to team channel ${channel}:`, message)
        } catch (error) {
            console.error(`Error broadcasting to team ${teamId}:`, error)
        }
    }

    /**
     * Broadcast a message to a specific game channel
     */
    async broadcastToGame(gameId: number, message: BroadcastMessage): Promise<void> {
        try {
            const channel = `game_${gameId}`
            await this.broadcastToChannel(channel, message)
            console.log(`Broadcasted to game channel ${channel}:`, message)
        } catch (error) {
            console.error(`Error broadcasting to game ${gameId}:`, error)
        }
    }

    /**
     * Broadcast a message to a general channel
     */
    async broadcastToGeneral(channel: string, message: BroadcastMessage): Promise<void> {
        try {
            await this.broadcastToChannel(channel, message)
            console.log(`Broadcasted to general channel ${channel}:`, message)
        } catch (error) {
            console.error(`Error broadcasting to general channel ${channel}:`, error)
        }
    }

    /**
     * Broadcast a message to multiple channels
     */
    async broadcastToMultiple(channels: string[], message: BroadcastMessage): Promise<void> {
        try {
            const promises = channels.map(channel => this.broadcastToChannel(channel, message))
            await Promise.all(promises)
            console.log(`Broadcasted to multiple channels:`, channels)
        } catch (error) {
            console.error(`Error broadcasting to multiple channels:`, error)
        }
    }

    /**
     * Broadcast to both team channels for a game
     */
    async broadcastToGameTeams(team1Id: number, team2Id: number, message: BroadcastMessage): Promise<void> {
        try {
            await this.broadcastToMultiple([`team_${team1Id}`, `team_${team2Id}`], message)
            console.log(`Broadcasted to both team channels for teams ${team1Id} and ${team2Id}`)
        } catch (error) {
            console.error(`Error broadcasting to game teams:`, error)
        }
    }

    /**
     * Core broadcasting function using Ably
     */
    private async broadcastToChannel(channel: string, message: BroadcastMessage): Promise<void> {
        try {
            // Add timestamp if not present
            if (!message.timestamp) {
                message.timestamp = Date.now()
            }

            // Get the channel from Ably
            const ablyChannel = this.ably.channels.get(channel)

            // Publish the message
            await ablyChannel.publish('game-event', message)

        } catch (error) {
            console.error(`Error broadcasting to channel ${channel}:`, error)
            throw error
        }
    }

    /**
     * Send a system notification to a specific channel
     */
    async sendSystemNotification(channel: string, notification: string, level: 'info' | 'warning' | 'error' = 'info'): Promise<void> {
        try {
            const message: BroadcastMessage = {
                type: 'SYSTEM_NOTIFICATION',
                notification: notification,
                level: level,
                timestamp: Date.now()
            }

            await this.broadcastToChannel(channel, message)
            console.log(`Sent system notification to channel ${channel}:`, notification)
        } catch (error) {
            console.error(`Error sending system notification to channel ${channel}:`, error)
        }
    }

    /**
     * Close the Ably connection
     */
    async close(): Promise<void> {
        try {
            await this.ably.close()
            console.log('Ably connection closed')
        } catch (error) {
            console.error('Error closing Ably connection:', error)
        }
    }
}
