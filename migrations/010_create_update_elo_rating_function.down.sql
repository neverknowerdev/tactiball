-- Migration: 010_create_update_elo_rating_function.down.sql
-- Description: Drop the update_elo_rating function
-- Date: 2024-12-19

-- Drop the function
DROP FUNCTION IF EXISTS public.update_elo_rating(BIGINT, BIGINT, NUMERIC);
