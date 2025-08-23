-- Migration: 002_create_games_table.up.sql
-- Description: Create the games table with all required columns and foreign key constraints
-- Date: 2024-12-19

-- Create game status enum type (matching smart contract)
CREATE TYPE public.game_status AS ENUM ('active', 'finished', 'finished_by_timeout');

-- Create games table
CREATE TABLE IF NOT EXISTS public.games (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP DEFAULT NOW(),
    last_move_at TIMESTAMP,
    last_move_team BIGINT,
    team1 BIGINT,
    team2 BIGINT,
    status public.game_status DEFAULT 'active',
    moves_made INTEGER DEFAULT 0,
    winner BIGINT,
    history JSONB,
    team1_info JSONB DEFAULT '{}'::JSONB,
    team2_info JSONB DEFAULT '{}'::JSONB,
    team1_score SMALLINT DEFAULT '0'::SMALLINT,
    team2_score SMALLINT DEFAULT '0'::SMALLINT
);

-- Create foreign key constraints
ALTER TABLE public.games 
    ADD CONSTRAINT games_last_move_team_fkey 
    FOREIGN KEY (last_move_team) REFERENCES public.teams(id);

ALTER TABLE public.games 
    ADD CONSTRAINT games_team1_fkey 
    FOREIGN KEY (team1) REFERENCES public.teams(id);

ALTER TABLE public.games 
    ADD CONSTRAINT games_team2_fkey 
    FOREIGN KEY (team2) REFERENCES public.teams(id);

ALTER TABLE public.games 
    ADD CONSTRAINT games_winner_fkey 
    FOREIGN KEY (winner) REFERENCES public.teams(id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_games_team1 ON public.games(team1);
CREATE INDEX IF NOT EXISTS idx_games_team2 ON public.games(team2);
CREATE INDEX IF NOT EXISTS idx_games_status ON public.games(status);
CREATE INDEX IF NOT EXISTS idx_games_winner ON public.games(winner);
CREATE INDEX IF NOT EXISTS idx_games_last_move_team ON public.games(last_move_team);
CREATE INDEX IF NOT EXISTS idx_games_created_at ON public.games(created_at);
CREATE INDEX IF NOT EXISTS idx_games_last_move_at ON public.games(last_move_at);

-- Create index on JSONB columns for efficient querying
CREATE INDEX IF NOT EXISTS idx_games_history_gin ON public.games USING GIN (history);
CREATE INDEX IF NOT EXISTS idx_games_team1_info_gin ON public.games USING GIN (team1_info);
CREATE INDEX IF NOT EXISTS idx_games_team2_info_gin ON public.games USING GIN (team2_info);

-- Add comment to table
COMMENT ON TABLE public.games IS 'Games table for chessball matches with team information and game state';

-- Add comments to columns
COMMENT ON COLUMN public.games.id IS 'Primary key, auto-incrementing';
COMMENT ON COLUMN public.games.created_at IS 'Timestamp when game was created';
COMMENT ON COLUMN public.games.last_move_at IS 'Timestamp of the last move made';
COMMENT ON COLUMN public.games.last_move_team IS 'ID of the team that made the last move';
COMMENT ON COLUMN public.games.team1 IS 'ID of the first team';
COMMENT ON COLUMN public.games.team2 IS 'ID of the second team';
COMMENT ON COLUMN public.games.status IS 'Current status of the game';
COMMENT ON COLUMN public.games.moves_made IS 'Number of moves made in the game';
COMMENT ON COLUMN public.games.winner IS 'ID of the winning team';
COMMENT ON COLUMN public.games.history IS 'JSON containing game move history';
COMMENT ON COLUMN public.games.team1_info IS 'JSON containing additional team1 information';
COMMENT ON COLUMN public.games.team2_info IS 'JSON containing additional team2 information';
COMMENT ON COLUMN public.games.team1_score IS 'Current score of team1';
COMMENT ON COLUMN public.games.team2_score IS 'Current score of team2';

-- Create index on active_game_id for better performance
CREATE INDEX IF NOT EXISTS idx_teams_active_game_id ON public.teams(active_game_id);

-- Add comment for the new column
COMMENT ON COLUMN public.teams.active_game_id IS 'Active game identifier for the team';
