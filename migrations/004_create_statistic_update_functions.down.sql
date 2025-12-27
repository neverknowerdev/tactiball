-- Migration: 004_create_statistic_update_functions.down.sql
-- Description: Rollback for statistic update functions
-- Date: 2024-12-19

-- Drop functions
DROP FUNCTION IF EXISTS rebuild_all_teams_statistics_period(statistic_period, DATE);
DROP FUNCTION IF EXISTS update_team_statistics_for_game(BIGINT);
DROP FUNCTION IF EXISTS update_team_statistic_for_game_result(BIGINT, statistic_period, DATE, BOOLEAN, BOOLEAN, INTEGER, INTEGER, NUMERIC);
DROP FUNCTION IF EXISTS get_or_create_team_statistic(BIGINT, statistic_period, DATE);
DROP FUNCTION IF EXISTS get_period_start(DATE, statistic_period);
