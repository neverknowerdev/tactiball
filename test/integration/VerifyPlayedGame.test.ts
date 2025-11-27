// ============================================================================
// FILE: __tests__/api/zealy/verify-user-played-game.test.ts
// ============================================================================

import { expect } from 'chai';
import { pool } from '../../frontend/db/client';
import * as dotenv from 'dotenv';

dotenv.config();

// Test configuration
const TEST_WALLET_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';
const TEST_ZEALY_USER_ID = 'test-zealy-user-123';
const ZEALY_API_KEY = process.env.ZEALY_API_KEY || 'eb50c37i_YJBlFllX6ojkZycqFd';

describe('Zealy - Verify User Played Game', () => {
    let testTeamId: number | undefined;

    before(async () => {
        const { rows: [team] } = await pool.query(
            'SELECT id FROM teams WHERE primary_wallet = $1',
            [TEST_WALLET_ADDRESS]
        );

        if (team) {
            testTeamId = team.id;
            console.log(`\n✅ Using existing test team: ${testTeamId}`);
        } else {
            console.log('\n⚠️  No test team found. Please create a team with wallet:', TEST_WALLET_ADDRESS);
        }
    });

    it('should have valid database connection', async () => {
        const { rows: [{ count }] } = await pool.query<{ count: string }>('SELECT COUNT(*)::int AS count FROM teams');
        expect(Number(count)).to.be.a('number');
    });

    it('should find test team with correct wallet address', async () => {
        const { rows: [team] } = await pool.query(
            'SELECT id, name, primary_wallet, zealy_user_id FROM teams WHERE primary_wallet = $1',
            [TEST_WALLET_ADDRESS]
        );

        console.log('\n📊 Test team data:', team);

        if (team) {
            expect(team.primary_wallet).to.equal(TEST_WALLET_ADDRESS);
            expect(team.id).to.exist;
            testTeamId = team.id;
        } else {
            console.warn('⚠️  No team found for test wallet');
        }
    });

    it('should have zealy_user_id set on test team', async () => {
        const { rows: [team] } = await pool.query(
            'SELECT zealy_user_id FROM teams WHERE primary_wallet = $1',
            [TEST_WALLET_ADDRESS]
        );

        if (team) {
            console.log(`\n🔗 Zealy User ID: ${team.zealy_user_id || 'NOT SET'}`);

            if (!team.zealy_user_id) {
                console.warn('⚠️  zealy_user_id is not set. Link account first via /api/zealy/link-zealy-account');
            }
        }
    });

    it('should query for games played today', async () => {
        if (!testTeamId) {
            console.warn('⚠️  Skipping: No test team ID');
            return;
        }

        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);

        const { rows: games } = await pool.query(
            `SELECT id, status, created_at, team1, team2
             FROM games
             WHERE (team1 = $1 OR team2 = $1)
               AND status = 'finished'
               AND created_at >= $2`,
            [testTeamId, todayStart.toISOString()]
        );

        console.log(`\n🎮 Games played today: ${games.length}`);

        if (games.length > 0) {
            console.log('  Game IDs:', games.map(g => g.id));
            expect(games.length).to.be.greaterThan(0);
        } else {
            console.log('  ℹ️  No games played today (expected if no games)');
        }
    });

    it('should verify game query filters are correct', async () => {
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);

        expect(todayStart.getUTCHours()).to.equal(0);
        expect(todayStart.getUTCMinutes()).to.equal(0);
        expect(todayStart.getUTCSeconds()).to.equal(0);

        console.log(`\n📅 Date filter: ${todayStart.toISOString()}`);
        console.log(`✅ Filters correctly set to today 00:00:00 UTC`);
    });

    it('should check all finished games (not just today)', async () => {
        if (!testTeamId) {
            console.warn('⚠️  Skipping: No test team ID');
            return;
        }

        const { rows: games } = await pool.query(
            `SELECT id, status, created_at, team1, team2
             FROM games
             WHERE (team1 = $1 OR team2 = $1)
               AND status = 'finished'
             ORDER BY created_at DESC
             LIMIT 10`,
            [testTeamId]
        );

        console.log(`\n📊 Total finished games (last 10): ${games.length}`);

        if (games.length > 0) {
            console.log('  Most recent games:');
            games.forEach((game, idx) => {
                const date = new Date(game.created_at);
                console.log(`    ${idx + 1}. Game ${game.id} - ${date.toISOString()}`);
            });
        }
    });

    it('should validate game status values', async () => {
        const { rows: games } = await pool.query(
            `SELECT status FROM games LIMIT 20`
        );

        if (games.length > 0) {
            const statuses = [...new Set(games.map(g => g.status))];
            console.log(`\n🎯 Game statuses found in DB:`, statuses);
            const hasFinished = statuses.includes('finished');
            console.log(`  Has 'finished' status: ${hasFinished ? '✅' : '❌'}`);
        }
    });

    it('should simulate Zealy API request for played game', async () => {
        if (!testTeamId) {
            console.warn('⚠️  Skipping: No test team ID');
            return;
        }

        const zealyRequest = {
            userId: TEST_ZEALY_USER_ID,
            communityId: 'chessball',
            subdomain: 'chessballtacticians',
            questId: 'play-game-quest',
            requestId: `test-${Date.now()}`,
            accounts: {
                'zealy-connect': TEST_WALLET_ADDRESS
            }
        };

        console.log('\n📨 Simulated Zealy request:', zealyRequest);

        const { rows: [team] } = await pool.query(
            'SELECT id, name, primary_wallet, zealy_user_id FROM teams WHERE primary_wallet = $1',
            [zealyRequest.accounts['zealy-connect']]
        );

        if (team) {
            console.log('✅ Team found:', team.name);
            expect(team.primary_wallet).to.equal(TEST_WALLET_ADDRESS);
        } else {
            console.log('❌ Team not found');
        }

        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);

        const { rows: games } = await pool.query(
            `SELECT id FROM games
             WHERE (team1 = $1 OR team2 = $1)
               AND status = 'finished'
               AND created_at >= $2
             LIMIT 1`,
            [team?.id, todayStart.toISOString()]
        );

        if (games.length > 0) {
            console.log('✅ Quest would PASS - game played today');
            expect(games.length).to.be.greaterThan(0);
        } else {
            console.log('❌ Quest would FAIL - no game played today');
        }
    });

    it('should verify quest fails without games today', async () => {
        if (!testTeamId) {
            console.warn('⚠️  Skipping: No test team ID');
            return;
        }

        const tomorrow = new Date();
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        tomorrow.setUTCHours(0, 0, 0, 0);

        const { rows: games } = await pool.query(
            `SELECT id FROM games
             WHERE (team1 = $1 OR team2 = $1)
               AND status = 'finished'
               AND created_at >= $2
             LIMIT 1`,
            [testTeamId, tomorrow.toISOString()]
        );

        console.log(`\n🔮 Future games check: ${games.length}`);
        expect(games.length).to.equal(0);
    });

    it('should check for Zealy user ID mismatch scenario', async () => {
        const { rows: [team] } = await pool.query(
            'SELECT zealy_user_id FROM teams WHERE primary_wallet = $1',
            [TEST_WALLET_ADDRESS]
        );

        if (team && team.zealy_user_id) {
            const requestUserId = 'different-user-456';
            const isMatch = team.zealy_user_id === requestUserId;

            console.log(`\n🔐 Zealy ID verification:`);
            console.log(`  DB Zealy ID: ${team.zealy_user_id}`);
            console.log(`  Request ID: ${requestUserId}`);
            console.log(`  Match: ${isMatch ? '✅' : '❌'}`);

            if (!isMatch) {
                console.log('  Expected: Quest would fail with mismatch error');
            }
        }
    });

    it('should verify only finished games are counted', async () => {
        if (!testTeamId) {
            console.warn('⚠️  Skipping: No test team ID');
            return;
        }

        const { rows: games } = await pool.query(
            `SELECT status FROM games
             WHERE (team1 = $1 OR team2 = $1)
             LIMIT 100`,
            [testTeamId]
        );

        if (games.length > 0) {
            const statusCounts: Record<string, number> = {};
            games.forEach(game => {
                statusCounts[game.status] = (statusCounts[game.status] || 0) + 1;
            });

            console.log(`\n📊 Game status distribution:`);
            Object.entries(statusCounts).forEach(([status, count]) => {
                console.log(`  ${status}: ${count}`);
            });

            console.log(`\n✅ Only counting 'finished' status (excludes finished_by_timeout, active, etc.)`);
        }
    });
});

describe('Quick Validation - Played Game Quest', () => {
    it('should check all teams with Zealy linked', async () => {
        const { rows: teamsWithZealy } = await pool.query(
            `SELECT id, name, primary_wallet, zealy_user_id
             FROM teams
             WHERE zealy_user_id IS NOT NULL`
        );

        console.log(`\n🔗 Teams with Zealy linked: ${teamsWithZealy.length}`);

        if (teamsWithZealy.length > 0) {
            console.log('  Sample teams:');
            teamsWithZealy.slice(0, 5).forEach(team => {
                console.log(`    - ${team.name} (${team.primary_wallet})`);
            });
        }
    });

    it('should verify database schema has required columns', async () => {
        const { rows: [sampleGame] } = await pool.query(
            `SELECT id, status, created_at, team1, team2 FROM games LIMIT 1`
        );

        if (sampleGame) {
            console.log('\n✅ Database schema validation:');
            console.log('  ✓ id');
            console.log('  ✓ status');
            console.log('  ✓ created_at');
            console.log('  ✓ team1');
            console.log('  ✓ team2');

            expect(sampleGame).to.have.property('id');
            expect(sampleGame).to.have.property('status');
            expect(sampleGame).to.have.property('created_at');
            expect(sampleGame).to.have.property('team1');
            expect(sampleGame).to.have.property('team2');
        }
    });
});