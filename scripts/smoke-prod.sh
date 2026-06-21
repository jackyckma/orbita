#!/usr/bin/env bash
# Production smoke test for Orbita API (requires ORBITA_ADMIN_TOKEN in env or Zeabur CLI access).
set -euo pipefail

BASE="${ORBITA_API_URL:-https://orbita-api.zeabur.app}"

echo "==> health"
HEALTH=$(curl -sk "$BASE/v1/health")
echo "$HEALTH"
python3 -c "import json,sys; h=json.load(sys.stdin); assert h.get('status')=='ok', h" <<<"$HEALTH"

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
MSG=$(curl -sk -X POST "$BASE/v1/sessions/$SID/messages" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d '{"input":{"type":"text","text":"Use echo with text SMOKE_OK and reply with only the echoed value."}}')
echo "$MSG"
python3 -c "
import json,sys
t=json.load(sys.stdin)
assert t.get('execution_meta',{}).get('tool_calls_made',0) >= 1, 'expected tool call'
text=t.get('assistant_message',{}).get('output',{}).get('natural_language','')
assert 'SMOKE_OK' in text, text
" <<<"$MSG"

echo "==> trajectory"
TRAJ=$(curl -sk "$BASE/v1/sessions/$SID/trajectory" "${AUTH[@]}")
python3 -c "
import json,sys
events=json.load(sys.stdin)['events']
types=[e['event_type'] for e in events]
assert 'turn_complete' in types, types
if 'tool_call_start' in types:
    print('tool_call_start ok')
print(f'trajectory ok ({len(events)} events)')
" <<<"$TRAJ"

echo "==> memory upsert"
MEM_CODE=$(curl -sk -o /tmp/orbita-smoke-mem.json -w "%{http_code}" -X PUT "$BASE/v1/memories/smoke-key" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d '{"content":"smoke test memory"}')
cat /tmp/orbita-smoke-mem.json
echo
test "$MEM_CODE" = "200"

echo "==> done"
