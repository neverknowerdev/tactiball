import { createPublicClient, http } from 'viem';
import { baseSepolia, base } from 'viem/chains';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

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

function createSupabaseClient() {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase environment variables');
    }

    return createClient(supabaseUrl, supabaseKey);
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
        primary_wallet: contractTeam.wallet.toLowerCase(), // Normalize to lowercase
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
async function getExistingTeam(supabase: any, teamId: number): Promise<DatabaseTeam | null> {
    const { data, error } = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .single();

    if (error) {
        if (error.code === 'PGRST116') {
            // No rows returned
            return null;
        }
        console.error(`Error fetching team ${teamId}:`, error);
        return null;
    }

    return data;
}

/**
 * Upsert team in database
 */
async function upsertTeam(supabase: any, teamData: Partial<DatabaseTeam>): Promise<boolean> {
    try {
        const existingTeam = await getExistingTeam(supabase, teamData.id!);

        if (existingTeam) {
            // Update existing team - only update fields that are different
            const updates: Partial<DatabaseTeam> = {};
            
            if (existingTeam.name !== teamData.name) updates.name = teamData.name;
            if (existingTeam.country !== teamData.country) updates.country = teamData.country;
            if (existingTeam.primary_wallet !== teamData.primary_wallet) updates.primary_wallet = teamData.primary_wallet;
            if (existingTeam.elo_rating !== teamData.elo_rating) updates.elo_rating = teamData.elo_rating;
            if (existingTeam.game_request_id !== teamData.game_request_id) updates.game_request_id = teamData.game_request_id;
            if (existingTeam.active_game_id !== teamData.active_game_id) updates.active_game_id = teamData.active_game_id;

            if (Object.keys(updates).length === 0) {
                return true; // No updates needed
            }

            const { error } = await supabase
                .from('teams')
                .update(updates)
                .eq('id', teamData.id);

            if (error) {
                console.error(`Error updating team ${teamData.id}:`, error);
                return false;
            }

            return true;
        } else {
            // Insert new team
            const { error } = await supabase
                .from('teams')
                .insert([teamData]);

            if (error) {
                console.error(`Error inserting team ${teamData.id}:`, error);
                return false;
            }

            return true;
        }
    } catch (error) {
        console.error(`Error upserting team ${teamData.id}:`, error);
        return false;
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
    endTeamId?: number
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

    const supabase = createSupabaseClient();
    const viemClient = createViemClient(network);

    // Get nextTeamId from contract
    console.log(`\n📡 Fetching nextTeamId from contract...`);
    const nextTeamId = await viemClient.readContract({
        address: finalContractAddress as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'nextTeamId',
        args: []
    }) as bigint;

    const totalTeams = Number(nextTeamId) - 1;
    console.log(`✅ Found ${totalTeams} teams in contract (nextTeamId: ${nextTeamId})`);

    if (totalTeams <= 0) {
        console.log(`\n⚠️  No teams found in contract`);
        return;
    }

    // Determine team ID range to sync
    const startId = startTeamId || 1;
    const endId = endTeamId || totalTeams;

    console.log(`\n📊 Syncing teams from ID ${startId} to ${endId}...`);

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    // Fetch and sync teams
    for (let teamId = startId; teamId <= endId; teamId++) {
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
            const success = await upsertTeam(supabase, dbTeamData);

            if (success) {
                console.log(`  ✅ Team ${teamId} synced successfully`);
                successCount++;
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
    console.log(`  ⏭️  Skipped (not found): ${skipCount}`);
    console.log(`  ❌ Errors: ${errorCount}`);
    console.log(`  📊 Total processed: ${startId} to ${endId}`);
    console.log(`  📈 Success rate: ${((successCount / (successCount + errorCount + skipCount)) * 100).toFixed(1)}%`);
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
        console.log('\nExamples:');
        console.log('  yarn ts-node scripts/sync-teams-from-contract.ts');
        console.log('  yarn ts-node scripts/sync-teams-from-contract.ts --network baseSepolia');
        console.log('  yarn ts-node scripts/sync-teams-from-contract.ts --network baseMainnet --start 1 --end 100');
        console.log('  yarn ts-node scripts/sync-teams-from-contract.ts --contract 0x1234... --start 1 --end 50');
        return;
    }

    let network: 'baseSepolia' | 'baseMainnet' = 'baseMainnet';
    let contractAddress: string | undefined;
    let startTeamId: number | undefined;
    let endTeamId: number | undefined;

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
        }
    }

    try {
        await syncTeamsFromContract(network, contractAddress, startTeamId, endTeamId);
    } catch (error) {
        console.error('\n❌ Error:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

