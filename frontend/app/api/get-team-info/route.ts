import { NextRequest, NextResponse } from 'next/server';
import { createAnonClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const walletAddress = searchParams.get('wallet');

        if (!walletAddress) {
            return NextResponse.json(
                { error: 'Wallet address is required' },
                { status: 400 }
            );
        }

        // Fetch team info from Supabase
        const supabase = createAnonClient();
        const { data: team, error } = await supabase
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
            `)
            .eq('primary_wallet', walletAddress)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // No team found for this wallet
                return NextResponse.json({
                    isFound: false,
                    message: 'No team found for this wallet address'
                });
            }
            throw error;
        }

        // Calculate team age in days
        const teamAge = Math.floor((Date.now() - new Date(team.created_at).getTime()) / (1000 * 60 * 60 * 24));

        // Calculate league and global positions using efficient SQL query
        let leaguePosition = null;
        let globalPosition = null;

        console.log('team.elo_rating', team.elo_rating);

        if (team.elo_rating) {
            const { data: rankData, error: rankError } = await supabase
                .rpc('get_team_rankings', { team_id_param: team.id });

            console.log('rankData', rankData);

            if (!rankError && rankData && rankData.length > 0) {
                const rankings = rankData[0];
                globalPosition = rankings.global_rank;
                leaguePosition = rankings.country_rank;
            }
        }

        const teamInfo = {
            id: team.id,
            name: team.name,
            logoUrl: null, // Not available in current schema
            countryIndex: team.country,
            walletAddress: team.primary_wallet,
            elo_rating: team.elo_rating,
            teamAge,
            leaguePosition,
            globalPosition,
            createdAt: team.created_at,
            active_game_id: team.active_game_id,
            lastGames: team.last_games_results || []
        };

        return NextResponse.json({
            isFound: true,
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
