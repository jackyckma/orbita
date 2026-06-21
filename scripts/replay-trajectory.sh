#!/usr/bin/env bash
# Fetch trajectory replay for a session (human timeline + structured steps).
set -euo pipefail

BASE="${ORBITA_API_URL:-https://orbita-api.zeabur.app}"
SESSION_ID="${1:-}"
CLIENT_ID="${ORBITA_CLIENT_ID:-replay-script}"

if [[ -z "$SESSION_ID" ]]; then
  echo "Usage: ORBITA_ADMIN_TOKEN=... $0 <session_id>"
  exit 1
fi

if [[ -z "${ORBITA_ADMIN_TOKEN:-}" ]]; then
  echo "ORBITA_ADMIN_TOKEN required (creates ephemeral API key)"
  exit 1
fi

KEY_JSON=$(curl -sk -X POST "$BASE/v1/admin/api-keys" \
  -H "x-orbita-admin-token: $ORBITA_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"allowed_client_ids\":[\"$CLIENT_ID\"]}")
API_KEY=$(python3 -c "import json,sys; print(json.load(sys.stdin)['key'])" <<<"$KEY_JSON")

REPLAY=$(curl -sk "$BASE/v1/sessions/$SESSION_ID/trajectory/replay" \
  -H "Authorization: Bearer $API_KEY" \
  -H "x-orbita-client-id: $CLIENT_ID")

python3 -c "
import json,sys
data=json.load(sys.stdin)
replay=data.get('replay',data)
print('--- timeline ---')
print(replay.get('timeline_text',''))
print('--- summary ---')
print(f'events={replay.get(\"event_count\")} turns={replay.get(\"turn_count\")} tools={replay.get(\"tool_call_count\")}')
" <<<"$REPLAY"
