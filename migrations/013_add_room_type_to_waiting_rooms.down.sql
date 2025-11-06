
-- Rollback migration: 013_add_room_type_to_waiting_rooms.down.sql

BEGIN;

-- Drop indexes
DROP INDEX IF EXISTS idx_waiting_rooms_type_status;
DROP INDEX IF EXISTS idx_waiting_rooms_room_type;

-- Drop column
ALTER TABLE public.waiting_rooms DROP COLUMN IF EXISTS room_type;

COMMIT;
