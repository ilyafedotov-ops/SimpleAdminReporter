#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

mkdir -p "$WORK_DIR/bin" "$WORK_DIR/backups"
printf 'backup' > "$WORK_DIR/backups/latest_backup.sql.gz"

cat > "$WORK_DIR/bin/gzip" <<'STUB'
#!/usr/bin/env bash
exit 0
STUB

cat > "$WORK_DIR/bin/gunzip" <<'STUB'
#!/usr/bin/env bash
printf 'select 1;'
STUB

cat > "$WORK_DIR/bin/createdb" <<'STUB'
#!/usr/bin/env bash
printf '%s' "$1" > "$VERIFY_TEST_DIR/createdb"
STUB

cat > "$WORK_DIR/bin/psql" <<'STUB'
#!/usr/bin/env bash
exit 1
STUB

cat > "$WORK_DIR/bin/dropdb" <<'STUB'
#!/usr/bin/env bash
printf '%s' "$1" > "$VERIFY_TEST_DIR/dropdb"
STUB

chmod +x "$WORK_DIR/bin/"*

set +e
PATH="$WORK_DIR/bin:$PATH" \
BACKUP_DIR="$WORK_DIR/backups" \
VERIFY_DB_NAME="verify_cleanup_test" \
VERIFY_TEST_DIR="$WORK_DIR" \
bash "$ROOT_DIR/scripts/verify-backups.sh" >/dev/null 2>&1
status=$?
set -e

if [[ "$status" -eq 0 ]]; then
  echo "Expected backup verification to fail"
  exit 1
fi

if [[ ! -f "$WORK_DIR/dropdb" ]]; then
  echo "Expected temporary database to be dropped on failure"
  exit 1
fi

if [[ "$(cat "$WORK_DIR/dropdb")" != "verify_cleanup_test" ]]; then
  echo "Expected dropdb to receive VERIFY_DB_NAME"
  exit 1
fi
