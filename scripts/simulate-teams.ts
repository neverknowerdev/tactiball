#!/usr/bin/env tsx

/**
 * Enhanced script to simulate TeamCreated events for existing teams
 * Fetches real team data from smart contract and sends events to event-router
 */

import { createPublicClient, http, encodeAbiParameters, parseAbiItem, encodeEventTopics } from 'viem';
import { base } from 'viem/chains';
import { CONTRACT_ADDRESS } from '../frontend/lib/contract';
import gameArtifact from '../artifacts/contracts/Game.sol/ChessBallGame.json';

// Configuration - UPDATE THESE VALUES
const RPC_URL = process.env.RPC_URL || process.env.TESTNET_RPC_URL || 'https://mainnet.base.org'; // Replace with your RPC URL

// Create Viem client
const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL)
});

// Types
interface TeamData {
    teamId: number;
    owner: string;
    name: string;
    country: number;
    timestamp: number;
}

interface WebhookEvent {
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
                    account: {
                        address: string;
                    };
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
            sequenceNumber: string;
            network: string;
        };
    };
}

// Function to fetch team data from smart contract
async function fetchTeamFromContract(teamId: number): Promise<TeamData | null> {
    try {
        console.log(`🔍 Fetching team ${teamId} from smart contract...`);

        const teamData = await publicClient.readContract({
            address: CONTRACT_ADDRESS as `0x${string}`,
            abi: gameArtifact.abi as any,
            functionName: 'getTeam',
            args: [BigInt(teamId)]
        }) as any; // Type assertion for complex tuple return

        if (!teamData) {
            throw new Error(`No team found with ID ${teamId}`);
        }

        console.log(`✅ Team ${teamId} found: ${teamData.name}`);

        return {
            teamId: Number(teamData.id),
            owner: teamData.wallet,
            name: teamData.name,
            country: Number(teamData.country),
            timestamp: Math.floor(Date.now() / 1000) - 86400 // Default to 1 day ago
        };

    } catch (error) {
        console.error(`❌ Error fetching team ${teamId}:`, error instanceof Error ? error.message : 'Unknown error');
        return null;
    }
}

// Function to create a simulated webhook event
function createWebhookEvent(team: TeamData): WebhookEvent {
    // Create topics: [eventSignature, indexed teamId, indexed owner]
    const eventSignature = encodeEventTopics({
        abi: gameArtifact.abi as any,
        eventName: 'TeamCreated'
    });

    const topics = [
        eventSignature[0], // Event signature
        `0x${BigInt(team.teamId).toString(16).padStart(64, '0')}`, // indexed teamId
        `0x${team.owner.slice(2).padStart(64, '0')}`   // indexed owner
    ];

    const encodedData = encodeAbiParameters(
        [
            { name: 'name', type: 'string' },
            { name: 'country', type: 'uint8' }
        ],
        [team.name, team.country]
    );

    return {
        webhookId: `simulated-${team.teamId}`,
        id: `simulated-${team.teamId}`,
        createdAt: new Date().toISOString(),
        type: "block",
        event: {
            data: {
                block: {
                    hash: `0x${Math.random().toString(16).slice(2, 66)}`,
                    number: Math.floor(Math.random() * 1000000),
                    timestamp: team.timestamp,
                    logs: [
                        {
                            data: encodedData,
                            topics: topics,
                            index: 0,
                            account: {
                                address: CONTRACT_ADDRESS
                            },
                            transaction: {
                                hash: `0x${Math.random().toString(16).slice(2, 66)}`,
                                nonce: 0,
                                index: 0,
                                from: {
                                    address: team.owner
                                },
                                to: {
                                    address: CONTRACT_ADDRESS
                                },
                                value: "0x0",
                                gasPrice: "0x0",
                                maxFeePerGas: "0x0",
                                maxPriorityFeePerGas: "0x0",
                                gas: 0,
                                status: 1,
                                gasUsed: 0,
                                cumulativeGasUsed: 0,
                                effectiveGasPrice: "0x0",
                                createdContract: null
                            }
                        }
                    ]
                },
                sequenceNumber: "1",
                network: "base"
            }
        }
    };
}

// Function to send event to event-router
async function sendEventToRouter(webhookEvent: WebhookEvent, eventRouterUrl: string): Promise<void> {
    try {
        console.log(`📤 Sending TeamCreated event for team ${webhookEvent.event.data.block.logs[0].topics[1]}`);

        const response = await fetch(eventRouterUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(webhookEvent)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log(`✅ Success: ${JSON.stringify(result)}`);

    } catch (error) {
        console.error(`❌ Error sending event:`, error instanceof Error ? error.message : 'Unknown error');
    }
}

// Function to show usage information
function showUsage(): void {
    console.log(`
🚀 Enhanced Team Event Simulation Script

Usage:
  tsx scripts/simulate-teams.ts [teamIds...] [eventRouterUrl]

Examples:
  # Simulate teams 1, 2, 3 with default local URL
  tsx scripts/simulate-teams.ts 1 2 3

  # Simulate team 5 with custom event-router URL
  tsx scripts/simulate-teams.ts 5 "https://your-project.supabase.co/functions/v1/event-router"

  # Simulate multiple teams with custom URL
  tsx scripts/simulate-teams.ts 1 2 3 4 5 "https://your-project.supabase.co/functions/v1/event-router"

Configuration:
  Update CONTRACT_ADDRESS and RPC_URL in the script before running.

Requirements:
  - Smart contract must be deployed and accessible
  - Teams must exist on the smart contract
  - Event-router function must be running
`);
}

// Main function
async function main(): Promise<void> {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        showUsage();
        return;
    }

    // Check if last argument is a URL
    let eventRouterUrl = 'http://localhost:54321/functions/v1/event-router';
    let teamIds = args;

    if (args[args.length - 1].startsWith('http')) {
        eventRouterUrl = args[args.length - 1];
        teamIds = args.slice(0, -1);
    }

    // Validate team IDs
    const validTeamIds = teamIds
        .map(id => parseInt(id))
        .filter(id => !isNaN(id) && id > 0);

    if (validTeamIds.length === 0) {
        console.error('❌ No valid team IDs provided');
        showUsage();
        return;
    }

    console.log(`🚀 Simulating TeamCreated events for ${validTeamIds.length} teams`);
    console.log(`📡 Sending to: ${eventRouterUrl}`);
    console.log(`🔗 Contract: ${CONTRACT_ADDRESS}`);
    console.log(`🌐 RPC: ${RPC_URL}`);
    console.log('');

    // Fetch teams and send events
    const successfulTeams: number[] = [];
    const failedTeams: number[] = [];

    for (const teamId of validTeamIds) {
        const team = await fetchTeamFromContract(teamId);

        if (team) {
            const webhookEvent = createWebhookEvent(team);
            await sendEventToRouter(webhookEvent, eventRouterUrl);
            successfulTeams.push(teamId);

            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
            failedTeams.push(teamId);
        }
    }

    // Summary
    console.log('');
    console.log('📊 Summary:');
    console.log(`✅ Successful: ${successfulTeams.length} teams`);
    if (successfulTeams.length > 0) {
        console.log(`   Teams: ${successfulTeams.join(', ')}`);
    }

    if (failedTeams.length > 0) {
        console.log(`❌ Failed: ${failedTeams.length} teams`);
        console.log(`   Teams: ${failedTeams.join(', ')}`);
    }

    if (successfulTeams.length > 0) {
        console.log('🎉 Events sent successfully!');
    }
}

// Run the script
if (require.main === module) {
    main().catch(console.error);
}
