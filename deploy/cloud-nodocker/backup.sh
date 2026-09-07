#!/usr/bin/env bash
# Backup the gateway SQLite database (online snapshot, safe while the service
# is running) plus the pre-deletion metadata snapshots. Optionally also tars
# the MCSManager panel data directory.
#
# Usage (as a user with read access to the data dirs):
#   sudo ./backup.sh
# Env overrides:
#   REPO=/opt/mcsm-shop
#   BACKUP_ROOT=/var/backups/mcsm-shop
#   KEEP=14                    number of newest archives to keep
#   PANEL_DATA_DIR=/opt/MCSManager/panel/data   (set to also back up panel data)
#
# Suggested cron (daily 03:17):
#   17 3 * * * /opt/mcsm-shop/deploy/cloud-nodocker/backup.sh >> /var/log/mcsm-backup.log 2>&1
set -euo pipefail

REPO="${REPO:-/opt/mcsm-shop}"
GW="$REPO/gateway"
DB="$GW/data/gateway.db"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/mcsm-shop}"
KEEP="${KEEP:-14}"
PANEL_DATA_DIR="${PANEL_DATA_DIR:-}"
STAMP="$(date +%Y%m%d-%H%M%S)"
WORK="$(mktemp -d)"

trap 'rm -rf "$WORK"' EXIT

if [ ! -f "$DB" ]; then
  echo "ERROR: gateway DB not found at $DB" >&2
  exit 1
fi
command -v node >/dev/null 2>&1 || { echo "ERROR: node is required" >&2; exit 1; }
command -v tar >/dev/null 2>&1 || { echo "ERROR: tar is required" >&2; exit 1; }

mkdir -p "$BACKUP_ROOT"

echo "== [1/3] SQLite online snapshot (VACUUM INTO) =="
# Consistent snapshot even with WAL active; never copy the live db file directly.
(cd "$GW" && node scripts/backup-db.mjs "$WORK/gateway.db")

echo "== [2/3] Collect metadata snapshots =="
if [ -d "$GW/data/backups" ]; then
  cp -a "$GW/data/backups" "$WORK/instance-snapshots"
fi

if [ -n "$PANEL_DATA_DIR" ] && [ -d "$PANEL_DATA_DIR" ]; then
  echo "== [2b/3] Panel data dir =="
  tar -C "$(dirname "$PANEL_DATA_DIR")" \
      --exclude='*/tmp' --exclude='*/log/*.log' \
      -czf "$WORK/panel-data.tar.gz" "$(basename "$PANEL_DATA_DIR")"
fi

echo "== [3/3] Write archive =="
ARCHIVE="$BACKUP_ROOT/mcsm-shop-$STAMP.tar.gz"
tar -C "$WORK" -czf "$ARCHIVE" .
echo "Wrote $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"

# Retention: keep the newest $KEEP archives.
ls -1t "$BACKUP_ROOT"/mcsm-shop-*.tar.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  echo "Prune old backup: $old"
  rm -f "$old"
done

echo "Backup done: $ARCHIVE"
