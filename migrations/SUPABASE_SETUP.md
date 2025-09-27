# Running Migrations with Supabase

## Prerequisites

1. **Install PostgreSQL client tools** (if not already installed):
   ```bash
   # macOS
   brew install postgresql
   
   # Ubuntu/Debian
   sudo apt-get install postgresql-client
   
   # Windows
   # Download from https://www.postgresql.org/download/windows/
   ```

2. **Get your Supabase connection details** from your project dashboard:
   - Host: `db.qdflmhravjbbheniwjeh.supabase.co`
   - Port: `5432` (usually)
   - Database: `postgres` (usually)
   - User: `postgres` (usually)
   - Password: Your database password

## Running Migrations

### Option 1: Using Environment Variables
```bash
export DB_HOST="db.qdflmhravjbbheniwjeh.supabase.co"
export DB_PORT="5432"
export DB_NAME="postgres"
export DB_USER="postgres"
export DB_PASSWORD="your_actual_password"
export SSL_MODE="require"

./migrations/run-migrations.sh
```

### Option 2: Inline Command
```bash
DB_HOST="db.qdflmhravjbbheniwjeh.supabase.co" \
DB_PORT="5432" \
DB_NAME="postgres" \
DB_USER="postgres" \
DB_PASSWORD="your_actual_password" \
SSL_MODE="require" \
./migrations/run-migrations.sh
```

### Option 3: Using Yarn Scripts
```bash
# Set environment variables first
export DB_HOST="db.qdflmhravjbbheniwjeh.supabase.co"
export DB_PORT="5432"
export DB_NAME="postgres"
export DB_USER="postgres"
export DB_PASSWORD="your_actual_password"
export SSL_MODE="require"

# Then run migrations
yarn db:migrate
```

## Troubleshooting

### Connection Issues
- **Hostname resolution**: Make sure the hostname is correct
- **SSL required**: Supabase requires SSL connections
- **Password**: Ensure the password is correct
- **Firewall**: Check if your network allows outbound connections to port 5432

### Common Errors
1. **"nodename nor servname provided"**: Check hostname spelling
2. **"SSL connection required"**: Set `SSL_MODE=require`
3. **"Authentication failed"**: Verify username and password
4. **"Database does not exist"**: This is normal for Supabase, the script will handle it

### Testing Connection
Test your connection manually first:
```bash
psql -h "db.qdflmhravjbbheniwjeh.supabase.co" \
     -p "5432" \
     -U "postgres" \
     -d "postgres" \
     --set=sslmode=require \
     -c "SELECT version();"
```

## Migration Order
The script automatically runs migrations in the correct order:
1. `001_create_teams_table.up.sql`
2. `002_create_games_table.up.sql`
3. `003_create_teams_statistic_table.up.sql`
4. `004_create_statistic_update_functions.up.sql`
5. `005_create_statistic_update_trigger.up.sql`
6. `006_add_last_games_result_to_teams.up.sql`

## Rollback
To rollback specific migrations:
```bash
yarn db:rollback:last-games-result
yarn db:rollback:statistic-trigger
yarn db:rollback:statistic-functions
yarn db:rollback:statistic-table
yarn db:rollback:games
yarn db:rollback:teams
```
