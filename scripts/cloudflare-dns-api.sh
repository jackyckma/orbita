#!/usr/bin/env bash
# CNAME api.get-orbita.com → Zeabur (or your API host). Requires CLOUDFLARE_API_TOKEN in .env.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOMAIN="get-orbita.com"
API_HOST="${ORBITA_API_CNAME_TARGET:-orbita-api.zeabur.app}"
RECORD_NAME="api.${DOMAIN}"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "CLOUDFLARE_API_TOKEN required"
  exit 1
fi

CF_API="https://api.cloudflare.com/client/v4"
auth=(-H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json")

ZONE_JSON=$(curl -4 -sf "${CF_API}/zones?name=${DOMAIN}" "${auth[@]}")
ZONE_ID=$(python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('result',[]); print(r[0]['id'] if r else '')" <<<"$ZONE_JSON")

if [[ -z "$ZONE_ID" ]]; then
  echo "Zone not found for $DOMAIN"
  exit 1
fi

echo "==> zone $ZONE_ID"
echo "==> upsert CNAME $RECORD_NAME -> $API_HOST (proxied)"

existing=$(curl -4 -sf "${CF_API}/zones/${ZONE_ID}/dns_records?type=CNAME&name=${RECORD_NAME}" "${auth[@]}")
record_id=$(python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('result',[]); print(r[0]['id'] if r else '')" <<<"$existing")
payload=$(python3 -c "import json; print(json.dumps({'type':'CNAME','name':'${RECORD_NAME}','content':'${API_HOST}','proxied':True,'comment':'orbita-api'}))")

if [[ -n "$record_id" ]]; then
  curl -4 -sf -X PATCH "${CF_API}/zones/${ZONE_ID}/dns_records/${record_id}" "${auth[@]}" -d "$payload" >/dev/null
else
  curl -4 -sf -X POST "${CF_API}/zones/${ZONE_ID}/dns_records" "${auth[@]}" -d "$payload" >/dev/null
fi

echo "==> done. Set ORBITA_PUBLIC_BASE_URL=https://${RECORD_NAME} on Zeabur after DNS propagates."
