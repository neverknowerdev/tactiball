#!/bin/bash

# Chessball Database Migration Runner
# This script runs the database migrations in the correct order

set -e

# Configuration
echo "🚀 Starting Chessball database migrations..."
echo "Database URL: $DB_URL"
echo ""

# Function to run a migration
run_migration() {
    local migration_file=$1
    local description=$2
    
    echo "📋 Running: $description"
    echo "File: $migration_file"
    
    if psql "$DB_URL" -f "$migration_file"; then
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
if psql "$DB_URL" -c "SELECT 1;" > /dev/null 2>&1; then
    echo "✅ Database connection successful"
else
    echo "❌ Database connection failed"
    echo "Please check DB_CONNECTION_STRING (currently $DB_URL)"
    exit 1
fi
echo ""

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
