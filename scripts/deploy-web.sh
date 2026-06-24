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

if [[ -z "${ORBITA_WAITLIST_NOTIFY_EMAIL:-}" ]]; then
  echo "Set ORBITA_WAITLIST_NOTIFY_EMAIL in .env — inbox you can read (FormSubmit activation + waitlist mail)."
  echo "Example: ORBITA_WAITLIST_NOTIFY_EMAIL=you@example.com"
  exit 1
fi

STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT
cp -r public/* "$STAGING/"
# Escape sed replacement (email only — still escape & and /)
ESCAPED_EMAIL="${ORBITA_WAITLIST_NOTIFY_EMAIL//\\/\\\\}"
ESCAPED_EMAIL="${ESCAPED_EMAIL//&/\\&}"
sed -i "s|__WAITLIST_NOTIFY_EMAIL__|${ESCAPED_EMAIL}|g" "$STAGING/waitlist.html"

if grep -q '__WAITLIST_NOTIFY_EMAIL__' "$STAGING/waitlist.html"; then
  echo "waitlist.html placeholder not replaced — check ORBITA_WAITLIST_NOTIFY_EMAIL"
  exit 1
fi

export CLOUDFLARE_API_TOKEN
echo "==> deploying orbita-web to Cloudflare Pages (waitlist → ${ORBITA_WAITLIST_NOTIFY_EMAIL})"
NODE_OPTIONS='--dns-result-order=ipv4first' pnpm exec wrangler pages deploy "$STAGING" \
  --project-name=orbita-web \
  --branch=main \
  --commit-dirty=true

echo "==> done. Confirm FormSubmit: submit https://get-orbita.com/waitlist once, click activation in ${ORBITA_WAITLIST_NOTIFY_EMAIL}"
