-- ============================================================================
-- Migration: Add zealy_user_id column to teams table
-- Description: Adds Zealy integration support to the teams table
-- ============================================================================

-- Add zealy_user_id column to teams table
ALTER TABLE teams 
ADD COLUMN IF NOT EXISTS zealy_user_id TEXT;

-- Create index for faster lookups when Zealy calls the verification endpoint
CREATE INDEX IF NOT EXISTS idx_teams_zealy_user_id 
ON teams(zealy_user_id);

-- Create index on wallet_address if it doesn't exist (for faster lookups)
CREATE INDEX IF NOT EXISTS idx_teams_wallet_address 
ON teams(wallet_address);

-- Optional: Add a unique constraint to ensure one Zealy account per team
-- Uncomment the line below if you want to enforce this
-- ALTER TABLE teams ADD CONSTRAINT unique_zealy_user_id UNIQUE (zealy_user_id);

-- Optional: Add a comment to document the column
COMMENT ON COLUMN teams.zealy_user_id IS 'Zealy user ID linked to this team for quest verification';

-- Verify the migration
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'teams' 
AND column_name IN ('zealy_user_id', 'wallet_address')
ORDER BY column_name;