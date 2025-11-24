-- Migration: 015_make_games_winner_nullable.down.sql

UPDATE public.games
SET winner = COALESCE(winner, team1)
WHERE winner IS NULL;

ALTER TABLE public.games
    ALTER COLUMN winner SET NOT NULL;

