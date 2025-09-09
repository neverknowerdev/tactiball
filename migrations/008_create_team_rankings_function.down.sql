-- Migration: 008_create_team_rankings_function.down.sql
-- Description: Drop team rankings function
-- Date: 2024-12-19

-- Drop the function
DROP FUNCTION IF EXISTS public.get_team_rankings(BIGINT);
