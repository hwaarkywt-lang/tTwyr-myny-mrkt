#!/bin/bash
# Restore a PostgreSQL backup file (gzipped pg_dump) into market_db.
# Usage: restore_db.sh /path/to/market_db_YYYYMMDD_HHMMSS.sql.gz
# WARNING: drops/recreates schema objects per the dump's --clean directives.

set -e

BACKUP_FILE="${1:-}"
DB_NAME="market_db"
DB_USER="market_admin"
DB_HOST="localhost"

if [ -z "$BACKUP_FILE" ]; then
  echo "ERROR: backup file path required" >&2
  exit 2
fi
if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: file not found: $BACKUP_FILE" >&2
  exit 2
fi

export PGPASSWORD="MarketSecure2026"

echo "[$(date)] Restoring $BACKUP_FILE → $DB_NAME"

# Pipe the decompressed dump straight into psql. The pg_dump in backup_db.sh
# was created with --clean --if-exists so DROP statements are included and
# the restore is idempotent.
gunzip -c "$BACKUP_FILE" | psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
  -v ON_ERROR_STOP=1 --quiet

echo "[$(date)] ✅ Restore complete"
