#!/usr/bin/env bash
# Configure production Orbita web_search (SearXNG) + HTTP allow-list.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -f "$REPO_ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_ROOT/.env"
  set +a
fi

: "${ORBITA_API_BASE:=https://api.get-orbita.com}"
PROJECT_ID="${ZEABUR_ORBITA_PROJECT_ID:-6a37d39a6d107f2b4271712f}"
API_SERVICE_ID="${ZEABUR_ORBITA_API_SERVICE_ID:-6a37d3a09f5fe35a4aa63552}"
SEARX_SERVICE_ID="${ORBITA_SEARXNG_SERVICE_ID:-}"
SEARX_NAME="${ORBITA_SEARXNG_SERVICE_NAME:-orbita-searxng}"

if [[ -z "${ORBITA_ADMIN_TOKEN:-}" ]]; then
  echo "==> loading ORBITA_ADMIN_TOKEN from Zeabur API service"
  ORBITA_ADMIN_TOKEN=$(npx zeabur@latest variable list --id "$API_SERVICE_ID" -i=false 2>/dev/null \
    | python3 -c "
import re, sys
text = re.sub(r'\x1b\[[0-9;]*m', '', sys.stdin.read())
for line in text.splitlines():
    if 'ORBITA_ADMIN_TOKEN' in line and 'KEY' not in line:
        parts = line.split()
        for i, p in enumerate(parts):
            if p == 'ORBITA_ADMIN_TOKEN' and i + 1 < len(parts):
                print(parts[i + 1])
                raise SystemExit(0)
raise SystemExit('ORBITA_ADMIN_TOKEN not found')
")
fi

ADMIN=(-H "x-orbita-admin-token: $ORBITA_ADMIN_TOKEN" -H "Content-Type: application/json")

if [[ -z "${ORBITA_SEARXNG_BASE_URL:-}" ]]; then
  if [[ -z "$SEARX_SERVICE_ID" ]]; then
    echo "==> deploy SearXNG service ($SEARX_NAME)"
    DEPLOY_JSON=$(cd "$REPO_ROOT/deploy/searxng" && npx zeabur@latest deploy \
      --project-id "$PROJECT_ID" \
      --name "$SEARX_NAME" \
      --json -i=false)
    SEARX_SERVICE_ID=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('service_id',''))" <<<"$DEPLOY_JSON")
    echo "searxng service_id=$SEARX_SERVICE_ID"
  fi
  if [[ -n "$SEARX_SERVICE_ID" ]]; then
    ORBITA_SEARXNG_BASE_URL=$(npx zeabur@latest service list --project-id "$PROJECT_ID" -i=false 2>/dev/null \
      | python3 -c "
import re, sys, json
text = re.sub(r'\x1b\[[0-9;]*m', '', sys.stdin.read())
sid = sys.argv[1]
try:
    data = json.loads(text)
    items = data if isinstance(data, list) else data.get('services', [])
except Exception:
    items = []
for row in items:
    if str(row.get('id') or row.get('_id') or '') == sid:
        dom = row.get('domain') or row.get('url') or ''
        if dom:
            print(dom if dom.startswith('http') else f'https://{dom}')
            raise SystemExit(0)
# fallback hostname pattern
print(f'https://{sys.argv[2]}.zeabur.app')
" "$SEARX_SERVICE_ID" "$SEARX_NAME" 2>/dev/null || echo "https://${SEARX_NAME}.zeabur.app")
  fi
fi

: "${ORBITA_SEARXNG_BASE_URL:?Set ORBITA_SEARXNG_BASE_URL or ORBITA_SEARXNG_SERVICE_ID}"

SEARX_HOST=$(python3 -c "from urllib.parse import urlparse; print(urlparse('$ORBITA_SEARXNG_BASE_URL').hostname)")
echo "==> SearXNG base: $ORBITA_SEARXNG_BASE_URL (host=$SEARX_HOST)"

echo "==> Zeabur env on orbita-api"
npx zeabur@latest variable update --id "$API_SERVICE_ID" -y -i=false \
  -k "ORBITA_WEB_SEARCH_PROVIDER=searxng" \
  -k "ORBITA_SEARXNG_BASE_URL=$ORBITA_SEARXNG_BASE_URL"

echo "==> HTTP allow-list (merge SearXNG + AT domains)"
CURRENT=$(curl -4 -sf "$ORBITA_API_BASE/v1/admin/settings" "${ADMIN[@]}")
NEW_DOMAINS=$(echo "$CURRENT" | python3 -c "
import json, sys
data = json.load(sys.stdin)
existing = data.get('http_allowed_domains', {}).get('domains', []) or []
extra = ['ai-transformation.io', 'ai-transformation.org', sys.argv[1]]
merged = sorted(set(existing + extra))
print(json.dumps({'domains': merged}))
" "$SEARX_HOST")
curl -4 -sf -X PUT "$ORBITA_API_BASE/v1/admin/settings/http-domains" "${ADMIN[@]}" -d "$NEW_DOMAINS" | python3 -m json.tool

echo "==> smoke SearXNG"
curl -4 -sf "${ORBITA_SEARXNG_BASE_URL%/}/search?q=ai+transformation&format=json" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('results', len(d.get('results') or []))
"

echo "==> done — redeploy orbita-api if profile/web_search not yet live"
