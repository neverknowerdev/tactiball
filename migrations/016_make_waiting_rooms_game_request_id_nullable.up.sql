-- Migration: 016_make_waiting_rooms_game_request_id_nullable.up.sql
-- Make game_request_id nullable in waiting_rooms table
-- This allows rooms to be created without a game request (which is created later when both teams are ready)

BEGIN;

-- Alter the column to allow NULL values
ALTER TABLE public.waiting_rooms 
ALTER COLUMN game_request_id DROP NOT NULL;

COMMIT;

