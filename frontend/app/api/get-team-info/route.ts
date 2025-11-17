import { NextRequest, NextResponse } from 'next/server';
import moment from 'moment';
import { db } from '@/lib/database';
import { teams } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

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

        const [team] = await db
            .select({
                id: teams.id,
                name: teams.name,
                created_at: teams.createdAt,
                primary_wallet: teams.primaryWallet,
                country: teams.country,
                elo_rating: teams.eloRating,
                last_games_results: teams.lastGamesResults,
                active_game_id: teams.activeGameId
            })
            .from(teams)
            .where(
                teamId
                    ? eq(teams.id, Number(teamId))
                    : eq(teams.primaryWallet, walletAddress!)
            )
            .limit(1);

        if (!team) {
            return NextResponse.json({
                is_found: false,
                message: teamId ? `No team found with ID: ${teamId}` : `No team found for wallet address: ${walletAddress}`
            });
        }

        // Calculate team age in days
        const teamAge = team.created_at
            ? Math.floor((Date.now() - new Date(team.created_at).getTime()) / (1000 * 60 * 60 * 24))
            : 0;


        console.log('team.elo_rating', team.elo_rating);

        const startOfWeek = moment().startOf('isoWeek').format('YYYY-MM-DD');
        const startOfMonth = moment().startOf('month').format('YYYY-MM-DD');

        console.log('start of week', startOfWeek);
        console.log('start of month', startOfMonth);

        // Fetch all data in parallel
        const [rankData, weekStats, monthStats, alltimeStats] = await Promise.all([
            db.execute(sql`SELECT * FROM public.get_team_rankings(${team.id})`),
            db.execute(sql`SELECT * FROM public.get_team_period_rankings(${team.id}, ${'week'}, ${startOfWeek})`),
            db.execute(sql`SELECT * FROM public.get_team_period_rankings(${team.id}, ${'month'}, ${startOfMonth})`),
            db.execute(sql`SELECT * FROM public.get_team_period_rankings(${team.id}, ${'alltime'}, ${'1900-01-01'})`)
        ]);

        // Extract league and global positions
        let leaguePosition = null;
        let globalPosition = null;

        console.log('rankData', rankData.rows);

        if (rankData.rows.length > 0) {
            const rankings = rankData.rows[0] as any;
            globalPosition = rankings.global_rank;
            leaguePosition = rankings.country_rank;
        }

        // Helper function to format statistics data
        const formatStats = (data: any[]) => {
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
                week: formatStats(weekStats.rows as any[]),
                month: formatStats(monthStats.rows as any[]),
                alltime: formatStats(alltimeStats.rows as any[])
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