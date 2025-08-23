-- Migration: 005_create_statistic_update_trigger.down.sql
-- Description: Rollback for statistic update trigger
-- Date: 2024-12-19

-- Drop trigger first
DROP TRIGGER IF EXISTS trigger_update_team_statistics ON public.games;

-- Drop function
DROP FUNCTION IF EXISTS public.trigger_update_team_statistics();
