#!/bin/bash

# Chessball Database Migration Runner
# This script runs the database migrations in the correct order

set -e

# Configuration
DB_NAME=${DB_NAME:-"postgres"}
DB_HOST=${DB_HOST:-"aws-1-us-east-2.pooler.supabase.com"}
DB_PORT=${DB_PORT:-"5432"}
DB_USER=${DB_USER:-"postgres.fbczuemyuopzctgztsxc"}
DB_PASSWORD=${DB_PASSWORD:-"VEEk49hPMyDfUBLs"}
SSL_MODE=${SSL_MODE:-"require"}

echo "🚀 Starting Chessball database migrations..."
echo "Database: $DB_NAME"
echo "Host: $DB_HOST:$DB_PORT"
echo "User: $DB_USER"
echo "SSL Mode: $SSL_MODE"
echo ""

# Function to run a migration
run_migration() {
    local migration_file=$1
    local description=$2
    
    echo "📋 Running: $description"
    echo "File: $migration_file"
    
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --set=sslmode="$SSL_MODE" -f "$migration_file"; then
        echo "✅ Successfully applied: $description"
    else
        echo "❌ Failed to apply: $description"
        exit 1
    fi
    
    echo ""
}

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "❌ Error: psql command not found. Please install PostgreSQL client tools."
    exit 1
fi

# Test database connection
echo "🔌 Testing database connection..."
export PGPASSWORD="$DB_PASSWORD"
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --set=sslmode="$SSL_MODE" -c "SELECT 1;" > /dev/null 2>&1; then
    echo "✅ Database connection successful"
else
    echo "❌ Database connection failed"
    echo "Please check your connection parameters:"
    echo "  - Host: $DB_HOST"
    echo "  - Port: $DB_PORT"
    echo "  - User: $DB_USER"
    echo "  - Database: $DB_NAME"
    echo "  - SSL Mode: $SSL_MODE"
    echo ""
    echo "For Supabase, you might need to set:"
    echo "  export DB_PASSWORD='your_password'"
    echo "  export SSL_MODE='require'"
    exit 1
fi
echo ""

# Check if we can connect to the database (skip database creation for remote hosts like Supabase)
if [[ "$DB_HOST" == "localhost" || "$DB_HOST" == "127.0.0.1" ]]; then
    # Check if database exists (only for local connections)
    if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" --set=sslmode="$SSL_MODE" -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
        echo "⚠️  Database '$DB_NAME' does not exist. Creating it..."
        createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME"
        echo "✅ Database '$DB_NAME' created successfully"
        echo ""
    fi
else
    echo "🌐 Remote database detected. Skipping database existence check."
    echo ""
fi

# Run all up migrations in order
echo "🔍 Finding migration files..."
for migration_file in *.up.sql; do
    if [ -f "$migration_file" ]; then
        # Extract description from filename (remove .up.sql and replace underscores with spaces)
        description=$(echo "$migration_file" | sed 's/\.up\.sql$//' | sed 's/_/ /g')
        run_migration "$migration_file" "$description"
    fi
done

echo "🎉 All migrations completed successfully!"
echo ""
echo "📊 Database schema created:"
echo "   - teams table with ELO ratings and team information"
echo "   - games table with foreign key relationships and game status enum"
echo "   - teams_statistic table with weekly and monthly statistics"
echo "   - Automatic triggers and functions for statistics updates"
echo "   - lastGamesResult array tracking for teams"
echo "   - Appropriate indexes for performance"
echo ""
echo "To rollback migrations, use the yarn scripts:"
echo "  yarn db:rollback:last-games-result"
echo "  yarn db:rollback:statistic-trigger"
echo "  yarn db:rollback:statistic-functions"
echo "  yarn db:rollback:statistic-table"
echo "  yarn db:rollback:games"
echo "  yarn db:rollback:teams"
