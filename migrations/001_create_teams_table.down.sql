-- Migration: 001_create_teams_table.down.sql
-- Description: Rollback for teams table creation
-- Date: 2024-12-19

-- Drop indexes first
DROP INDEX IF EXISTS idx_teams_elo_rating;
DROP INDEX IF EXISTS idx_teams_country;
DROP INDEX IF EXISTS idx_teams_primary_wallet;

-- Drop table
DROP TABLE IF EXISTS public.teams;
