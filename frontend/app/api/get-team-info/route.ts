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

        // Calculate statistics from last_games_results array
        const lastGamesResults = team.last_games_results || [];
        const wins = lastGamesResults.filter((result: string) => result === 'VICTORY').length;
        const draws = lastGamesResults.filter((result: string) => result === 'DRAW').length;
        const losses = lastGamesResults.filter((result: string) => result === 'DEFEAT' || result === 'DEFEAT_BY_TIMEOUT').length;
        const totalMatches = lastGamesResults.length;

        // Calculate win rate
        const winRate = totalMatches > 0 ? (wins / totalMatches * 100) : 0;

        // Get league position (placeholder - you might want to implement this based on your ranking logic)
        const leaguePosition = team.elo_rating ? Math.floor(Math.random() * 50) + 1 : null;
        const globalPosition = team.elo_rating ? Math.floor(Math.random() * 200) + 1 : null;

        const teamInfo = {
            id: team.id,
            name: team.name,
            logoUrl: null, // Not available in current schema
            countryIndex: team.country,
            walletAddress: team.primary_wallet,
            elo_rating: team.elo_rating,
            matchesPlayed: totalMatches,
            wins,
            losses,
            draws,
            winRate,
            teamAge,
            leaguePosition,
            globalPosition,
            createdAt: team.created_at,
            active_game_id: team.active_game_id
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
