#!/usr/bin/env bash
# Waitlist invite E2E: signup → approve + ZSend invite email → session with new key.
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
# Gmail +alias delivers to the same inbox; override with ORBITA_E2E_INVITE_EMAIL
BASE_EMAIL="${ORBITA_E2E_INVITE_EMAIL:-jackymama@gmail.com}"
if [[ "$BASE_EMAIL" == *"@"* ]]; then
  LOCAL="${BASE_EMAIL%@*}"
  DOMAIN="${BASE_EMAIL#*@}"
  EMAIL="${LOCAL}+orbita-e2e-${TS}@${DOMAIN}"
else
  EMAIL="orbita-invite-e2e-${TS}@example.com"
fi
CLIENT_ID="waitlist-invite-e2e-${TS}"

admin=(-H "x-orbita-admin-token: $ORBITA_ADMIN_TOKEN" -H "Content-Type: application/json")

echo "==> POST /v1/waitlist ($EMAIL)"
ENTRY=$(curl -4 -sf -X POST "$API/v1/waitlist" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"message\":\"invite e2e script\"}")
ENTRY_ID=$(echo "$ENTRY" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
echo "    entry_id=$ENTRY_ID"

echo "==> PATCH approve + send_invite"
APPROVE=$(curl -4 -sf -X PATCH "$API/v1/admin/waitlist/$ENTRY_ID" "${admin[@]}" \
  -d "{\"status\":\"approved\",\"send_invite\":true,\"client_id\":\"$CLIENT_ID\"}")
INVITE_SENT=$(echo "$APPROVE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('invite_sent', False))")
API_KEY=$(echo "$APPROVE" | python3 -c "import json,sys; print(json.load(sys.stdin)['api_key'])")
echo "    invite_sent=$INVITE_SENT"
echo "    api_key prefix: ${API_KEY:0:16}…"

if [[ "$INVITE_SENT" != "True" && "$INVITE_SENT" != "true" ]]; then
  echo "WARN: invite email not sent — check ZEABUR_ZSEND_API_KEY and ORBITA_INSTANCE_FROM_EMAIL on API service"
  exit 1
fi

echo "==> POST /v1/sessions (verify key)"
SESSION=$(curl -4 -sf -X POST "$API/v1/sessions" \
  -H "Authorization: Bearer $API_KEY" \
  -H "x-orbita-client-id: $CLIENT_ID" \
  -H "Content-Type: application/json" \
  -d '{"agent_profile":"default"}')
SESSION_ID=$(echo "$SESSION" | python3 -c "import json,sys; print(json.load(sys.stdin)['session']['id'])")
echo "    session_id=$SESSION_ID"

echo "==> invite e2e ok — check inbox for: $EMAIL"
