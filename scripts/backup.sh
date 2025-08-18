#!/bin/bash

# AD Reporting Application - Database Backup Script
# This script creates a backup of the PostgreSQL database

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/app/backups}"
DB_HOST="${DB_HOST:-postgres}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-reporting}"
DB_USER="${DB_USER:-postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="reporting_backup_${TIMESTAMP}.sql.gz"
LOG_FILE="${BACKUP_DIR}/backup.log"

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

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

log "Starting database backup..."

# Check if required tools are available
if ! command_exists pg_dump; then
    log "ERROR: pg_dump not found. Please install PostgreSQL client tools."
    exit 1
fi

if ! command_exists gzip; then
    log "ERROR: gzip not found. Please install gzip."
    exit 1
fi

# Set PostgreSQL password (if provided via environment)
if [ -n "$PGPASSWORD" ]; then
    export PGPASSWORD
elif [ -n "$DB_PASSWORD" ]; then
    export PGPASSWORD="$DB_PASSWORD"
fi

# Perform the backup
log "Backing up database $DB_NAME to $BACKUP_DIR/$BACKUP_FILE"

if pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --no-owner --no-acl --clean --if-exists \
    --exclude-table=audit_log \
    --exclude-table=report_history \
    | gzip > "$BACKUP_DIR/$BACKUP_FILE"; then
    
    # Get backup file size
    BACKUP_SIZE=$(ls -lh "$BACKUP_DIR/$BACKUP_FILE" | awk '{print $5}')
    log "SUCCESS: Backup completed successfully. Size: $BACKUP_SIZE"
    
    # Verify the backup
    if gzip -t "$BACKUP_DIR/$BACKUP_FILE" 2>/dev/null; then
        log "Backup file integrity verified."
    else
        log "ERROR: Backup file appears to be corrupted!"
        exit 1
    fi
    
    # Create a symlink to the latest backup
    ln -sf "$BACKUP_FILE" "$BACKUP_DIR/latest_backup.sql.gz"
    
    # Clean up old backups
    log "Cleaning up backups older than $RETENTION_DAYS days..."
    find "$BACKUP_DIR" -name "reporting_backup_*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete
    
    # Count remaining backups
    BACKUP_COUNT=$(find "$BACKUP_DIR" -name "reporting_backup_*.sql.gz" -type f | wc -l)
    log "Current number of backups: $BACKUP_COUNT"
    
    # Export backup metadata
    cat > "$BACKUP_DIR/latest_backup.info" <<EOF
{
  "filename": "$BACKUP_FILE",
  "timestamp": "$(date -Iseconds)",
  "database": "$DB_NAME",
  "host": "$DB_HOST",
  "size": "$BACKUP_SIZE",
  "retention_days": $RETENTION_DAYS
}
EOF
    
    echo -e "${GREEN}Backup completed successfully!${NC}"
    exit 0
else
    log "ERROR: Backup failed!"
    echo -e "${RED}Backup failed! Check the log at $LOG_FILE${NC}"
    exit 1
fi