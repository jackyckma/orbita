#!/usr/bin/env bash
# Verify portfolio Zeabur collector output: at least one deploy-line report note within 48h.
#
# Usage:
#   ./scripts/portfolio-zeabur-collect-verify-output.sh
#
# Credentials (never echoed) — same env vars as portfolio-zeabur-collect-setup-harness.sh:
#   ORBITA_API_KEY | PERSONAL_ORBITA_API_KEY
# read from ./.env or ~/.orbita-personal.env.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPECTED_EDGE="deploy"

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
CLIENT_ID="${ORBITA_CLIENT_ID:-personal-jacky}"

if [[ -z "$API_KEY" ]]; then
  echo "error: set ORBITA_API_KEY (personal-jacky) in .env or ~/.orbita-personal.env" >&2
  exit 1
fi

SINCE="$(python3 -c 'from datetime import datetime, timedelta, timezone; print((datetime.now(timezone.utc) - timedelta(hours=48)).strftime("%Y-%m-%dT%H:%M:%S.000Z"))')"

echo "using client_id=${CLIENT_ID} api_base=${ORBITA_API_BASE%/} edge=${EXPECTED_EDGE} since=${SINCE} (key and note bodies not echoed)"

LIST_RESP="$(curl -4 -sS -G -w "\n%{http_code}" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "x-orbita-client-id: ${CLIENT_ID}" \
  -H "Accept: application/json" \
  --data-urlencode "type=report" \
  --data-urlencode "since=${SINCE}" \
  "${ORBITA_API_BASE%/}/v1/notes")"

LIST_HTTP="$(printf '%s' "$LIST_RESP" | tail -n1)"
LIST_JSON="$(printf '%s' "$LIST_RESP" | sed '$d')"

if [[ "$LIST_HTTP" != "200" ]]; then
  echo "error: GET /v1/notes?type=report&since=… → HTTP ${LIST_HTTP}" >&2
  printf '%s' "$LIST_JSON" | python3 -c '
import json, sys
raw = sys.stdin.read().strip()
if not raw:
  sys.exit(0)
try:
  d = json.loads(raw)
except json.JSONDecodeError:
  print("(non-JSON error body omitted)", file=sys.stderr)
  sys.exit(0)
safe = {k: v for k, v in d.items() if k not in ("body", "notes")}
print(json.dumps(safe, indent=2), file=sys.stderr)
' || true
  exit 1
fi

export ORBITA_API_BASE API_KEY CLIENT_ID EXPECTED_EDGE
export LIST_JSON

RESULT="$(python3 <<'PY'
import json
import os
import subprocess
import sys
import urllib.parse

api_base = os.environ["ORBITA_API_BASE"].rstrip("/")
api_key = os.environ["API_KEY"]
client_id = os.environ["CLIENT_ID"]
expected_edge = os.environ["EXPECTED_EDGE"]

try:
    data = json.loads(os.environ["LIST_JSON"])
except json.JSONDecodeError as exc:
    print(f"error: invalid JSON from GET /v1/notes: {exc}", file=sys.stderr)
    sys.exit(1)

notes = data.get("notes") or []
if not notes:
    print(
        f"error: no type=report notes updated within 48h for client {client_id}; "
        f"expected at least one with edge={expected_edge} (portfolio Zeabur collector may not have run).",
        file=sys.stderr,
    )
    sys.exit(1)

def curl_get_note(note_id: str) -> tuple[int, dict | None]:
    url = f"{api_base}/v1/notes/{urllib.parse.quote(note_id, safe='')}"
    proc = subprocess.run(
        [
            "curl", "-4", "-sS", "-w", "\n%{http_code}",
            "-H", f"Authorization: Bearer {api_key}",
            "-H", f"x-orbita-client-id: {client_id}",
            "-H", "Accept: application/json",
            url,
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        print(f"error: GET /v1/notes/{note_id} curl failed", file=sys.stderr)
        sys.exit(1)
    lines = proc.stdout.rsplit("\n", 1)
    body = lines[0] if len(lines) == 2 else proc.stdout
    http = lines[1] if len(lines) == 2 else "000"
    try:
        status = int(http)
    except ValueError:
        status = 0
    if status != 200:
        print(f"error: GET /v1/notes/{note_id} → HTTP {status}", file=sys.stderr)
        sys.exit(1)
    try:
        return status, json.loads(body)
    except json.JSONDecodeError as exc:
        print(f"error: invalid JSON from GET /v1/notes/{note_id}: {exc}", file=sys.stderr)
        sys.exit(1)

matches = []
for item in notes:
    note_id = item.get("id")
    if not note_id:
        continue
    _, full = curl_get_note(note_id)
    if not full:
        continue
    fm = full.get("frontmatter") or {}
    note_type = str(fm.get("type", "")).lower()
    edge = str(fm.get("edge", "")).lower()
    if note_type == "report" and edge == expected_edge:
        matches.append(
            {
                "id": full.get("id"),
                "title": full.get("title"),
                "updated_at": full.get("updated_at"),
                "project": fm.get("project"),
                "edge": edge,
            }
        )

if not matches:
    print(
        f"error: found {len(notes)} type=report note(s) within 48h but none with edge={expected_edge}; "
        "portfolio Zeabur collector output not verified.",
        file=sys.stderr,
    )
    sys.exit(1)

best = sorted(matches, key=lambda m: m.get("updated_at") or "", reverse=True)[0]
print("ok: portfolio Zeabur collector report verified")
print(json.dumps(best, indent=2))
PY
)"

printf '%s\n' "$RESULT"
