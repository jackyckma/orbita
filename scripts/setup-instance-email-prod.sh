#!/usr/bin/env bash
# Configure production instance email: Zeabur from-address, HTTP allow-list, Resend vault credential.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API="${ORBITA_API_URL:-https://api.get-orbita.com}"
SERVICE_ID="${ORBITA_ZEABUR_API_SERVICE_ID:-6a37d3a09f5fe35a4aa63552}"
CLIENT_ID="${ORBITA_INBOUND_CLIENT_ID:-orbita-instance}"
FROM_EMAIL="${ORBITA_INSTANCE_FROM_EMAIL:-orbita@get-orbita.com}"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

if [[ -z "${ORBITA_ADMIN_TOKEN:-}" ]]; then
  echo "ORBITA_ADMIN_TOKEN required (prod admin token)"
  exit 1
fi

admin=(-H "x-orbita-admin-token: $ORBITA_ADMIN_TOKEN" -H "Content-Type: application/json")

echo "==> Zeabur: ORBITA_INSTANCE_FROM_EMAIL=$FROM_EMAIL"
npx zeabur@latest variable update --id "$SERVICE_ID" \
  -k "ORBITA_INSTANCE_FROM_EMAIL=$FROM_EMAIL" \
  -y -i=false

echo "==> HTTP allow-list: merge api.resend.com with existing domains"
CURRENT=$(curl -4 -sf "$API/v1/admin/settings" "${admin[@]}")
DOMAINS=$(python3 -c "
import json,sys
d=json.loads(sys.argv[1])
existing=d.get('http_allowed_domains',{}).get('domains',[]) or []
merged=sorted(set(existing + ['api.resend.com']))
print(json.dumps(merged))
" "$CURRENT")
curl -4 -sf -X PUT "$API/v1/admin/settings/http-domains" "${admin[@]}" \
  -d "{\"domains\":$DOMAINS}" | jq .

if [[ -n "${RESEND_API_KEY:-}" ]]; then
  echo "==> vault credential resend for client_id=$CLIENT_ID"
  curl -4 -sf -X POST "$API/v1/admin/credentials" "${admin[@]}" \
    -d "$(jq -n \
      --arg cid "$CLIENT_ID" \
      --arg secret "$RESEND_API_KEY" \
      '{
        client_id: $cid,
        name: "resend",
        secret: $secret,
        scope: ["emails:send"]
      }')" | jq .
else
  echo "WARN: RESEND_API_KEY not set — skip vault credential (add key and re-run)"
fi

echo "==> done"
