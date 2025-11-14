import { ethers } from "hardhat";
import { ChessBallGame } from "../../typechain-types";
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

// Initialize Supabase client
function createSupabaseClient() {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase environment variables');
    }

    return createClient(supabaseUrl, supabaseKey);
}

async function main() {
    console.log("🌱 Starting seed data script for Preview environment...");

    // Check required environment variables
    if (!process.env.RELAYER_PRIVATE_KEY) {
        throw new Error("RELAYER_PRIVATE_KEY environment variable is required");
    }

    const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL;
    if (!BASE_SEPOLIA_RPC_URL) {
        throw new Error("BASE_SEPOLIA_RPC_URL environment variable is required");
    }

    // Get contract address from deployment.json
    const deploymentPath = path.join(__dirname, '..', 'deployment.json');
    let deploymentData: any = {};

    try {
        const deploymentContent = fs.readFileSync(deploymentPath, 'utf8');
        deploymentData = JSON.parse(deploymentContent);
    } catch (error) {
        throw new Error(`Could not read deployment.json: ${error}`);
    }

    // Get contract address - handle both old format and new format
    let contractAddress: string;
    if (deploymentData.baseSepolia?.proxyAddress) {
        contractAddress = deploymentData.baseSepolia.proxyAddress;
    } else if (deploymentData.proxyAddress) {
        contractAddress = deploymentData.proxyAddress;
    } else {
        throw new Error("Contract address not found in deployment.json");
    }

    console.log(`📋 Contract address: ${contractAddress}`);

    // Create wallet from private key
    const wallet = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY);
    console.log(`👛 Using wallet: ${wallet.address}`);

    // Connect to provider
    const provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC_URL);
    const connectedWallet = wallet.connect(provider);

    // Get contract instance
    const gameContract = await ethers.getContractAt("ChessBallGame", contractAddress, connectedWallet) as ChessBallGame;

    // Initialize Supabase client
    const supabase = createSupabaseClient();

    // Default wallet address
    const defaultWallet = "0x810E57D64D4Bd3D92560dF5E82f01f654359F89B";
    const relayerWallet = wallet.address;

    // Teams to create - each team needs a different wallet
    const teams = [
        { name: "DevRoyale", country: 1, wallet: defaultWallet },
        { name: "neverknower", country: 1, wallet: relayerWallet }
    ];

    console.log("\n📝 Creating teams on smart contract and database...");

    for (const team of teams) {
        try {
            // Check if team already exists in contract for this wallet
            const existingTeamId = await gameContract.teamIdByWallet(team.wallet);

            if (existingTeamId > 0) {
                console.log(`⚠️  Team already exists in contract for wallet ${team.wallet}. Team ID: ${existingTeamId}`);

                // Check if team exists in database
                const { data: dbTeam } = await supabase
                    .from('teams')
                    .select('*')
                    .eq('id', Number(existingTeamId))
                    .single();

                if (dbTeam) {
                    console.log(`✅ Team "${team.name}" already exists in database with ID ${existingTeamId}`);
                    continue;
                } else {
                    // Team exists in contract but not in DB, insert it
                    console.log(`📥 Inserting team "${team.name}" into database...`);
                    const { error: insertError } = await supabase
                        .from('teams')
                        .insert({
                            id: Number(existingTeamId),
                            primary_wallet: team.wallet,
                            name: team.name,
                            country: team.country,
                            elo_rating: 10000,
                            created_at: new Date().toISOString()
                        });

                    if (insertError) {
                        console.error(`❌ Error inserting team "${team.name}" into database:`, insertError);
                    } else {
                        console.log(`✅ Team "${team.name}" inserted into database`);
                    }
                }
            } else {
                // Create team on contract - use createTeamRelayer for the default wallet, createTeam for relayer wallet
                console.log(`🚀 Creating team "${team.name}" on contract for wallet ${team.wallet}...`);

                const gasPrice = await provider.getFeeData();
                const adjustedGasPrice = gasPrice.gasPrice ? gasPrice.gasPrice * 150n / 100n : undefined;

                let tx;
                if (team.wallet.toLowerCase() === connectedWallet.address.toLowerCase()) {
                    // Use regular createTeam if wallet matches the connected wallet
                    tx = await gameContract.createTeam(team.name, team.country, {
                        gasPrice: adjustedGasPrice
                    });
                } else {
                    // Use createTeamRelayer for other wallets (requires relayer permission)
                    tx = await gameContract.createTeamRelayer(team.wallet, team.name, team.country, {
                        gasPrice: adjustedGasPrice
                    });
                }

                console.log(`⏳ Transaction hash: ${tx.hash}`);
                console.log("Waiting for transaction confirmation...");

                const receipt = await tx.wait();
                console.log(`✅ Transaction confirmed in block ${receipt?.blockNumber}`);

                // Get the team ID from the contract
                const teamId = await gameContract.teamIdByWallet(team.wallet);
                console.log(`📋 Team ID from contract: ${teamId}`);

                // Insert team into database
                console.log(`📥 Inserting team "${team.name}" into database...`);
                const { error: insertError } = await supabase
                    .from('teams')
                    .insert({
                        id: Number(teamId),
                        primary_wallet: team.wallet,
                        name: team.name,
                        country: team.country,
                        elo_rating: 10000,
                        created_at: new Date().toISOString()
                    });

                if (insertError) {
                    console.error(`❌ Error inserting team "${team.name}" into database:`, insertError);
                } else {
                    console.log(`✅ Team "${team.name}" created successfully!`);
                    console.log(`   - Team ID: ${teamId}`);
                    console.log(`   - Name: ${team.name}`);
                    console.log(`   - Country: ${team.country}`);
                    console.log(`   - Wallet: ${team.wallet}`);
                }
            }
        } catch (error: any) {
            console.error(`❌ Error processing team "${team.name}":`, error.message);
            // Continue with next team
        }
    }

    console.log("\n🎉 Seed data script completed!");
}

// Run the script
main()
    .then(() => {
        console.log("\n✅ Script completed successfully!");
        process.exit(0);
    })
    .catch((error) => {
        console.error("\n💥 Script failed:", error);
        process.exit(1);
    });
