-- Migration: 009_create_period_rankings_function.up.sql
-- Description: Create function to get team rankings based on statistics for specific periods
-- Date: 2024-12-19

-- Drop function if exists to ensure clean recreation
DROP FUNCTION IF EXISTS public.get_team_period_rankings(BIGINT, public.statistic_period, DATE);

-- Create function to get team rankings based on statistics for a specific period
CREATE OR REPLACE FUNCTION public.get_team_period_rankings(
    team_id_param BIGINT,
    period_type public.statistic_period,
    period_start_date DATE
)
RETURNS TABLE(
    team_id BIGINT,
    elo_rating NUMERIC,
    countryIndex SMALLINT,
    elo_rating_delta NUMERIC,
    global_rank BIGINT,
    country_rank BIGINT,
    wins INTEGER,
    draws INTEGER,
    losses INTEGER,
    goal_scored INTEGER,
    goal_conceded INTEGER,
    total_games INTEGER,
    win_percentage NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id as team_id,
        t.elo_rating,
        t.country as countryIndex,
        ts.elo_rating_delta,
        CASE 
            WHEN ts.team_id IS NOT NULL THEN (
                SELECT COUNT(*) + 1 
                FROM teams t2 
                JOIN teams_statistic ts2 ON t2.id = ts2.team_id
                WHERE ts2.period = period_type 
                AND (period_type = 'alltime' OR ts2.period_start = period_start_date)
                AND t2.elo_rating > t.elo_rating
            )
            ELSE NULL
        END AS global_rank,
        CASE 
            WHEN ts.team_id IS NOT NULL THEN (
                SELECT COUNT(*) + 1 
                FROM teams t3 
                JOIN teams_statistic ts3 ON t3.id = ts3.team_id
                WHERE ts3.period = period_type 
                AND (period_type = 'alltime' OR ts3.period_start = period_start_date)
                AND t3.country = t.country 
                AND t3.elo_rating > t.elo_rating
            )
            ELSE NULL
        END AS country_rank,
        COALESCE(ts.wins, 0) as wins,
        COALESCE(ts.draws, 0) as draws,
        COALESCE(ts.losses, 0) as losses,
        COALESCE(ts.goal_scored, 0) as goal_scored,
        COALESCE(ts.goal_conceded, 0) as goal_conceded,
        COALESCE(ts.wins + ts.draws + ts.losses, 0) as total_games,
        CASE 
            WHEN (ts.wins + ts.draws + ts.losses) > 0 
            THEN (ts.wins::NUMERIC / (ts.wins + ts.draws + ts.losses)) * 100 
            ELSE 0 
        END as win_percentage
    FROM teams t
    LEFT JOIN teams_statistic ts ON t.id = ts.team_id 
        AND ts.period = period_type 
        AND (period_type = 'alltime' OR ts.period_start = period_start_date)
    WHERE t.id = team_id_param;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_team_period_rankings(BIGINT, public.statistic_period, DATE) TO PUBLIC;

-- Add comment
COMMENT ON FUNCTION public.get_team_period_rankings(BIGINT, public.statistic_period, DATE) IS 'Returns team rankings and statistics for a specific period based on ELO rating and period statistics';