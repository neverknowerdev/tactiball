import { NextRequest, NextResponse } from 'next/server';
import { createAnonClient } from '@/lib/supabase';

/**
 * GET /api/get-leaderboard
 * 
 * Fetches leaderboard data for teams including global and local (country) rankings.
 * 
 * Query Parameters:
 * - wallet (optional): User's wallet address to identify their team
 * - limit (optional): Number of teams to return (default: 10)
 * - period (optional): Time period for statistics - 'week', 'month', or 'alltime' (default: 'alltime')
 * 
 * Returns:
 * - global_leaderboard: Top N teams globally ranked by ELO rating
 * - local_leaderboard: Top N teams in user's country (if wallet provided)
 * - user_team: User's team data even if not in top N (if wallet provided)
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
    goal_difference: number;
    win_percentage: number;
    is_user_team?: boolean;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
    try {
        const { searchParams } = new URL(req.url);
        const walletAddress = searchParams.get('wallet');
        const limit = parseInt(searchParams.get('limit') || '10');
        const period = searchParams.get('period') || 'alltime'; // week, month, or alltime

        // Validate period
        if (!['week', 'month', 'alltime'].includes(period)) {
            return NextResponse.json(
                { success: false, error: 'Invalid period. Must be week, month, or alltime' },
                { status: 400 }
            );
        }

        const supabase = createAnonClient();

        // Get user's team ID if wallet address provided
        let userTeamId: number | null = null;
        let userCountry: number | null = null;

        if (walletAddress) {
            const { data: userTeam, error: userTeamError } = await supabase
                .from('teams')
                .select('id, country')
                .eq('primary_wallet', walletAddress)
                .single();

            if (!userTeamError && userTeam) {
                userTeamId = userTeam.id;
                userCountry = userTeam.country;
            }
        }

        // Get current period start date
        const currentDate = new Date();
        let periodStart: string;

        switch (period) {
            case 'week':
                periodStart = new Date(currentDate.setDate(currentDate.getDate() - currentDate.getDay())).toISOString().split('T')[0];
                break;
            case 'month':
                periodStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString().split('T')[0];
                break;
            case 'alltime':
                periodStart = '2025-08-21'; // Fixed start date for alltime
                break;
            default:
                periodStart = '2025-08-21';
        }

        // Get global leaderboard with statistics
        const { data: globalLeaderboard, error: globalError } = await supabase
            .from('teams')
            .select(`
                id,
                name,
                country,
                elo_rating,
                teams_statistic!inner(
                    wins,
                    draws,
                    losses,
                    goal_scored,
                    goal_conceded
                )
            `)
            .eq('teams_statistic.period', period)
            .eq('teams_statistic.period_start', periodStart)
            .order('elo_rating', { ascending: false })
            .limit(limit);

        if (globalError) {
            console.error('Error fetching global leaderboard:', globalError);
            return NextResponse.json(
                { success: false, error: 'Failed to fetch global leaderboard' },
                { status: 500 }
            );
        }

        // Get local (country) leaderboard if user country is known
        let localLeaderboard: any[] = [];
        if (userCountry !== null) {
            const { data: localData, error: localError } = await supabase
                .from('teams')
                .select(`
                    id,
                    name,
                    country,
                    elo_rating,
                    teams_statistic!inner(
                        wins,
                        draws,
                        losses,
                        goal_scored,
                        goal_conceded
                    )
                `)
                .eq('country', userCountry)
                .eq('teams_statistic.period', period)
                .eq('teams_statistic.period_start', periodStart)
                .order('elo_rating', { ascending: false })
                .limit(limit);

            if (!localError) {
                localLeaderboard = localData || [];
            }
        }

        // Get user's team data if not in top N
        let userTeamData: LeaderboardEntry | null = null;
        if (userTeamId) {
            const isInGlobalTop = globalLeaderboard?.some(team => team.id === userTeamId);
            const isInLocalTop = localLeaderboard.some(team => team.id === userTeamId);

            if (!isInGlobalTop || !isInLocalTop) {
                const { data: userTeamStats, error: userStatsError } = await supabase
                    .from('teams')
                    .select(`
                        id,
                        name,
                        country,
                        elo_rating,
                        teams_statistic!inner(
                            wins,
                            draws,
                            losses,
                            goal_scored,
                            goal_conceded
                        )
                    `)
                    .eq('id', userTeamId)
                    .eq('teams_statistic.period', period)
                    .eq('teams_statistic.period_start', periodStart)
                    .single();

                if (!userStatsError && userTeamStats) {
                    const stats = userTeamStats.teams_statistic[0];
                    const totalGames = stats.wins + stats.draws + stats.losses;

                    userTeamData = {
                        team_id: userTeamStats.id,
                        team_name: userTeamStats.name,
                        country: userTeamStats.country,
                        elo_rating: userTeamStats.elo_rating,
                        global_rank: 0, // Will be calculated
                        country_rank: 0, // Will be calculated
                        total_games: totalGames,
                        wins: stats.wins,
                        draws: stats.draws,
                        losses: stats.losses,
                        goals_scored: stats.goal_scored,
                        goals_conceded: stats.goal_conceded,
                        goal_difference: stats.goal_scored - stats.goal_conceded,
                        win_percentage: totalGames > 0 ? (stats.wins / totalGames) * 100 : 0,
                        is_user_team: true
                    };
                }
            }
        }

        // Process global leaderboard data
        const processedGlobalLeaderboard: LeaderboardEntry[] = (globalLeaderboard || []).map((team, index) => {
            const stats = team.teams_statistic[0];
            const totalGames = stats.wins + stats.draws + stats.losses;

            return {
                team_id: team.id,
                team_name: team.name,
                country: team.country,
                elo_rating: team.elo_rating,
                global_rank: index + 1,
                country_rank: 0, // Will be calculated separately
                total_games: totalGames,
                wins: stats.wins,
                draws: stats.draws,
                losses: stats.losses,
                goals_scored: stats.goal_scored,
                goals_conceded: stats.goal_conceded,
                goal_difference: stats.goal_scored - stats.goal_conceded,
                win_percentage: totalGames > 0 ? (stats.wins / totalGames) * 100 : 0,
                is_user_team: team.id === userTeamId
            };
        });

        // Process local leaderboard data
        const processedLocalLeaderboard: LeaderboardEntry[] = localLeaderboard.map((team, index) => {
            const stats = team.teams_statistic[0];
            const totalGames = stats.wins + stats.draws + stats.losses;

            return {
                team_id: team.id,
                team_name: team.name,
                country: team.country,
                elo_rating: team.elo_rating,
                global_rank: 0, // Not relevant for local leaderboard
                country_rank: index + 1,
                total_games: totalGames,
                wins: stats.wins,
                draws: stats.draws,
                losses: stats.losses,
                goals_scored: stats.goal_scored,
                goals_conceded: stats.goal_conceded,
                goal_difference: stats.goal_scored - stats.goal_conceded,
                win_percentage: totalGames > 0 ? (stats.wins / totalGames) * 100 : 0,
                is_user_team: team.id === userTeamId
            };
        });

        // Calculate actual ranks for user team if not in top N
        if (userTeamData) {
            // Get global rank
            const { data: globalRankData, error: globalRankError } = await supabase
                .rpc('get_team_rankings', { team_id_param: userTeamId });

            if (!globalRankError && globalRankData && globalRankData.length > 0) {
                userTeamData.global_rank = globalRankData[0].global_rank;
                userTeamData.country_rank = globalRankData[0].country_rank;
            }
        }

        return NextResponse.json({
            success: true,
            data: {
                period,
                period_start: periodStart,
                global_leaderboard: processedGlobalLeaderboard,
                local_leaderboard: processedLocalLeaderboard,
                user_team: userTeamData
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
