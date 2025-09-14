import { NextRequest, NextResponse } from 'next/server';
import { createAnonClient } from '@/lib/supabase';
import moment from 'moment';

/**
 * GET /api/get-leaderboard
 * 
 * Fetches top teams leaderboard data.
 * 
 * Query Parameters:
 * - limit (optional): Number of teams to return (default: 10)
 * - period (optional): Time period for statistics - 'week', 'month', or 'alltime' (default: 'alltime')
 * - country_index (optional): Country index to get country-specific leaderboard
 * 
 * Returns:
 * - global_leaderboard: Top N teams globally ranked by ELO rating
 * - country_leaderboard: Top N teams in specified country (if country_index provided)
 * - period: The period used for statistics
 * - period_start: Start date of the period
 */

interface LeaderboardEntry {
    team_id: number;
    team_name: string;
    country: number;
    elo_rating: number;
    global_rank: number;
    country_rank: number;
    total_games: number;
    wins: number;
    draws: number;
    losses: number;
    goals_scored: number;
    goals_conceded: number;
    elo_rating_delta: number;
    goal_difference: number;
    win_percentage: number;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
    try {
        const { searchParams } = new URL(req.url);
        const limit = parseInt(searchParams.get('limit') || '10');
        const period = searchParams.get('period') || 'alltime'; // week, month, or alltime
        const countryIndex = searchParams.get('country_index');

        // Validate period
        if (!['week', 'month', 'alltime'].includes(period)) {
            return NextResponse.json(
                { success: false, error: 'Invalid period. Must be week, month, or alltime' },
                { status: 400 }
            );
        }

        const supabase = createAnonClient();

        let periodStart: string;

        switch (period) {
            case 'week':
                periodStart = moment().startOf('isoWeek').format('YYYY-MM-DD');
                break;
            case 'month':
                periodStart = moment().startOf('month').format('YYYY-MM-DD');
                break;
            case 'alltime':
                periodStart = '2025-08-21'; // Fixed start date for alltime
                break;
            default:
                periodStart = '2025-08-21';
        }

        // Get global leaderboard with statistics
        const { data: globalLeaderboard, error: globalError } = await supabase
            .from('teams_statistic')
            .select(`
                wins,
                draws,
                losses,
                goal_scored,
                goal_conceded,
                elo_rating_delta,
                teams!inner(
                    id,
                    name,
                    country,
                    elo_rating,
                    last_games_results
                )
            `)
            .eq('period', period)
            .eq('period_start', periodStart)
            .order('elo_rating_delta', { ascending: false })
            .limit(limit);

        if (globalError) {
            console.error('Error fetching global leaderboard:', globalError);
            return NextResponse.json(
                { success: false, error: 'Failed to fetch global leaderboard' },
                { status: 500 }
            );
        }

        // Debug: Log the structure of the first item
        if (globalLeaderboard && globalLeaderboard.length > 0) {
            console.log('Sample global leaderboard item:', JSON.stringify(globalLeaderboard[0], null, 2));
        }

        // Get country leaderboard if country_index is provided
        let countryLeaderboard: any[] = [];
        if (countryIndex) {
            const { data: countryData, error: countryError } = await supabase
                .from('teams_statistic')
                .select(`
                    wins,
                    draws,
                    losses,
                    goal_scored,
                    goal_conceded,
                    elo_rating_delta,
                    teams!inner(
                        id,
                        name,
                        country,
                        elo_rating,
                        last_games_results
                    )
                `)
                .eq('teams.country', parseInt(countryIndex))
                .eq('period', period)
                .eq('period_start', periodStart)
                .order('elo_rating_delta', { ascending: false })
                .limit(limit);

            if (!countryError) {
                countryLeaderboard = countryData || [];
            }
        }


        // Process global leaderboard data
        const processedGlobalLeaderboard: LeaderboardEntry[] = (globalLeaderboard || [])
            .map((stat, index) => {
                console.log('stat', stat);
                const team = stat.teams as any; // teams is an object, not an array
                const totalGames = stat.wins + stat.draws + stat.losses;

                return {
                    team_id: team.id,
                    team_name: team.name,
                    country: team.country,
                    elo_rating: team.elo_rating,
                    global_rank: index + 1,
                    country_rank: 0, // Will be calculated separately
                    total_games: totalGames,
                    wins: stat.wins,
                    draws: stat.draws,
                    losses: stat.losses,
                    goals_scored: stat.goal_scored,
                    goals_conceded: stat.goal_conceded,
                    elo_rating_delta: stat.elo_rating_delta,
                    goal_difference: stat.goal_scored - stat.goal_conceded,
                    last_games: team.last_games_results,
                    win_percentage: totalGames > 0 ? (stat.wins / totalGames) * 100 : 0
                };
            });

        // Process country leaderboard data
        const processedCountryLeaderboard: LeaderboardEntry[] = countryLeaderboard
            .map((stat, index) => {
                const team = stat.teams as any; // teams is an object, not an array
                const totalGames = stat.wins + stat.draws + stat.losses;

                return {
                    team_id: team.id,
                    team_name: team.name,
                    country: team.country,
                    elo_rating: team.elo_rating,
                    global_rank: 0, // Not relevant for country leaderboard
                    country_rank: index + 1,
                    total_games: totalGames,
                    wins: stat.wins,
                    draws: stat.draws,
                    losses: stat.losses,
                    goals_scored: stat.goal_scored,
                    goals_conceded: stat.goal_conceded,
                    elo_rating_delta: stat.elo_rating_delta,
                    goal_difference: stat.goal_scored - stat.goal_conceded,
                    last_games: team.last_games_results,
                    win_percentage: totalGames > 0 ? (stat.wins / totalGames) * 100 : 0
                };
            });

        return NextResponse.json({
            success: true,
            data: {
                period,
                period_start: periodStart,
                global_leaderboard: processedGlobalLeaderboard,
                country_leaderboard: countryIndex ? processedCountryLeaderboard : null
            }
        });

    } catch (error) {
        console.error('Error in get-leaderboard API:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
