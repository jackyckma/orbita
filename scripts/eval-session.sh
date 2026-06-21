#!/usr/bin/env bash
# Evaluate session trajectory against expectations (after a turn or smoke flow).
set -euo pipefail

BASE="${ORBITA_API_URL:-https://orbita-api.zeabur.app}"
SESSION_ID="${1:-}"
CLIENT_ID="${ORBITA_CLIENT_ID:-eval-script}"

REQUIRE_TURN="${EVAL_REQUIRE_TURN_COMPLETE:-1}"
MIN_EVENTS="${EVAL_MIN_EVENTS:-1}"
REQUIRED_TOOLS="${EVAL_REQUIRED_TOOLS:-}"

if [[ -z "$SESSION_ID" ]]; then
  echo "Usage: ORBITA_ADMIN_TOKEN=... $0 <session_id>"
  exit 1
fi

if [[ -z "${ORBITA_ADMIN_TOKEN:-}" ]]; then
  echo "ORBITA_ADMIN_TOKEN required"
  exit 1
fi

KEY_JSON=$(curl -sk -X POST "$BASE/v1/admin/api-keys" \
  -H "x-orbita-admin-token: $ORBITA_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"allowed_client_ids\":[\"$CLIENT_ID\"]}")
API_KEY=$(python3 -c "import json,sys; print(json.load(sys.stdin)['key'])" <<<"$KEY_JSON")

TRAJ=$(curl -sk "$BASE/v1/sessions/$SESSION_ID/trajectory" \
  -H "Authorization: Bearer $API_KEY" \
  -H "x-orbita-client-id: $CLIENT_ID")

export TRAJ REQUIRE_TURN MIN_EVENTS REQUIRED_TOOLS
python3 <<'PY'
import json, os, sys

traj = json.loads(os.environ["TRAJ"])
events = traj["events"]
min_events = int(os.environ.get("MIN_EVENTS", "1"))
require_turn = os.environ.get("REQUIRE_TURN", "1") == "1"
required_tools = [t.strip() for t in os.environ.get("REQUIRED_TOOLS", "").split(",") if t.strip()]

checks = []
if len(events) < min_events:
    checks.append(f"FAIL min_events: {len(events)} < {min_events}")
else:
    checks.append(f"OK min_events: {len(events)}")

types = [e["event_type"] for e in events]
if require_turn and "turn_complete" not in types:
    checks.append("FAIL require_turn_complete")
else:
    checks.append("OK turn_complete")

tool_names = [
    e.get("payload", {}).get("tool_name")
    for e in events
    if e.get("event_type") == "tool_call_complete"
]
for name in required_tools:
    if name in tool_names:
        checks.append(f"OK tool:{name}")
    else:
        checks.append(f"FAIL tool:{name}")

for line in checks:
    print(line)
if any(line.startswith("FAIL") for line in checks):
    sys.exit(1)
PY

echo "==> eval OK"
