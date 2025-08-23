-- Migration: 001_create_teams_table.up.sql
-- Description: Create the teams table with all required columns and constraints
-- Date: 2024-12-19

-- Create teams table
CREATE TABLE IF NOT EXISTS public.teams (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP DEFAULT NOW(),
    primary_wallet VARCHAR,
    name VARCHAR,
    country SMALLINT,
    game_request_id INTEGER,
    active_game_id INTEGER,
    elo_rating NUMERIC DEFAULT '100'::NUMERIC
);

-- Create index on primary wallet for faster lookups
CREATE INDEX IF NOT EXISTS idx_teams_primary_wallet ON public.teams(primary_wallet);

-- Create index on country for filtering
CREATE INDEX IF NOT EXISTS idx_teams_country ON public.teams(country);

-- Create index on elo rating for sorting
CREATE INDEX IF NOT EXISTS idx_teams_elo_rating ON public.teams(elo_rating);

-- Add comment to table
COMMENT ON TABLE public.teams IS 'Teams table for chessball game with ELO ratings and country information';

-- Add comments to columns
COMMENT ON COLUMN public.teams.id IS 'Primary key, auto-incrementing';
COMMENT ON COLUMN public.teams.created_at IS 'Timestamp when team was created';
COMMENT ON COLUMN public.teams.primary_wallet IS 'Primary wallet address for the team';
COMMENT ON COLUMN public.teams.name IS 'Team name';
COMMENT ON COLUMN public.teams.country IS 'Country code for the team';
COMMENT ON COLUMN public.teams.game_request_id IS 'Game request identifier';
COMMENT ON COLUMN public.teams.active_game_id IS 'Active game identifier';
COMMENT ON COLUMN public.teams.elo_rating IS 'ELO rating for matchmaking and ranking';
