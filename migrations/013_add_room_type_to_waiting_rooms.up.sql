
-- Migration: 013_add_room_type_to_waiting_rooms.sql

BEGIN;

-- Add room_type column
ALTER TABLE public.waiting_rooms 
ADD COLUMN room_type VARCHAR(10) NOT NULL DEFAULT 'public' CHECK (room_type IN ('public', 'private'));

-- Add index for filtering public rooms
CREATE INDEX idx_waiting_rooms_room_type ON public.waiting_rooms(room_type);

-- Add composite index for common queries
CREATE INDEX idx_waiting_rooms_type_status ON public.waiting_rooms(room_type, status, expires_at);

COMMIT;
