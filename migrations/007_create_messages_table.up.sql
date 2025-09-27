-- Migration: 007_create_messages_table.up.sql
-- Description: Create messages table for blockchain event logs
-- Date: 2024-12-19

-- Create the messages table
CREATE TABLE public.messages (
    id BIGSERIAL PRIMARY KEY,
    block_number BIGINT NOT NULL,
    transaction_hash VARCHAR(66) NOT NULL,
    log_index INTEGER NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    event_name VARCHAR(255) NOT NULL,
    args JSONB NOT NULL DEFAULT '{}',
    is_processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create unique constraint on transaction_hash + log_index
CREATE UNIQUE INDEX idx_messages_transaction_log_unique 
ON public.messages (transaction_hash, log_index);

-- Add comments
COMMENT ON TABLE public.messages IS 'Table storing blockchain event logs and messages';
COMMENT ON COLUMN public.messages.id IS 'Primary key, auto-incrementing';
COMMENT ON COLUMN public.messages.block_number IS 'Block number where the event occurred';
COMMENT ON COLUMN public.messages.transaction_hash IS 'Hash of the transaction containing the event';
COMMENT ON COLUMN public.messages.log_index IS 'Index of the log within the transaction';
COMMENT ON COLUMN public.messages.timestamp IS 'Timestamp when the event occurred';
COMMENT ON COLUMN public.messages.event_name IS 'Name of the blockchain event';
COMMENT ON COLUMN public.messages.args IS 'Event arguments stored as JSONB';
COMMENT ON COLUMN public.messages.is_processed IS 'Flag indicating if the message has been processed';
COMMENT ON COLUMN public.messages.processed_at IS 'Timestamp when the message was processed';
COMMENT ON COLUMN public.messages.created_at IS 'Record creation timestamp';


-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO PUBLIC;
GRANT USAGE, SELECT ON SEQUENCE public.messages_id_seq TO PUBLIC;
