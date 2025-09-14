import { createPublicClient, http } from 'viem';
import { baseSepolia, base } from 'viem/chains';
import * as fs from 'fs';
import * as path from 'path';

// Load deployment configuration
const deploymentPath = path.join(__dirname, '..', 'deployment.json');
const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));

// Import the ABI from the artifact file
const artifactPath = path.join(__dirname, '..', 'artifacts', 'contracts', 'Game.sol', 'ChessBallGame.json');
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
const CONTRACT_ABI = artifact.abi;

async function fetchTeamInfo(teamId: string, network: 'baseSepolia' | 'baseMainnet' = 'baseSepolia') {
    try {
        // Get network configuration
        const networkConfig = deployment[network];
        if (!networkConfig) {
            throw new Error(`Network ${network} not found in deployment config`);
        }

        console.log(`\n🔍 Fetching team info for Team ID: ${teamId}`);
        console.log(`🌐 Network: ${network}`);
        console.log(`📍 Contract Address: ${networkConfig.proxyAddress}`);
        console.log(`⛓️  Chain ID: ${networkConfig.chainId}`);

        // Setup client
        const client = createPublicClient({
            chain: network === 'baseSepolia' ? baseSepolia : base,
            transport: http()
        });

        // Fetch team data
        console.log('\n📡 Calling getTeam function...');
        const teamData = await client.readContract({
            address: networkConfig.proxyAddress as `0x${string}`,
            abi: CONTRACT_ABI,
            functionName: 'getTeam',
            args: [BigInt(teamId)]
        }) as any;

        console.log('\n✅ Team data retrieved successfully!');
        console.log('\n📊 Team Details:');
        console.log(`   ID: ${teamData.id}`);
        console.log(`   Name: ${teamData.name}`);
        console.log(`   Wallet: ${teamData.wallet}`);
        console.log(`   Country: ${getCountryName(teamData.country)}`);
        console.log(`   ELO Rating: ${teamData.eloRating}`);
        console.log(`   Registered At: ${new Date(Number(teamData.registeredAt) * 1000).toISOString()}`);
        console.log(`   Total Games: ${teamData.totalGames}`);
        console.log(`   Has Active Game: ${teamData.hasActiveGame ? 'Yes' : 'No'}`);
        console.log(`   Game Request ID: ${teamData.gameRequestId || 'None'}`);

        // Team games
        console.log('\n🎮 Team Games:');
        console.log(`   Total Games Played: ${teamData.games.length}`);
        if (teamData.games.length > 0) {
            console.log(`   Game IDs: [${teamData.games.join(', ')}]`);

            // Fetch last 5 games for detailed info
            const lastNGames = await client.readContract({
                address: networkConfig.proxyAddress as `0x${string}`,
                abi: CONTRACT_ABI,
                functionName: 'getLastNGames',
                args: [BigInt(teamId), BigInt(5)]
            }) as any;

            if (lastNGames.length > 0) {
                console.log('\n📜 Recent Games (Last 5):');
                lastNGames.forEach((game: any, index: number) => {
                    console.log(`   Game ${index + 1}:`);
                    console.log(`     ID: ${game.gameId}`);
                    console.log(`     Status: ${getGameStatusString(game.status)}`);
                    console.log(`     Created: ${new Date(Number(game.createdAt) * 1000).toISOString()}`);
                    console.log(`     Moves Made: ${game.gameState.movesMade}`);
                    console.log(`     Team 1 Score: ${game.gameState.team1score}`);
                    console.log(`     Team 2 Score: ${game.gameState.team2score}`);
                    console.log(`     Winner: ${getWinnerString(game.winner)}`);
                    console.log(`     Finish Reason: ${getFinishReasonString(game.finishReason)}`);

                    // Show which team this team was in the game
                    const isTeam1 = game.team1.teamId === BigInt(teamId);
                    const isTeam2 = game.team2.teamId === BigInt(teamId);
                    if (isTeam1) {
                        console.log(`     This team was: Team 1 (ELO: ${game.team1.eloRating})`);
                    } else if (isTeam2) {
                        console.log(`     This team was: Team 2 (ELO: ${game.team2.eloRating})`);
                    }
                    console.log('');
                });
            }
        } else {
            console.log('   No games played yet');
        }

        // Additional team statistics
        console.log('\n📈 Team Statistics:');
        const activeGames = await client.readContract({
            address: networkConfig.proxyAddress as `0x${string}`,
            abi: CONTRACT_ABI,
            functionName: 'getActiveGames',
            args: []
        }) as any;

        const activeGameCount = await client.readContract({
            address: networkConfig.proxyAddress as `0x${string}`,
            abi: CONTRACT_ABI,
            functionName: 'getActiveGameCount',
            args: []
        }) as any;

        console.log(`   Active Games Count: ${activeGameCount}`);
        console.log(`   Active Game IDs: [${activeGames.join(', ')}]`);

        // Check if this team has an active game
        const hasActiveGame = activeGames.some((gameId: any) => {
            // We'd need to check each active game to see if this team is playing
            // For now, we'll use the hasActiveGame flag from team data
            return teamData.hasActiveGame;
        });
        console.log(`   This team has active game: ${hasActiveGame ? 'Yes' : 'No'}`);

        return teamData;

    } catch (error) {
        console.error('\n❌ Error fetching team info:', error);
        return null;
    }
}

function getGameStatusString(status: number): string {
    switch (status) {
        case 0: return 'NONE';
        case 1: return 'ACTIVE';
        case 2: return 'FINISHED';
        case 3: return 'FINISHED_BY_TIMEOUT';
        default: return `UNKNOWN (${status})`;
    }
}

function getWinnerString(winner: number): string {
    switch (winner) {
        case 0: return 'NONE';
        case 1: return 'TEAM_1';
        case 2: return 'TEAM_2';
        default: return `UNKNOWN (${winner})`;
    }
}

function getFinishReasonString(reason: number): string {
    switch (reason) {
        case 0: return 'NONE';
        case 1: return 'MAX_MOVES_REACHED';
        case 2: return 'MOVE_TIMEOUT';
        default: return `UNKNOWN (${reason})`;
    }
}

function getCountryName(countryCode: number): string {
    // Basic country mapping - you might want to expand this
    const countries: { [key: number]: string } = {
        0: 'Unknown',
        1: 'United States',
        2: 'Canada',
        3: 'United Kingdom',
        4: 'Germany',
        5: 'France',
        6: 'Spain',
        7: 'Italy',
        8: 'Brazil',
        9: 'Argentina',
        10: 'Japan',
        // Add more countries as needed
    };
    return countries[countryCode] || `Country Code ${countryCode}`;
}

// Main execution
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: yarn ts-node scripts/fetch-team.ts <teamId> [network]');
        console.log('  teamId: The ID of the team to fetch');
        console.log('  network: Optional - baseSepolia (default) or baseMainnet');
        console.log('\nExamples:');
        console.log('  yarn ts-node scripts/fetch-team.ts 1');
        console.log('  yarn ts-node scripts/fetch-team.ts 1 baseSepolia');
        console.log('  yarn ts-node scripts/fetch-team.ts 1 baseMainnet');
        return;
    }

    const teamId = args[0];
    const network = (args[1] as 'baseSepolia' | 'baseMainnet') || 'baseSepolia';

    console.log('here', teamId, network);

    // Validate team ID
    if (isNaN(Number(teamId)) || Number(teamId) < 0) {
        console.error('❌ Invalid team ID. Please provide a valid positive number.');
        return;
    }

    // Validate network
    if (!['baseSepolia', 'baseMainnet'].includes(network)) {
        console.error('❌ Invalid network. Please use "baseSepolia" or "baseMainnet".');
        return;
    }

    await fetchTeamInfo(teamId, network);
}

function bigintToNumber(key: string, value: any) {
    return typeof value === "bigint" ? Number(value) : value
}

// Run the script
if (require.main === module) {
    main().catch(console.error);
}

export { fetchTeamInfo };
