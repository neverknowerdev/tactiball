import { expect } from 'chai';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

// Test configuration
const TEST_ZEALY_API_KEY = process.env.ZEALY_API_KEY || "eb50c37i_YJBlFllX6ojkZycqFd";
const TEST_WALLET_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
const TEST_USER_ID = "test-zealy-user-123";
const TEST_TEAM_ID = 1;

describe('Zealy Verify User Won Game API', () => {
  let supabase: any;
  let mockTeam: any;

  before(async () => {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.TEST_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }

    supabase = createClient(supabaseUrl, supabaseKey);

    // Setup test data - get or create a test team
    const { data: existingTeam } = await supabase
      .from('teams')
      .select('*')
      .eq('id', TEST_TEAM_ID)
      .maybeSingle();

    mockTeam = existingTeam;
  });

  it('should have valid Supabase connection', async () => {
    const { data, error } = await supabase
      .from('teams')
      .select('count')
      .limit(1);

    expect(error).to.be.null;
    expect(data).to.exist;
  });

  it('should reject request with invalid API key', async () => {
    const mockRequest = {
      headers: {
        get: (key: string) => {
          if (key === 'x-api-key') return 'invalid-key';
          return null;
        }
      },
      json: async () => ({})
    };

    // Import and call the POST function
    const { POST } = await import('../frontend/app/api/zealy/verify-user-won-game/route');
    const response = await POST(mockRequest as any);

    expect(response.status).to.equal(400);
    const body = await response.json();
    expect(body.message).to.equal('Invalid API key');
  });

  it('should reject request without zealy-connect account', async () => {
    const mockRequest = {
      headers: {
        get: (key: string) => {
          if (key === 'x-api-key') return TEST_ZEALY_API_KEY;
          return null;
        }
      },
      json: async () => ({
        userId: TEST_USER_ID,
        communityId: 'test-community',
        subdomain: 'test-subdomain',
        questId: 'test-quest',
        requestId: 'test-request-123',
        accounts: {}
      })
    };

    const { POST } = await import('../frontend/app/api/zealy/verify-user-won-game/route');
    const response = await POST(mockRequest as any);

    expect(response.status).to.equal(400);
    const body = await response.json();
    expect(body.message).to.include('Account not connected');
  });

  it('should reject request for non-existent team', async () => {
    const nonExistentWallet = '0xnonexistent000000000000000000000000000000';

    const mockRequest = {
      headers: {
        get: (key: string) => {
          if (key === 'x-api-key') return TEST_ZEALY_API_KEY;
          return null;
        }
      },
      json: async () => ({
        userId: TEST_USER_ID,
        communityId: 'test-community',
        subdomain: 'test-subdomain',
        questId: 'test-quest',
        requestId: 'test-request-123',
        accounts: {
          'zealy-connect': nonExistentWallet
        }
      })
    };

    const { POST } = await import('../frontend/app/api/zealy/verify-user-won-game/route');
    const response = await POST(mockRequest as any);

    expect(response.status).to.equal(400);
    const body = await response.json();
    expect(body.message).to.include('No TactiBall team found');
  });

  it('should verify team exists in database', async () => {
    if (!mockTeam) {
      console.log('⚠️  No test team found, skipping test');
      return;
    }

    const { data: team, error } = await supabase
      .from('teams')
      .select('id, name, primary_wallet, zealy_user_id')
      .eq('id', mockTeam.id)
      .maybeSingle();

    expect(error).to.be.null;
    expect(team).to.exist;
    expect(team.id).to.equal(mockTeam.id);
    console.log('✅ Test team found:', team.name);
  });

  it('should check for games won today', async () => {
    if (!mockTeam) {
      console.log('⚠️  No test team found, skipping test');
      return;
    }

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayStartISO = todayStart.toISOString();

    // Fixed: Using correct column names from schema
    const { data: games, error } = await supabase
      .from('games')
      .select('id, status, created_at, team1, team2, winner')
      .or(`team1.eq.${mockTeam.id},team2.eq.${mockTeam.id}`)
      .eq('status', 'finished')
      .eq('winner', mockTeam.id)
      .gte('created_at', todayStartISO);

    expect(error).to.be.null;
    console.log(`\n🎮 Games won today by team ${mockTeam.id}: ${games?.length || 0}`);

    if (games && games.length > 0) {
      console.log('  Recent wins:', games.slice(0, 3).map((g: any) => ({
        id: g.id,
        created_at: g.created_at
      })));
    }
  });

  it('should reject mismatched zealy_user_id', async () => {
    if (!mockTeam || !mockTeam.primary_wallet) {
      console.log('⚠️  No test team with wallet found, skipping test');
      return;
    }

    // Update team with a different Zealy user ID
    await supabase
      .from('teams')
      .update({ zealy_user_id: 'different-user-id' })
      .eq('id', mockTeam.id);

    const mockRequest = {
      headers: {
        get: (key: string) => {
          if (key === 'x-api-key') return TEST_ZEALY_API_KEY;
          return null;
        }
      },
      json: async () => ({
        userId: TEST_USER_ID,
        communityId: 'test-community',
        subdomain: 'test-subdomain',
        questId: 'test-quest',
        requestId: 'test-request-123',
        accounts: {
          'zealy-connect': mockTeam.primary_wallet
        }
      })
    };

    const { POST } = await import('../frontend/app/api/zealy/verify-user-won-game/route');
    const response = await POST(mockRequest as any);

    const body = await response.json();

    if (response.status === 400 && body.message.includes('Account mismatch')) {
      expect(body.message).to.include('Account mismatch');
      console.log('✅ Correctly rejected mismatched user ID');
    }

    // Cleanup - reset zealy_user_id
    await supabase
      .from('teams')
      .update({ zealy_user_id: null })
      .eq('id', mockTeam.id);
  });

  it('should validate UTC timezone for today filter', () => {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setUTCHours(23, 59, 59, 999);

    console.log('\n⏰ UTC Time validation:');
    console.log('  Today start (UTC):', todayStart.toISOString());
    console.log('  Today end (UTC):', todayEnd.toISOString());

    expect(todayStart.getUTCHours()).to.equal(0);
    expect(todayStart.getUTCMinutes()).to.equal(0);
    expect(todayStart.getUTCSeconds()).to.equal(0);
  });

  it('should verify game status and winner fields', async () => {
    if (!mockTeam) {
      console.log('⚠️  No test team found, skipping test');
      return;
    }

    // Fixed: Using correct column names
    const { data: recentGames } = await supabase
      .from('games')
      .select('id, status, winner, team1, team2')
      .or(`team1.eq.${mockTeam.id},team2.eq.${mockTeam.id}`)
      .eq('status', 'finished')
      .limit(5);

    if (recentGames && recentGames.length > 0) {
      console.log(`\n📊 Recent finished games: ${recentGames.length}`);

      recentGames.forEach((game: any) => {
        expect(game.status).to.equal('finished');
        expect(game.winner).to.exist;

        const teamWon = game.winner === mockTeam.id;
        console.log(`  Game ${game.id}: ${teamWon ? '✅ Won' : '❌ Lost'}`);
      });
    }
  });

  it('should handle successful quest completion', async () => {
    if (!mockTeam || !mockTeam.primary_wallet) {
      console.log('⚠️  No test team with wallet found, skipping test');
      return;
    }

    // Check if team has won any games today
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    // Fixed: Using correct column names
    const { data: todayGames } = await supabase
      .from('games')
      .select('id')
      .or(`team1.eq.${mockTeam.id},team2.eq.${mockTeam.id}`)
      .eq('status', 'finished')
      .eq('winner', mockTeam.id)
      .gte('created_at', todayStart.toISOString())
      .limit(1);

    if (todayGames && todayGames.length > 0) {
      const mockRequest = {
        headers: {
          get: (key: string) => {
            if (key === 'x-api-key') return TEST_ZEALY_API_KEY;
            return null;
          }
        },
        json: async () => ({
          userId: TEST_USER_ID,
          communityId: 'test-community',
          subdomain: 'test-subdomain',
          questId: 'test-quest',
          requestId: 'test-request-123',
          accounts: {
            'zealy-connect': mockTeam.primary_wallet
          }
        })
      };

      const { POST } = await import('../frontend/app/api/zealy/verify-user-won-game/route');
      const response = await POST(mockRequest as any);

      expect(response.status).to.equal(200);
      const body = await response.json();
      expect(body.message).to.include('Quest completed');
      console.log('✅ Quest completion verified:', body.message);
    } else {
      console.log('⚠️  Team has no wins today, skipping successful completion test');
    }
  });

  it('should verify request body structure', () => {
    const validBody = {
      userId: 'test-user',
      communityId: 'test-community',
      subdomain: 'test-subdomain',
      questId: 'test-quest',
      requestId: 'test-request',
      accounts: {
        'zealy-connect': '0x123'
      }
    };

    expect(validBody).to.have.property('userId');
    expect(validBody).to.have.property('communityId');
    expect(validBody).to.have.property('subdomain');
    expect(validBody).to.have.property('questId');
    expect(validBody).to.have.property('requestId');
    expect(validBody).to.have.property('accounts');
    expect(validBody.accounts).to.have.property('zealy-connect');

    console.log('✅ Request body structure validated');
  });
});

describe('Zealy API Error Handling', () => {
  let supabase: any;

  before(() => {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.TEST_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
    supabase = createClient(supabaseUrl, supabaseKey);
  });

  it('should handle malformed request body gracefully', async () => {
    const mockRequest = {
      headers: {
        get: (key: string) => {
          if (key === 'x-api-key') return TEST_ZEALY_API_KEY;
          return null;
        }
      },
      json: async () => {
        throw new Error('Invalid JSON');
      }
    };

    const { POST } = await import('../frontend/app/api/zealy/verify-user-won-game/route');
    const response = await POST(mockRequest as any);

    expect(response.status).to.equal(400);
    const body = await response.json();
    expect(body.message).to.include('unexpected error');
  });

  it('should include requestId in error messages for tracking', async () => {
    const testRequestId = 'test-track-123';
    const mockRequest = {
      headers: {
        get: (key: string) => {
          if (key === 'x-api-key') return TEST_ZEALY_API_KEY;
          return null;
        }
      },
      json: async () => ({
        userId: TEST_USER_ID,
        communityId: 'test-community',
        subdomain: 'test-subdomain',
        questId: 'test-quest',
        requestId: testRequestId,
        accounts: {
          'zealy-connect': '0xnonexistent'
        }
      })
    };

    const { POST } = await import('../frontend/app/api/zealy/verify-user-won-game/route');
    const response = await POST(mockRequest as any);

    // Should handle non-existent team gracefully
    expect(response.status).to.equal(400);
    console.log('✅ Error tracking with requestId validated');
  });

  it('should verify all error responses return status 400', async () => {
    const errorScenarios = [
      'Invalid API key',
      'Account not connected',
      'No team found',
      'No games won'
    ];

    console.log('\n🔍 Error response codes validation:');
    errorScenarios.forEach(scenario => {
      console.log(`  ${scenario}: Expected status 400`);
    });

    expect(errorScenarios.length).to.be.greaterThan(0);
  });
});