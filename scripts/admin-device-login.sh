#!/usr/bin/env bash
# Start admin device flow and poll until approved (for remote admin login).
set -euo pipefail

BASE="${ORBITA_API_URL:-http://127.0.0.1:3000}"

echo "==> starting device flow"
START=$(curl -sf -X POST "$BASE/v1/auth/device")
echo "$START" | python3 -m json.tool

DEVICE=$(python3 -c "import json,sys; print(json.load(sys.stdin)['device_code'])" <<<"$START")
URL=$(python3 -c "import json,sys; print(json.load(sys.stdin)['verification_url'])" <<<"$START")

echo ""
echo "Open this URL to approve:"
echo "  $URL"
echo ""

for i in $(seq 1 120); do
  POLL=$(curl -sf "$BASE/v1/auth/device/poll?device_code=$DEVICE")
  STATUS=$(python3 -c "import json,sys; print(json.load(sys.stdin)['status'])" <<<"$POLL")
  if [[ "$STATUS" == "approved" ]]; then
    echo "==> approved"
    echo "$POLL" | python3 -m json.tool
    exit 0
  fi
  if [[ "$STATUS" == "expired" ]]; then
    echo "device flow expired"
    exit 1
  fi
  sleep 5
done

echo "timed out waiting for approval"
exit 1
