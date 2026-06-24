#!/usr/bin/env bash
# Deploy static marketing site to Cloudflare Pages (orbita-web).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/apps/orbita-web"

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
echo "==> deploying orbita-web to Cloudflare Pages"
NODE_OPTIONS='--dns-result-order=ipv4first' pnpm exec wrangler pages deploy public \
  --project-name=orbita-web \
  --branch=main \
  --commit-dirty=true

echo "==> done. Waitlist submits to POST https://api.get-orbita.com/v1/waitlist"
