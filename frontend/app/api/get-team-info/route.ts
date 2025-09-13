import { NextRequest, NextResponse } from 'next/server';
import { createAnonClient } from '@/lib/supabase';
import moment from 'moment';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const walletAddress = searchParams.get('wallet');
        const teamId = searchParams.get('team_id');

        if (!walletAddress && !teamId) {
            return NextResponse.json(
                { error: 'Either wallet address or team_id is required' },
                { status: 400 }
            );
        }

        // Fetch team info from Supabase
        const supabase = createAnonClient();

        let teamQuery = supabase
            .from('teams')
            .select(`
                id,
                name,
                created_at,
                primary_wallet,
                country,
                elo_rating,
                last_games_results,
                active_game_id
            `);

        // Query by team_id or wallet address
        if (teamId) {
            teamQuery = teamQuery.eq('id', teamId);
        } else {
            teamQuery = teamQuery.eq('primary_wallet', walletAddress);
        }

        const { data: team, error } = await teamQuery.single();

        if (error) {
            if (error.code === 'PGRST116') {
                // No team found
                return NextResponse.json({
                    is_found: false,
                    message: teamId ? `No team found with ID: ${teamId}` : `No team found for wallet address: ${walletAddress}`
                });
            }
            throw error;
        }

        // Calculate team age in days
        const teamAge = Math.floor((Date.now() - new Date(team.created_at).getTime()) / (1000 * 60 * 60 * 24));


        console.log('team.elo_rating', team.elo_rating);

        const startOfWeek = moment().startOf('isoWeek').format('YYYY-MM-DD');
        const startOfMonth = moment().startOf('month').format('YYYY-MM-DD');

        console.log('start of week', startOfWeek);
        console.log('start of month', startOfMonth);

        // Fetch all data in parallel
        const [rankData, weekStats, monthStats, alltimeStats] = await Promise.all([
            supabase.rpc('get_team_rankings', { team_id_param: team.id }),
            supabase.rpc('get_team_period_rankings', {
                team_id_param: team.id,
                period_type: 'week',
                period_start_date: startOfWeek
            }),
            supabase.rpc('get_team_period_rankings', {
                team_id_param: team.id,
                period_type: 'month',
                period_start_date: startOfMonth
            }),
            supabase.rpc('get_team_period_rankings', {
                team_id_param: team.id,
                period_type: 'alltime',
                period_start_date: '1900-01-01' // Dummy date for alltime
            })
        ]);

        // Log any errors
        if (rankData.error) {
            console.error('Error fetching team rankings:', rankData.error);
        }
        if (weekStats.error) {
            console.error('Error fetching week rankings:', weekStats.error);
        }
        if (monthStats.error) {
            console.error('Error fetching month rankings:', monthStats.error);
        }
        if (alltimeStats.error) {
            console.error('Error fetching alltime rankings:', alltimeStats.error);
        }

        console.log('monthStats.data', monthStats.data);

        // Extract league and global positions
        let leaguePosition = null;
        let globalPosition = null;

        console.log('rankData', rankData.data);

        if (!rankData.error && rankData.data && rankData.data.length > 0) {
            const rankings = rankData.data[0];
            globalPosition = rankings.global_rank;
            leaguePosition = rankings.country_rank;
        }

        // Helper function to format statistics data
        const formatStats = (data: any) => {
            if (!data || data.length === 0) {
                return {
                    goal_scored: 0,
                    goal_conceded: 0,
                    wins: 0,
                    draws: 0,
                    losses: 0,
                    total_games: 0,
                    win_percentage: 0,
                    global_rank: null,
                    country_rank: null
                };
            }
            const stats = data[0];
            return {
                goal_scored: stats.goal_scored || 0,
                goal_conceded: stats.goal_conceded || 0,
                wins: stats.wins || 0,
                draws: stats.draws || 0,
                losses: stats.losses || 0,
                total_games: stats.total_games || 0,
                win_percentage: stats.win_percentage || 0,
                global_rank: stats.global_rank,
                country_rank: stats.country_rank,
                elo_rating_delta: stats.elo_rating_delta
            };
        };

        const teamInfo = {
            id: team.id,
            name: team.name,
            logo_url: null, // Not available in current schema
            country_index: team.country,
            wallet_address: team.primary_wallet,
            elo_rating: team.elo_rating,
            team_age: teamAge,
            league_position: leaguePosition,
            global_position: globalPosition,
            created_at: team.created_at,
            active_game_id: team.active_game_id,
            last_games: team.last_games_results || [],
            leaderboard: {
                week: formatStats(weekStats.data),
                month: formatStats(monthStats.data),
                alltime: formatStats(alltimeStats.data)
            }
        };

        return NextResponse.json({
            is_found: true,
            team: teamInfo
        });
    } catch (error) {
        console.error('Error fetching team info:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}