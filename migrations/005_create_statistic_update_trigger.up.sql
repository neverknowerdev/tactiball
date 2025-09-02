-- Migration: 005_create_statistic_update_trigger.up.sql
-- Description: Create trigger to automatically update team statistics when games are finished
-- Date: 2024-12-19

-- Create trigger function to update statistics when games are modified
CREATE OR REPLACE FUNCTION public.trigger_update_team_statistics()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only update statistics when a game is finished or when the status changes to finished
    IF TG_OP = 'INSERT' THEN
        -- New game finished
        IF NEW.status = 'finished'::public.game_status THEN
            PERFORM public.update_team_statistics_for_game(NEW.id);
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Game status changed to finished or winner changed
        IF (OLD.status != NEW.status AND NEW.status = 'finished'::public.game_status) OR
           (OLD.winner != NEW.winner AND NEW.status = 'finished'::public.game_status) OR
           (OLD.team1_score != NEW.team1_score AND NEW.status = 'finished'::public.game_status) OR
           (OLD.team2_score != NEW.team2_score AND NEW.status = 'finished'::public.game_status) OR
           (OLD.team1_info != NEW.team1_info AND NEW.status = 'finished'::public.game_status) OR
           (OLD.team2_info != NEW.team2_info AND NEW.status = 'finished'::public.game_status) THEN
            PERFORM public.update_team_statistics_for_game(NEW.id);
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        -- Game deleted, update statistics for both teams
        IF OLD.status = 'finished'::public.game_status THEN
            PERFORM public.update_team_statistics_for_game(OLD.id);
        END IF;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create trigger on games table
CREATE TRIGGER trigger_update_team_statistics
    AFTER INSERT OR UPDATE OR DELETE ON public.games
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_update_team_statistics();

-- Add comments
COMMENT ON FUNCTION public.trigger_update_team_statistics() IS 'Trigger function to automatically update team statistics when games are modified';
COMMENT ON TRIGGER trigger_update_team_statistics ON public.games IS 'Automatically updates team statistics when games are finished or modified';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.trigger_update_team_statistics() TO PUBLIC;
