#!/usr/bin/env bash
# Register (or print) the portfolio git collector harness — same pattern as AT1b harness setup.
# Creates a cron harness on client personal-jacky using template portfolio-git-collect@v1.
# Idempotent: if a harness with the same name already exists, prints it and exits 0.
#
# Usage:
#   ./scripts/portfolio-git-collect-setup-harness.sh
#
# Credentials (never echoed) — any ONE of these key names is accepted:
#   ORBITA_API_KEY | ORBITA_PERSONAL_API_KEY | PERSONAL_ORBITA_API_KEY
# read from ./.env or ~/.orbita-personal.env.
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

# Accept every spelling that has existed in the wild. ~/.orbita-personal.env uses
# ORBITA_PERSONAL_API_KEY; earlier drafts of this script only looked for
# ORBITA_API_KEY / PERSONAL_ORBITA_API_KEY, so a correctly provisioned machine
# was told the credential was missing when it was simply named differently.
API_KEY="${ORBITA_API_KEY:-${ORBITA_PERSONAL_API_KEY:-${PERSONAL_ORBITA_API_KEY:-}}}"
CLIENT_ID="${ORBITA_CLIENT_ID:-${ORBITA_PERSONAL_CLIENT_ID:-personal-jacky}}"
NAME="${PORTFOLIO_GIT_HARNESS_NAME:-portfolio-git-collect}"

if [[ -z "$API_KEY" ]]; then
  echo "error: no Orbita API key found for client '${CLIENT_ID}'." >&2
  echo "  Looked for: ORBITA_API_KEY, ORBITA_PERSONAL_API_KEY, PERSONAL_ORBITA_API_KEY" >&2
  echo "  Searched:   ${ROOT}/.env, \$HOME/.orbita-personal.env, and the current environment" >&2
  echo "  If one of those files exists, check the variable NAME inside it before assuming the key is missing." >&2
  exit 1
fi

echo "using client_id=${CLIENT_ID} api_base=${ORBITA_API_BASE%/} (key not echoed)"

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

BODY=$(NAME="$NAME" python3 -c '
import json, os
print(json.dumps({
  "template_id": "portfolio-git-collect@v1",
  "name": os.environ["NAME"],
  "overrides": {
    "loops": {
      "trigger": {"cron": "0 6 * * *", "timezone": "UTC", "enabled": True}
    },
    "application": {
      "collector": "portfolio_git",
      "credential_name": "github_read",
      "period_hours": 24
    }
  }
}))
')

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

echo
echo "harness registered. It runs daily at 06:00 UTC."
echo "Verify from a hub session with portfolio_brief — the repo line should stop reporting 'no report ever collected'."
