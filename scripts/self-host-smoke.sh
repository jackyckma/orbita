#!/usr/bin/env bash
# Smoke test for local or remote self-hosted Orbita API.
set -euo pipefail

BASE="${ORBITA_API_URL:-http://127.0.0.1:3000}"

echo "==> health"
curl -sf "$BASE/v1/health" | python3 -c "import json,sys; h=json.load(sys.stdin); assert h.get('status')=='ok', h"

echo "==> profiles"
curl -sf "$BASE/v1/profiles" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ids=[p['id'] for p in d['profiles']]
assert 'default' in ids, ids
print('profiles:', ', '.join(ids))
"

if [[ -z "${ORBITA_ADMIN_TOKEN:-}" ]]; then
  echo "ORBITA_ADMIN_TOKEN not set — skipping admin session + key flow"
  exit 0
fi

echo "==> admin session"
curl -sf -X POST "$BASE/v1/admin/session" \
  -H "Content-Type: application/json" \
  -d "{\"admin_token\":\"$ORBITA_ADMIN_TOKEN\"}" \
  -c /tmp/orbita-selfhost-cookies.txt

echo "==> create api key"
KEY_JSON=$(curl -sf -X POST "$BASE/v1/admin/api-keys" \
  -b /tmp/orbita-selfhost-cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"allowed_client_ids":["selfhost-smoke"],"scopes":["sessions:create","sessions:use"]}')
API_KEY=$(python3 -c "import json,sys; print(json.load(sys.stdin)['key'])" <<<"$KEY_JSON")

SESSION=$(curl -sf -X POST "$BASE/v1/sessions" \
  -H "Authorization: Bearer $API_KEY" \
  -H "x-orbita-client-id: selfhost-smoke" \
  -H "Content-Type: application/json" \
  -d '{"agent_profile":"default"}')
SID=$(python3 -c "import json,sys; print(json.load(sys.stdin)['session']['id'])" <<<"$SESSION")

echo "==> mock message (requires ORBITA_E2E_MOCK=1 on server for deterministic output)"
MSG_CODE=$(curl -s -o /tmp/orbita-selfhost-msg.json -w "%{http_code}" -X POST "$BASE/v1/sessions/$SID/messages" \
  -H "Authorization: Bearer $API_KEY" \
  -H "x-orbita-client-id: selfhost-smoke" \
  -H "Content-Type: application/json" \
  -d '{"input":{"type":"text","text":"ping"}}')
echo "message status: $MSG_CODE"

echo "==> done (session_id=$SID)"
