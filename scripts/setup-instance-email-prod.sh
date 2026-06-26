#!/usr/bin/env bash
# Configure production instance email: from-address, HTTP allow-list, Zeabur ZSend vault + API env.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API="${ORBITA_API_URL:-https://api.get-orbita.com}"
SERVICE_ID="${ORBITA_ZEABUR_API_SERVICE_ID:-6a37d3a09f5fe35a4aa63552}"
CLIENT_ID="${ORBITA_INBOUND_CLIENT_ID:-orbita-instance}"
FROM_EMAIL="${ORBITA_INSTANCE_FROM_EMAIL:-orbita@get-orbita.com}"
PUBLIC_BASE="${ORBITA_PUBLIC_BASE_URL:-https://api.get-orbita.com}"
ZSEND_KEY="${ZEABUR_ZSEND_API_KEY:-}"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

if [[ -z "${ORBITA_ADMIN_TOKEN:-}" ]]; then
  ORBITA_ADMIN_TOKEN=$(npx zeabur@latest variable list --id "$SERVICE_ID" -i=false 2>/dev/null | python3 -c "
import re, sys
for line in sys.stdin:
    if re.search(r'\\bORBITA_ADMIN_TOKEN\\b', line) and 'INBOUND' not in line:
        m = re.search(r'\\[32m([^\\[]+)\\[0m', line)
        if m:
            print(m.group(1).strip())
            break
")
  export ORBITA_ADMIN_TOKEN
fi

if [[ -z "${ORBITA_ADMIN_TOKEN:-}" ]]; then
  echo "ORBITA_ADMIN_TOKEN required (prod admin token from Zeabur Dashboard)"
  exit 1
fi

admin=(-H "x-orbita-admin-token: $ORBITA_ADMIN_TOKEN" -H "Content-Type: application/json")

echo "==> Zeabur API env: email + waitlist invite (process env, not vault only)"
ZEABUR_KEYS=(
  -k "ORBITA_INSTANCE_FROM_EMAIL=$FROM_EMAIL"
  -k "ORBITA_PUBLIC_BASE_URL=$PUBLIC_BASE"
)
if [[ -n "${ZSEND_KEY:-}" ]]; then
  ZEABUR_KEYS+=(-k "ZEABUR_ZSEND_API_KEY=$ZSEND_KEY")
else
  echo "WARN: ZEABUR_ZSEND_API_KEY not set — waitlist invite emails will not send"
fi
if [[ -n "${ORBITA_QUOTA_SESSIONS_PER_DAY:-}" ]]; then
  ZEABUR_KEYS+=(-k "ORBITA_QUOTA_SESSIONS_PER_DAY=$ORBITA_QUOTA_SESSIONS_PER_DAY")
fi
if [[ -n "${ORBITA_QUOTA_MESSAGES_PER_DAY:-}" ]]; then
  ZEABUR_KEYS+=(-k "ORBITA_QUOTA_MESSAGES_PER_DAY=$ORBITA_QUOTA_MESSAGES_PER_DAY")
fi
npx zeabur@latest variable update --id "$SERVICE_ID" "${ZEABUR_KEYS[@]}" -y -i=false

echo "==> HTTP allow-list: merge api.zeabur.com with existing domains"
CURRENT=$(curl -4 -sf "$API/v1/admin/settings" "${admin[@]}")
DOMAINS=$(python3 -c "
import json,sys
d=json.loads(sys.argv[1])
existing=d.get('http_allowed_domains',{}).get('domains',[]) or []
merged=sorted(set(existing + ['api.zeabur.com']))
print(json.dumps(merged))
" "$CURRENT")
curl -4 -sf -X PUT "$API/v1/admin/settings/http-domains" "${admin[@]}" \
  -d "{\"domains\":$DOMAINS}" | jq .

if [[ -n "${ZSEND_KEY:-}" ]]; then
  echo "==> vault credential zsend for client_id=$CLIENT_ID (agent http_post)"
  curl -4 -sf -X POST "$API/v1/admin/credentials" "${admin[@]}" \
    -d "$(jq -n \
      --arg cid "$CLIENT_ID" \
      --arg secret "$ZSEND_KEY" \
      '{
        client_id: $cid,
        name: "zsend",
        secret: $secret,
        scope: ["emails:send"]
      }')" | jq .
else
  echo "      Create key: npx zeabur@latest email keys create --name orbita --permission send_only -i=false"
fi

echo "==> done (restart API service if invite/quota env changed)"
