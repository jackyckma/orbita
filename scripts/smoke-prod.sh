#!/usr/bin/env bash
# Production smoke test for Orbita API (requires ORBITA_ADMIN_TOKEN in env or Zeabur CLI access).
set -euo pipefail

BASE="${ORBITA_API_URL:-https://orbita-api.zeabur.app}"

echo "==> health"
curl -sk "$BASE/v1/health"
echo

if [[ -z "${ORBITA_ADMIN_TOKEN:-}" ]]; then
  echo "ORBITA_ADMIN_TOKEN not set — skipping authenticated flow"
  exit 0
fi

echo "==> create api key"
KEY_JSON=$(curl -sk -X POST "$BASE/v1/admin/api-keys" \
  -H "x-orbita-admin-token: $ORBITA_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"allowed_client_ids":["smoke-script"]}')
API_KEY=$(python3 -c "import json,sys; print(json.load(sys.stdin)['key'])" <<<"$KEY_JSON")

AUTH=(-H "Authorization: Bearer $API_KEY" -H "x-orbita-client-id: smoke-script")

SESSION=$(curl -sk -X POST "$BASE/v1/sessions" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d '{"agent_profile":"default"}')
SID=$(python3 -c "import json,sys; print(json.load(sys.stdin)['session']['id'])" <<<"$SESSION")

echo "==> message (echo tool)"
curl -sk -X POST "$BASE/v1/sessions/$SID/messages" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d '{"input":{"type":"text","text":"Use echo with text SMOKE_OK and reply with only the echoed value."}}'
echo

echo "==> memory upsert"
curl -sk -X PUT "$BASE/v1/memories/smoke-key" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d '{"content":"smoke test memory"}' -w "\nHTTP %{http_code}\n"

echo "==> done"
