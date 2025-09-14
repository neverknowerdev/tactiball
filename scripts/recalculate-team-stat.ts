import { createPublicClient, http, decodeEventLog, toEventHash } from 'viem';
import { base } from 'viem/chains';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Load deployment configuration
const deploymentPath = path.join(__dirname, '..', 'deployment.json');
const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));

// Import the ABI from the artifact file
const artifactPath = path.join(__dirname, '..', 'artifacts', 'contracts', 'Game.sol', 'ChessBallGame.json');
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
const CONTRACT_ABI = artifact.abi;

// Basescan API configuration
const BASESCAN_API_URL = 'https://api.basescan.org/api';
const API_KEY = process.env.BASESCAN_API_KEY || 'YourApiKeyToken';

if (API_KEY === 'YourApiKeyToken') {
    console.warn('⚠️  BASESCAN_API_KEY not set. Some events may not be fetched properly.');
}

// Event signatures using viem helper
const GAME_STARTED_TOPIC = toEventHash('event GameStarted(uint256 indexed gameId, uint256 indexed team1id, uint256 indexed team2id, uint8 teamWithBall)');
const GAME_FINISHED_TOPIC = toEventHash('event GameFinished(uint256 indexed gameId, uint8 winner, uint8 finishReason)');
const GOAL_SCORED_TOPIC = toEventHash('event GoalScored(uint256 indexed gameId, uint8 scoringTeam)');
const ELO_UPDATED_TOPIC = toEventHash('event EloUpdated(uint256 indexed teamId, uint256 gameId, uint64 eloRating)');
const TEAM_CREATED_TOPIC = toEventHash('event TeamCreated(uint256 indexed teamId, address indexed owner, string name, uint8 country)');

// Database interface
interface DatabaseGame {
    id: number;
    team1: number;
    team2: number;
    team1_score: number;
    team2_score: number;
    winner: number | null;
    team1_info: any;
    team2_info: any;
    created_at: string;
    last_move_at: string | null;
}

interface DatabaseTeam {
    id: number;
    name: string;
    country: number;
    elo_rating: number;
    active_game_id: number | null;
    primary_wallet: string;
}

interface ContractEvent {
    blockNumber: string;
    transactionHash: string;
    logIndex: string;
    topics: string[];
    data: string;
    timeStamp: string;
}

// Initialize Supabase client
function createSupabaseClient() {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase environment variables');
    }

    return createClient(supabaseUrl, supabaseKey);
}

// Initialize Viem client
function createViemClient() {
    const rpcUrl = process.env.BASE_MAINNET_RPC_URL || process.env.RPC_URL || 'https://mainnet.base.org';

    return createPublicClient({
        chain: base,
        transport: http(rpcUrl)
    });
}

// Convert timestamp to block number (approximate)
async function getBlockNumberFromTimestamp(client: any, timestamp: number): Promise<number> {
    try {
        // Get current block to estimate
        const currentBlock = await client.getBlockNumber();
        const currentBlockData = await client.getBlock({ blockNumber: currentBlock });
        const currentTimestamp = Number(currentBlockData.timestamp);

        // Rough estimation: 2 seconds per block on Base
        const blockTime = 2;
        const blocksDiff = Math.floor((currentTimestamp - timestamp) / blockTime);
        return Number(currentBlock) - blocksDiff;
    } catch (error) {
        console.warn('Could not estimate block number from timestamp, using 0');
        return 0;
    }
}

// Fetch events from Basescan API
async function fetchEventsFromBasescan(
    contractAddress: string,
    teamId: number,
    fromDate: string,
    toDate: string
): Promise<ContractEvent[]> {
    const allEvents: ContractEvent[] = [];

    // Fetch different event types
    const eventTopics = [
        { topic: GAME_STARTED_TOPIC, name: 'GameStarted' },
        { topic: GAME_FINISHED_TOPIC, name: 'GameFinished' },
        { topic: ELO_UPDATED_TOPIC, name: 'EloUpdated' },
        { topic: TEAM_CREATED_TOPIC, name: 'TeamCreated' },
        { topic: GOAL_SCORED_TOPIC, name: 'GoalScored' }
    ];

    for (const eventType of eventTopics) {
        try {
            const url = new URL(BASESCAN_API_URL);
            url.searchParams.set('module', 'logs');
            url.searchParams.set('action', 'getLogs');
            url.searchParams.set('address', contractAddress);
            url.searchParams.set('topic0', eventType.topic);
            url.searchParams.set('fromDate', fromDate);
            url.searchParams.set('toDate', toDate);
            url.searchParams.set('apikey', API_KEY);

            console.log(`Fetching ${eventType.name} events from ${fromDate} to ${toDate}...`);

            const response = await fetch(url.toString());
            const data = await response.json();

            if (data.status !== '1') {
                console.warn(`Basescan API error for ${eventType.name}:`, data.message || 'Unknown error');
                if (data.message && (data.message.includes('No records found') || data.message.includes('NOTOK'))) {
                    console.log(`  ℹ️  No ${eventType.name} events found in the specified range`);
                }
                continue;
            }

            if (data.result && Array.isArray(data.result)) {
                allEvents.push(...data.result);
                console.log(`Found ${data.result.length} ${eventType.name} events`);
            }
        } catch (error) {
            console.error(`Error fetching ${eventType.name} events:`, error);
            // Continue with other event types even if one fails
        }
    }

    return allEvents;
}

// Decode event data
function decodeEvent(event: ContractEvent): any {
    try {
        const decoded = decodeEventLog({
            abi: CONTRACT_ABI,
            data: event.data as `0x${string}`,
            topics: event.topics as [`0x${string}`, ...`0x${string}`[]]
        });
        return decoded;
    } catch (error) {
        console.warn('Error decoding event:', error);
        return null;
    }
}

// Get team information from smart contract
async function getTeamFromContract(client: any, contractAddress: string, teamId: number): Promise<any | null> {
    try {
        console.log(`📡 Fetching team ${teamId} from smart contract...`);
        const teamData = await client.readContract({
            address: contractAddress as `0x${string}`,
            abi: CONTRACT_ABI,
            functionName: 'getTeam',
            args: [BigInt(teamId)]
        }) as any;

        console.log(`✅ Team data retrieved from contract:`, {
            id: teamData.id,
            name: teamData.name,
            wallet: teamData.wallet,
            country: teamData.country,
            eloRating: teamData.eloRating,
            registeredAt: teamData.registeredAt,
            totalGames: teamData.totalGames,
            hasActiveGame: teamData.hasActiveGame,
            gameRequestId: teamData.gameRequestId
        });

        return teamData;
    } catch (error) {
        console.error('Error fetching team from contract:', error);
        return null;
    }
}

// Get team information from database
async function getTeamInfo(supabase: any, teamId: number): Promise<DatabaseTeam | null> {
    const { data, error } = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .single();

    if (error) {
        console.error('Error fetching team from database:', error);
        return null;
    }

    return data;
}

// Get games for a team within date range
async function getTeamGames(
    supabase: any,
    teamId: number,
    dateFrom: string,
    dateTo: string
): Promise<DatabaseGame[]> {
    const { data, error } = await supabase
        .from('games')
        .select('*')
        .or(`team1.eq.${teamId},team2.eq.${teamId}`)
        .gte('created_at', dateFrom)
        .lte('created_at', dateTo)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching team games:', error);
        return [];
    }

    return data || [];
}

// Update game in database
async function updateGame(supabase: any, gameId: number, updates: Partial<DatabaseGame>): Promise<boolean> {
    const { error } = await supabase
        .from('games')
        .update(updates)
        .eq('id', gameId);

    if (error) {
        console.error('Error updating game:', error);
        return false;
    }

    return true;
}

// Update team in database
async function updateTeam(supabase: any, teamId: number, updates: Partial<DatabaseTeam>): Promise<boolean> {
    const { error } = await supabase
        .from('teams')
        .update(updates)
        .eq('id', teamId);

    if (error) {
        console.error('Error updating team:', error);
        return false;
    }

    return true;
}

// Create or update team in database based on contract data
async function syncTeamFromContract(
    supabase: any,
    contractTeamData: any,
    existingDbTeam: DatabaseTeam | null
): Promise<DatabaseTeam | null> {
    try {
        const teamData = {
            id: Number(contractTeamData.id),
            name: contractTeamData.name,
            country: Number(contractTeamData.country),
            elo_rating: Number(contractTeamData.eloRating),
            primary_wallet: contractTeamData.wallet,
            active_game_id: contractTeamData.hasActiveGame ? 1 : null, // We'll need to find the actual active game ID
            created_at: new Date(Number(contractTeamData.registeredAt) * 1000).toISOString()
        };

        if (existingDbTeam) {
            // Update existing team
            console.log(`🔄 Updating team ${teamData.id} in database with contract data...`);

            const updates: Partial<DatabaseTeam> = {};
            if (existingDbTeam.name !== teamData.name) updates.name = teamData.name;
            if (existingDbTeam.country !== teamData.country) updates.country = teamData.country;
            if (existingDbTeam.elo_rating !== teamData.elo_rating) updates.elo_rating = teamData.elo_rating;
            if (existingDbTeam.primary_wallet !== teamData.primary_wallet) updates.primary_wallet = teamData.primary_wallet;
            if (existingDbTeam.active_game_id !== teamData.active_game_id) updates.active_game_id = teamData.active_game_id;

            if (Object.keys(updates).length > 0) {
                console.log(`📝 Team updates needed:`, updates);
                const success = await updateTeam(supabase, teamData.id, updates);
                if (success) {
                    console.log(`✅ Team ${teamData.id} updated successfully`);
                    return { ...existingDbTeam, ...updates };
                } else {
                    console.log(`❌ Failed to update team ${teamData.id}`);
                    return existingDbTeam;
                }
            } else {
                console.log(`✅ Team ${teamData.id} is already up to date`);
                return existingDbTeam;
            }
        } else {
            // Create new team
            console.log(`🆕 Creating new team ${teamData.id} in database...`);

            const { data, error } = await supabase
                .from('teams')
                .insert([teamData])
                .select()
                .single();

            if (error) {
                console.error('Error creating team:', error);
                return null;
            }

            console.log(`✅ Team ${teamData.id} created successfully`);
            return data;
        }
    } catch (error) {
        console.error('Error syncing team from contract:', error);
        return existingDbTeam;
    }
}

// Main function to recalculate team statistics
async function recalculateTeamStats(
    teamId: number,
    dateFrom: string,
    dateTo: string,
    contractAddress: string
): Promise<void> {
    console.log(`\n🔄 Recalculating team statistics for team ${teamId}`);
    console.log(`📅 Date range: ${dateFrom} to ${dateTo}`);
    console.log(`📍 Contract: ${contractAddress}`);

    // Initialize clients
    const supabase = createSupabaseClient();
    const viemClient = createViemClient();

    // First, get team information from smart contract
    console.log(`\n📡 Fetching team data from smart contract...`);
    const contractTeamData = await getTeamFromContract(viemClient, contractAddress, teamId);
    if (!contractTeamData) {
        throw new Error(`Team ${teamId} not found in smart contract`);
    }

    // Get team information from database
    const dbTeam = await getTeamInfo(supabase, teamId);

    // Sync team data from contract to database
    console.log(`\n🔄 Syncing team data from contract to database...`);
    const team = await syncTeamFromContract(supabase, contractTeamData, dbTeam);
    if (!team) {
        throw new Error(`Failed to sync team ${teamId} data`);
    }

    console.log(`\n👥 Team: ${team.name} (ID: ${team.id})`);
    console.log(`🏆 Current ELO: ${team.elo_rating}`);
    console.log(`🌐 Wallet: ${team.primary_wallet}`);
    console.log(`🏳️  Country: ${team.country}`);
    console.log(`🎮 Active Game: ${team.active_game_id ? 'Yes' : 'No'}`);

    console.log(`\n📊 Fetching events from ${dateFrom} to ${dateTo}...`);

    // Fetch all events from Basescan using date range
    const events = await fetchEventsFromBasescan(contractAddress, teamId, dateFrom, dateTo);
    console.log(`\n📡 Found ${events.length} total events`);

    if (events.length === 0) {
        console.log(`\n⚠️  No events found from Basescan API. This could mean:`);
        console.log(`  - No events exist for this team in the specified date range`);
        console.log(`  - BASESCAN_API_KEY is not set or invalid`);
        console.log(`  - The contract address is incorrect`);
        console.log(`  - The date range is outside the contract's deployment period`);
        console.log(`\nContinuing with database-only processing...`);
    }

    // Get existing games for the team
    const existingGames = await getTeamGames(supabase, teamId, dateFrom, dateTo);
    console.log(`\n🎮 Found ${existingGames.length} existing games in database`);

    // Process events and collect updates
    const gameUpdates = new Map<number, Partial<DatabaseGame>>();
    const teamUpdates: Partial<DatabaseTeam> = {};

    let gamesProcessed = 0;

    for (const event of events) {
        const decoded = decodeEvent(event);
        if (!decoded) continue;

        const eventName = decoded.eventName;
        const args = decoded.args as any;

        console.log(`\n🔍 Processing ${eventName} event...`);

        switch (eventName) {
            case 'GameStarted': {
                const gameId = Number(args.gameId);
                const team1Id = Number(args.team1id);
                const team2Id = Number(args.team2id);

                // Check if this game involves our team
                if (team1Id !== teamId && team2Id !== teamId) continue;

                console.log(`  🎮 Game ${gameId} started: Team ${team1Id} vs Team ${team2Id}`);

                // Find existing game in database
                const existingGame = existingGames.find(g => g.id === gameId);
                if (existingGame) {
                    gamesProcessed++;

                    // Collect team info updates
                    if (!gameUpdates.has(gameId)) {
                        gameUpdates.set(gameId, {});
                    }
                    gameUpdates.get(gameId)!.team1 = team1Id;
                    gameUpdates.get(gameId)!.team2 = team2Id;
                }
                break;
            }

            case 'GameFinished': {
                const gameId = Number(args.gameId);
                const winner = Number(args.winner);

                console.log(`  🏁 Game ${gameId} finished, winner: ${winner}`);

                // Find existing game in database
                const existingGame = existingGames.find(g => g.id === gameId);
                if (existingGame) {
                    gamesProcessed++;

                    // Collect winner update
                    if (!gameUpdates.has(gameId)) {
                        gameUpdates.set(gameId, {});
                    }
                    gameUpdates.get(gameId)!.winner = winner;
                }
                break;
            }

            case 'GoalScored': {
                const gameId = Number(args.gameId);
                const scoringTeam = Number(args.scoringTeam);

                console.log(`  ⚽ Goal scored in game ${gameId} by team ${scoringTeam}`);

                // Find existing game in database
                const existingGame = existingGames.find(g => g.id === gameId);
                if (existingGame) {
                    gamesProcessed++;

                    // Collect score updates
                    if (!gameUpdates.has(gameId)) {
                        gameUpdates.set(gameId, {});
                    }

                    if (scoringTeam === 1) {
                        // Team 1 scored
                        const currentScore = gameUpdates.get(gameId)!.team1_score || 0;
                        gameUpdates.get(gameId)!.team1_score = currentScore + 1;
                    } else if (scoringTeam === 2) {
                        // Team 2 scored
                        const currentScore = gameUpdates.get(gameId)!.team2_score || 0;
                        gameUpdates.get(gameId)!.team2_score = currentScore + 1;
                    }
                }
                break;
            }

            case 'EloUpdated': {
                const eventTeamId = Number(args.teamId);
                const gameId = Number(args.gameId);
                const eloRating = Number(args.eloRating);

                if (eventTeamId !== teamId) continue;

                console.log(`  📈 ELO updated for team ${eventTeamId}: ${eloRating}`);

                // Collect team ELO update
                teamUpdates.elo_rating = eloRating;
                break;
            }

            case 'TeamCreated': {
                const eventTeamId = Number(args.teamId);
                const name = args.name;
                const country = Number(args.country);

                if (eventTeamId !== teamId) continue;

                console.log(`  👥 Team created: ${name} (Country: ${country})`);

                // Collect team info updates
                teamUpdates.name = name;
                teamUpdates.country = country;
                break;
            }
        }
    }

    // Process collected updates and check if they're needed
    let gamesUpdated = 0;

    // Process game updates
    for (const [gameId, updates] of gameUpdates) {
        const existingGame = existingGames.find(g => g.id === gameId);
        if (!existingGame) continue;

        // Check if any updates are actually needed
        const needsUpdate = Object.keys(updates).some(key => {
            const updateValue = updates[key as keyof DatabaseGame];
            const existingValue = existingGame[key as keyof DatabaseGame];
            return updateValue !== existingValue;
        });

        if (needsUpdate) {
            gamesUpdated++;
            console.log(`  ✅ Game ${gameId} needs update:`, updates);
        } else {
            // Remove from updates if no changes needed
            gameUpdates.delete(gameId);
            console.log(`  ⏭️  Game ${gameId} is already up to date`);
        }
    }

    // Process team updates - prioritize contract data over event data
    console.log(`\n🔄 Processing team updates...`);

    // First, ensure team data is synced with contract (this was already done above)
    // Now process any additional updates from events
    const teamNeedsUpdate = Object.keys(teamUpdates).some(key => {
        const updateValue = teamUpdates[key as keyof DatabaseTeam];
        const existingValue = team[key as keyof DatabaseTeam];
        return updateValue !== existingValue;
    });

    if (!teamNeedsUpdate && Object.keys(teamUpdates).length > 0) {
        console.log(`  ⏭️  Team ${teamId} is already up to date with contract data`);
        // Clear team updates if no changes needed
        Object.keys(teamUpdates).forEach(key => delete teamUpdates[key as keyof DatabaseTeam]);
    } else if (teamNeedsUpdate) {
        console.log(`  ✅ Team ${teamId} needs update from events:`, teamUpdates);
    } else {
        console.log(`  ✅ Team ${teamId} is already synchronized with contract data`);
    }

    // Apply updates to database
    console.log(`\n💾 Applying updates to database...`);

    // Update games
    for (const [gameId, updates] of gameUpdates) {
        console.log(`  🔄 Updating game ${gameId}...`);
        const success = await updateGame(supabase, gameId, updates);
        if (success) {
            console.log(`  ✅ Game ${gameId} updated successfully`);
        } else {
            console.log(`  ❌ Failed to update game ${gameId}`);
        }
    }

    // Update team
    if (Object.keys(teamUpdates).length > 0) {
        console.log(`  🔄 Updating team ${teamId}...`);
        const success = await updateTeam(supabase, teamId, teamUpdates);
        if (success) {
            console.log(`  ✅ Team ${teamId} updated successfully`);
        } else {
            console.log(`  ❌ Failed to update team ${teamId}`);
        }
    }

    // Summary
    console.log(`\n📊 Summary:`);
    console.log(`  📡 Contract team data: ✅ Synced`);
    console.log(`  📡 Events processed: ${events.length}`);
    console.log(`  🎮 Games processed: ${gamesProcessed}`);
    console.log(`  ✅ Games updated: ${gamesUpdated}`);
    console.log(`  👥 Team updates: ${Object.keys(teamUpdates).length > 0 ? 'Yes' : 'No'}`);
    console.log(`  🔄 Contract sync: Team data synchronized with smart contract`);
}

// Main execution
async function main() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('Usage: yarn ts-node scripts/recalculate-team-stat.ts <teamId> <dateFrom> <dateTo> [contractAddress]');
        console.log('  teamId: The ID of the team to recalculate');
        console.log('  dateFrom: Start date in YYYY-MM-DD format');
        console.log('  dateTo: End date in YYYY-MM-DD format');
        console.log('  contractAddress: Optional - contract address (defaults to mainnet)');
        console.log('\nExamples:');
        console.log('  yarn ts-node scripts/recalculate-team-stat.ts 1 2024-01-01 2024-12-31');
        console.log('  yarn ts-node scripts/recalculate-team-stat.ts 1 2024-01-01 2024-12-31 0x1234...');
        return;
    }

    const teamId = parseInt(args[0]);
    const dateFrom = args[1];
    const dateTo = args[2] || new Date().toISOString().split('T')[0];
    const contractAddress = args[3] || deployment.baseMainnet?.proxyAddress;

    if (!contractAddress) {
        console.error('❌ Contract address not found. Please provide it as an argument or check deployment.json');
        return;
    }

    if (isNaN(teamId) || teamId < 0) {
        console.error('❌ Invalid team ID. Please provide a valid positive number.');
        return;
    }


    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateFrom) || !dateRegex.test(dateTo)) {
        console.error('❌ Invalid date format. Please use YYYY-MM-DD format.');
        return;
    }

    try {
        await recalculateTeamStats(teamId, dateFrom, dateTo, contractAddress);
        console.log('\n🎉 Team statistics recalculation completed successfully!');
    } catch (error) {
        console.error('\n❌ Error recalculating team statistics:', error);
        process.exit(1);
    }
}

// Run the script
if (require.main === module) {
    main().catch(console.error);
}

export { recalculateTeamStats };
