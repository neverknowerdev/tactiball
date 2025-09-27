-- Migration: 003_create_teams_statistic_table.down.sql
-- Description: Rollback for teams_statistic table
-- Date: 2024-12-19

-- Drop indexes first
DROP INDEX IF EXISTS idx_teams_statistic_team_period_start;
DROP INDEX IF EXISTS idx_teams_statistic_team_period;
DROP INDEX IF EXISTS idx_teams_statistic_period_start;
DROP INDEX IF EXISTS idx_teams_statistic_period;
DROP INDEX IF EXISTS idx_teams_statistic_team_id;

-- Drop foreign key constraint
ALTER TABLE public.teams_statistic DROP CONSTRAINT IF EXISTS teams_statistic_team_id_fkey;

-- Drop table
DROP TABLE IF EXISTS public.teams_statistic;

-- Drop enum type
DROP TYPE IF EXISTS public.statistic_period;
