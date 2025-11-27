-- Migration: 002_create_games_table.down.sql
-- Description: Rollback for games table creation
-- Date: 2024-12-19

-- Drop foreign key constraints first
ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_winner_fkey;
ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_team2_fkey;
ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_team1_fkey;
ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_last_move_team_fkey;

-- Drop table
DROP TABLE IF EXISTS public.games CASCADE;

-- Drop enum type
DROP TYPE IF EXISTS game_status;