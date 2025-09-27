-- Migration: 004_create_statistic_update_functions.up.sql
-- Description: Create functions to update team statistics for week and month periods
-- Date: 2024-12-19

-- Function to get period start date
CREATE OR REPLACE FUNCTION public.get_period_start(game_date DATE, period_type public.statistic_period)
RETURNS DATE
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN CASE period_type
        WHEN 'week' THEN DATE_TRUNC('week', game_date)::DATE  -- Start of week (Monday)
        WHEN 'month' THEN DATE_TRUNC('month', game_date)::DATE -- Start of month
        WHEN 'alltime' THEN '2025-08-21'::DATE -- Fixed start date for alltime period
        ELSE NULL
    END;
END;
$$;

-- Function to get or create team statistic record for a period
CREATE OR REPLACE FUNCTION public.get_or_create_team_statistic(
    team_id_param BIGINT,
    period_type public.statistic_period,
    period_start_date DATE
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    record_id BIGINT;
BEGIN
    -- Try to get existing record
    SELECT id INTO record_id
    FROM public.teams_statistic
    WHERE team_id = team_id_param 
      AND period = period_type 
      AND period_start = period_start_date;
    
    -- If not found, create new record with default values
    IF record_id IS NULL THEN
        INSERT INTO public.teams_statistic (
            team_id, period, period_start, wins, draws, losses,
            goal_scored, goal_conceded, biggest_win_diff, biggest_win_goal_scored,
            biggest_win_goals_conceded, biggest_loss_diff, biggest_loss_goals_scored,
            biggest_loss_goals_conceded, elo_rating_delta, updated_at
        ) VALUES (
            team_id_param, period_type, period_start_date, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, NOW()
        ) RETURNING id INTO record_id;
    END IF;
    
    RETURN record_id;
END;
$$;

-- Function to update team statistic based on game result
CREATE OR REPLACE FUNCTION public.update_team_statistic_for_game_result(
    team_id_param BIGINT,
    period_type public.statistic_period,
    period_start_date DATE,
    is_win BOOLEAN,
    is_draw BOOLEAN,
    goals_scored INTEGER,
    goals_conceded INTEGER,
    elo_rating_diff NUMERIC
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    stat_id BIGINT;
    goal_diff INTEGER;
BEGIN
    -- Get or create the statistic record
    stat_id := public.get_or_create_team_statistic(team_id_param, period_type, period_start_date);
    
    goal_diff := goals_scored - goals_conceded;
    
    -- Update the record based on game result
    UPDATE public.teams_statistic 
    SET 
        wins = wins + CASE WHEN is_win THEN 1 ELSE 0 END,
        draws = draws + CASE WHEN is_draw THEN 1 ELSE 0 END,
        losses = losses + CASE WHEN NOT is_win AND NOT is_draw THEN 1 ELSE 0 END,
        goal_scored = goal_scored + goals_scored,
        goal_conceded = goal_conceded + goals_conceded,
        elo_rating_delta = elo_rating_delta + elo_rating_diff,
        -- Update biggest win if this is a win and better than current
        biggest_win_diff = CASE 
            WHEN is_win AND goal_diff > biggest_win_diff THEN goal_diff
            ELSE biggest_win_diff
        END,
        biggest_win_goal_scored = CASE 
            WHEN is_win AND goal_diff > biggest_win_diff THEN goals_scored
            ELSE biggest_win_goal_scored
        END,
        biggest_win_goals_conceded = CASE 
            WHEN is_win AND goal_diff > biggest_win_diff THEN goals_conceded
            ELSE biggest_win_goals_conceded
        END,
        -- Update biggest loss if this is a loss and worse than current
        biggest_loss_diff = CASE 
            WHEN NOT is_win AND NOT is_draw AND (-goal_diff) > biggest_loss_diff THEN (-goal_diff)
            ELSE biggest_loss_diff
        END,
        biggest_loss_goals_scored = CASE 
            WHEN NOT is_win AND NOT is_draw AND (-goal_diff) > biggest_loss_diff THEN goals_scored
            ELSE biggest_loss_goals_scored
        END,
        biggest_loss_goals_conceded = CASE 
            WHEN NOT is_win AND NOT is_draw AND (-goal_diff) > biggest_loss_diff THEN goals_conceded
            ELSE biggest_loss_goals_conceded
        END,
        updated_at = NOW()
    WHERE id = stat_id;
END;
$$;

-- Function to update statistics for week, month, and alltime when a game is finished
CREATE OR REPLACE FUNCTION public.update_team_statistics_for_game(game_id_param BIGINT)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    game_record RECORD;
    week_start DATE;
    month_start DATE;
    alltime_start DATE;
    team1_is_win BOOLEAN;
    team1_is_draw BOOLEAN;
    team2_is_win BOOLEAN;
    team2_is_draw BOOLEAN;
    team1_elo_diff NUMERIC;
    team2_elo_diff NUMERIC;
BEGIN
    -- Get the game details
    SELECT 
        team1, team2, team1_score, team2_score, winner, status,
        created_at::DATE as game_date,
        team1_info, team2_info
    INTO game_record
    FROM public.games
    WHERE id = game_id_param AND status = 'finished'::public.game_status;
    
    IF NOT FOUND THEN
        RETURN;
    END IF;
    
    -- Calculate period start dates
    week_start := public.get_period_start(game_record.game_date, 'week');
    month_start := public.get_period_start(game_record.game_date, 'month');
    alltime_start := public.get_period_start(game_record.game_date, 'alltime');
    
    -- Determine game results
    team1_is_win := (game_record.winner = game_record.team1);
    team1_is_draw := (game_record.winner IS NULL);
    team2_is_win := (game_record.winner = game_record.team2);
    team2_is_draw := (game_record.winner IS NULL);
    
    -- Extract ELO rating differences
    team1_elo_diff := COALESCE((game_record.team1_info->>'elo_rating_diff')::NUMERIC, 0);
    team2_elo_diff := COALESCE((game_record.team2_info->>'elo_rating_diff')::NUMERIC, 0);
    
    -- Update weekly statistics for both teams
    PERFORM public.update_team_statistic_for_game_result(
        game_record.team1, 'week', week_start,
        team1_is_win, team1_is_draw,
        game_record.team1_score, game_record.team2_score,
        team1_elo_diff
    );
    
    PERFORM public.update_team_statistic_for_game_result(
        game_record.team2, 'week', week_start,
        team2_is_win, team2_is_draw,
        game_record.team2_score, game_record.team1_score,
        team2_elo_diff
    );
    
    -- Update monthly statistics for both teams
    PERFORM public.update_team_statistic_for_game_result(
        game_record.team1, 'month', month_start,
        team1_is_win, team1_is_draw,
        game_record.team1_score, game_record.team2_score,
        team1_elo_diff
    );
    
    PERFORM public.update_team_statistic_for_game_result(
        game_record.team2, 'month', month_start,
        team2_is_win, team2_is_draw,
        game_record.team2_score, game_record.team1_score,
        team2_elo_diff
    );
    
    -- Update alltime statistics for both teams
    PERFORM public.update_team_statistic_for_game_result(
        game_record.team1, 'alltime', alltime_start,
        team1_is_win, team1_is_draw,
        game_record.team1_score, game_record.team2_score,
        team1_elo_diff
    );
    
    PERFORM public.update_team_statistic_for_game_result(
        game_record.team2, 'alltime', alltime_start,
        team2_is_win, team2_is_draw,
        game_record.team2_score, game_record.team1_score,
        team2_elo_diff
    );
END;
$$;

-- Function to rebuild statistics for all teams in a specific period (for maintenance)
CREATE OR REPLACE FUNCTION public.rebuild_all_teams_statistics_period(
    period_type public.statistic_period,
    period_start_date DATE
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    game_record RECORD;
BEGIN
    -- Clear existing statistics for this period
    DELETE FROM public.teams_statistic 
    WHERE period = period_type AND period_start = period_start_date;
    
    -- Rebuild from games in this period
    FOR game_record IN 
        SELECT id FROM public.games 
        WHERE status = 'finished'::public.game_status
          AND created_at::DATE >= period_start_date
          AND created_at::DATE < (
              CASE 
                  WHEN period_type = 'week' THEN period_start_date + INTERVAL '7 days'
                  WHEN period_type = 'month' THEN period_start_date + INTERVAL '1 month'
                  WHEN period_type = 'alltime' THEN '9999-12-31'::DATE -- Alltime includes all games
              END
          )::DATE
    LOOP
        PERFORM public.update_team_statistics_for_game(game_record.id);
    END LOOP;
END;
$$;

-- Add comments
COMMENT ON FUNCTION public.get_period_start(DATE, public.statistic_period) IS 'Get the start date for a week, month, or alltime period';
COMMENT ON FUNCTION public.get_or_create_team_statistic(BIGINT, public.statistic_period, DATE) IS 'Get existing or create new team statistic record with default values';
COMMENT ON FUNCTION public.update_team_statistic_for_game_result(BIGINT, public.statistic_period, DATE, BOOLEAN, BOOLEAN, INTEGER, INTEGER, NUMERIC) IS 'Update team statistic by incrementing fields based on game result';
COMMENT ON FUNCTION public.update_team_statistics_for_game(BIGINT) IS 'Update weekly, monthly, and alltime statistics for both teams when a game is finished';
COMMENT ON FUNCTION public.rebuild_all_teams_statistics_period(public.statistic_period, DATE) IS 'Rebuild statistics for all teams in a specific period (maintenance function)';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_period_start(DATE, public.statistic_period) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_team_statistic(BIGINT, public.statistic_period, DATE) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_team_statistic_for_game_result(BIGINT, public.statistic_period, DATE, BOOLEAN, BOOLEAN, INTEGER, INTEGER, NUMERIC) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_team_statistics_for_game(BIGINT) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.rebuild_all_teams_statistics_period(public.statistic_period, DATE) TO PUBLIC;
