#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
URL="${DATABASE_URL:-postgresql://orbita:orbita@localhost:5432/orbita}"

run_sql() {
  local file="$1"
  echo "==> applying $(basename "$file")"
  if command -v psql >/dev/null 2>&1; then
    psql "$URL" -v ON_ERROR_STOP=1 -f "$file"
  elif docker ps --format '{{.Names}}' | grep -q 'orbita-postgres'; then
    docker exec -i "$(docker ps --format '{{.Names}}' | grep orbita-postgres | head -1)" \
      psql -U orbita -d orbita -v ON_ERROR_STOP=1 < "$file"
  else
    echo "ERROR: psql not found and orbita-postgres container not running" >&2
    exit 1
  fi
}

for f in \
  "$ROOT/packages/lane-auth/drizzle/0000_init.sql" \
  "$ROOT/packages/lane-sessions/drizzle/0001_sessions.sql" \
  "$ROOT/packages/lane-sessions/drizzle/0002_compression.sql" \
  "$ROOT/packages/lane-memory/drizzle/0001_memory.sql" \
  "$ROOT/packages/lane-memory/drizzle/0002_vectors.sql" \
  "$ROOT/packages/lane-trajectory/drizzle/0001_trajectory.sql" \
  "$ROOT/packages/lane-scheduler/drizzle/0001_scheduler.sql"; do
  run_sql "$f"
done

echo "==> migrations complete"
