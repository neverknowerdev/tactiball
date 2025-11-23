-- Migration: 015_make_games_winner_nullable.down.sql

UPDATE games
SET winner = COALESCE(winner, team1)
WHERE winner IS NULL;

ALTER TABLE games
    ALTER COLUMN winner SET NOT NULL;

