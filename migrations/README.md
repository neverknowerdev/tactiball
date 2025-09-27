# Database Migrations

This folder contains database migration files for the Chessball project.

## Migration Files

Each migration has two files:
- `.up.sql` - Applies the migration
- `.down.sql` - Rolls back the migration

### 001_create_teams_table
**Up Migration:** Creates the `teams` table with the following structure:
- `id` - Primary key (BIGSERIAL)
- `created_at` - Timestamp with default NOW()
- `primaryWallet` - Team's primary wallet address
- `name` - Team name
- `country` - Country code (SMALLINT)
- `gameRequestl` - Game request identifier
- `eloRating` - ELO rating with default 100

**Down Migration:** Removes the teams table and all associated indexes

### 002_create_games_table
**Up Migration:** Creates the `games` table with the following structure:
- `id` - Primary key (BIGSERIAL)
- `created_at` - Timestamp with default NOW()
- `last_move_at` - Timestamp of last move
- `last_move_team` - Foreign key to teams.id
- `team1` - Foreign key to teams.id
- `team2` - Foreign key to teams.id
- `status` - Game status
- `movesMade` - Number of moves (default 0)
- `winner` - Foreign key to teams.id
- `history` - JSONB for game move history
- `team1Info` - JSONB for team1 additional info (default {})
- `team2Info` - JSONB for team2 additional info (default {})
- `team1score` - Team1 score (default 0)
- `team2score` - Team2 score (default 0)

**Down Migration:** Removes foreign key constraints, indexes, and the games table

### 003_create_teams_statistic_table
**Up Migration:** Creates `teams_statistic` table with period-based statistics:
- `team_id`, `period` (week/month), `period_start`
- `wins`, `draws`, `losses`, `goal_scored`, `goal_conceded`
- `biggest_win_diff`, `biggest_win_goal_scored`, `biggest_win_goals_conceded`
- `biggest_loss_diff`, `biggest_loss_goals_scored`, `biggest_loss_goals_conceded`
- `elo_rating_delta` - ELO rating change in the period
- Includes proper indexes and foreign key constraints

**Down Migration:** Removes the table, indexes, and enum type

### 004_create_statistic_update_functions
**Up Migration:** Creates simplified functions to update team statistics:
- `get_period_start()` - Calculate period start dates (week/month)
- `get_or_create_team_statistic()` - Get existing or create new record with defaults
- `update_team_statistic_for_game_result()` - Update specific fields based on game result
- `update_team_statistics_for_game()` - Update both teams' weekly and monthly stats
- `rebuild_all_teams_statistics_period()` - Rebuild statistics for maintenance

**Down Migration:** Removes all statistic update functions

### 005_create_statistic_update_trigger
**Up Migration:** Creates automatic trigger to update statistics:
- Automatically updates team statistics when games are finished
- Updates both weekly and monthly statistics for affected teams
- Only triggers when relevant game data changes

**Down Migration:** Removes the trigger and function

### 006_add_last_games_result_to_teams
**Up Migration:** Adds `lastGamesResult` array to teams table with automatic updates:
- Creates `game_result` enum type (VICTORY, DRAW, DEFEAT, DEFEAT_BY_TIMEOUT)
- Adds `lastGamesResult` column to store last 10 game results
- Creates functions to update individual and all teams' result arrays
- Implements automatic triggers to keep arrays synchronized with game changes
- Includes GIN index for efficient array queries

**Down Migration:** Removes the enum type, column, functions, triggers, and indexes

### 007_add_statistics_jsonb_to_teams
**Up Migration:** Adds `statistics` JSONB field to teams table to store smart contract GameStatistics struct:
- Adds `statistics` JSONB column with default values matching GameStatistics struct
- Creates GIN index on statistics column for better performance
- Stores all team statistics (wins, losses, draws, goals, etc.) from smart contract
- Enables real-time synchronization of team statistics with blockchain data

**Down Migration:** Removes the statistics column and index

## Foreign Key Relationships

The `games` table has the following foreign key constraints:
- `games_last_move_team_fkey` → `teams.id`
- `games_team1_fkey` → `teams.id`
- `games_team2_fkey` → `teams.id`
- `games_winner_fkey` → `teams.id`

## Team Statistics Table

The `teams_statistic` table provides period-based team performance metrics (weekly and monthly):

### Key Features
- **Period-based**: Separate statistics for week and month periods
- **Automatic Updates**: Triggers automatically update stats when games are finished
- **Comprehensive Metrics**: Wins, draws, losses, goals, biggest wins/losses, ELO changes
- **Efficient Storage**: One record per team per period with upsert logic

### Usage Examples
```sql
-- Get team's weekly statistics
SELECT period_start, wins, draws, losses, goal_scored, goal_conceded
FROM teams_statistic 
WHERE team_id = 1 AND period = 'week'
ORDER BY period_start DESC;

-- Get team's monthly performance
SELECT period_start, wins, draws, losses, elo_rating_delta
FROM teams_statistic 
WHERE team_id = 1 AND period = 'month'
ORDER BY period_start DESC;

-- Find teams with best weekly performance
SELECT t.name, ts.wins, ts.goal_scored, ts.goal_conceded
FROM teams_statistic ts
JOIN teams t ON ts.team_id = t.id
WHERE ts.period = 'week' 
  AND ts.period_start = (SELECT MAX(period_start) FROM teams_statistic WHERE period = 'week')
ORDER BY ts.wins DESC, ts.goal_scored DESC;

-- Get biggest win margin for a team this month
SELECT period_start, biggest_win_diff, biggest_win_goal_scored, biggest_win_goals_conceded
FROM teams_statistic 
WHERE team_id = 1 AND period = 'month'
ORDER BY period_start DESC
LIMIT 1;
```

### Manual Updates
```sql
-- Rebuild statistics for current week (maintenance)
SELECT rebuild_all_teams_statistics_period('week', CURRENT_DATE);

-- Rebuild statistics for current month (maintenance)  
SELECT rebuild_all_teams_statistics_period('month', CURRENT_DATE);

-- Update statistics for a specific game
SELECT update_team_statistics_for_game(123);
```

## Last Games Result Tracking

The `lastGamesResult` array in the teams table automatically tracks the last 10 game results for each team:

### Key Features
- **Automatic Updates**: Triggers automatically update arrays when games are modified
- **Result Types**: VICTORY, DRAW, DEFEAT, DEFEAT_BY_TIMEOUT
- **Recent History**: Always maintains the 10 most recent results
- **Performance**: GIN index for efficient array queries

### Usage Examples
```sql
-- Get team's recent form (last 10 games)
SELECT name, lastGamesResult 
FROM teams 
WHERE id = 1;

-- Find teams with recent winning streaks
SELECT name, lastGamesResult
FROM teams 
WHERE lastGamesResult[1:3] = ARRAY['VICTORY', 'VICTORY', 'VICTORY'];

-- Count recent victories for a team
SELECT name, 
       ARRAY_LENGTH(ARRAY_REMOVE(lastGamesResult, 'VICTORY'), 1) as recent_victories
FROM teams 
WHERE id = 1;

-- Get teams with timeout defeats in their last 5 games
SELECT name, lastGamesResult[1:5] as last_5_games
FROM teams 
WHERE 'DEFEAT_BY_TIMEOUT' = ANY(lastGamesResult[1:5]);
```

### Manual Updates
```sql
-- Update a specific team's last games result
SELECT update_team_last_games_result(1);

-- Update all teams' last games result arrays
SELECT update_all_teams_last_games_result();
```

### Using Yarn Scripts
```bash
# Rebuild statistics for current week (maintenance)
yarn db:rebuild-week-stats

# Rebuild statistics for current month (maintenance)
yarn db:rebuild-month-stats

# Update statistics for a specific game (replace 1 with actual game ID)
yarn db:update-game-stats
```



## Indexes

### Teams Table
- Primary key index on `id`
- Index on `primaryWallet` for wallet lookups
- Index on `country` for filtering
- Index on `eloRating` for sorting
- GIN index on `statistics` JSONB column for efficient statistics querying
- GIN index on `last_games_results` array for efficient result tracking

### Games Table
- Primary key index on `id`
- Indexes on foreign key columns for joins
- Indexes on `status`, `created_at`, `last_move_at` for filtering
- GIN indexes on JSONB columns for efficient querying

## Usage

### Apply Migrations
Run all up migrations automatically:
```bash
# Using the migration runner script
./migrations/run-migrations.sh

# Using yarn
yarn db:migrate
```

The script automatically finds and runs all `.up.sql` files in the correct order.

### Rollback Specific Migrations
To rollback a specific migration, run the corresponding `.down.sql` file:
```bash
# Rollback in reverse order due to dependencies
psql -d your_database -f migrations/006_add_last_games_result_to_teams.down.sql
psql -d your_database -f migrations/005_create_statistic_update_trigger.down.sql
psql -d your_database -f migrations/004_create_statistic_update_functions.down.sql
psql -d your_database -f migrations/003_create_teams_statistic_table.down.sql
psql -d your_database -f migrations/002_create_games_table.down.sql
psql -d your_database -f migrations/001_create_teams_table.down.sql
```

**Note:** Rollback migrations must be run in reverse order due to foreign key dependencies.

### Using Yarn Scripts
```bash
# Run all migrations
yarn db:migrate

# Rollback specific components
yarn db:rollback:last-games-result
yarn db:rollback:statistic-trigger
yarn db:rollback:statistic-functions
yarn db:rollback:statistic-table
yarn db:rollback:games
yarn db:rollback:teams

# Refresh statistics manually
yarn db:refresh-stats
```

## Notes

- All migrations use `IF NOT EXISTS` to prevent errors on re-runs
- Foreign key constraints ensure referential integrity
- JSONB columns use GIN indexes for efficient JSON querying
- Default values are set for appropriate columns
- All tables include comprehensive comments for documentation

## Dependencies

- PostgreSQL 12+ (for JSONB support)
- The `teams` table must be created before the `games` table due to foreign key dependencies
