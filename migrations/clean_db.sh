#!/bin/bash

# Chessball Database Cleanup Script
# This script runs all down migrations in reverse order to clean up the database

set -e

# Configuration
DB_NAME=${DB_NAME:-"postgres"}
DB_HOST=${DB_HOST:-"localhost"}
DB_PORT=${DB_PORT:-"5432"}
DB_USER=${DB_USER:-"postgres"}
DB_PASSWORD=${DB_PASSWORD:-""}
SSL_MODE=${SSL_MODE:-"require"}

echo "🧹 Starting Chessball database cleanup..."
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
    
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --set=sslmode="$SSL_MODE" -f "$migration_file"; then
        echo "✅ Successfully rolled back: $description"
    else
        echo "❌ Failed to rollback: $description"
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

# Run all down migrations in reverse order
echo "🔍 Finding rollback migration files..."
down_migrations=()

# Collect all .down.sql files
for migration_file in *.down.sql; do
    if [ -f "$migration_file" ]; then
        down_migrations+=("$migration_file")
    fi
done

# Sort them in reverse order (highest number first)
IFS=$'\n' sorted_migrations=($(sort -r <<<"${down_migrations[*]}"))
unset IFS

if [ ${#sorted_migrations[@]} -eq 0 ]; then
    echo "⚠️  No rollback migration files found"
    exit 0
fi

echo "📋 Found ${#sorted_migrations[@]} rollback migrations to run in reverse order:"
for migration in "${sorted_migrations[@]}"; do
    echo "   - $migration"
done
echo ""

# Confirm before proceeding
echo "⚠️  WARNING: This will completely remove all Chessball database schema!"
echo "   - All tables will be dropped"
echo "   - All data will be lost"
echo "   - All functions and triggers will be removed"
echo ""
read -p "Are you sure you want to continue? (type 'yes' to confirm): " confirmation

if [ "$confirmation" != "yes" ]; then
    echo "❌ Cleanup cancelled"
    exit 0
fi

echo ""

# Run rollbacks in reverse order
for migration_file in "${sorted_migrations[@]}"; do
    # Extract description from filename (remove .down.sql and replace underscores with spaces)
    description=$(echo "$migration_file" | sed 's/\.down\.sql$//' | sed 's/_/ /g')
    run_rollback "$migration_file" "$description"
done

echo "🎉 All rollback migrations completed successfully!"
echo ""
echo "🗑️  Database schema has been completely cleaned up:"
echo "   - teams table removed"
echo "   - games table removed"
echo "   - teams_statistic table removed"
echo "   - All functions and triggers removed"
echo "   - All enums and types removed"
echo ""
echo "💡 To recreate the schema, run: ./run-migrations.sh"
