#!/bin/bash

# Chessball Database Cleanup Script
# This script rolls back all migrations to version 000, effectively cleaning the database

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🧹 Starting Chessball database cleanup..."
echo "This will rollback all migrations to version 000"
echo ""

# Run the migration script to rollback all migrations
"$SCRIPT_DIR/run-migrations.sh" down 000 --force

echo ""
echo "🎉 Database cleanup completed successfully!"
echo ""
echo "💡 To recreate the schema, run: ./run-migrations.sh up"
