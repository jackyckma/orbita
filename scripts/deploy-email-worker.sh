#!/usr/bin/env bash
# Deploy Cloudflare Email Worker (inbound mail → Orbita API).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/apps/orbita-email-worker"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "Set CLOUDFLARE_API_TOKEN in .env or environment"
  exit 1
fi

export CLOUDFLARE_API_TOKEN

# Wrangler needs account id; token may lack User:Read (/memberships).
if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  CLOUDFLARE_ACCOUNT_ID=$(curl -4 -sf "https://api.cloudflare.com/client/v4/accounts" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | python3 -c "import json,sys; print(json.load(sys.stdin)['result'][0]['id'])")
  export CLOUDFLARE_ACCOUNT_ID
fi

if [[ -n "${ORBITA_INBOUND_EMAIL_TOKEN:-}" ]]; then
  echo "==> syncing ORBITA_INBOUND_EMAIL_TOKEN secret"
  printf '%s' "$ORBITA_INBOUND_EMAIL_TOKEN" | pnpm exec wrangler secret put ORBITA_INBOUND_EMAIL_TOKEN
fi

echo "==> deploying orbita-email-worker"
NODE_OPTIONS='--dns-result-order=ipv4first' pnpm exec wrangler deploy

echo "==> done. Configure Email Routing: orbita@get-orbita.com → Worker orbita-email-worker"
echo "    See docs/cloudflare-email-worker.md"
