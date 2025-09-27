-- Migration: 002_create_games_table.down.sql
-- Description: Rollback for games table creation
-- Date: 2024-12-19

-- Drop foreign key constraints first
ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_winner_fkey;
ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_team2_fkey;
ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_team1_fkey;
ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_last_move_team_fkey;

-- Drop enum type
DROP TYPE IF EXISTS public.game_status;

-- Drop function
DROP FUNCTION IF EXISTS public.newGameState(BIGINT);

-- Drop indexes
DROP INDEX IF EXISTS idx_games_team2info_gin;
DROP INDEX IF EXISTS idx_games_team1info_gin;
DROP INDEX IF EXISTS idx_games_history_gin;
DROP INDEX IF EXISTS idx_games_last_move_at;
DROP INDEX IF EXISTS idx_games_created_at;
DROP INDEX IF EXISTS idx_games_last_move_team;
DROP INDEX IF EXISTS idx_games_winner;
DROP INDEX IF EXISTS idx_games_status;
DROP INDEX IF EXISTS idx_games_team2;
DROP INDEX IF EXISTS idx_games_team1;
DROP INDEX IF EXISTS idx_teams_active_game_id;

-- Drop table
DROP TABLE IF EXISTS public.games;
