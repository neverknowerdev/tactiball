-- Migration: 006_add_last_games_result_to_teams.up.sql
-- Description: Add lastGamesResult array to teams table with automatic updates
-- Date: 2024-12-19

-- First, create the result enum type
CREATE TYPE public.game_result AS ENUM ('VICTORY', 'DRAW', 'DEFEAT', 'DEFEAT_BY_TIMEOUT');

-- Add the lastGamesResult column to teams table
ALTER TABLE public.teams 
ADD COLUMN IF NOT EXISTS last_games_results public.game_result[] DEFAULT '{}';

-- Create a trigger function to automatically update lastGamesResult when games are modified
CREATE OR REPLACE FUNCTION public.trigger_update_team_last_games_result()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    team1_result public.game_result;
    team2_result public.game_result;
    do_update BOOLEAN := FALSE;
BEGIN

    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.status IN ('finished'::public.game_status, 'finished_by_timeout'::public.game_status) THEN
        -- Calculate team1 result
        team1_result := CASE
            WHEN OLD.winner = OLD.team1 THEN 'VICTORY'::public.game_result
            WHEN OLD.winner IS NULL AND OLD.status = 'finished'::public.game_status THEN 'DRAW'::public.game_result
            WHEN OLD.status = 'finished_by_timeout'::public.game_status AND OLD.winner <> OLD.team1 THEN 'DEFEAT_BY_TIMEOUT'::public.game_result
            ELSE 'DEFEAT'::public.game_result
        END;
        
        -- Calculate team2 result
        team2_result := CASE
            WHEN OLD.winner = OLD.team2 THEN 'VICTORY'::public.game_result
            WHEN OLD.winner IS NULL AND OLD.status = 'finished'::public.game_status THEN 'DRAW'::public.game_result
            WHEN OLD.status = 'finished_by_timeout'::public.game_status AND OLD.winner <> OLD.team2 THEN 'DEFEAT_BY_TIMEOUT'::public.game_result
            ELSE 'DEFEAT'::public.game_result
        END;

        UPDATE public.teams
        SET last_games_results = CASE
            WHEN cardinality(last_games_results) >= 10 THEN
                array_append(last_games_results[1:], team1_result)
            ELSE
                array_append(last_games_results, team1_result)
        END
        WHERE id = NEW.team1; 

        UPDATE public.teams
        SET last_games_results = CASE
            WHEN cardinality(last_games_results) >= 10 THEN
                array_append(last_games_results[1:], team2_result)
            ELSE
                array_append(last_games_results, team2_result)
        END
        WHERE id = NEW.team2;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create trigger on games table
CREATE TRIGGER trigger_update_team_last_games_result
    AFTER INSERT OR UPDATE OR DELETE ON public.games
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_update_team_last_games_result();

-- Create index on the new array column for better performance
CREATE INDEX IF NOT EXISTS idx_teams_last_games_results ON public.teams USING GIN (last_games_results);

-- Create the missing function to update a specific team's last games result
CREATE OR REPLACE FUNCTION public.update_team_last_games_result(team_id_param BIGINT, new_result public.game_result)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.teams
    SET last_games_results = array_append(
        CASE
            WHEN cardinality(last_games_results) <= 10 THEN last_games_results
            ELSE last_games_results[1:]
        END,
        new_result
    )::public.game_result[]
    WHERE id = team_id_param;
END;
$$;

-- Create the missing function to update all teams' last games results
CREATE OR REPLACE FUNCTION public.update_all_teams_last_games_result()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    team_record RECORD;
    game_record RECORD;
    team_result public.game_result;
BEGIN
    -- For each team, get their last 10 finished games and update the array
    FOR team_record IN SELECT id FROM public.teams LOOP
        -- Clear existing results for this team
        UPDATE public.teams SET last_games_results = '{}'::public.game_result[] WHERE id = team_record.id;
        
        -- Get last 10 finished games for this team
        FOR game_record IN 
            SELECT 
                CASE 
                    WHEN winner = team_record.id THEN 'VICTORY'::public.game_result
                    WHEN winner IS NULL AND status = 'finished'::public.game_status THEN 'DRAW'::public.game_result
                    WHEN status = 'finished_by_timeout'::public.game_status AND winner <> team_record.id THEN 'DEFEAT_BY_TIMEOUT'::public.game_result
                    ELSE 'DEFEAT'::public.game_result
                END as result
            FROM public.games 
            WHERE (team1 = team_record.id OR team2 = team_record.id)
              AND status IN ('finished'::public.game_status, 'finished_by_timeout'::public.game_status)
            ORDER BY created_at DESC
            LIMIT 10
        LOOP
            PERFORM public.update_team_last_games_result(team_record.id, game_record.result);
        END LOOP;
    END LOOP;
END;
$$;

-- Add comments
COMMENT ON COLUMN public.teams.last_games_results IS 'Array of last 10 game results (VICTORY, DRAW, DEFEAT, DEFEAT_BY_TIMEOUT)';
COMMENT ON FUNCTION public.update_team_last_games_result(BIGINT, public.game_result) IS 'Updates the lastGamesResult array for a specific team by appending a new result and trimming to 10 elements';
COMMENT ON FUNCTION public.update_all_teams_last_games_result() IS 'Updates lastGamesResult arrays for all teams';
COMMENT ON FUNCTION public.trigger_update_team_last_games_result() IS 'Trigger function to automatically update lastGamesResult when games change';
COMMENT ON TRIGGER trigger_update_team_last_games_result ON public.games IS 'Automatically updates team lastGamesResult arrays when games are modified';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.update_team_last_games_result(BIGINT, public.game_result) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_all_teams_last_games_result() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.trigger_update_team_last_games_result() TO PUBLIC;

-- Initialize the lastGamesResult arrays for existing teams
SELECT public.update_all_teams_last_games_result();
