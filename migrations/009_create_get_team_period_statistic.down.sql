-- Migration: 009_create_get_team_period_statistic.down.sql
-- Description: Drop get_team_period_rankings function
-- Date: 2024-12-19

-- Drop the function
DROP FUNCTION IF EXISTS get_team_period_rankings(BIGINT, statistic_period, DATE);

