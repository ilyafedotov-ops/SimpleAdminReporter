#!/bin/bash

# AD Reporting Application - Database Restore Script
# This script restores a PostgreSQL database from a backup

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/app/backups}"
DB_HOST="${DB_HOST:-postgres}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-reporting}"
DB_USER="${DB_USER:-postgres}"
LOG_FILE="${BACKUP_DIR}/restore.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to log messages
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Show usage
usage() {
    echo "Usage: $0 [backup_file]"
    echo ""
    echo "If no backup file is specified, the latest backup will be used."
    echo ""
    echo "Examples:"
    echo "  $0                                    # Restore from latest backup"
    echo "  $0 reporting_backup_20240120_1230.sql.gz  # Restore specific backup"
    echo ""
    exit 1
}

# Check if help is requested
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    usage
fi

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

log "Starting database restore..."

# Check if required tools are available
if ! command_exists psql; then
    log "ERROR: psql not found. Please install PostgreSQL client tools."
    exit 1
fi

if ! command_exists gunzip; then
    log "ERROR: gunzip not found. Please install gzip."
    exit 1
fi

# Set PostgreSQL password (if provided via environment)
if [ -n "$PGPASSWORD" ]; then
    export PGPASSWORD
elif [ -n "$DB_PASSWORD" ]; then
    export PGPASSWORD="$DB_PASSWORD"
fi

# Determine which backup to restore
if [ -n "$1" ]; then
    BACKUP_FILE="$1"
    if [[ ! "$BACKUP_FILE" =~ ^/ ]]; then
        BACKUP_FILE="$BACKUP_DIR/$BACKUP_FILE"
    fi
else
    # Use latest backup
    BACKUP_FILE="$BACKUP_DIR/latest_backup.sql.gz"
fi

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    log "ERROR: Backup file not found: $BACKUP_FILE"
    echo -e "${RED}Backup file not found!${NC}"
    
    # List available backups
    echo ""
    echo "Available backups:"
    ls -lh "$BACKUP_DIR"/reporting_backup_*.sql.gz 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'
    echo ""
    exit 1
fi

log "Restoring from backup: $BACKUP_FILE"

# Verify backup file integrity
if ! gzip -t "$BACKUP_FILE" 2>/dev/null; then
    log "ERROR: Backup file appears to be corrupted!"
    echo -e "${RED}Backup file is corrupted!${NC}"
    exit 1
fi

# Confirm restore
echo -e "${YELLOW}WARNING: This will restore the database from backup.${NC}"
echo -e "${YELLOW}Current database data will be replaced!${NC}"
echo ""
echo "Database: $DB_NAME on $DB_HOST:$DB_PORT"
echo "Backup file: $(basename "$BACKUP_FILE")"
echo ""
read -p "Are you sure you want to continue? (yes/no) " -n 3 -r
echo
if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    log "Restore cancelled by user."
    echo "Restore cancelled."
    exit 0
fi

# Create a current backup before restore (safety measure)
log "Creating safety backup before restore..."
SAFETY_BACKUP="$BACKUP_DIR/pre_restore_backup_$(date +%Y%m%d_%H%M%S).sql.gz"
if pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --no-owner --no-acl | gzip > "$SAFETY_BACKUP"; then
    log "Safety backup created: $SAFETY_BACKUP"
else
    log "WARNING: Could not create safety backup. Continuing anyway..."
fi

# Perform the restore
log "Restoring database..."

# First, drop existing connections to the database
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres <<EOF
SELECT pg_terminate_backend(pg_stat_activity.pid)
FROM pg_stat_activity
WHERE pg_stat_activity.datname = '$DB_NAME'
  AND pid <> pg_backend_pid();
EOF

# Restore the backup
if gunzip -c "$BACKUP_FILE" | psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1; then
    log "SUCCESS: Database restored successfully!"
    
    # Update sequences
    log "Updating sequences..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<EOF
-- Update all sequences to max values
DO \$\$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT 
            schemaname,
            tablename,
            pg_get_serial_sequence(schemaname||'.'||tablename, 'id') AS sequence_name
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND pg_get_serial_sequence(schemaname||'.'||tablename, 'id') IS NOT NULL
    ) LOOP
        IF r.sequence_name IS NOT NULL THEN
            EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(id) FROM %I.%I), 1), true)',
                r.sequence_name, r.schemaname, r.tablename);
        END IF;
    END LOOP;
END\$\$;
EOF
    
    # Run any post-restore migrations
    if [ -f "$BACKUP_DIR/../database/post_restore.sql" ]; then
        log "Running post-restore migrations..."
        psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
            -f "$BACKUP_DIR/../database/post_restore.sql"
    fi
    
    # Verify restore
    log "Verifying restore..."
    TABLE_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';")
    
    log "Database has $TABLE_COUNT tables."
    
    echo -e "${GREEN}Database restored successfully!${NC}"
    echo ""
    echo "Post-restore checklist:"
    echo "  1. Verify application connectivity"
    echo "  2. Check data integrity"
    echo "  3. Update any environment-specific configurations"
    echo "  4. Clear application caches if needed"
    echo ""
    
    exit 0
else
    log "ERROR: Restore failed!"
    echo -e "${RED}Restore failed! Check the log at $LOG_FILE${NC}"
    
    # Offer to restore the safety backup
    if [ -f "$SAFETY_BACKUP" ]; then
        echo ""
        echo -e "${YELLOW}A safety backup was created before the restore attempt.${NC}"
        echo "To restore it, run:"
        echo "  $0 $SAFETY_BACKUP"
    fi
    
    exit 1
fi