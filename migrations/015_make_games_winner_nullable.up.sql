-- Migration: 015_make_games_winner_nullable.up.sql

ALTER TABLE games
    ALTER COLUMN winner DROP NOT NULL;

