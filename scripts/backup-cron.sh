#!/bin/bash

# AD Reporting Application - Automated Backup Script for Cron
# This script is designed to be run from cron for automated backups

# Load environment from .env file if it exists
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

if [ -f "$ENV_FILE" ]; then
    export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/app/backups}"
BACKUP_LOG="${BACKUP_DIR}/backup-cron.log"
MAX_LOG_SIZE=10485760  # 10MB in bytes

# Function to rotate log if it's too large
rotate_log() {
    if [ -f "$BACKUP_LOG" ]; then
        LOG_SIZE=$(stat -f%z "$BACKUP_LOG" 2>/dev/null || stat -c%s "$BACKUP_LOG" 2>/dev/null)
        if [ "$LOG_SIZE" -gt "$MAX_LOG_SIZE" ]; then
            mv "$BACKUP_LOG" "${BACKUP_LOG}.old"
            echo "[$(date +'%Y-%m-%d %H:%M:%S')] Log rotated" > "$BACKUP_LOG"
        fi
    fi
}

# Function to send notification (customize based on your notification method)
send_notification() {
    local status=$1
    local message=$2
    
    # Example: Send to a webhook (uncomment and modify as needed)
    # if [ -n "$WEBHOOK_URL" ]; then
    #     curl -X POST "$WEBHOOK_URL" \
    #         -H "Content-Type: application/json" \
    #         -d "{\"status\": \"$status\", \"message\": \"$message\", \"timestamp\": \"$(date -Iseconds)\"}"
    # fi
    
    # Example: Send email (requires mail/sendmail configured)
    # if [ -n "$ADMIN_EMAIL" ]; then
    #     echo "$message" | mail -s "AD Reporting Backup $status" "$ADMIN_EMAIL"
    # fi
    
    # For now, just log
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] Notification: $status - $message" >> "$BACKUP_LOG"
}

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Rotate log if needed
rotate_log

# Log start
echo "[$(date +'%Y-%m-%d %H:%M:%S')] === Starting automated backup ===" >> "$BACKUP_LOG"

# Run the backup script
if "$SCRIPT_DIR/backup.sh" >> "$BACKUP_LOG" 2>&1; then
    # Get backup statistics
    BACKUP_COUNT=$(find "$BACKUP_DIR" -name "reporting_backup_*.sql.gz" -type f | wc -l)
    LATEST_SIZE=$(ls -lh "$BACKUP_DIR/latest_backup.sql.gz" 2>/dev/null | awk '{print $5}')
    DISK_USAGE=$(df -h "$BACKUP_DIR" | tail -1 | awk '{print $5}')
    
    MESSAGE="Backup completed successfully. Size: $LATEST_SIZE, Total backups: $BACKUP_COUNT, Disk usage: $DISK_USAGE"
    
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $MESSAGE" >> "$BACKUP_LOG"
    send_notification "SUCCESS" "$MESSAGE"
    
    # Check disk space and warn if getting full
    DISK_PCT=$(df "$BACKUP_DIR" | tail -1 | awk '{print $5}' | sed 's/%//')
    if [ "$DISK_PCT" -gt 80 ]; then
        send_notification "WARNING" "Backup disk usage is at ${DISK_PCT}%. Consider increasing retention cleanup."
    fi
else
    MESSAGE="Backup failed! Check logs at $BACKUP_LOG"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $MESSAGE" >> "$BACKUP_LOG"
    send_notification "FAILURE" "$MESSAGE"
    exit 1
fi

echo "[$(date +'%Y-%m-%d %H:%M:%S')] === Automated backup completed ===" >> "$BACKUP_LOG"
echo "" >> "$BACKUP_LOG"