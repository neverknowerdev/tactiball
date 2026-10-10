import { Log } from 'viem';
import { processEventRouter } from './event-router';

export interface WebhookEvent {
    webhookId: string;
    id: string;
    createdAt: string;
    type: string;
    event: {
        data: {
            block: {
                hash: string;
                number: number;
                timestamp: number;
                logs: Array<{
                    data: string;
                    topics: string[];
                    index: number;
                    transaction: {
                        hash: string;
                        nonce: number;
                        index: number;
                        from: {
                            address: string;
                        };
                        to: {
                            address: string;
                        };
                        value: string;
                        gasPrice: string;
                        maxFeePerGas: string;
                        maxPriorityFeePerGas: string;
                        gas: number;
                        status: number;
                        gasUsed: number;
                        cumulativeGasUsed: number;
                        effectiveGasPrice: string;
                        createdContract: string | null;
                    };
                }>;
            };
        };
        sequenceNumber: string;
        network: string;
    };
}
/**
 * Processes webhook events directly using the event-router function
 * This triggers the gameActionCommitted event processing
 */
export async function sendWebhookMessage(logs: Log[]): Promise<{ success: boolean; error?: string }> {
    try {
        if (logs.length == 0) {
            return { success: false, error: 'No logs provided' };
        }

        // Create webhook event structure that matches what the event-router expects
        // The gameActionCommitted event signature is: gameActionCommitted(uint256 indexed gameId, uint256 timestamp)
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const webhookEvent = {
            webhookId: `game-action-${logs[0].transactionHash}-${Date.now()}`,
            id: `game-action-${logs[0].transactionHash}-${Date.now()}`,
            createdAt: currentTimestamp.toString(),
            type: 'blockchain.logs',
            event: {
                data: {
                    block: {
                        hash: logs[0].blockHash || '',
                        number: Number(logs[0].blockNumber),
                        timestamp: currentTimestamp,
                        logs: logs.map(log => ({
                            data: log.data, // Empty data for gameActionCommitted event
                            topics: log.topics,
                            index: Number(log.logIndex),
                            account: {
                                address: ''
                            },
                            transaction: {
                                hash: log.transactionHash || '',
                                nonce: 0,
                                index: Number(log.transactionIndex),
                                from: {
                                    address: ''
                                },
                                to: {
                                    address: ''
                                },
                                value: '0',
                                gasPrice: '0',
                                maxFeePerGas: '0',
                                maxPriorityFeePerGas: '0',
                                gas: 0,
                                status: 1,
                                gasUsed: 0,
                                cumulativeGasUsed: 0,
                                effectiveGasPrice: '0',
                                createdContract: null
                            }
                        }))
                    }
                },
                sequenceNumber: '1',
                network: 'base'
            }
        };

        console.log('Processing webhook event directly:', webhookEvent.webhookId);
        console.log('Webhook event:', JSON.stringify(webhookEvent, null, 2));

        // Process the event directly using the event-router function
        const result = await processEventRouter(webhookEvent);

        if (result.success) {
            console.log('Webhook event processed successfully');
        } else {
            console.error('Error processing webhook event:', result.error);
        }

        return result;

    } catch (error) {
        console.error('Error processing webhook message:', error);
        return { success: false, error: 'Error processing webhook message' };
    }
}
