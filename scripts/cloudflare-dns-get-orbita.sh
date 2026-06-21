#!/usr/bin/env bash
# Configure DNS for get-orbita.com → Cloudflare Workers (orbita-web).
# Prerequisites:
#   1. Zone get-orbita.com added to Cloudflare (nameservers updated at registrar)
#   2. CLOUDFLARE_API_TOKEN in .env with Zone:DNS:Edit for get-orbita.com
#   3. Token IP allowlist includes this machine (use IPv4 API calls)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOMAIN="get-orbita.com"
WORKER_NAME="orbita-web"

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
  echo "Zone not found for $DOMAIN."
  echo "Add the domain in Cloudflare Dashboard → Websites → Add site, then update registrar nameservers."
  exit 1
fi

echo "==> zone id: $ZONE_ID"

# Workers custom domain: CNAME @ to worker route (Cloudflare proxied)
# For Workers on custom domain, use wrangler routes or dashboard Custom Domains.
# Here we set www CNAME to the workers.dev subdomain pattern after first deploy.

WORKERS_SUBDOMAIN=$(curl -4 -sf "${CF_API}/accounts" "${auth[@]}" 2>/dev/null | python3 -c "
import json,sys
try:
  d=json.load(sys.stdin)
  print(d['result'][0]['name'] if d.get('result') else '')
except: print('')
" || true)

echo "==> ensure Worker '$WORKER_NAME' is deployed (pnpm --filter @orbita/web deploy)"
echo "==> Then in Cloudflare Dashboard:"
echo "    Workers & Pages → $WORKER_NAME → Settings → Domains & Routes → Add Custom Domain"
echo "    Add: $DOMAIN and www.$DOMAIN"
echo ""
echo "Optional: apex A/AAAA records are managed automatically when using Custom Domains."
echo ""
echo "If you use a manual CNAME for www only:"
echo "  www.$DOMAIN CNAME ${WORKER_NAME}.<account>.workers.dev (proxied)"

# List existing DNS records
echo "==> current DNS records for $DOMAIN"
curl -4 -sf "${CF_API}/zones/${ZONE_ID}/dns_records?per_page=50" "${auth[@]}" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for r in d.get('result',[]):
    print(f'{r[\"type\"]:6} {r[\"name\"]:30} -> {r[\"content\"]} (proxied={r.get(\"proxied\")})')
"

echo "==> DNS script finished (custom domain binding is via Workers Custom Domains UI or wrangler)"
