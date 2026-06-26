#!/usr/bin/env bash
# Phase 1 waitlist E2E: signup → admin approve → API key → create session.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API="${ORBITA_API_URL:-https://api.get-orbita.com}"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

if [[ -z "${ORBITA_ADMIN_TOKEN:-}" ]]; then
  echo "ORBITA_ADMIN_TOKEN required in .env"
  exit 1
fi

TS=$(date +%s)
EMAIL="orbita-e2e-${TS}@example.com"
CLIENT_ID="waitlist-e2e-${TS}"

admin=(-H "x-orbita-admin-token: $ORBITA_ADMIN_TOKEN" -H "Content-Type: application/json")

echo "==> POST /v1/waitlist ($EMAIL)"
ENTRY=$(curl -4 -sf -X POST "$API/v1/waitlist" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"message\":\"e2e script\"}")
ENTRY_ID=$(echo "$ENTRY" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
echo "    entry_id=$ENTRY_ID"

echo "==> PATCH /v1/admin/waitlist/$ENTRY_ID (approve, no invite email)"
APPROVE=$(curl -4 -sf -X PATCH "$API/v1/admin/waitlist/$ENTRY_ID" "${admin[@]}" \
  -d "{\"status\":\"approved\",\"send_invite\":false,\"client_id\":\"$CLIENT_ID\"}")
API_KEY=$(echo "$APPROVE" | python3 -c "import json,sys; print(json.load(sys.stdin)['api_key'])")
echo "    api_key prefix: ${API_KEY:0:16}…"

echo "==> POST /v1/sessions"
SESSION=$(curl -4 -sf -X POST "$API/v1/sessions" \
  -H "Authorization: Bearer $API_KEY" \
  -H "x-orbita-client-id: $CLIENT_ID" \
  -H "Content-Type: application/json" \
  -d '{"agent_profile":"default"}')
SESSION_ID=$(echo "$SESSION" | python3 -c "import json,sys; print(json.load(sys.stdin)['session']['id'])")
echo "    session_id=$SESSION_ID"

echo "==> waitlist e2e ok"
