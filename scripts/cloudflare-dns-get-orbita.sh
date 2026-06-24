#!/usr/bin/env bash
# DNS + Pages custom domains for get-orbita.com → orbita-web (Cloudflare Pages).
# Prerequisites:
#   1. Zone get-orbita.com active on Cloudflare
#   2. CLOUDFLARE_API_TOKEN with Zone:DNS:Edit + Cloudflare Pages:Edit
#   3. Token IP allowlist includes this machine (scripts use curl -4)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOMAIN="get-orbita.com"
PAGES_PROJECT="orbita-web"
PAGES_HOST="${PAGES_PROJECT}.pages.dev"

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

echo "==> looking up zone $DOMAIN"
ZONE_JSON=$(curl -4 -sf "${CF_API}/zones?name=${DOMAIN}" "${auth[@]}")
ZONE_ID=$(python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('result',[]); print(r[0]['id'] if r else '')" <<<"$ZONE_JSON")

if [[ -z "$ZONE_ID" ]]; then
  echo "Zone not found for $DOMAIN. Add it in Cloudflare Dashboard first."
  exit 1
fi

echo "==> zone id: $ZONE_ID"

ACCOUNT_JSON=$(curl -4 -sf "${CF_API}/accounts" "${auth[@]}")
ACCOUNT_ID=$(python3 -c "import json,sys; d=json.load(sys.stdin); print(d['result'][0]['id'] if d.get('result') else '')" <<<"$ACCOUNT_JSON")
echo "==> account id: $ACCOUNT_ID"

upsert_cname() {
  local name="$1"
  local existing
  existing=$(curl -4 -sf "${CF_API}/zones/${ZONE_ID}/dns_records?type=CNAME&name=${name}" "${auth[@]}")
  local record_id
  record_id=$(python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('result',[]); print(r[0]['id'] if r else '')" <<<"$existing")

  local payload
  payload=$(python3 -c "import json; print(json.dumps({'type':'CNAME','name':'${name}','content':'${PAGES_HOST}','proxied':True,'comment':'orbita-web Pages'}))")

  if [[ -n "$record_id" ]]; then
    echo "==> updating CNAME ${name} -> ${PAGES_HOST}"
    curl -4 -sf -X PATCH "${CF_API}/zones/${ZONE_ID}/dns_records/${record_id}" "${auth[@]}" -d "$payload" >/dev/null
  else
    echo "==> creating CNAME ${name} -> ${PAGES_HOST}"
    curl -4 -sf -X POST "${CF_API}/zones/${ZONE_ID}/dns_records" "${auth[@]}" -d "$payload" >/dev/null
  fi
}

upsert_cname "$DOMAIN"
upsert_cname "www.$DOMAIN"

register_pages_domain() {
  local host="$1"
  local domains_json
  domains_json=$(curl -4 -sf "${CF_API}/accounts/${ACCOUNT_ID}/pages/projects/${PAGES_PROJECT}/domains" "${auth[@]}")
  local found
  found=$(python3 -c "import json,sys; d=json.load(sys.stdin); print(any(x['name']=='${host}' for x in d.get('result',[])))" <<<"$domains_json")

  if [[ "$found" == "True" ]]; then
    echo "==> Pages custom domain already registered: $host"
    return
  fi

  echo "==> registering Pages custom domain: $host"
  curl -4 -sf -X POST "${CF_API}/accounts/${ACCOUNT_ID}/pages/projects/${PAGES_PROJECT}/domains" \
    "${auth[@]}" -d "$(python3 -c "import json; print(json.dumps({'name':'${host}'}))")" >/dev/null
}

register_pages_domain "$DOMAIN"
register_pages_domain "www.$DOMAIN"

echo "==> Pages custom domain status"
curl -4 -sf "${CF_API}/accounts/${ACCOUNT_ID}/pages/projects/${PAGES_PROJECT}/domains" "${auth[@]}" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for x in d.get('result',[]):
    ssl=x.get('validation_data',{}).get('status','?')
    print(f'  {x[\"name\"]:25} status={x[\"status\"]} ssl={ssl}')
"

echo "==> current DNS records"
curl -4 -sf "${CF_API}/zones/${ZONE_ID}/dns_records?per_page=50" "${auth[@]}" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for r in d.get('result',[]):
    print(f'  {r[\"type\"]:6} {r[\"name\"]:30} -> {r[\"content\"]} (proxied={r.get(\"proxied\")})')
"

echo "==> done. SSL may take 1–3 minutes after DNS changes; then https://${DOMAIN} should return 200."
