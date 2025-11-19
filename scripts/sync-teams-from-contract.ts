import { createPublicClient, http, decodeEventLog, toEventHash } from 'viem';
import { baseSepolia, base } from 'viem/chains';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { pool } from '../db/client';

dotenv.config();

// Load deployment configuration
const deploymentPath = path.join(__dirname, '..', 'deployment.json');
const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));

// Import the ABI from the artifact file
const artifactPath = path.join(__dirname, '..', 'artifacts', 'contracts', 'Game.sol', 'ChessBallGame.json');
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
const CONTRACT_ABI = artifact.abi;

interface ContractTeam {
    id: bigint;
    wallet: string;
    name: string;
    eloRating: bigint;
    registeredAt: bigint;
    games: bigint[];
    country: number;
    hasActiveGame: boolean;
    gameRequestId: bigint;
    totalGames: bigint;
}

interface DatabaseTeam {
    id: number;
    created_at?: string;
    primary_wallet: string;
    name: string;
    country: number;
    game_request_id: number | null;
    active_game_id: number | null;
    elo_rating: number;
    zealy_user_id?: string | null;
}

// Statistics interfaces
const BASESCAN_API_URL = 'https://api.basescan.org/api';
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || 'FYAQZAN8ANY2F53HVJFWWIH2K2VFQBT3V7';

// Event signatures
const GAME_STARTED_TOPIC = toEventHash('event GameStarted(uint256 indexed gameId, uint256 indexed team1id, uint256 indexed team2id, uint8 teamWithBall)');
const GAME_FINISHED_TOPIC = toEventHash('event GameFinished(uint256 indexed gameId, uint8 winner, uint8 finishReason)');
const GOAL_SCORED_TOPIC = toEventHash('event GoalScored(uint256 indexed gameId, uint8 scoringTeam)');
const ELO_UPDATED_TOPIC = toEventHash('event EloUpdated(uint256 indexed teamId, uint256 gameId, uint64 eloRating)');
const TEAM_CREATED_TOPIC = toEventHash('event TeamCreated(uint256 indexed teamId, address indexed owner, string name, uint8 country)');

interface ContractEvent {
    blockNumber: string;
    transactionHash: string;
    logIndex: string;
    topics: string[];
    data: string;
    timeStamp: string;
}

interface GameResult {
    gameId: number;
    team1Id: number;
    team2Id: number;
    team1Score: number;
    team2Score: number;
    winner: number; // 0 = draw, 1 = team1, 2 = team2
    finishReason: number;
    timestamp: number;
    blockNumber: number;
    team1EloChange?: number;
    team2EloChange?: number;
}

function createViemClient(network: 'baseSepolia' | 'baseMainnet') {
    const rpcUrl = network === 'baseSepolia' 
        ? process.env.BASE_SEPOLIA_RPC_URL || process.env.RPC_URL || 'https://sepolia.base.org'
        : process.env.BASE_MAINNET_RPC_URL || process.env.RPC_URL || 'https://mainnet.base.org';
    
    return createPublicClient({
        chain: network === 'baseSepolia' ? baseSepolia : base,
        transport: http(rpcUrl)
    });
}

/**
 * Convert contract ELO rating (uint64 with 2 decimal precision, e.g., 10000 = 100.00) to database format
 */
function convertEloRating(contractElo: bigint): number {
    return Number(contractElo) / 100;
}

/**
 * Convert contract team data to database team format
 */
function mapContractTeamToDb(contractTeam: ContractTeam): Partial<DatabaseTeam> {
    // Find active game ID from games array if hasActiveGame is true
    // The last game in the array is likely the active one if hasActiveGame is true
    // Note: The contract's games array contains game IDs, and the last one is usually the active game
    // when hasActiveGame is true. We could verify this by checking the games table status,
    // but using the last game ID is a reasonable approach.
    const activeGameId = contractTeam.hasActiveGame && contractTeam.games.length > 0
        ? Number(contractTeam.games[contractTeam.games.length - 1])
        : null;

    return {
        id: Number(contractTeam.id),
        primary_wallet: contractTeam.wallet, // Normalize to lowercase
        name: contractTeam.name,
        country: contractTeam.country,
        game_request_id: contractTeam.gameRequestId > 0 ? Number(contractTeam.gameRequestId) : null,
        active_game_id: activeGameId,
        elo_rating: convertEloRating(contractTeam.eloRating),
        created_at: new Date(Number(contractTeam.registeredAt) * 1000).toISOString()
    };
}

/**
 * Get existing team from database
 */
async function getExistingTeam(teamId: number): Promise<DatabaseTeam | null> {
    const { rows } = await pool.query<DatabaseTeam>(
        'SELECT * FROM teams WHERE id = $1 LIMIT 1',
        [teamId]
    );
    return rows[0] ?? null;
}

/**
 * Upsert team in database
 */
async function upsertTeam(teamData: Partial<DatabaseTeam>): Promise<boolean> {
    if (teamData.id === undefined) {
        throw new Error('Team ID is required for upsert');
    }

    try {
        const existingTeam = await getExistingTeam(teamData.id);

        if (existingTeam) {
            const columns: Array<[keyof DatabaseTeam, string]> = [
                ['name', 'name'],
                ['country', 'country'],
                ['primary_wallet', 'primary_wallet'],
                ['elo_rating', 'elo_rating'],
                ['game_request_id', 'game_request_id'],
                ['active_game_id', 'active_game_id']
            ];

            const updates: string[] = [];
            const values: any[] = [];

            for (const [key, column] of columns) {
                const newValue = teamData[key];
                if (newValue !== undefined && newValue !== (existingTeam as any)[key]) {
                    updates.push(`${column} = $${values.length + 1}`);
                    values.push(newValue);
                }
            }

            if (updates.length === 0) {
                return true;
            }

            values.push(teamData.id);

            await pool.query(
                `UPDATE teams SET ${updates.join(', ')} WHERE id = $${values.length}`,
                values
            );

            return true;
        }

        const insertValues = [
            teamData.id,
            teamData.primary_wallet ?? null,
            teamData.name ?? null,
            teamData.country ?? null,
            teamData.game_request_id ?? null,
            teamData.active_game_id ?? null,
            teamData.elo_rating ?? null,
            teamData.created_at ?? new Date().toISOString()
        ];

        await pool.query(
            `INSERT INTO teams (id, primary_wallet, name, country, game_request_id, active_game_id, elo_rating, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO UPDATE SET
                primary_wallet = EXCLUDED.primary_wallet,
                name = EXCLUDED.name,
                country = EXCLUDED.country,
                game_request_id = EXCLUDED.game_request_id,
                active_game_id = EXCLUDED.active_game_id,
                elo_rating = EXCLUDED.elo_rating,
                created_at = EXCLUDED.created_at`,
            insertValues
        );

        return true;
    } catch (error) {
        console.error(`Error upserting team ${teamData.id}:`, error);
        return false;
    }
}

/**
 * Fetch events from Basescan API
 */
async function fetchEventsFromBasescan(
    contractAddress: string,
    network: 'baseSepolia' | 'baseMainnet' = 'baseMainnet',
    fromBlock: number = 0,
    toBlock: number = 99999999
): Promise<ContractEvent[]> {
    const allEvents: ContractEvent[] = [];

    // Use correct Basescan API URL based on network
    const basescanUrl = network === 'baseSepolia' 
        ? 'https://api-sepolia.basescan.org/api'
        : BASESCAN_API_URL;

    const eventTopics = [
        { topic: GAME_STARTED_TOPIC, name: 'GameStarted' },
        { topic: GAME_FINISHED_TOPIC, name: 'GameFinished' },
        { topic: GOAL_SCORED_TOPIC, name: 'GoalScored' },
        { topic: ELO_UPDATED_TOPIC, name: 'EloUpdated' }
    ];

    for (const eventType of eventTopics) {
        try {
            const url = new URL(basescanUrl);
            url.searchParams.set('module', 'logs');
            url.searchParams.set('action', 'getLogs');
            url.searchParams.set('address', contractAddress);
            url.searchParams.set('topic0', eventType.topic);
            url.searchParams.set('fromBlock', fromBlock.toString());
            url.searchParams.set('toBlock', toBlock.toString());
            url.searchParams.set('apikey', BASESCAN_API_KEY);

            const response = await fetch(url.toString());
            const data = await response.json();

            if (data.status !== '1') {
                if (!data.message?.includes('No records found')) {
                    console.warn(`  ⚠️  ${eventType.name}: ${data.message}`);
                }
                continue;
            }

            if (data.result && Array.isArray(data.result)) {
                allEvents.push(...data.result);
            }
        } catch (error) {
            console.error(`  ❌ Error fetching ${eventType.name}:`, error);
        }
    }

    // Sort by block number and log index
    allEvents.sort((a, b) => {
        const blockDiff = parseInt(a.blockNumber) - parseInt(b.blockNumber);
        if (blockDiff !== 0) return blockDiff;
        return parseInt(a.logIndex) - parseInt(b.logIndex);
    });

    return allEvents;
}

/**
 * Decode event log
 */
function decodeEvent(event: ContractEvent): any {
    try {
        return decodeEventLog({
            abi: CONTRACT_ABI,
            data: event.data as `0x${string}`,
            topics: event.topics as [`0x${string}`, ...`0x${string}`[]]
        });
    } catch (error) {
        console.warn('Error decoding event:', error);
        return null;
    }
}

/**
 * Process events to reconstruct games with ELO changes
 */
function processEventsToGames(events: ContractEvent[]): Map<number, GameResult> {
    const games = new Map<number, GameResult>();
    const eloUpdates = new Map<string, number>(); // Key: "gameId-teamId", Value: eloRating

    for (const event of events) {
        const decoded = decodeEvent(event);
        if (!decoded) continue;

        const eventName = decoded.eventName;
        const args = decoded.args as any;

        switch (eventName) {
            case 'GameStarted': {
                const gameId = Number(args.gameId);
                games.set(gameId, {
                    gameId,
                    team1Id: Number(args.team1id),
                    team2Id: Number(args.team2id),
                    team1Score: 0,
                    team2Score: 0,
                    winner: 0,
                    finishReason: 0,
                    timestamp: parseInt(event.timeStamp),
                    blockNumber: parseInt(event.blockNumber)
                });
                break;
            }

            case 'GoalScored': {
                const gameId = Number(args.gameId);
                const scoringTeam = Number(args.scoringTeam);
                
                if (games.has(gameId)) {
                    const game = games.get(gameId)!;
                    if (scoringTeam === 1) {
                        game.team1Score++;
                    } else if (scoringTeam === 2) {
                        game.team2Score++;
                    }
                }
                break;
            }

            case 'GameFinished': {
                const gameId = Number(args.gameId);
                const winner = Number(args.winner);
                const finishReason = Number(args.finishReason);
                
                if (games.has(gameId)) {
                    const game = games.get(gameId)!;
                    game.winner = winner;
                    game.finishReason = finishReason;
                }
                break;
            }

            case 'EloUpdated': {
                const teamId = Number(args.teamId);
                const gameId = Number(args.gameId);
                const eloRating = Number(args.eloRating);
                
                eloUpdates.set(`${gameId}-${teamId}`, eloRating);
                break;
            }
        }
    }

    // Match ELO updates to games
    for (const [gameId, game] of games) {
        const team1Key = `${gameId}-${game.team1Id}`;
        const team2Key = `${gameId}-${game.team2Id}`;
        
        if (eloUpdates.has(team1Key)) {
            game.team1EloChange = eloUpdates.get(team1Key);
        }
        if (eloUpdates.has(team2Key)) {
            game.team2EloChange = eloUpdates.get(team2Key);
        }
    }

    return games;
}

/**
 * Calculate statistics for a team from games
 */
function calculateTeamStats(teamId: number, games: GameResult[], initialElo: number = 100): {
    wins: number;
    draws: number;
    losses: number;
    goals_scored: number;
    goals_conceded: number;
    elo_delta: number;
    biggest_win_diff: number;
    biggest_win_goal_scored: number;
    biggest_win_goals_conceded: number;
    biggest_loss_diff: number;
    biggest_loss_goals_scored: number;
    biggest_loss_goals_conceded: number;
} {
    const stats = {
        wins: 0,
        draws: 0,
        losses: 0,
        goals_scored: 0,
        goals_conceded: 0,
        elo_delta: 0,
        biggest_win_diff: 0,
        biggest_win_goal_scored: 0,
        biggest_win_goals_conceded: 0,
        biggest_loss_diff: 0,
        biggest_loss_goals_scored: 0,
        biggest_loss_goals_conceded: 0
    };

    let currentElo = initialElo;
    const sortedGames = [...games].sort((a, b) => a.timestamp - b.timestamp);

    for (const game of sortedGames) {
        // Only count finished games
        if (game.winner === 0 && game.team1Score === 0 && game.team2Score === 0) {
            continue;
        }

        const isTeam1 = game.team1Id === teamId;
        const myScore = isTeam1 ? game.team1Score : game.team2Score;
        const opponentScore = isTeam1 ? game.team2Score : game.team1Score;
        const myEloChange = isTeam1 ? game.team1EloChange : game.team2EloChange;

        stats.goals_scored += myScore;
        stats.goals_conceded += opponentScore;

        const goalDiff = myScore - opponentScore;

        // Calculate ELO delta
        if (myEloChange !== undefined) {
            const eloBefore = currentElo;
            currentElo = myEloChange / 100; // Convert from contract format
            stats.elo_delta += (currentElo - eloBefore);
        }

        // Determine result
        if (game.finishReason === 2 || game.finishReason === 3) {
            // Timeout
            const didIWin = (isTeam1 && game.winner === 1) || (!isTeam1 && game.winner === 2);
            if (didIWin) {
                stats.wins++;
                if (goalDiff > stats.biggest_win_diff) {
                    stats.biggest_win_diff = goalDiff;
                    stats.biggest_win_goal_scored = myScore;
                    stats.biggest_win_goals_conceded = opponentScore;
                }
            } else {
                stats.losses++;
                const lossDiff = -goalDiff;
                if (lossDiff > stats.biggest_loss_diff) {
                    stats.biggest_loss_diff = lossDiff;
                    stats.biggest_loss_goals_scored = myScore;
                    stats.biggest_loss_goals_conceded = opponentScore;
                }
            }
        } else {
            // Normal finish
            if (game.winner === 0) {
                stats.draws++;
            } else {
                const didIWin = (isTeam1 && game.winner === 1) || (!isTeam1 && game.winner === 2);
                if (didIWin) {
                    stats.wins++;
                    if (goalDiff > stats.biggest_win_diff) {
                        stats.biggest_win_diff = goalDiff;
                        stats.biggest_win_goal_scored = myScore;
                        stats.biggest_win_goals_conceded = opponentScore;
                    }
                } else {
                    stats.losses++;
                    const lossDiff = -goalDiff;
                    if (lossDiff > stats.biggest_loss_diff) {
                        stats.biggest_loss_diff = lossDiff;
                        stats.biggest_loss_goals_scored = myScore;
                        stats.biggest_loss_goals_conceded = opponentScore;
                    }
                }
            }
        }
    }

    return stats;
}

/**
 * Get period start date
 */
function getPeriodStart(date: Date, period: 'week' | 'month' | 'alltime'): Date {
    if (period === 'alltime') {
        return new Date('2025-08-21'); // Fixed start date for alltime
    }
    
    const d = new Date(date);
    if (period === 'week') {
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        return d;
    } else { // month
        return new Date(d.getFullYear(), d.getMonth(), 1);
    }
}

/**
 * Update team statistics in database
 */
async function updateTeamStatistics(
    teamId: number,
    games: GameResult[],
    initialElo: number
): Promise<boolean> {
    try {
        const stats = calculateTeamStats(teamId, games, initialElo);

        // Update statistics for alltime, current week, and current month
        const periods: Array<'week' | 'month' | 'alltime'> = ['week', 'month', 'alltime'];
        const today = new Date();

        for (const period of periods) {
            const periodStart = getPeriodStart(today, period);
            const periodStartStr = periodStart.toISOString().split('T')[0];

            // Filter games for this period (for week/month only)
            let periodGames = games;
            if (period !== 'alltime') {
                periodGames = games.filter(game => {
                    const gameDate = new Date(game.timestamp * 1000);
                    const gamePeriodStart = getPeriodStart(gameDate, period);
                    return gamePeriodStart.getTime() === periodStart.getTime();
                });
            }

            // Calculate stats for this period
            const periodStats = period === 'alltime' 
                ? stats 
                : calculateTeamStats(teamId, periodGames, initialElo);

            // Upsert statistics
            await pool.query(
                `INSERT INTO teams_statistic (
                    team_id,
                    period,
                    period_start,
                    wins,
                    draws,
                    losses,
                    goal_scored,
                    goal_conceded,
                    biggest_win_diff,
                    biggest_win_goal_scored,
                    biggest_win_goals_conceded,
                    biggest_loss_diff,
                    biggest_loss_goals_scored,
                    biggest_loss_goals_conceded,
                    elo_rating_delta,
                    updated_at
                )
                VALUES (
                    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
                )
                ON CONFLICT (team_id, period, period_start) DO UPDATE SET
                    wins = EXCLUDED.wins,
                    draws = EXCLUDED.draws,
                    losses = EXCLUDED.losses,
                    goal_scored = EXCLUDED.goal_scored,
                    goal_conceded = EXCLUDED.goal_conceded,
                    biggest_win_diff = EXCLUDED.biggest_win_diff,
                    biggest_win_goal_scored = EXCLUDED.biggest_win_goal_scored,
                    biggest_win_goals_conceded = EXCLUDED.biggest_win_goals_conceded,
                    biggest_loss_diff = EXCLUDED.biggest_loss_diff,
                    biggest_loss_goals_scored = EXCLUDED.biggest_loss_goals_scored,
                    biggest_loss_goals_conceded = EXCLUDED.biggest_loss_goals_conceded,
                    elo_rating_delta = EXCLUDED.elo_rating_delta,
                    updated_at = EXCLUDED.updated_at`,
                [
                    teamId,
                    period,
                    periodStartStr,
                    periodStats.wins,
                    periodStats.draws,
                    periodStats.losses,
                    periodStats.goals_scored,
                    periodStats.goals_conceded,
                    periodStats.biggest_win_diff,
                    periodStats.biggest_win_goal_scored,
                    periodStats.biggest_win_goals_conceded,
                    periodStats.biggest_loss_diff,
                    periodStats.biggest_loss_goals_scored,
                    periodStats.biggest_loss_goals_conceded,
                    periodStats.elo_delta,
                    new Date().toISOString()
                ]
            );
        }

        return true;
    } catch (error) {
        console.error(`Error updating statistics for team ${teamId}:`, error);
        return false;
    }
}

/**
 * Fetch all team IDs from TeamCreated events
 */
async function fetchAllTeamIdsFromEvents(
    contractAddress: string,
    network: 'baseSepolia' | 'baseMainnet' = 'baseMainnet',
    fromBlock: number = 0,
    toBlock: number = 99999999
): Promise<number[]> {
    const basescanUrl = network === 'baseSepolia' 
        ? 'https://api-sepolia.basescan.org/api'
        : BASESCAN_API_URL;

    try {
        console.log(`  📡 Fetching TeamCreated events from Basescan...`);
        console.log(`  📍 Contract: ${contractAddress}`);
        console.log(`  🔗 URL: ${basescanUrl}`);
        console.log(`  📊 Event hash: ${TEAM_CREATED_TOPIC}`);
        console.log(`  📦 Block range: ${fromBlock} to ${toBlock}`);

        const url = new URL(basescanUrl);
        url.searchParams.set('module', 'logs');
        url.searchParams.set('action', 'getLogs');
        url.searchParams.set('address', contractAddress);
        url.searchParams.set('topic0', TEAM_CREATED_TOPIC);
        url.searchParams.set('fromBlock', fromBlock.toString());
        url.searchParams.set('toBlock', toBlock === 99999999 ? 'latest' : toBlock.toString());
        url.searchParams.set('apikey', BASESCAN_API_KEY);
        // Add pagination parameters to ensure we get all results
        url.searchParams.set('page', '1');
        url.searchParams.set('offset', '10000'); // Max offset to get all results

        console.log(`  🔗 Full URL: ${url.toString().replace(BASESCAN_API_KEY, '***')}`);

        const response = await fetch(url.toString());
        const data = await response.json();

        console.log(`  📥 Response status: ${data.status}`);
        if (data.message) {
            console.log(`  📝 Response message: ${data.message}`);
        }
        if (data.result) {
            console.log(`  📦 Response result type: ${typeof data.result}, isArray: ${Array.isArray(data.result)}`);
        }

        if (data.status !== '1') {
            if (data.message && !data.message.includes('No records found')) {
                console.warn(`  ⚠️  TeamCreated events API error: ${data.message}`);
                // Log full response for debugging
                console.log(`  🔍 Full API response:`, JSON.stringify(data, null, 2));
            } else {
                console.log(`  ℹ️  No TeamCreated events found in Basescan`);
            }
            return [];
        }

        if (data.result && Array.isArray(data.result)) {
            console.log(`  ✅ Found ${data.result.length} TeamCreated event(s) in Basescan`);
            
            // Extract team IDs from topics (topic1 is the indexed teamId)
            const teamIds: number[] = data.result.map((event: ContractEvent, index: number) => {
                // topic1 is the teamId (indexed parameter)
                if (!event.topics || event.topics.length < 2) {
                    console.warn(`  ⚠️  Event ${index} has invalid topics:`, event);
                    return null;
                }
                const teamIdHex = event.topics[1];
                const teamId = Number(BigInt(teamIdHex));
                console.log(`  📋 Event ${index + 1}: Team ID ${teamId} (from ${teamIdHex})`);
                return teamId;
            }).filter((id: number | null): id is number => id !== null);

            // Remove duplicates and sort
            const uniqueTeamIds: number[] = [...new Set(teamIds)].sort((a: number, b: number) => a - b);
            console.log(`  ✅ Extracted ${uniqueTeamIds.length} unique team ID(s): ${uniqueTeamIds.join(', ')}`);
            return uniqueTeamIds;
        }

        console.log(`  ⚠️  No result array in response`);
        return [];
    } catch (error) {
        console.error(`  ❌ Error fetching TeamCreated events:`, error);
        if (error instanceof Error) {
            console.error(`  ❌ Error message: ${error.message}`);
        }
        return [];
    }
}

/**
 * Fetch a single team from the contract
 */
async function fetchTeamFromContract(
    client: any,
    contractAddress: string,
    teamId: number
): Promise<ContractTeam | null> {
    try {
        const teamData = await client.readContract({
            address: contractAddress as `0x${string}`,
            abi: CONTRACT_ABI,
            functionName: 'getTeam',
            args: [BigInt(teamId)]
        }) as any;

        return {
            id: BigInt(teamData.id),
            wallet: teamData.wallet,
            name: teamData.name,
            eloRating: BigInt(teamData.eloRating),
            registeredAt: BigInt(teamData.registeredAt),
            games: teamData.games.map((g: bigint) => BigInt(g)),
            country: Number(teamData.country),
            hasActiveGame: teamData.hasActiveGame,
            gameRequestId: BigInt(teamData.gameRequestId),
            totalGames: BigInt(teamData.totalGames)
        };
    } catch (error: any) {
        // Contract will revert if team doesn't exist
        if (error.message?.includes('DoesNotExist') || error.message?.includes('execution reverted')) {
            return null;
        }
        console.error(`Error fetching team ${teamId}:`, error);
        return null;
    }
}

/**
 * Main function to sync teams from smart contract to database
 */
export async function syncTeamsFromContract(
    network: 'baseSepolia' | 'baseMainnet' = 'baseMainnet',
    contractAddress?: string,
    startTeamId?: number,
    endTeamId?: number,
    includeStatistics: boolean = false
): Promise<void> {
    console.log(`\n🔄 Syncing teams from smart contract to database`);
    console.log(`🌐 Network: ${network}`);

    // Get contract address
    const networkConfig = deployment[network];
    if (!networkConfig) {
        throw new Error(`Network ${network} not found in deployment config`);
    }

    const finalContractAddress = contractAddress || networkConfig.proxyAddress;
    console.log(`📍 Contract Address: ${finalContractAddress}`);

    const viemClient = createViemClient(network);

    // Fetch all team IDs from TeamCreated events (primary method)
    console.log(`\n📡 Fetching all team IDs from TeamCreated events...`);
    let teamIdsToSync: number[] = [];
    
    const teamIdsFromEvents = await fetchAllTeamIdsFromEvents(finalContractAddress, network);
    
    if (teamIdsFromEvents.length > 0) {
        console.log(`✅ Found ${teamIdsFromEvents.length} teams from TeamCreated events:`, teamIdsFromEvents);
        teamIdsToSync = teamIdsFromEvents;
    } else {
        // Fallback to nextTeamId method if events are not available
        console.log(`⚠️  No TeamCreated events found, falling back to nextTeamId method...`);
        const nextTeamId = await viemClient.readContract({
            address: finalContractAddress as `0x${string}`,
            abi: CONTRACT_ABI,
            functionName: 'nextTeamId',
            args: []
        }) as bigint;

        const totalTeams = Number(nextTeamId) - 1;
        console.log(`✅ Found ${totalTeams} teams from nextTeamId (nextTeamId: ${nextTeamId})`);

        if (totalTeams <= 0) {
            console.log(`\n⚠️  No teams found in contract`);
            return;
        }

        // Generate team IDs from 1 to totalTeams, but also try to verify each team exists
        // by attempting to fetch it from the contract
        const startId = startTeamId || 1;
        // Always check at least up to nextTeamId (which might be 2, meaning teams 1 and 2 exist)
        // Also check a few beyond nextTeamId in case the contract state is inconsistent
        const endId = endTeamId || Math.max(totalTeams, Number(nextTeamId));
        teamIdsToSync = [];
        
        console.log(`\n🔍 Verifying team IDs from ${startId} to ${endId}...`);
        for (let i = startId; i <= endId; i++) {
            try {
                const team = await fetchTeamFromContract(viemClient, finalContractAddress, i);
                if (team) {
                    teamIdsToSync.push(i);
                    console.log(`  ✅ Team ${i} exists: ${team.name}`);
                } else {
                    console.log(`  ⏭️  Team ${i} does not exist, skipping...`);
                }
            } catch (error) {
                console.log(`  ⏭️  Team ${i} does not exist (error: ${error instanceof Error ? error.message : 'unknown'})`);
            }
        }
        
        // Always check a few more IDs beyond nextTeamId in case events show teams that 
        // nextTeamId doesn't account for (e.g., if nextTeamId is 2 but team 2 exists)
        if (!startTeamId && !endTeamId) {
            const maxIdToCheck = Math.max(Number(nextTeamId) + 2, endId + 3);
            console.log(`\n🔍 Checking additional IDs up to ${maxIdToCheck} to catch any missed teams...`);
            for (let i = endId + 1; i <= maxIdToCheck; i++) {
                try {
                    const team = await fetchTeamFromContract(viemClient, finalContractAddress, i);
                    if (team) {
                        teamIdsToSync.push(i);
                        console.log(`  ✅ Team ${i} exists: ${team.name}`);
                    }
                } catch (error) {
                    // Team doesn't exist, continue
                }
            }
        }
        
        if (teamIdsToSync.length === 0) {
            console.log(`\n⚠️  No teams found after verification`);
            return;
        }
    }

    // Apply manual range filters if provided
    if (startTeamId !== undefined || endTeamId !== undefined) {
        const startId = startTeamId || Math.min(...teamIdsToSync);
        const endId = endTeamId || Math.max(...teamIdsToSync);
        teamIdsToSync = teamIdsToSync.filter(id => id >= startId && id <= endId);
    }

    if (teamIdsToSync.length === 0) {
        console.log(`\n⚠️  No teams to sync after filtering`);
        return;
    }

    console.log(`\n📊 Syncing ${teamIdsToSync.length} team(s):`, teamIdsToSync);

    // Fetch game events if statistics are enabled
    let allGames: Map<number, GameResult> | null = null;
    if (includeStatistics) {
        console.log(`\n📈 Statistics syncing enabled - fetching game events...`);
        try {
            const events = await fetchEventsFromBasescan(finalContractAddress, network);
            console.log(`✅ Fetched ${events.length} events from Basescan`);
            allGames = processEventsToGames(events);
            console.log(`✅ Processed ${allGames.size} games from events`);
        } catch (error) {
            console.error(`⚠️  Error fetching events for statistics:`, error);
            console.log(`  Continuing with basic team sync only...`);
            includeStatistics = false;
        }
    }

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    let statsCount = 0;

    // Fetch and sync teams
    for (const teamId of teamIdsToSync) {
        try {
            console.log(`\n👤 Processing team ${teamId}...`);

            // Fetch team from contract
            const contractTeam = await fetchTeamFromContract(viemClient, finalContractAddress, teamId);

            if (!contractTeam) {
                console.log(`  ⏭️  Team ${teamId} does not exist in contract, skipping...`);
                skipCount++;
                continue;
            }

            console.log(`  📋 Team data: ${contractTeam.name} (${contractTeam.wallet})`);

            // Map to database format
            const dbTeamData = mapContractTeamToDb(contractTeam);

            // Upsert to database
            const success = await upsertTeam(dbTeamData);

            if (success) {
                console.log(`  ✅ Team ${teamId} synced successfully`);
                successCount++;

                // Update statistics if enabled and team has games
                if (includeStatistics && allGames && contractTeam.games.length > 0) {
                    try {
                        console.log(`  📊 Updating statistics for team ${teamId}...`);
                        
                        // Filter games for this team
                        const teamGames = Array.from(allGames.values()).filter(
                            game => game.team1Id === teamId || game.team2Id === teamId
                        );

                        if (teamGames.length > 0) {
                            const initialElo = convertEloRating(contractTeam.eloRating);
                            const statsSuccess = await updateTeamStatistics(
                                teamId,
                                teamGames,
                                initialElo
                            );

                            if (statsSuccess) {
                                console.log(`  ✅ Statistics updated (${teamGames.length} games)`);
                                statsCount++;
                            } else {
                                console.log(`  ⚠️  Statistics update failed`);
                            }
                        } else {
                            console.log(`  ℹ️  No finished games found for statistics`);
                        }
                    } catch (error) {
                        console.error(`  ⚠️  Error updating statistics:`, error);
                    }
                }
            } else {
                console.log(`  ❌ Failed to sync team ${teamId}`);
                errorCount++;
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            console.error(`  ❌ Error processing team ${teamId}:`, error);
            errorCount++;
        }
    }

    console.log(`\n🎉 Sync completed!`);
    console.log(`  ✅ Successfully synced: ${successCount}`);
    if (includeStatistics) {
        console.log(`  📊 Statistics updated: ${statsCount}`);
    }
    console.log(`  ⏭️  Skipped (not found): ${skipCount}`);
    console.log(`  ❌ Errors: ${errorCount}`);
    console.log(`  📊 Total teams to sync: ${teamIdsToSync.length}`);
    console.log(`  📊 Team IDs synced: ${teamIdsToSync.join(', ')}`);
    console.log(`  📈 Success rate: ${teamIdsToSync.length > 0 ? ((successCount / (successCount + errorCount + skipCount)) * 100).toFixed(1) : 0}%`);
}

// Main execution
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log('Usage: yarn ts-node scripts/sync-teams-from-contract.ts [options]');
        console.log('\nOptions:');
        console.log('  --network <network>        Network to use: baseSepolia or baseMainnet (default: baseMainnet)');
        console.log('  --contract <address>       Contract address (optional, uses deployment.json by default)');
        console.log('  --start <teamId>           Start team ID (default: 1)');
        console.log('  --end <teamId>             End team ID (default: all teams)');
        console.log('  --stats                    Include statistics syncing (wins, losses, goals, etc.)');
        console.log('\nExamples:');
        console.log('  yarn ts-node scripts/sync-teams-from-contract.ts');
        console.log('  yarn ts-node scripts/sync-teams-from-contract.ts --network baseSepolia');
        console.log('  yarn ts-node scripts/sync-teams-from-contract.ts --network baseMainnet --start 1 --end 100');
        console.log('  yarn ts-node scripts/sync-teams-from-contract.ts --contract 0x1234... --start 1 --end 50');
        console.log('  yarn ts-node scripts/sync-teams-from-contract.ts --stats');
        console.log('  yarn ts-node scripts/sync-teams-from-contract.ts --network baseSepolia --stats');
        return;
    }

    let network: 'baseSepolia' | 'baseMainnet' = 'baseMainnet';
    let contractAddress: string | undefined;
    let startTeamId: number | undefined;
    let endTeamId: number | undefined;
    let includeStatistics = false;

    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--network' && args[i + 1]) {
            network = args[i + 1] as 'baseSepolia' | 'baseMainnet';
            if (!['baseSepolia', 'baseMainnet'].includes(network)) {
                console.error('❌ Invalid network. Use baseSepolia or baseMainnet');
                return;
            }
            i++;
        } else if (args[i] === '--contract' && args[i + 1]) {
            contractAddress = args[i + 1];
            i++;
        } else if (args[i] === '--start' && args[i + 1]) {
            startTeamId = parseInt(args[i + 1]);
            if (isNaN(startTeamId) || startTeamId < 1) {
                console.error('❌ Invalid start team ID');
                return;
            }
            i++;
        } else if (args[i] === '--end' && args[i + 1]) {
            endTeamId = parseInt(args[i + 1]);
            if (isNaN(endTeamId) || endTeamId < 1) {
                console.error('❌ Invalid end team ID');
                return;
            }
            i++;
        } else if (args[i] === '--stats') {
            includeStatistics = true;
        }
    }

    try {
        await syncTeamsFromContract(network, contractAddress, startTeamId, endTeamId, includeStatistics);
    } catch (error) {
        console.error('\n❌ Error:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

