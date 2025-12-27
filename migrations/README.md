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

## Migration Tracking System

The migration system uses a `migrations` table to track all applied migrations. This table is automatically created by the first migration (`000_migrations.up.sql`) and contains:

- `id` - Primary key (BIGSERIAL)
- `name` - Migration name with operation suffix (e.g., `create_teams_table.up`)
- `version` - Migration version number (INTEGER)
- `hash` - SHA256 hash of the migration file
- `is_dirty` - Boolean flag indicating if migration is in progress
- `created_at` - Timestamp when the migration was applied

The system ensures:
- Migrations are only applied once
- Failed migrations are marked as dirty
- Version numbers are stored as integers
- Rollbacks remove migration records from the tracking table

## Usage

### Running Migrations

The migration system uses `run-migrations.sh` script which supports both up and down migrations.

#### Apply Migrations (Up)

Apply all new migrations that haven't been applied yet:
```bash
# Apply all new migrations
./migrations/run-migrations.sh up

# Apply migrations up to a specific version
./migrations/run-migrations.sh up 005
```

**Examples:**
```bash
# Apply all pending migrations
./migrations/run-migrations.sh up

# Apply only migrations up to version 005
./migrations/run-migrations.sh up 005

# With custom database connection string
DB_CONNECTION_STRING="postgres://user:pass@localhost:5432/dbname" ./migrations/run-migrations.sh up
```

The script will:
1. Check database connection
2. Ensure migrations table exists
3. Find the latest applied migration
4. Apply all new migrations in order
5. Track each migration in the database with hash and version

#### Rollback Migrations (Down)

Rollback migrations to a specific version:
```bash
# Rollback to a specific version number
./migrations/run-migrations.sh down 005

# Rollback to a specific migration by name
./migrations/run-migrations.sh down create_teams_table
```

**Examples:**
```bash
# Rollback to version 005 (removes all migrations after 005)
./migrations/run-migrations.sh down 005

# Rollback to a migration by name
./migrations/run-migrations.sh down create_teams_table

# With custom database connection string
DB_CONNECTION_STRING="postgres://user:pass@localhost:5432/dbname" ./migrations/run-migrations.sh down 003
```

**Important Notes:**
- Down migrations require a target version or migration name (required argument)
- The script will show a confirmation prompt before rolling back
- Migrations are rolled back in reverse order (newest first)
- Rolled back migrations are removed from the tracking table

### Migration File Naming

Migration files must follow this naming convention:
- Up migrations: `NNN_description.up.sql` (e.g., `001_create_teams_table.up.sql`)
- Down migrations: `NNN_description.down.sql` (e.g., `001_create_teams_table.down.sql`)

Where:
- `NNN` is a zero-padded version number (e.g., `001`, `002`, `015`)
- `description` is a descriptive name using underscores
- The version number is parsed as an integer (leading zeros are handled automatically)

### Checking Migration Status

You can check the current migration status by querying the migrations table:
```sql
-- View all applied migrations
SELECT version, name, is_dirty, created_at
FROM public.migrations
ORDER BY version;

-- Check for dirty (failed) migrations
SELECT version, name, created_at
FROM public.migrations
WHERE is_dirty = true;

-- Get latest applied version
SELECT MAX(version) as latest_version
FROM public.migrations
WHERE is_dirty = false;
```

### Environment Variables

The migration script uses the `DB_CONNECTION_STRING` environment variable:
```bash
# Set database connection string
export DB_CONNECTION_STRING="postgres://user:password@localhost:5432/database"

# Or use inline
DB_CONNECTION_STRING="postgres://user:password@localhost:5432/database" ./migrations/run-migrations.sh up
```

If not set, it defaults to: `postgres://postgres:postgres@localhost:5432/postgres`

### Troubleshooting

**Migration marked as dirty:**
If a migration fails, it will be marked as `is_dirty = true`. You should:
1. Fix the issue in the migration file
2. Manually clean up any partial changes
3. Update the migration record: `UPDATE public.migrations SET is_dirty = false WHERE version = X;`
4. Re-run the migration

**Version conflicts:**
If you need to re-apply a migration:
1. Remove it from the migrations table: `DELETE FROM public.migrations WHERE version = X;`
2. Re-run the migration script

**Checking migration file hash:**
The system tracks file hashes to detect changes. If a migration file is modified after being applied, you'll need to remove the old record and re-apply it.

## Notes

- All migrations use `IF NOT EXISTS` to prevent errors on re-runs
- Foreign key constraints ensure referential integrity
- JSONB columns use GIN indexes for efficient JSON querying
- Default values are set for appropriate columns
- All tables include comprehensive comments for documentation
- Migration versions are stored as integers in the database
- The migration system automatically tracks applied migrations and prevents duplicate applications
- Failed migrations are marked as dirty to prevent data corruption

## Dependencies

- PostgreSQL 12+ (for JSONB support)
- The `teams` table must be created before the `games` table due to foreign key dependencies
