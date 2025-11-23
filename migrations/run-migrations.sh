#!/bin/bash

# Chessball Database Migration Runner
# This script applies or rolls back database migrations

set -e

# Configuration
MIGRATIONS_DIR="$(cd "$(dirname "$0")" && pwd)"
DB_CONNECTION_STRING="${DB_CONNECTION_STRING:-postgres://postgres:postgres@localhost:5432/postgres}"

# Function to show usage
show_usage() {
    echo "Usage: $0 <up|down> [version]"
    echo ""
    echo "Commands:"
    echo "  up [version]    Apply migrations (version is optional)"
    echo "  down <version> Rollback migrations to specified version (version is required)"
    echo ""
    echo "Examples:"
    echo "  $0 up                    # Apply all new migrations"
    echo "  $0 up 005                # Apply migrations up to version 005"
    echo "  $0 down 005              # Rollback to version 005"
    echo "  $0 down create_teams_table  # Rollback to migration named 'create_teams_table'"
    echo ""
    exit 1
}

# Function to check if psql is available
check_psql() {
    if ! command -v psql &> /dev/null; then
        echo "❌ Error: psql command not found. Please install PostgreSQL client tools."
        exit 1
    fi
}

# Function to test database connection
test_connection() {
    echo "🔌 Testing database connection..."
    if psql "$DB_CONNECTION_STRING" -c "SELECT 1;" > /dev/null 2>&1; then
        echo "✅ Database connection successful"
    else
        echo "❌ Database connection failed"
        echo "Please check DB_CONNECTION_STRING"
        exit 1
    fi
    echo ""
}

# Function to ensure migrations table exists
ensure_migrations_table() {
    echo "📋 Ensuring migrations table exists..."
    psql "$DB_CONNECTION_STRING" -c "
        CREATE TABLE IF NOT EXISTS public.migrations (
            version INTEGER PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            hash VARCHAR(64) NOT NULL,
            is_dirty BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
    " > /dev/null 2>&1
    
    # Create indexes if they don't exist
    psql "$DB_CONNECTION_STRING" -c "
        CREATE INDEX IF NOT EXISTS idx_migrations_name ON public.migrations(name);
        CREATE INDEX IF NOT EXISTS idx_migrations_is_dirty ON public.migrations(is_dirty);
    " > /dev/null 2>&1
    
    echo "✅ Migrations table ready"
    echo ""
}

# Function to calculate SHA256 hash of a file
calculate_hash() {
    local file=$1
    if command -v shasum &> /dev/null; then
        shasum -a 256 "$file" | cut -d' ' -f1
    elif command -v sha256sum &> /dev/null; then
        sha256sum "$file" | cut -d' ' -f1
    else
        echo "❌ Error: Neither shasum nor sha256sum found. Cannot calculate file hash."
        exit 1
    fi
}

# Function to extract version and name from migration filename (for up migrations)
extract_up_migration_info() {
    local filename=$1
    local basename=$(basename "$filename" .up.sql)
    
    # Extract version (number prefix) and name (rest)
    # Name includes .up suffix as per requirement
    if [[ $basename =~ ^([0-9]+)_(.+)$ ]]; then
        # Parse version as integer (remove leading zeros if any, but keep as string for DB)
        local version_str="${BASH_REMATCH[1]}"
        local version_num=$((10#$version_str))  # Convert to integer (handles leading zeros)
        echo "${version_num}|${BASH_REMATCH[2]}.up"
    else
        echo "|${basename}.up"
    fi
}

# Function to extract version and name from migration filename (for down migrations)
extract_down_migration_info() {
    local filename=$1
    local basename=$(basename "$filename" .down.sql)
    
    # Extract version (number prefix) and name (rest)
    # Name includes .down suffix as per requirement
    if [[ $basename =~ ^([0-9]+)_(.+)$ ]]; then
        # Parse version as integer
        local version_str="${BASH_REMATCH[1]}"
        local version_num=$((10#$version_str))  # Convert to integer (handles leading zeros)
        echo "${version_num}|${BASH_REMATCH[2]}.down"
    else
        echo "|${basename}.down"
    fi
}

# Function to get latest applied migration version (as integer)
get_latest_version() {
    local version_str=$(psql "$DB_CONNECTION_STRING" -t -A -c "
        SELECT COALESCE(MAX(version), -1)
        FROM public.migrations
        WHERE is_dirty = false;
    " | tr -d ' ')
    
    # Ensure it's a number
    if [[ "$version_str" =~ ^-?[0-9]+$ ]]; then
        echo $((10#$version_str))
    else
        echo "-1"
    fi
}

# Function to check if migration is already applied
is_migration_applied() {
    local version=$1
    local name=$2
    local hash=$3
    
    local count=$(psql "$DB_CONNECTION_STRING" -t -A -c "
        SELECT COUNT(*)
        FROM public.migrations
        WHERE version = $version AND name = '$name' AND hash = '$hash' AND is_dirty = false;
    " | tr -d ' ')
    
    [ "$count" -gt 0 ]
}

# Function to apply a single migration
apply_migration() {
    local migration_file=$1
    local version=$2
    local name=$3
    local hash=$4
    
    echo "📋 Applying migration: $name (version: $version)"
    echo "   File: $(basename "$migration_file")"
    echo "   Hash: ${hash:0:8}..."
    
    # Insert migration record with is_dirty=true
    # Ensure version is stored as integer
    psql "$DB_CONNECTION_STRING" -c "
        INSERT INTO public.migrations (version, name, hash, is_dirty, created_at)
        VALUES ($version, '$name', '$hash', true, NOW())
        ON CONFLICT (version) 
        DO UPDATE SET hash = EXCLUDED.hash, is_dirty = true, name = EXCLUDED.name;
    " > /dev/null 2>&1
    
    # Run the migration
    if psql "$DB_CONNECTION_STRING" -f "$migration_file"; then
        echo "   ✅ Migration SQL executed successfully"
        
        # Update is_dirty to false
        psql "$DB_CONNECTION_STRING" -c "
            UPDATE public.migrations
            SET is_dirty = false
            WHERE version = $version AND name = '$name';
        " > /dev/null 2>&1
        
        echo "   ✅ Migration marked as clean"
    else
        echo "   ❌ Failed to apply migration"
        echo "   ⚠️  Migration is marked as dirty in database"
        exit 1
    fi
    
    echo ""
}

# Function to find target migration version (for down migrations)
find_target_version() {
    local target=$1
    
    # Check if target is a version number
    if [[ "$target" =~ ^[0-9]+$ ]]; then
        # Parse as integer
        echo $((10#$target))
        return
    fi
    
    # Otherwise, treat as name and find version
    # Try with .up suffix first (since we store up migrations with .up)
    local version_str=$(psql "$DB_CONNECTION_STRING" -t -A -c "
        SELECT version
        FROM public.migrations
        WHERE (name = '$target.up' OR name = '$target') AND is_dirty = false
        ORDER BY version DESC
        LIMIT 1;
    " | tr -d ' ')
    
    if [ -z "$version_str" ]; then
        echo ""
        return
    fi
    
    # Parse as integer
    if [[ "$version_str" =~ ^-?[0-9]+$ ]]; then
        echo $((10#$version_str))
    else
        echo ""
    fi
}

# Function to get migrations to rollback
get_migrations_to_rollback() {
    local target_version=$1
    
    psql "$DB_CONNECTION_STRING" -t -A -c "
        SELECT version || '|' || REPLACE(name, '.up', '')
        FROM public.migrations
        WHERE version > $target_version AND is_dirty = false
        ORDER BY version DESC;
    "
}

# Function to rollback a single migration
rollback_migration() {
    local version=$1
    local name=$2  # This is the base name (without .up)
    
    echo "🔄 Rolling back migration: $name (version: $version)"
    
    # Find the down migration file
    local down_file="${MIGRATIONS_DIR}/${version}_${name}.down.sql"
    
    if [ ! -f "$down_file" ]; then
        echo "   ❌ Down migration file not found: $(basename "$down_file")"
        echo "   ⚠️  Cannot rollback this migration"
        return 1
    fi
    
    echo "   File: $(basename "$down_file")"
    
    # Calculate hash
    local hash=$(calculate_hash "$down_file")
    echo "   Hash: ${hash:0:8}..."
    
    # Update migration record with is_dirty=true
    # Note: name in DB has .up suffix, so we need to add it
    local db_name="${name}.up"
    psql "$DB_CONNECTION_STRING" -c "
        UPDATE public.migrations
        SET is_dirty = true, hash = '$hash'
        WHERE version = $version AND name = '$db_name';
    " > /dev/null 2>&1
    
    # Run the down migration
    if psql "$DB_CONNECTION_STRING" -f "$down_file"; then
        echo "   ✅ Down migration SQL executed successfully"
        
        # Delete the migration record (since it's rolled back)
        psql "$DB_CONNECTION_STRING" -c "
            DELETE FROM public.migrations
            WHERE version = $version AND name = '$db_name';
        " > /dev/null 2>&1
        
        echo "   ✅ Migration record removed from database"
    else
        echo "   ❌ Failed to rollback migration"
        echo "   ⚠️  Migration is marked as dirty in database"
        return 1
    fi
    
    echo ""
    return 0
}

# Function to run up migrations
run_up() {
    local target_version=$1  # Optional, can be empty
    
    echo "🚀 Starting Chessball database migrations (UP)..."
    echo "Database URL: ${DB_CONNECTION_STRING}"
    echo "Migrations directory: ${MIGRATIONS_DIR}"
    echo ""
    
    check_psql
    test_connection
    ensure_migrations_table
    
    # Get latest applied version
    latest_version=$(get_latest_version)
    echo "📊 Latest applied migration version: $latest_version"
    
    if [ -n "$target_version" ]; then
        # Parse target version as integer
        if [[ "$target_version" =~ ^[0-9]+$ ]]; then
            target_version=$((10#$target_version))
            echo "📊 Target version: $target_version"
            
            if [ "$target_version" -le "$latest_version" ]; then
                echo "✅ Database is already at or beyond target version $target_version"
                echo "   No migrations to apply"
                exit 0
            fi
        else
            echo "❌ Error: Target version must be a number"
            exit 1
        fi
    fi
    echo ""
    
    # Find all up migration files and sort them
    echo "🔍 Finding migration files..."
    migration_files=()
    while IFS= read -r -d '' file; do
        migration_files+=("$file")
    done < <(find "$MIGRATIONS_DIR" -maxdepth 1 -name "*.up.sql" -type f -print0 | sort -z)
    
    if [ ${#migration_files[@]} -eq 0 ]; then
        echo "⚠️  No migration files found"
        exit 0
    fi
    
    echo "Found ${#migration_files[@]} migration file(s)"
    echo ""
    
    # Process each migration
    applied_count=0
    for migration_file in "${migration_files[@]}"; do
        # Extract version and name
        info=$(extract_up_migration_info "$migration_file")
        version=$(echo "$info" | cut -d'|' -f1)
        name=$(echo "$info" | cut -d'|' -f2)
        
        # Skip if version is empty (invalid format)
        if [ -z "$version" ] || ! [[ "$version" =~ ^[0-9]+$ ]]; then
            echo "⚠️  Skipping invalid migration file: $(basename "$migration_file")"
            continue
        fi
        
        # Skip if version is less than or equal to latest
        if [ "$version" -le "$latest_version" ]; then
            echo "⏭️  Skipping already applied migration: $name (version: $version)"
            continue
        fi
        
        # If target version is specified, skip if version is greater than target
        if [ -n "$target_version" ] && [ "$version" -gt "$target_version" ]; then
            echo "⏭️  Skipping migration beyond target: $name (version: $version)"
            continue
        fi
        
        # Calculate hash
        hash=$(calculate_hash "$migration_file")
        
        # Check if already applied (with same hash)
        if is_migration_applied "$version" "$name" "$hash"; then
            echo "⏭️  Migration already applied: $name (version: $version)"
            continue
        fi
        
        # Apply the migration
        apply_migration "$migration_file" "$version" "$name" "$hash"
        applied_count=$((applied_count + 1))
    done
    
    if [ $applied_count -eq 0 ]; then
        echo "✅ No new migrations to apply. Database is up to date."
    else
        echo "🎉 Successfully applied $applied_count migration(s)!"
    fi
    
    echo ""
}

# Function to run down migrations
run_down() {
    local target=$1  # Required
    
    if [ -z "$target" ]; then
        echo "❌ Error: Target migration name or version is required for down migrations"
        echo ""
        show_usage
    fi
    
    echo "🔄 Starting Chessball database migrations (DOWN)..."
    echo "Database URL: ${DB_CONNECTION_STRING}"
    echo "Migrations directory: ${MIGRATIONS_DIR}"
    echo ""
    
    check_psql
    test_connection
    
    # Find target version
    echo "🎯 Finding target migration..."
    target_version=$(find_target_version "$target")
    
    if [ -z "$target_version" ]; then
        echo "❌ Error: Could not find migration matching: $target"
        echo ""
        echo "Available migrations:"
        psql "$DB_CONNECTION_STRING" -c "
            SELECT version, name, is_dirty
            FROM public.migrations
            WHERE is_dirty = false
            ORDER BY version;
        "
        exit 1
    fi
    
    echo "✅ Target migration version: $target_version"
    echo ""
    
    # Get current latest version
    current_latest=$(get_latest_version)
    
    if [ "$current_latest" -le "$target_version" ]; then
        echo "✅ Database is already at or before target version $target_version"
        echo "   No migrations to rollback"
        exit 0
    fi
    
    echo "📊 Current latest version: $current_latest"
    echo "📊 Target version: $target_version"
    echo ""
    
    # Get migrations to rollback
    echo "🔍 Finding migrations to rollback..."
    migrations_to_rollback=$(get_migrations_to_rollback "$target_version")
    
    if [ -z "$migrations_to_rollback" ]; then
        echo "✅ No migrations to rollback"
        exit 0
    fi
    
    # Count migrations to rollback
    rollback_count=$(echo "$migrations_to_rollback" | grep -c . || echo "0")
    echo "Found $rollback_count migration(s) to rollback"
    echo ""
    
    # Confirm with user
    echo "⚠️  WARNING: This will rollback the following migrations:"
    echo "$migrations_to_rollback" | while IFS='|' read -r version name; do
        echo "   - $name (version: $version)"
    done
    echo ""
    read -p "Are you sure you want to continue? (yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        echo "❌ Rollback cancelled"
        exit 0
    fi
    
    echo ""
    
    # Rollback each migration
    rolled_back_count=0
    
    while IFS='|' read -r version name; do
        if [ -z "$version" ] || [ -z "$name" ]; then
            continue
        fi
        
        # Parse version as integer
        if [[ "$version" =~ ^[0-9]+$ ]]; then
            version=$((10#$version))
        else
            echo "⚠️  Skipping invalid version: $version"
            continue
        fi
        
        if rollback_migration "$version" "$name"; then
            rolled_back_count=$((rolled_back_count + 1))
        else
            echo "❌ Failed to rollback migration: $name (version: $version)"
            echo "   Stopping rollback process"
            exit 1
        fi
    done <<< "$migrations_to_rollback"
    
    echo "🎉 Successfully rolled back $rolled_back_count migration(s)!"
    echo ""
}

# Main execution
if [ $# -eq 0 ]; then
    show_usage
fi

COMMAND=$1
shift

case "$COMMAND" in
    up)
        run_up "$@"
        ;;
    down)
        run_down "$@"
        ;;
    *)
        echo "❌ Error: Unknown command: $COMMAND"
        echo ""
        show_usage
        ;;
esac
