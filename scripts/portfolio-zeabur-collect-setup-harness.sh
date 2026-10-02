#!/usr/bin/env bash
# Register (or print) the portfolio Zeabur deploy collector harness.
# Creates a cron harness on the configured hub client using template portfolio-zeabur-collect@v1.
# Idempotent: if a harness with the same name already exists, prints it and exits 0.
#
# Usage:
#   ./scripts/portfolio-zeabur-collect-setup-harness.sh
#
# Credentials (never echoed):
#   ORBITA_API_KEY | PERSONAL_ORBITA_API_KEY
# Client id (required): ORBITA_CLIENT_ID or ORBITA_HUB_CLIENT_ID
#   or ~/.orbita-personal.env
# Vault credential name: zeabur_api (D-002)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
elif [[ -f "$HOME/.orbita-personal.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$HOME/.orbita-personal.env"
  set +a
fi

: "${ORBITA_API_BASE:=${ORBITA_API_URL:-https://api.get-orbita.com}}"
API_KEY="${ORBITA_API_KEY:-${PERSONAL_ORBITA_API_KEY:-}}"
CLIENT_ID="${ORBITA_CLIENT_ID:-${ORBITA_HUB_CLIENT_ID:-}}"
NAME="${PORTFOLIO_ZEABUR_HARNESS_NAME:-portfolio-zeabur-collect}"

if [[ -z "$CLIENT_ID" ]]; then
  echo "error: set ORBITA_CLIENT_ID or ORBITA_HUB_CLIENT_ID (hub tenant for portfolio collectors)." >&2
  exit 1
fi

build_post_body() {
  NAME="$NAME" python3 -c '
import json, os
print(json.dumps({
  "template_id": "portfolio-zeabur-collect@v1",
  "name": os.environ["NAME"],
  "overrides": {
    "loops": {
      "trigger": {"cron": "30 6 * * *", "timezone": "UTC", "enabled": True}
    },
    "application": {
      "collector": "portfolio_zeabur",
      "credential_name": "zeabur_api",
      "period_hours": 24
    }
  }
}))
'
}

if [[ "${DRY_RUN:-}" == "1" ]]; then
  build_post_body
  exit 0
fi

if [[ -z "$API_KEY" ]]; then
  echo "error: set ORBITA_API_KEY in .env or ~/.orbita-personal.env" >&2
  exit 1
fi

LIST=$(curl -4 -sS \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "x-orbita-client-id: ${CLIENT_ID}" \
  -H "Accept: application/json" \
  "${ORBITA_API_BASE%/}/v1/harnesses")

EXISTING=$(NAME="$NAME" python3 -c '
import json, os, sys
data = json.loads(sys.stdin.read())
items = data.get("harnesses") or data.get("items") or data
if isinstance(items, dict):
  items = items.get("harnesses") or []
name = os.environ["NAME"]
for h in items:
  if h.get("name") == name:
    print(json.dumps(h, indent=2))
    break
' <<<"$LIST")

if [[ -n "$EXISTING" ]]; then
  echo "harness already exists:"
  echo "$EXISTING"
  exit 0
fi

BODY=$(build_post_body)

RESP=$(curl -4 -sS -w "\n%{http_code}" \
  -X POST \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "x-orbita-client-id: ${CLIENT_ID}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d "$BODY" \
  "${ORBITA_API_BASE%/}/v1/harnesses")

HTTP=$(printf '%s' "$RESP" | tail -n1)
BODY_OUT=$(printf '%s' "$RESP" | sed '$d')
echo "$BODY_OUT"
if [[ "$HTTP" != "200" && "$HTTP" != "201" ]]; then
  echo "error: POST /v1/harnesses → HTTP $HTTP" >&2
  exit 1
fi
