-- Migration: 004_create_statistic_update_functions.down.sql
-- Description: Rollback for statistic update functions
-- Date: 2024-12-19

-- Drop functions
DROP FUNCTION IF EXISTS public.rebuild_all_teams_statistics_period(public.statistic_period, DATE);
DROP FUNCTION IF EXISTS public.update_team_statistics_for_game(BIGINT);
DROP FUNCTION IF EXISTS public.update_team_statistic_for_game_result(BIGINT, public.statistic_period, DATE, BOOLEAN, BOOLEAN, INTEGER, INTEGER, NUMERIC);
DROP FUNCTION IF EXISTS public.get_or_create_team_statistic(BIGINT, public.statistic_period, DATE);
DROP FUNCTION IF EXISTS public.get_period_start(DATE, public.statistic_period);
