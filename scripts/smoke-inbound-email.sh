#!/usr/bin/env bash
# Smoke test POST /v1/inbound/email (requires ORBITA_INBOUND_EMAIL_TOKEN).
set -euo pipefail

API="${ORBITA_API_URL:-https://api.get-orbita.com}"

if [[ -z "${ORBITA_INBOUND_EMAIL_TOKEN:-}" ]]; then
  echo "ORBITA_INBOUND_EMAIL_TOKEN required"
  exit 1
fi

MSG_ID="smoke-$(date +%s)"

curl -4 -sf -X POST "$API/v1/inbound/email" \
  -H "content-type: application/json" \
  -H "x-orbita-inbound-token: $ORBITA_INBOUND_EMAIL_TOKEN" \
  -d "$(jq -n \
    --arg mid "$MSG_ID" \
    '{
      from: "noreply@resend.dev",
      to: "orbita@get-orbita.com",
      subject: "Orbita inbound smoke",
      text: "verification_code=SMOKE123",
      message_id: $mid
    }')" | jq .

echo "==> inbound smoke ok (message_id=$MSG_ID)"
