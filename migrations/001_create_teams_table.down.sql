-- Migration: 001_create_teams_table.down.sql
-- Description: Rollback for teams table creation
-- Date: 2024-12-19

-- Drop table
DROP TABLE IF EXISTS public.teams CASCADE;



