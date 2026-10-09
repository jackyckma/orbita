#!/usr/bin/env bash
# Tier-A synthetic executor day: REST ticket verbs against local API (no LLM, no prod).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export DATABASE_URL="${DATABASE_URL:-postgresql://orbita:orbita@localhost:5432/orbita}"
export ORBITA_ADMIN_TOKEN="${ORBITA_ADMIN_TOKEN:-e2e-admin-token}"
export ORBITA_SECRETS_KEY="${ORBITA_SECRETS_KEY:-e2e0123456789012345678901234567}"
export ORBITA_E2E_MOCK=1
export ORBITA_TICKETS_ENABLED=1
export HOST=127.0.0.1
export PORT="${PORT:-3100}"
export E2E_API_URL="http://${HOST}:${PORT}"
export TICKETS_BOT_LOOP_CLIENT="${TICKETS_BOT_LOOP_CLIENT:-tickets-bot-loop}"

API_PID=""
STATE_DIR="$(mktemp -d)"
trap 'rm -rf "$STATE_DIR"; if [[ -n "$API_PID" ]] && kill -0 "$API_PID" 2>/dev/null; then kill "$API_PID" 2>/dev/null || true; wait "$API_PID" 2>/dev/null || true; fi' EXIT

free_port() {
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
    sleep 1
  fi
}

wait_api() {
  local ready=0
  for _ in $(seq 1 60); do
    if curl -sf "$E2E_API_URL/v1/health" >/dev/null; then
      ready=1
      break
    fi
    sleep 1
  done
  if [[ "$ready" != "1" ]]; then
    echo "API failed to become ready on $E2E_API_URL" >&2
    exit 1
  fi
}

start_api() {
  if [[ -n "$API_PID" ]] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
    API_PID=""
  fi
  free_port
  node apps/orbita-api/dist/index.js &
  API_PID=$!
  wait_api
}

create_key() {
  local client="$1"
  curl -sf -X POST "$E2E_API_URL/v1/admin/api-keys" \
    -H "Content-Type: application/json" \
    -H "x-orbita-admin-token: $ORBITA_ADMIN_TOKEN" \
    -d "{\"allowed_client_ids\":[\"$client\"]}"
}

curl_auth() {
  local key="$1"
  shift
  curl "$@" \
    -H "Authorization: Bearer ${key}" \
    -H "x-orbita-client-id: ${TICKETS_BOT_LOOP_CLIENT}"
}

charter_json() {
  cat <<'JSON'
{
  "purpose": "bot-loop smoke",
  "principles": ["stay within guardrails"],
  "guardrails": {
    "allowed_action_categories": ["dev", "L0"],
    "forbidden_action_categories": [],
    "max_auto_risk_tier": "L1"
  },
  "approval_policy": { "epics": "integrator", "tasks": "auto" },
  "cadence": { "description": "on demand" },
  "reporting": { "expectations": "none" },
  "success_measures": ["smoke green"],
  "review_date": "2026-12-31",
  "assigned_principals": ["founder"],
  "hard_limits": [],
  "soft_constraints": []
}
JSON
}

echo "==> postgres (docker compose)"
docker compose up -d postgres
for _ in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U orbita -d orbita >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "==> build"
pnpm build

echo "==> phase 1: mint API keys (tickets on, roles unset)"
unset ORBITA_TICKETS_FOUNDER_KEY_IDS ORBITA_TICKETS_INTEGRATOR_KEY_IDS ORBITA_TICKETS_KEY_MANDATES
start_api

FOUNDER_JSON="$(create_key "$TICKETS_BOT_LOOP_CLIENT")"
INTEGRATOR_JSON="$(create_key "$TICKETS_BOT_LOOP_CLIENT")"
EXECUTOR_JSON="$(create_key "$TICKETS_BOT_LOOP_CLIENT")"
FOUNDER_ID="$(echo "$FOUNDER_JSON" | jq -r .id)"
INTEGRATOR_ID="$(echo "$INTEGRATOR_JSON" | jq -r .id)"
EXECUTOR_ID="$(echo "$EXECUTOR_JSON" | jq -r .id)"
FOUNDER_KEY="$(echo "$FOUNDER_JSON" | jq -r .key)"
INTEGRATOR_KEY="$(echo "$INTEGRATOR_JSON" | jq -r .key)"
EXECUTOR_KEY="$(echo "$EXECUTOR_JSON" | jq -r .key)"

echo "==> phase 2: integrator creates draft mandate"
export ORBITA_TICKETS_FOUNDER_KEY_IDS="$FOUNDER_ID"
export ORBITA_TICKETS_INTEGRATOR_KEY_IDS="$INTEGRATOR_ID"
unset ORBITA_TICKETS_KEY_MANDATES
start_api

MANDATE_BODY="$(curl_auth "$INTEGRATOR_KEY" -sf -X POST "$E2E_API_URL/v1/tickets" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --argjson charter "$(charter_json)" \
    '{ticket:{project:"bot-loop",function:"dev",kind:"mandate",title:"Bot loop mandate",charter:$charter}}')")"
MANDATE_ID="$(echo "$MANDATE_BODY" | jq -r .ticket.id)"
echo "mandate_id=$MANDATE_ID" >"$STATE_DIR/state"

echo "==> denial: integrator cannot activate mandate (ROLE_REQUIRED)"
DENY_CODE="$(curl_auth "$INTEGRATOR_KEY" -s -o "$STATE_DIR/deny.json" -w "%{http_code}" -X POST \
  "$E2E_API_URL/v1/tickets/ticket_approve" \
  -H "Content-Type: application/json" \
  -d "{\"ticket_id\":\"$MANDATE_ID\"}")"
if [[ "$DENY_CODE" != "409" ]]; then
  echo "expected 409 for integrator mandate activate, got $DENY_CODE: $(cat "$STATE_DIR/deny.json")" >&2
  exit 1
fi
TICKET_ERR="$(jq -r '.error.details.ticket_error // empty' "$STATE_DIR/deny.json")"
if [[ "$TICKET_ERR" != "ROLE_REQUIRED" ]]; then
  echo "expected ROLE_REQUIRED, got $TICKET_ERR" >&2
  exit 1
fi

echo "==> denial: executor ticket_approve on mandate is forbidden (not allowlisted)"
EXEC_DENY="$(curl_auth "$EXECUTOR_KEY" -s -o "$STATE_DIR/exec-deny.json" -w "%{http_code}" -X POST \
  "$E2E_API_URL/v1/tickets/ticket_approve" \
  -H "Content-Type: application/json" \
  -d "{\"ticket_id\":\"$MANDATE_ID\"}")"
if [[ "$EXEC_DENY" != "403" ]]; then
  echo "expected 403 for executor mandate approve, got $EXEC_DENY: $(cat "$STATE_DIR/exec-deny.json")" >&2
  exit 1
fi
EXEC_CODE="$(jq -r '.error.code // empty' "$STATE_DIR/exec-deny.json")"
if [[ "$EXEC_CODE" != "forbidden" ]]; then
  echo "expected error.code forbidden, got $EXEC_CODE" >&2
  exit 1
fi

echo "==> founder activates mandate"
curl_auth "$FOUNDER_KEY" -sf -X POST "$E2E_API_URL/v1/tickets/ticket_approve" \
  -H "Content-Type: application/json" \
  -d "{\"ticket_id\":\"$MANDATE_ID\"}" >/dev/null

echo "==> phase 3: bind executor mandate + vitest REST loop"
export ORBITA_TICKETS_KEY_MANDATES="{\"$EXECUTOR_ID\":[\"$MANDATE_ID\"]}"
start_api

export E2E_TICKETS_BOT_LOOP=1
export TICKETS_BOT_LOOP_FOUNDER_KEY="$FOUNDER_KEY"
export TICKETS_BOT_LOOP_INTEGRATOR_KEY="$INTEGRATOR_KEY"
export TICKETS_BOT_LOOP_EXECUTOR_KEY="$EXECUTOR_KEY"
export TICKETS_BOT_LOOP_MANDATE_ID="$MANDATE_ID"

pnpm exec vitest run --config tests/e2e/vitest.config.ts tests/e2e/tickets-bot-loop.test.ts

echo "==> tickets-bot-loop-smoke OK"
