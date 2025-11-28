-- Migration: 016_make_waiting_rooms_game_request_id_nullable.down.sql
-- Rollback: Make game_request_id NOT NULL again

BEGIN;

-- First, set any NULL values to a default (0) to avoid constraint violation
-- Note: This assumes no NULL values exist, or you may need to handle them differently
UPDATE public.waiting_rooms 
SET game_request_id = 0 
WHERE game_request_id IS NULL;

-- Now make the column NOT NULL again
ALTER TABLE public.waiting_rooms 
ALTER COLUMN game_request_id SET NOT NULL;

COMMIT;

