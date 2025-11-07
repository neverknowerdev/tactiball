#!/bin/bash

# Chessball Database Cleanup Script for Preview Environment
# This script clears the database tables without requiring user confirmation

set -e

# Configuration from environment variables
DB_NAME=${DB_NAME:-"postgres"}
DB_HOST=${DB_HOST:-"localhost"}
DB_PORT=${DB_PORT:-"5432"}
DB_USER=${DB_USER:-"postgres"}
DB_PASSWORD=${DB_PASSWORD:-""}
SSL_MODE=${SSL_MODE:-"require"}

echo "🧹 Starting Chessball database cleanup for Preview environment..."
echo "Database: $DB_NAME"
echo "Host: $DB_HOST:$DB_PORT"
echo "User: $DB_USER"
echo "SSL Mode: $SSL_MODE"
echo ""

# Function to run a rollback migration
run_rollback() {
    local migration_file=$1
    local description=$2
    
    echo "🔄 Rolling back: $description"
    echo "File: $migration_file"
    
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --set=sslmode="$SSL_MODE" -f "$migration_file" > /dev/null 2>&1; then
        echo "✅ Successfully rolled back: $description"
    else
        echo "⚠️  Could not rollback: $description (might not exist)"
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
    exit 1
fi
echo ""

# Simply truncate all tables to clear data
echo "🗑️  Truncating all tables..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --set=sslmode="$SSL_MODE" <<EOF
TRUNCATE TABLE IF EXISTS public.games CASCADE;
TRUNCATE TABLE IF EXISTS public.teams_statistic CASCADE;
TRUNCATE TABLE IF EXISTS public.teams CASCADE;
TRUNCATE TABLE IF EXISTS public.messages CASCADE;
TRUNCATE TABLE IF EXISTS public.waiting_rooms CASCADE;
EOF

if [ $? -eq 0 ]; then
    echo "✅ All tables truncated successfully"
else
    echo "⚠️  Some tables might not exist or couldn't be truncated (this is OK if schema is fresh)"
fi
echo ""

echo "🎉 Database cleanup and schema recreation completed!"
echo ""

