#!/bin/bash
# Daily PostgreSQL backup script for Mini Market Management System
# Saves a compressed dump to /app/backups/ with 14-day rotation.

set -e

BACKUP_DIR="/app/backups"
DB_NAME="market_db"
DB_USER="market_admin"
DB_HOST="localhost"
RETENTION_DAYS=14

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/market_db_${TIMESTAMP}.sql.gz"

export PGPASSWORD="MarketSecure2026"

echo "[$(date)] Starting backup → $BACKUP_FILE"
pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" --no-owner --clean --if-exists \
  | gzip > "$BACKUP_FILE"

# Size verification
SIZE=$(stat -c %s "$BACKUP_FILE" 2>/dev/null || echo 0)
if [ "$SIZE" -lt 1024 ]; then
  echo "[$(date)] ERROR: backup file too small ($SIZE bytes) — possible failure"
  rm -f "$BACKUP_FILE"
  exit 1
fi

# Cleanup: keep last 14 backups
find "$BACKUP_DIR" -name "market_db_*.sql.gz" -mtime +${RETENTION_DAYS} -delete

echo "[$(date)] ✅ Backup complete: $(du -h "$BACKUP_FILE" | cut -f1)"
echo "[$(date)] Total backups: $(ls -1 "$BACKUP_DIR"/market_db_*.sql.gz 2>/dev/null | wc -l)"
