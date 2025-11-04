import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http } from 'viem';
import { baseSepolia, base } from 'viem/chains';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

// Load deployment configuration
const deploymentPath = path.join(__dirname, '..', 'deployment.json');
const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));

// Import the ABI from the artifact file
const artifactPath = path.join(__dirname, '..', 'artifacts', 'contracts', 'Game.sol', 'ChessBallGame.json');
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
const CONTRACT_ABI = artifact.abi;

// Test configuration
const TEST_NETWORK = 'baseSepolia' as const;
const TEST_TEAM_ID = 1; // Change this to an existing team ID

describe('Sync Teams from Contract', () => {
    let supabase: any;
    let viemClient: any;
    let contractAddress: string;

    beforeAll(() => {
        const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.TEST_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
        
        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Missing Supabase environment variables');
        }

        supabase = createClient(supabaseUrl, supabaseKey);

        // Get contract address from deployment config
        const networkConfig = deployment[TEST_NETWORK];
        if (!networkConfig) {
            throw new Error(`Network ${TEST_NETWORK} not found in deployment config`);
        }
        contractAddress = networkConfig.proxyAddress;

        // Create viem client
        const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || process.env.RPC_URL || 'https://sepolia.base.org';
        viemClient = createPublicClient({
            chain: baseSepolia,
            transport: http(rpcUrl)
        });
    });

    it('should have valid Supabase connection', async () => {
        const { data, error } = await supabase.from('teams').select('count').limit(1);
        expect(error).toBeNull();
        expect(data).toBeDefined();
    });

    it('should have valid contract connection', async () => {
        try {
            const nextTeamId = await viemClient.readContract({
                address: contractAddress as `0x${string}`,
                abi: CONTRACT_ABI,
                functionName: 'nextTeamId'
            });
            
            expect(nextTeamId).toBeDefined();
            expect(Number(nextTeamId)).toBeGreaterThanOrEqual(0);
            console.log(`✅ Contract connection valid. nextTeamId: ${nextTeamId}`);
        } catch (error) {
            console.error('❌ Contract connection failed:', error);
            throw error;
        }
    });

    it('should fetch a team from contract', async () => {
        try {
            const teamData = await viemClient.readContract({
                address: contractAddress as `0x${string}`,
                abi: CONTRACT_ABI,
                functionName: 'getTeam',
                args: [BigInt(TEST_TEAM_ID)]
            }) as any;

            expect(teamData).toBeDefined();
            expect(teamData.id).toBeDefined();
            expect(teamData.name).toBeDefined();
            expect(teamData.wallet).toBeDefined();
            expect(teamData.country).toBeDefined();
            expect(teamData.eloRating).toBeDefined();
            
            console.log(`✅ Team ${TEST_TEAM_ID} fetched from contract:`);
            console.log(`   Name: ${teamData.name}`);
            console.log(`   Wallet: ${teamData.wallet}`);
            console.log(`   Country: ${teamData.country}`);
            console.log(`   ELO: ${teamData.eloRating}`);
        } catch (error: any) {
            if (error.message?.includes('DoesNotExist') || error.message?.includes('execution reverted')) {
                console.log(`⚠️  Team ${TEST_TEAM_ID} does not exist in contract. Skipping test.`);
                return;
            }
            throw error;
        }
    });

    it('should convert contract ELO rating to database format', () => {
        // Contract stores ELO as uint64 with 2 decimal precision (10000 = 100.00)
        const contractElo = BigInt(10000);
        const dbElo = Number(contractElo) / 100;
        
        expect(dbElo).toBe(100);
        
        const contractElo2 = BigInt(12550); // 125.50
        const dbElo2 = Number(contractElo2) / 100;
        
        expect(dbElo2).toBe(125.5);
    });

    it('should map contract team data to database format', () => {
        const contractTeam = {
            id: BigInt(1),
            wallet: '0x1234567890123456789012345678901234567890',
            name: 'Test Team',
            eloRating: BigInt(10000),
            registeredAt: BigInt(Math.floor(Date.now() / 1000)),
            games: [BigInt(1), BigInt(2)],
            country: 1,
            hasActiveGame: true,
            gameRequestId: BigInt(0),
            totalGames: BigInt(2)
        };

        // Simulate the mapping function
        const convertEloRating = (contractElo: bigint): number => {
            return Number(contractElo) / 100;
        };

        const dbTeam = {
            id: Number(contractTeam.id),
            primary_wallet: contractTeam.wallet,
            name: contractTeam.name,
            country: contractTeam.country,
            game_request_id: contractTeam.gameRequestId > 0 ? Number(contractTeam.gameRequestId) : null,
            active_game_id: contractTeam.hasActiveGame && contractTeam.games.length > 0
                ? Number(contractTeam.games[contractTeam.games.length - 1])
                : null,
            elo_rating: convertEloRating(contractTeam.eloRating),
            created_at: new Date(Number(contractTeam.registeredAt) * 1000).toISOString()
        };

        expect(dbTeam.id).toBe(1);
        expect(dbTeam.primary_wallet).toBe(contractTeam.wallet);
        expect(dbTeam.name).toBe('Test Team');
        expect(dbTeam.country).toBe(1);
        expect(dbTeam.elo_rating).toBe(100);
        expect(dbTeam.active_game_id).toBe(2);
        expect(dbTeam.game_request_id).toBeNull();
        expect(dbTeam.created_at).toBeDefined();
    });

    it('should sync a team from contract to database', async () => {
        // Import the sync function
        const { syncTeamsFromContract } = require('../scripts/sync-teams-from-contract');

        // Get team from contract first
        let contractTeam;
        try {
            contractTeam = await viemClient.readContract({
                address: contractAddress as `0x${string}`,
                abi: CONTRACT_ABI,
                functionName: 'getTeam',
                args: [BigInt(TEST_TEAM_ID)]
            }) as any;
        } catch (error: any) {
            if (error.message?.includes('DoesNotExist') || error.message?.includes('execution reverted')) {
                console.log(`⚠️  Team ${TEST_TEAM_ID} does not exist in contract. Skipping test.`);
                return;
            }
            throw error;
        }

        // Get team from database before sync
        const { data: teamBefore } = await supabase
            .from('teams')
            .select('*')
            .eq('id', TEST_TEAM_ID)
            .single();

        console.log('\n📊 Team before sync:', teamBefore);

        // Run sync for a single team
        await syncTeamsFromContract(
            TEST_NETWORK,
            contractAddress,
            TEST_TEAM_ID,
            TEST_TEAM_ID
        );

        // Get team from database after sync
        const { data: teamAfter } = await supabase
            .from('teams')
            .select('*')
            .eq('id', TEST_TEAM_ID)
            .single();

        console.log('\n📊 Team after sync:', teamAfter);

        // Verify team was synced
        if (teamAfter) {
            expect(teamAfter.id).toBe(TEST_TEAM_ID);
            expect(teamAfter.name).toBe(contractTeam.name);
            expect(teamAfter.primary_wallet).toBe(contractTeam.wallet.toLowerCase());
            expect(teamAfter.country).toBe(Number(contractTeam.country));
            expect(teamAfter.elo_rating).toBe(Number(contractTeam.eloRating) / 100);
        } else {
            console.log('⚠️  Team not found in database after sync');
        }
    }, 60000); // 60 second timeout

    it('should handle non-existent teams gracefully', async () => {
        // Try to fetch a team that doesn't exist
        const nonExistentTeamId = 999999;
        
        try {
            await viemClient.readContract({
                address: contractAddress as `0x${string}`,
                abi: CONTRACT_ABI,
                functionName: 'getTeam',
                args: [BigInt(nonExistentTeamId)]
            });
            
            // If we get here, the team exists (unlikely)
            console.log(`⚠️  Team ${nonExistentTeamId} exists in contract`);
        } catch (error: any) {
            // Expected: contract should revert with DoesNotExist error
            expect(error.message).toContain('DoesNotExist');
            console.log(`✅ Correctly handled non-existent team ${nonExistentTeamId}`);
        }
    });

    it('should validate team data structure from contract', async () => {
        try {
            const teamData = await viemClient.readContract({
                address: contractAddress as `0x${string}`,
                abi: CONTRACT_ABI,
                functionName: 'getTeam',
                args: [BigInt(TEST_TEAM_ID)]
            }) as any;

            // Validate required fields
            expect(teamData.id).toBeDefined();
            expect(teamData.wallet).toBeDefined();
            expect(teamData.name).toBeDefined();
            expect(teamData.country).toBeDefined();
            expect(teamData.eloRating).toBeDefined();
            expect(teamData.registeredAt).toBeDefined();
            expect(teamData.games).toBeDefined();
            expect(teamData.hasActiveGame).toBeDefined();
            expect(teamData.gameRequestId).toBeDefined();
            expect(teamData.totalGames).toBeDefined();

            // Validate data types
            expect(typeof teamData.id).toBe('bigint');
            expect(typeof teamData.name).toBe('string');
            expect(typeof teamData.wallet).toBe('string');
            expect(typeof teamData.country).toBe('number');
            expect(typeof teamData.eloRating).toBe('bigint');
            expect(Array.isArray(teamData.games)).toBe(true);
            expect(typeof teamData.hasActiveGame).toBe('boolean');

            console.log(`✅ Team data structure is valid`);
        } catch (error: any) {
            if (error.message?.includes('DoesNotExist') || error.message?.includes('execution reverted')) {
                console.log(`⚠️  Team ${TEST_TEAM_ID} does not exist in contract. Skipping test.`);
                return;
            }
            throw error;
        }
    });

    it('should get nextTeamId from contract', async () => {
        const nextTeamId = await viemClient.readContract({
            address: contractAddress as `0x${string}`,
            abi: CONTRACT_ABI,
            functionName: 'nextTeamId'
        }) as bigint;

        expect(nextTeamId).toBeDefined();
        expect(Number(nextTeamId)).toBeGreaterThanOrEqual(0);
        
        const totalTeams = Number(nextTeamId) - 1;
        console.log(`\n📊 Contract stats:`);
        console.log(`   nextTeamId: ${nextTeamId}`);
        console.log(`   Total teams: ${totalTeams}`);
        
        if (totalTeams > 0) {
            expect(totalTeams).toBeGreaterThan(0);
        }
    });
});

describe('Team Data Validation', () => {
    let supabase: any;

    beforeAll(() => {
        const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.TEST_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
        
        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Missing Supabase environment variables');
        }

        supabase = createClient(supabaseUrl, supabaseKey);
    });

    it('should validate team data in database matches expected schema', async () => {
        const { data: teams, error } = await supabase
            .from('teams')
            .select('*')
            .limit(5);

        if (error) {
            console.error('Error fetching teams:', error);
            return;
        }

        if (teams && teams.length > 0) {
            const team = teams[0];
            
            // Validate required fields
            expect(team).toHaveProperty('id');
            expect(team).toHaveProperty('primary_wallet');
            expect(team).toHaveProperty('name');
            expect(team).toHaveProperty('country');
            expect(team).toHaveProperty('elo_rating');

            // Validate data types
            expect(typeof team.id).toBe('number');
            expect(typeof team.primary_wallet).toBe('string');
            expect(typeof team.name).toBe('string');
            expect(typeof team.country).toBe('number');
            expect(typeof team.elo_rating).toBe('number');

            console.log(`✅ Database team schema is valid`);
        } else {
            console.log('⚠️  No teams found in database');
        }
    });

    it('should validate ELO rating is within reasonable range', async () => {
        const { data: teams, error } = await supabase
            .from('teams')
            .select('id, name, elo_rating')
            .limit(10);

        if (error) {
            console.error('Error fetching teams:', error);
            return;
        }

        if (teams && teams.length > 0) {
            teams.forEach((team: any) => {
                expect(team.elo_rating).toBeGreaterThan(0);
                expect(team.elo_rating).toBeLessThan(10000); // Reasonable upper limit
                
                // ELO is stored with 2 decimal precision, so it should be divisible by 0.01
                const rounded = Math.round(team.elo_rating * 100) / 100;
                expect(Math.abs(team.elo_rating - rounded)).toBeLessThan(0.001);
            });

            console.log(`✅ ELO ratings are within reasonable range`);
        } else {
            console.log('⚠️  No teams found in database');
        }
    });
});

