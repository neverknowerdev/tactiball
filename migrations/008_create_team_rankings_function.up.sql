-- Migration: 008_create_team_rankings_function.up.sql
-- Description: Create function to get team rankings efficiently
-- Date: 2024-12-19

-- Drop function if exists to ensure clean recreation
DROP FUNCTION IF EXISTS public.get_team_rankings(BIGINT);

-- Create function to get team rankings
CREATE OR REPLACE FUNCTION public.get_team_rankings(team_id_param BIGINT)
RETURNS TABLE(
    team_id BIGINT,
    elo_rating NUMERIC,
    countryIndex SMALLINT,
    global_rank BIGINT,
    country_rank BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id as team_id,
        t.elo_rating,
        t.country as countryIndex,
        (
            SELECT COUNT(*) + 1 
            FROM teams t2 
            WHERE t2.elo_rating > t.elo_rating
        ) AS global_rank,
        (
            SELECT COUNT(*) + 1 
            FROM teams t3 
            WHERE t3.country = t.country 
            AND t3.elo_rating > t.elo_rating
        ) AS country_rank
    FROM teams t
    WHERE t.id = team_id_param;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_team_rankings(BIGINT) TO PUBLIC;

-- Add comment
COMMENT ON FUNCTION public.get_team_rankings(BIGINT) IS 'Returns global and country rankings for a specific team based on ELO rating';
