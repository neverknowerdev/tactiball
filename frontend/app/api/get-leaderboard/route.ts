import { NextRequest, NextResponse } from 'next/server';
import moment from 'moment';
import { db } from '@/lib/database';
import { teamsStatistic, teams, statisticPeriodEnum } from '@/db/schema';
import { and, eq, desc } from 'drizzle-orm';

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

        const typedPeriod = period as (typeof statisticPeriodEnum.enumValues)[number];
        const globalLeaderboard = await db
            .select({
                wins: teamsStatistic.wins,
                draws: teamsStatistic.draws,
                losses: teamsStatistic.losses,
                goal_scored: teamsStatistic.goalScored,
                goal_conceded: teamsStatistic.goalConceded,
                elo_rating_delta: teamsStatistic.eloRatingDelta,
                team: {
                    id: teams.id,
                    name: teams.name,
                    country: teams.country,
                    elo_rating: teams.eloRating,
                    last_games_results: teams.lastGamesResults
                }
            })
            .from(teamsStatistic)
            .innerJoin(teams, eq(teamsStatistic.teamId, teams.id))
            .where(
                and(
                    eq(teamsStatistic.period, typedPeriod),
                        eq(teamsStatistic.period, typedPeriod),
                    eq(teamsStatistic.periodStart, periodStart)
                )
            )
            .orderBy(desc(teamsStatistic.eloRatingDelta))
            .limit(limit);

        // Get country leaderboard if country_index is provided
        let countryLeaderboard: typeof globalLeaderboard = [];
        if (countryIndex) {
            countryLeaderboard = await db
                .select({
                    wins: teamsStatistic.wins,
                    draws: teamsStatistic.draws,
                    losses: teamsStatistic.losses,
                    goal_scored: teamsStatistic.goalScored,
                    goal_conceded: teamsStatistic.goalConceded,
                    elo_rating_delta: teamsStatistic.eloRatingDelta,
                    team: {
                        id: teams.id,
                        name: teams.name,
                        country: teams.country,
                        elo_rating: teams.eloRating,
                        last_games_results: teams.lastGamesResults
                    }
                })
                .from(teamsStatistic)
                .innerJoin(teams, eq(teamsStatistic.teamId, teams.id))
                .where(
                    and(
                        eq(teams.country, parseInt(countryIndex, 10)),
                        eq(teamsStatistic.period, period as any),
                        eq(teamsStatistic.periodStart, periodStart)
                    )
                )
                .orderBy(desc(teamsStatistic.eloRatingDelta))
                .limit(limit);
        }


        // Process global leaderboard data
        const processedGlobalLeaderboard: LeaderboardEntry[] = globalLeaderboard
            .map((stat, index) => {
                const team = stat.team;
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
                const team = stat.team;
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
