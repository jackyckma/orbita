#!/usr/bin/env bash
# Tier A E2E: Docker Postgres + API with ORBITA_E2E_MOCK=1 (no live LLM).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export DATABASE_URL="${DATABASE_URL:-postgresql://orbita:orbita@localhost:5432/orbita}"
export ORBITA_ADMIN_TOKEN="${ORBITA_ADMIN_TOKEN:-e2e-admin-token}"
export ORBITA_SECRETS_KEY="${ORBITA_SECRETS_KEY:-e2e0123456789012345678901234567}"
export ORBITA_E2E_MOCK=1
export HOST=127.0.0.1
export PORT="${PORT:-3099}"
export E2E_API_URL="http://${HOST}:${PORT}"

API_PID=""

free_port() {
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
    sleep 1
  fi
}

cleanup() {
  if [[ -n "$API_PID" ]] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "==> starting postgres (docker compose)"
docker compose up -d postgres

echo "==> waiting for postgres"
for _ in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U orbita -d orbita >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "==> building packages"
pnpm build

echo "==> starting API (mock LLM) on :$PORT"
free_port
node apps/orbita-api/dist/index.js &
API_PID=$!

ready=0
for _ in $(seq 1 60); do
  if curl -sf "$E2E_API_URL/v1/health" >/dev/null; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" != "1" ]]; then
  echo "API failed to become ready on $E2E_API_URL"
  exit 1
fi

echo "==> running tier A HTTP tests"
pnpm exec vitest run --config tests/e2e/vitest.config.ts tests/e2e/tier-a-api.test.ts

echo "==> tier A E2E OK"
