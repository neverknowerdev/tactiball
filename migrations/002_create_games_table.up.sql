-- Migration: 002_create_games_table.up.sql
-- Description: Create the games table with all required columns and foreign key constraints
-- Date: 2024-12-19

-- Create game status enum type (matching smart contract)
CREATE TYPE game_status AS ENUM ('active', 'finished', 'finished_by_timeout');

-- Create games table
CREATE TABLE IF NOT EXISTS games (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    last_move_at TIMESTAMP,
    last_move_team BIGINT,
    team1 BIGINT NOT NULL,
    team2 BIGINT NOT NULL,
    status game_status DEFAULT 'active' NOT NULL,
    moves_made INTEGER DEFAULT 0 NOT NULL,
    winner BIGINT NOT NULL,
    history JSONB,
    team1_info JSONB DEFAULT '{}'::JSONB NOT NULL,
    team2_info JSONB DEFAULT '{}'::JSONB NOT NULL,
    team1_score SMALLINT DEFAULT '0'::SMALLINT NOT NULL,
    team2_score SMALLINT DEFAULT '0'::SMALLINT NOT NULL,
    history_ipfs_cid VARCHAR,
    is_verified BOOLEAN DEFAULT FALSE NOT NULL
);

-- Create foreign key constraints
ALTER TABLE games 
    ADD CONSTRAINT games_last_move_team_fkey 
    FOREIGN KEY (last_move_team) REFERENCES teams(id);

ALTER TABLE games 
    ADD CONSTRAINT games_team1_fkey 
    FOREIGN KEY (team1) REFERENCES teams(id);

ALTER TABLE games 
    ADD CONSTRAINT games_team2_fkey 
    FOREIGN KEY (team2) REFERENCES teams(id);

ALTER TABLE games 
    ADD CONSTRAINT games_winner_fkey 
    FOREIGN KEY (winner) REFERENCES teams(id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_games_team1 ON games(team1);
CREATE INDEX IF NOT EXISTS idx_games_team2 ON games(team2);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_winner ON games(winner);
CREATE INDEX IF NOT EXISTS idx_games_last_move_team ON games(last_move_team);
CREATE INDEX IF NOT EXISTS idx_games_created_at ON games(created_at);
CREATE INDEX IF NOT EXISTS idx_games_last_move_at ON games(last_move_at);

-- Create index on JSONB columns for efficient querying
CREATE INDEX IF NOT EXISTS idx_games_history_gin ON games USING GIN (history);
CREATE INDEX IF NOT EXISTS idx_games_team1_info_gin ON games USING GIN (team1_info);
CREATE INDEX IF NOT EXISTS idx_games_team2_info_gin ON games USING GIN (team2_info);

-- Add comment to table
COMMENT ON TABLE games IS 'Games table for chessball matches with team information and game state';

-- Add comments to columns
COMMENT ON COLUMN games.id IS 'Primary key, auto-incrementing';
COMMENT ON COLUMN games.created_at IS 'Timestamp when game was created';
COMMENT ON COLUMN games.last_move_at IS 'Timestamp of the last move made';
COMMENT ON COLUMN games.last_move_team IS 'ID of the team that made the last move';
COMMENT ON COLUMN games.team1 IS 'ID of the first team';
COMMENT ON COLUMN games.team2 IS 'ID of the second team';
COMMENT ON COLUMN games.status IS 'Current status of the game';
COMMENT ON COLUMN games.moves_made IS 'Number of moves made in the game';
COMMENT ON COLUMN games.winner IS 'ID of the winning team';
COMMENT ON COLUMN games.history IS 'JSON containing game move history';
COMMENT ON COLUMN games.team1_info IS 'JSON containing additional team1 information';
COMMENT ON COLUMN games.team2_info IS 'JSON containing additional team2 information';
COMMENT ON COLUMN games.team1_score IS 'Current score of team1';
COMMENT ON COLUMN games.team2_score IS 'Current score of team2';
COMMENT ON COLUMN games.history_ipfs_cid IS 'IPFS CID of the game history';
COMMENT ON COLUMN games.is_verified IS 'Whether the game history is verified';

-- Create index on active_game_id for better performance
CREATE INDEX IF NOT EXISTS idx_teams_active_game_id ON teams(active_game_id);

-- Add comment for the new column
COMMENT ON COLUMN teams.active_game_id IS 'Active game identifier for the team';

-- Create function to handle new game state updates
CREATE OR REPLACE FUNCTION new_game_state(game_id BIGINT, history_item JSONB)
RETURNS void AS $$
BEGIN
    -- Update the game record to clear team moves and increment moves counter
    UPDATE games 
    SET 
        moves_made = moves_made + 1,
        last_move_at = NULL,
        history = COALESCE(history, '[]'::jsonb) || jsonb_build_array(history_item)
    WHERE id = game_id;
    
    -- Raise an error if no rows were updated (game not found)
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Game with ID % not found', game_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Add comment for the function
COMMENT ON FUNCTION new_game_state(BIGINT,JSONB) IS 'Updates game state by clearing team moves and incrementing moves counter, returns the latest history item';
