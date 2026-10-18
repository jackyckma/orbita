#!/usr/bin/env bash
# Local verify for ORBITA_AGENT_PRINCIPALS_ENABLED (DDL + admin list) after T-0108 lands.
#
# Usage:
#   DRY_RUN=1 ./scripts/agent-principals-verify-local.sh
#   ORBITA_E2E_MOCK=1 ORBITA_API_BASE=http://127.0.0.1:3099 \
#     ORBITA_ADMIN_TOKEN=… ./scripts/agent-principals-verify-local.sh
#
# Credentials (never echoed): ORBITA_ADMIN_TOKEN from ./.env or ~/.orbita-personal.env.
# Optional: ORBITA_API_BASE / ORBITA_API_URL (defaults to http://127.0.0.1:3000 when ORBITA_E2E_MOCK=1).
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

: "${ORBITA_API_BASE:=${ORBITA_API_URL:-}}"
if [[ -z "$ORBITA_API_BASE" ]] && [[ "${ORBITA_E2E_MOCK:-}" == "1" || "${DRY_RUN:-}" == "1" ]]; then
  ORBITA_API_BASE="http://127.0.0.1:3000"
fi

API_BASE="${ORBITA_API_BASE%/}"
HEALTH_URL="${API_BASE}/v1/health"
ADMIN_URL="${API_BASE}/v1/admin/agent-principals"

if [[ "${DRY_RUN:-}" == "1" ]]; then
  echo "DRY_RUN: would GET ${HEALTH_URL}"
  echo "DRY_RUN: would GET ${ADMIN_URL} (header x-orbita-admin-token: <ORBITA_ADMIN_TOKEN>)"
  exit 0
fi

if [[ "${ORBITA_E2E_MOCK:-}" != "1" ]]; then
  echo "skip: set ORBITA_E2E_MOCK=1 and ORBITA_API_BASE to a local tier-A API, or use DRY_RUN=1 (see script header)." >&2
  exit 0
fi

if [[ -z "$API_BASE" ]]; then
  echo "error: ORBITA_API_BASE is required when ORBITA_E2E_MOCK=1" >&2
  exit 1
fi

echo "using api_base=${API_BASE} (ORBITA_E2E_MOCK=1; secrets not echoed)"

HEALTH_RESP="$(curl -4 -sS -w "\n%{http_code}" "${HEALTH_URL}")"
HEALTH_HTTP="$(printf '%s' "$HEALTH_RESP" | tail -n1)"
HEALTH_JSON="$(printf '%s' "$HEALTH_RESP" | sed '$d')"

if [[ "$HEALTH_HTTP" != "200" ]]; then
  echo "error: GET /v1/health → HTTP ${HEALTH_HTTP}" >&2
  exit 1
fi

export HEALTH_JSON
PRINCIPALS_ON="$(python3 <<'PY'
import json, os, sys

def truthy(v):
    if v is True:
        return True
    if isinstance(v, str) and v.strip() in ("1", "true", "yes", "on"):
        return True
    return False

raw = os.environ.get("HEALTH_JSON", "")
try:
    h = json.loads(raw)
except json.JSONDecodeError:
    print("0")
    sys.exit(0)

for key in ("agent_principals_enabled", "agentPrincipalsEnabled"):
    if truthy(h.get(key)):
        print("1")
        sys.exit(0)

features = h.get("features")
if isinstance(features, dict):
    ap = features.get("agent_principals") or features.get("agentPrincipals")
    if isinstance(ap, dict) and truthy(ap.get("enabled")):
        print("1")
        sys.exit(0)
    if truthy(features.get("agent_principals_enabled")):
        print("1")
        sys.exit(0)

print("0")
PY
)"

if [[ "$PRINCIPALS_ON" != "1" ]]; then
  echo "skip: server reports ORBITA_AGENT_PRINCIPALS_ENABLED off (via GET /v1/health); no admin probe."
  echo "  Start API with ORBITA_AGENT_PRINCIPALS_ENABLED=1 after T-0108 to run full verify."
  exit 0
fi

ADMIN_TOKEN="${ORBITA_ADMIN_TOKEN:-}"
if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "error: ORBITA_ADMIN_TOKEN required when agent principals are enabled on the server" >&2
  exit 1
fi

ADMIN_RESP="$(curl -4 -sS -w "\n%{http_code}" \
  -H "x-orbita-admin-token: ${ADMIN_TOKEN}" \
  -H "Accept: application/json" \
  "${ADMIN_URL}")"
ADMIN_HTTP="$(printf '%s' "$ADMIN_RESP" | tail -n1)"
ADMIN_JSON="$(printf '%s' "$ADMIN_RESP" | sed '$d')"

if [[ "$ADMIN_HTTP" != "200" ]]; then
  echo "error: GET /v1/admin/agent-principals → HTTP ${ADMIN_HTTP}" >&2
  exit 1
fi

export ADMIN_JSON
python3 <<'PY'
import json, os, sys

raw = os.environ.get("ADMIN_JSON", "")
try:
    body = json.loads(raw)
except json.JSONDecodeError:
    print("error: admin response is not JSON", file=sys.stderr)
    sys.exit(1)

if isinstance(body, list):
    print(f"ok: agent principals list ({len(body)} row(s))")
    sys.exit(0)

if isinstance(body, dict):
    for key in ("principals", "items", "data"):
        val = body.get(key)
        if isinstance(val, list):
            print(f"ok: agent principals list ({len(val)} row(s))")
            sys.exit(0)

print("error: expected JSON array or object with principals/items/data list", file=sys.stderr)
sys.exit(1)
PY
