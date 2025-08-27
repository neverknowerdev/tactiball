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

async function fetchGameInfo(gameId: string, network: 'baseSepolia' | 'baseMainnet' = 'baseSepolia') {
    try {
        // Get network configuration
        const networkConfig = deployment[network];
        if (!networkConfig) {
            throw new Error(`Network ${network} not found in deployment config`);
        }

        console.log(`\n🔍 Fetching game info for Game ID: ${gameId}`);
        console.log(`🌐 Network: ${network}`);
        console.log(`📍 Contract Address: ${networkConfig.proxyAddress}`);
        console.log(`⛓️  Chain ID: ${networkConfig.chainId}`);

        // Setup client
        const client = createPublicClient({
            chain: network === 'baseSepolia' ? baseSepolia : base,
            transport: http()
        });

        // Fetch game data
        console.log('\n📡 Calling getGame function...');
        const gameData = await client.readContract({
            address: networkConfig.proxyAddress as `0x${string}`,
            abi: CONTRACT_ABI,
            functionName: 'getGame',
            args: [BigInt(gameId)]
        }) as any;

        console.log('\n✅ Game data retrieved successfully!');
        console.log('\n📊 Game Details:');
        console.log(`   ID: ${gameData.gameId}`);
        console.log(`   Status: ${getGameStatusString(gameData.status)}`);
        console.log(`   Created At: ${new Date(Number(gameData.createdAt) * 1000).toISOString()}`);
        console.log(`   Moves Made: ${gameData.movesMade}`);
        console.log(`   History length: ${gameData.history.length}`);
        console.log(`   Last Move Time: ${gameData.lastMoveTime ? new Date(Number(gameData.lastMoveTime) * 1000).toISOString() : 'N/A'}`);

        // Team 1 info
        console.log('\n🔴 Team 1:');
        console.log(`   ID: ${gameData.team1.teamId}`);
        console.log(`   ELO Rating: ${gameData.team1.eloRating}`);
        console.log(`   Score: ${gameData.team1.score}`);
        console.log(`   Move Committed: ${gameData.team1.isCommittedMove ? 'Yes' : 'No'}`);

        // Team 2 info
        console.log('\n🔵 Team 2:');
        console.log(`   ID: ${gameData.team2.teamId}`);
        console.log(`   ELO Rating: ${gameData.team2.eloRating}`);
        console.log(`   Score: ${gameData.team2.score}`);
        console.log(`   Move Committed: ${gameData.team2.isCommittedMove ? 'Yes' : 'No'}`);

        // Game history
        if (gameData.history && gameData.history.length > 0) {
            console.log('\n📜 Game History:');
            gameData.history.forEach((state: any, index: number) => {
                console.log(`   State ${index + 1}:`);
                console.log(`     Type: ${getStateTypeString(state.type)}`);
                console.log(`     Ball Position: (${state.ballPosition.x}, ${state.ballPosition.y})`);
                console.log(`     Ball Owner: ${getBallOwnerString(state.ballOwner)}`);
                console.log(`     Team 1 Positions: ${state.team1Positions.length} players`);
                console.log(`     Team 2 Positions: ${state.team2Positions.length} players`);
                if (state.clashRandomResults && state.clashRandomResults.length > 0) {
                    console.log(`     Clash Results: [${state.clashRandomResults.join(', ')}]`);
                }
            });
        }

        // Additional info
        console.log('\n📈 Additional Info:');
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

        return gameData;

    } catch (error) {
        console.error('\n❌ Error fetching game info:', error);
        return null;
    }
}

function getGameStatusString(status: number): string {
    switch (status) {
        case 0: return 'PENDING';
        case 1: return 'ACTIVE';
        case 2: return 'FINISHED';
        case 3: return 'FINISHED_BY_TIMEOUT';
        default: return `UNKNOWN (${status})`;
    }
}

function getBallOwnerString(owner: number): string {
    switch (owner) {
        case 0: return 'NO_OWNER';
        case 1: return 'TEAM_1';
        case 2: return 'TEAM_2';
        default: return `UNKNOWN (${owner})`;
    }
}

function getStateTypeString(type: number): string {
    switch (type) {
        case 1: return 'START_POSITIONS';
        case 2: return 'MOVE';
        case 3: return 'GOAL';
        default: return `UNKNOWN (${type})`;
    }
}

// Main execution
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: yarn ts-node scripts/fetch-game-simple.ts <gameId> [network]');
        console.log('  gameId: The ID of the game to fetch');
        console.log('  network: Optional - baseSepolia (default) or baseMainnet');
        console.log('\nExamples:');
        console.log('  yarn ts-node scripts/fetch-game-simple.ts 1');
        console.log('  yarn ts-node scripts/fetch-game-simple.ts 1 baseSepolia');
        console.log('  yarn ts-node scripts/fetch-game-simple.ts 1 baseMainnet');
        return;
    }

    const gameId = args[0];
    const network = (args[1] as 'baseSepolia' | 'baseMainnet') || 'baseSepolia';

    console.log('here', gameId, network);

    // Validate game ID
    if (isNaN(Number(gameId)) || Number(gameId) < 0) {
        console.error('❌ Invalid game ID. Please provide a valid positive number.');
        return;
    }

    // Validate network
    if (!['baseSepolia', 'baseMainnet'].includes(network)) {
        console.error('❌ Invalid network. Please use "baseSepolia" or "baseMainnet".');
        return;
    }

    await fetchGameInfo(gameId, network);
}

// Run the script
if (require.main === module) {
    main().catch(console.error);
}

export { fetchGameInfo };
