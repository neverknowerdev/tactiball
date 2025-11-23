-- Migration: 001_create_teams_table.up.sql
-- Description: Create the teams table with all required columns and constraints
-- Date: 2024-12-19

-- Create teams table
CREATE TABLE IF NOT EXISTS teams (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP DEFAULT NOW(),
    primary_wallet VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    country SMALLINT NOT NULL,
    game_request_id INTEGER,
    active_game_id INTEGER,
    elo_rating NUMERIC DEFAULT '100'::NUMERIC NOT NULL
);

-- Create index on primary wallet for faster lookups
CREATE INDEX IF NOT EXISTS idx_teams_primary_wallet ON teams(primary_wallet);

-- Create index on country for filtering
CREATE INDEX IF NOT EXISTS idx_teams_country ON teams(country);

-- Create index on elo rating for sorting
CREATE INDEX IF NOT EXISTS idx_teams_elo_rating ON teams(elo_rating);

-- Add comment to table
COMMENT ON TABLE teams IS 'Teams table for chessball game with ELO ratings and country information';

-- Add comments to columns
COMMENT ON COLUMN teams.id IS 'Primary key, auto-incrementing';
COMMENT ON COLUMN teams.created_at IS 'Timestamp when team was created';
COMMENT ON COLUMN teams.primary_wallet IS 'Primary wallet address for the team';
COMMENT ON COLUMN teams.name IS 'Team name';
COMMENT ON COLUMN teams.country IS 'Country code for the team';
COMMENT ON COLUMN teams.game_request_id IS 'Game request identifier';
COMMENT ON COLUMN teams.active_game_id IS 'Active game identifier';
COMMENT ON COLUMN teams.elo_rating IS 'ELO rating for matchmaking and ranking';
