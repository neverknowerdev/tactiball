import Ably from 'ably';

// Initialize Ably client
// You'll need to add ABLY_API_KEY to your environment variables
export const ably = new Ably.Realtime({
    key: process.env.NEXT_PUBLIC_ABLY_API_KEY || 'your-ably-api-key',
    clientId: 'chessball-client'
});

// Channel names for different game features
export const CHANNELS = {
    OPPONENT_FINDING: 'opponent-finding',
    GAME_CHANNEL: 'game'
} as const;

// Types for presence data
export interface OpponentFindingPresence {
    team_name: string;
    team_id: number;
    user_wallet_address: string;
    username: string;
    elo_rating: number;
    timestamp: number;
}

// Helper function to get the opponent finding channel
export const getOpponentFindingChannel = () => {
    return ably.channels.get(CHANNELS.OPPONENT_FINDING);
};

// Helper function to join opponent finding room with presence
export const joinOpponentFindingRoom = async (presenceData: OpponentFindingPresence) => {
    const channel = getOpponentFindingChannel();

    try {
        // Enter presence with user info
        await channel.presence.enter(presenceData);
        console.log('Joined opponent finding room with presence:', presenceData);

        return channel;
    } catch (error) {
        console.error('Error joining opponent finding room:', error);
        throw error;
    }
};

// Helper function to leave opponent finding room
export const leaveOpponentFindingRoom = async () => {
    const channel = getOpponentFindingChannel();

    try {
        await channel.presence.leave();
        console.log('Left opponent finding room');
    } catch (error) {
        console.error('Error leaving opponent finding room:', error);
    }
};

// Helper function to get all current members in the channel
export const getCurrentChannelMembers = async (): Promise<OpponentFindingPresence[]> => {
    const channel = getOpponentFindingChannel();

    try {
        const members = await channel.presence.get();
        console.log('Current channel members:', members);
        return members.map((member: any) => member.data);
    } catch (error) {
        console.error('Error getting channel members:', error);
        return [];
    }
};

// Team channel management
export class TeamChannelManager {
    private teamChannel: any = null;
    private isConnected: boolean = false;
    private teamId: number | null = null;

    /**
     * Subscribe to a team's channel
     */
    async subscribeToTeam(teamId: number): Promise<void> {
        try {
            // Unsubscribe from previous team channel if exists
            if (this.teamChannel) {
                await this.unsubscribeFromTeam();
            }

            this.teamId = teamId;
            const channelName = `team_${teamId}`;
            this.teamChannel = ably.channels.get(channelName);

            // Subscribe to specific game events
            this.teamChannel.subscribe('game-event', (message: any) => {
                console.log(`[Team ${teamId}] Game event received:`, {
                    type: message.data.type,
                    data: message.data,
                    timestamp: message.data.timestamp
                });

                // Dispatch custom event to the page level
                const customEvent = new CustomEvent('game-event', { detail: message.data });
                window.dispatchEvent(customEvent);
            });

            this.isConnected = true;
            console.log(`[Team ${teamId}] Successfully subscribed to team channel: ${channelName}`);
        } catch (error) {
            console.error(`[Team ${teamId}] Error subscribing to team channel:`, error);
            throw error;
        }
    }

    /**
     * Unsubscribe from the current team channel
     */
    async unsubscribeFromTeam(): Promise<void> {
        if (this.teamChannel) {
            try {
                this.teamChannel.unsubscribe();
                this.teamChannel = null;
                this.isConnected = false;
                console.log(`[Team ${this.teamId}] Unsubscribed from team channel`);
                this.teamId = null;
            } catch (error) {
                console.error(`[Team ${this.teamId}] Error unsubscribing from team channel:`, error);
            }
        }
    }

    /**
     * Check if currently connected to a team channel
     */
    isConnectedToTeam(): boolean {
        return this.isConnected;
    }

    /**
     * Get current team ID
     */
    getCurrentTeamId(): number | null {
        return this.teamId;
    }

    /**
     * Get current team channel
     */
    getTeamChannel(): any {
        return this.teamChannel;
    }
}

// Create a singleton instance for team channel management
export const teamChannelManager = new TeamChannelManager();

// Helper function to subscribe to team channel
export const subscribeToTeamChannel = async (teamId: number): Promise<void> => {
    return teamChannelManager.subscribeToTeam(teamId);
};

// Helper function to unsubscribe from team channel
export const unsubscribeFromTeamChannel = async (): Promise<void> => {
    return teamChannelManager.unsubscribeFromTeam();
};

// Game channel management
export class GameChannelManager {
    private gameChannel: any = null;
    private isConnected: boolean = false;
    private gameId: string | null = null;

    /**
     * Subscribe to a specific game's channel
     */
    async subscribeToGame(gameId: string): Promise<void> {
        try {
            // Unsubscribe from previous game channel if exists
            if (this.gameChannel) {
                await this.unsubscribeFromGame();
            }

            this.gameId = gameId;
            const channelName = `${CHANNELS.GAME_CHANNEL}_${gameId}`;
            this.gameChannel = ably.channels.get(channelName);

            this.gameChannel.subscribe('game-event', (message: any) => {
                console.log(`[Game ${gameId}] Game event received:`, {
                    type: message.data.type,
                    data: message.data,
                    timestamp: message.data.timestamp
                });

                // Dispatch custom event to the page level
                const customEvent = new CustomEvent('game-event', { detail: message.data });
                window.dispatchEvent(customEvent);
            });

            this.isConnected = true;
            console.log(`[Game ${gameId}] Successfully subscribed to game channel: ${channelName}`);
        } catch (error) {
            console.error(`[Game ${gameId}] Error subscribing to game channel:`, error);
            throw error;
        }
    }

    /**
     * Unsubscribe from the current game channel
     */
    async unsubscribeFromGame(): Promise<void> {
        if (this.gameChannel) {
            try {
                this.gameChannel.unsubscribe();
                this.gameChannel = null;
                this.isConnected = false;
                console.log(`[Game ${this.gameId}] Unsubscribed from game channel`);
                this.gameId = null;
            } catch (error) {
                console.error(`[Game ${this.gameId}] Error unsubscribing from game channel:`, error);
            }
        }
    }

    /**
     * Check if currently connected to a game channel
     */
    isConnectedToGame(): boolean {
        return this.isConnected;
    }

    /**
     * Get current game ID
     */
    getCurrentGameId(): string | null {
        return this.gameId;
    }

    /**
     * Get current game channel
     */
    getGameChannel(): any {
        return this.gameChannel;
    }

    /**
     * Publish a message to the current game channel
     */
    async publishGameMessage(eventType: string, data: any): Promise<void> {
        if (this.gameChannel && this.isConnected) {
            try {
                await this.gameChannel.publish(eventType, {
                    ...data,
                    timestamp: Date.now()
                });
                console.log(`[Game ${this.gameId}] Published ${eventType}:`, data);
            } catch (error) {
                console.error(`[Game ${this.gameId}] Error publishing ${eventType}:`, error);
                throw error;
            }
        } else {
            throw new Error('Not connected to any game channel');
        }
    }
}

// Create a singleton instance for game channel management
export const gameChannelManager = new GameChannelManager();

// Helper function to subscribe to game channel
export const subscribeToGame = async (gameId: string): Promise<void> => {
    return gameChannelManager.subscribeToGame(gameId);
};

// Helper function to unsubscribe from game channel
export const unsubscribeFromGame = async (): Promise<void> => {
    return gameChannelManager.unsubscribeFromGame();
};
