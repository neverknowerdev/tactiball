-- Migration: 003_create_teams_statistic_table.up.sql
-- Description: Create teams_statistic table with period-based statistics (week/month)
-- Date: 2024-12-19

-- Create period enum type
CREATE TYPE public.statistic_period AS ENUM ('week', 'month', 'alltime');

-- Create teams_statistic table
CREATE TABLE IF NOT EXISTS public.teams_statistic (
    id BIGSERIAL PRIMARY KEY,
    team_id BIGINT NOT NULL,
    period public.statistic_period NOT NULL,
    period_start DATE NOT NULL,
    wins INTEGER DEFAULT 0,
    draws INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    goal_scored INTEGER DEFAULT 0,
    goal_conceded INTEGER DEFAULT 0,
    biggest_win_diff INTEGER DEFAULT 0,
    biggest_win_goal_scored INTEGER DEFAULT 0,
    biggest_win_goals_conceded INTEGER DEFAULT 0,
    biggest_loss_diff INTEGER DEFAULT 0,
    biggest_loss_goals_scored INTEGER DEFAULT 0,
    biggest_loss_goals_conceded INTEGER DEFAULT 0,
    elo_rating_delta NUMERIC DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Unique constraint to ensure one record per team per period per start date
    UNIQUE(team_id, period, period_start)
);

-- Create foreign key constraint
ALTER TABLE public.teams_statistic 
    ADD CONSTRAINT teams_statistic_team_id_fkey 
    FOREIGN KEY (team_id) REFERENCES public.teams(id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_teams_statistic_team_id ON public.teams_statistic(team_id);
CREATE INDEX IF NOT EXISTS idx_teams_statistic_period ON public.teams_statistic(period);
CREATE INDEX IF NOT EXISTS idx_teams_statistic_period_start ON public.teams_statistic(period_start);
CREATE INDEX IF NOT EXISTS idx_teams_statistic_team_period ON public.teams_statistic(team_id, period);
CREATE INDEX IF NOT EXISTS idx_teams_statistic_team_period_start ON public.teams_statistic(team_id, period, period_start);

-- Add comments
COMMENT ON TABLE public.teams_statistic IS 'Period-based team statistics (weekly, monthly, and alltime)';
COMMENT ON COLUMN public.teams_statistic.team_id IS 'Reference to teams.id';
COMMENT ON COLUMN public.teams_statistic.period IS 'Statistics period: week, month, or alltime';
COMMENT ON COLUMN public.teams_statistic.period_start IS 'Start date of the period';
COMMENT ON COLUMN public.teams_statistic.wins IS 'Number of wins in the period';
COMMENT ON COLUMN public.teams_statistic.draws IS 'Number of draws in the period';
COMMENT ON COLUMN public.teams_statistic.losses IS 'Number of losses in the period';
COMMENT ON COLUMN public.teams_statistic.goal_scored IS 'Total goals scored in the period';
COMMENT ON COLUMN public.teams_statistic.goal_conceded IS 'Total goals conceded in the period';
COMMENT ON COLUMN public.teams_statistic.biggest_win_diff IS 'Biggest win margin (goals_scored - goals_conceded)';
COMMENT ON COLUMN public.teams_statistic.biggest_win_goal_scored IS 'Goals scored in biggest win';
COMMENT ON COLUMN public.teams_statistic.biggest_win_goals_conceded IS 'Goals conceded in biggest win';
COMMENT ON COLUMN public.teams_statistic.biggest_loss_diff IS 'Biggest loss margin (goals_conceded - goals_scored)';
COMMENT ON COLUMN public.teams_statistic.biggest_loss_goals_scored IS 'Goals scored in biggest loss';
COMMENT ON COLUMN public.teams_statistic.biggest_loss_goals_conceded IS 'Goals conceded in biggest loss';
COMMENT ON COLUMN public.teams_statistic.elo_rating_delta IS 'Total ELO rating change in the period';
