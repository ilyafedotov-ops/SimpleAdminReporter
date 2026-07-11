#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
LATEST_LINK="$BACKUP_DIR/latest_backup.sql.gz"

if [[ ! -f "$LATEST_LINK" ]]; then
  echo "No latest backup found at $LATEST_LINK"
  exit 1
fi

echo "Verifying backup integrity: $LATEST_LINK"
gzip -t "$LATEST_LINK"

TEMP_DB="${VERIFY_DB_NAME:-reporting_verify_$(date +%s)}"
DB_CREATED=false
export PGHOST="${DB_HOST:-localhost}"
export PGPORT="${DB_PORT:-5432}"
export PGUSER="${DB_USER:-postgres}"
export PGPASSWORD="${DB_PASSWORD:-${POSTGRES_PASSWORD:-}}"

cleanup_temp_db() {
  if [[ "$DB_CREATED" == "true" ]]; then
    dropdb "$TEMP_DB" >/dev/null 2>&1 || true
  fi
}
trap cleanup_temp_db EXIT

echo "Restoring backup into temporary database: $TEMP_DB"
createdb "$TEMP_DB"
DB_CREATED=true
gunzip -c "$LATEST_LINK" | psql -v ON_ERROR_STOP=1 -d "$TEMP_DB" >/dev/null
TABLE_COUNT=$(psql -At -d "$TEMP_DB" -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
dropdb "$TEMP_DB"
DB_CREATED=false

echo "Backup verification succeeded. Public tables restored: $TABLE_COUNT"
exit 0
