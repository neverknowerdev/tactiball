'use server'

import { Log } from 'viem';

/**
 * Sends webhook message to Supabase event-router function
 * This triggers the gameActionCommitted event processing
 */
export async function sendWebhookMessage(logs: Log[]) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

        if (!supabaseUrl) {
            console.error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
            return;
        }

        const webhookApiKey = process.env.WEBHOOK_API_KEY;
        if (!webhookApiKey) {
            console.error('Missing WEBHOOK_API_KEY environment variable');
            return;
        }

        if (logs.length == 0) {
            return;
        }

        // Construct the event-router function URL
        const eventRouterUrl = `${supabaseUrl}/functions/v1/event-router`;

        // Create webhook event structure that matches what the event-router expects
        // The gameActionCommitted event signature is: gameActionCommitted(uint256 indexed gameId, uint256 timestamp)
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const webhookEvent = {
            webhookId: `game-action-${logs[0].transactionHash}-${Date.now()}`,
            id: `game-action-${logs[0].transactionHash}-${Date.now()}`,
            createdAt: currentTimestamp,
            type: 'blockchain.logs',
            event: {
                data: {
                    block: {
                        hash: logs[0].blockHash,
                        number: logs[0].blockNumber,
                        timestamp: currentTimestamp,
                        logs: logs.map(log => ({
                            data: log.data, // Empty data for gameActionCommitted event
                            topics: log.topics,
                            index: log.logIndex,
                            transaction: {
                                hash: log.transactionHash,
                                index: log.transactionIndex,
                            }
                        }))
                    }
                },
                network: 'base'
            }
        };

        console.log('Sending webhook message to event-router:', eventRouterUrl);
        console.log('Webhook event:', JSON.stringify(webhookEvent, null, 2));

        const response = await fetch(eventRouterUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': webhookApiKey,
            },
            body: JSON.stringify(webhookEvent)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Webhook request failed with status ${response.status}:`, errorText);
            return;
        }

        const result = await response.json();
        console.log('Webhook message sent successfully:', result);

    } catch (error) {
        console.error('Error sending webhook message:', error);
    }
}
