-- Migration: 010_create_update_elo_rating_function.up.sql
-- Description: Create function to update ELO rating and track changes in game record
-- Date: 2024-12-19

-- Drop function if exists to ensure clean recreation
DROP FUNCTION IF EXISTS public.update_elo_rating(BIGINT, BIGINT, NUMERIC);

-- Create function to update ELO rating and track changes
CREATE OR REPLACE FUNCTION public.update_elo_rating(
    team_id_param BIGINT,
    game_id_param BIGINT,
    new_elo_rating NUMERIC
)
RETURNS TABLE(
    success BOOLEAN,
    message TEXT,
    elo_rating_diff NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
    current_elo_rating NUMERIC;
    elo_diff NUMERIC;
    team_position INTEGER; -- 1 for team1, 2 for team2
    update_result BOOLEAN := FALSE;
BEGIN
    -- Get current ELO rating for the team
    SELECT elo_rating INTO current_elo_rating
    FROM teams
    WHERE id = team_id_param;
    
    -- Check if team exists
    IF current_elo_rating IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Team not found', NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC;
        RETURN;
    END IF;
    
    -- Check if game exists and team is part of it
    SELECT 
        CASE 
            WHEN team1 = team_id_param THEN 1
            WHEN team2 = team_id_param THEN 2
            ELSE NULL
        END INTO team_position
    FROM games
    WHERE id = game_id_param;
    
    -- Check if team is part of the game
    IF team_position IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Team is not part of this game', current_elo_rating, new_elo_rating, NULL::NUMERIC;
        RETURN;
    END IF;
    
    -- Calculate ELO difference
    elo_diff := new_elo_rating - current_elo_rating;
    
    -- Update game record with ELO rating changes
    IF team_position = 1 THEN
        UPDATE games 
        SET 
            team1_info = COALESCE(team1_info, '{}'::jsonb) || jsonb_build_object(
                'elo_rating_old', current_elo_rating,
                'elo_rating_new', new_elo_rating,
                'elo_rating_diff', elo_diff
            )
        WHERE id = game_id_param;
    ELSE
        UPDATE games 
        SET 
            team2_info = COALESCE(team2_info, '{}'::jsonb) || jsonb_build_object(
                'elo_rating_old', current_elo_rating,
                'elo_rating_new', new_elo_rating,
                'elo_rating_diff', elo_diff
            )
        WHERE id = game_id_param;
    END IF;
    
    -- Update team's ELO rating
    UPDATE teams 
    SET elo_rating = new_elo_rating
    WHERE id = team_id_param;
    
    -- Check if update was successful
    GET DIAGNOSTICS update_result = ROW_COUNT;
    
    IF update_result THEN
        RETURN QUERY SELECT TRUE, 'ELO rating updated successfully', elo_diff;
    ELSE
        RETURN QUERY SELECT FALSE, 'Failed to update ELO rating', elo_diff;
    END IF;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.update_elo_rating(BIGINT, BIGINT, NUMERIC) TO PUBLIC;

-- Add comment
COMMENT ON FUNCTION public.update_elo_rating(BIGINT, BIGINT, NUMERIC) IS 'Updates team ELO rating and tracks changes in game record with old/new/diff values';
