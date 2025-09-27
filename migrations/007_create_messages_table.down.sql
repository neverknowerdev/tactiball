-- Migration: 007_create_messages_table.down.sql
-- Description: Rollback for messages table creation
-- Date: 2024-12-19

-- Drop indexes
DROP INDEX IF EXISTS idx_messages_transaction_log_unique;

-- Drop the table
DROP TABLE IF EXISTS public.messages;
