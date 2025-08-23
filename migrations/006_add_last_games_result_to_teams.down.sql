-- Migration: 006_add_last_games_result_to_teams.down.sql
-- Description: Rollback for lastGamesResult array addition to teams table
-- Date: 2024-12-19

-- Drop trigger first
DROP TRIGGER IF EXISTS trigger_update_team_last_games_result ON public.games;

-- Drop functions
DROP FUNCTION IF EXISTS public.trigger_update_team_last_games_result();
DROP FUNCTION IF EXISTS public.update_team_last_games_result(BIGINT, public.game_result);
DROP FUNCTION IF EXISTS public.update_all_teams_last_games_result();

-- Drop index
DROP INDEX IF EXISTS idx_teams_last_games_results;

-- Remove the column from teams table
ALTER TABLE public.teams DROP COLUMN IF EXISTS last_games_results;

-- Drop the enum type
DROP TYPE IF EXISTS public.game_result;
