-- Migration: 015_make_games_winner_nullable.up.sql

ALTER TABLE public.games
    ALTER COLUMN winner DROP NOT NULL;

