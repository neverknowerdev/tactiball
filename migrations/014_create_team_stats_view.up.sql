-- Migration: 014_create_team_stats_view.up.sql
-- Purpose: Provide a lightweight team_stats view for local testing environments

CREATE OR REPLACE VIEW team_stats AS
SELECT
    t.id AS team_id,
    0::bigint AS total_games,
    0::bigint AS wins,
    0::bigint AS draws,
    0::bigint AS losses,
    t.last_games_results AS last_game_results
FROM teams t;

COMMENT ON VIEW team_stats IS 'Lightweight team stats view used for local testing';
COMMENT ON COLUMN team_stats.team_id IS 'Reference to teams.id';
COMMENT ON COLUMN team_stats.total_games IS 'Placeholder total games count for tests';
COMMENT ON COLUMN team_stats.wins IS 'Placeholder wins count for tests';
COMMENT ON COLUMN team_stats.draws IS 'Placeholder draws count for tests';
COMMENT ON COLUMN team_stats.losses IS 'Placeholder losses count for tests';
COMMENT ON COLUMN team_stats.last_game_results IS 'Latest results derived from teams.last_games_results';

