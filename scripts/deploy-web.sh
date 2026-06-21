#!/usr/bin/env bash
# Deploy static site to Cloudflare Workers (assets).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/apps/orbita-web"

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  if [[ -f "$ROOT/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$ROOT/.env"
    set +a
  fi
fi

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "Set CLOUDFLARE_API_TOKEN in .env or environment"
  exit 1
fi

export CLOUDFLARE_API_TOKEN
echo "==> deploying orbita-web to Cloudflare Workers"
pnpm exec wrangler deploy

echo "==> done. Attach custom domain in Cloudflare dashboard or run scripts/cloudflare-dns-get-orbita.sh"
