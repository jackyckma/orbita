#!/usr/bin/env bash
# Prod smoke: PUT a probe note, read embedding_meta, then GET /v1/notes/search.
# Exits 0 only when indexing succeeded and search returns the probe note.
#
# Usage:
#   ./scripts/note-search-embed-diagnose.sh
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

API_KEY="${ORBITA_API_KEY:-${ORBITA_PERSONAL_API_KEY:-${PERSONAL_ORBITA_API_KEY:-}}}"
CLIENT_ID="${ORBITA_CLIENT_ID:-${ORBITA_PERSONAL_CLIENT_ID:-personal-jacky}}"

if [[ -z "$API_KEY" ]]; then
  echo "error: no Orbita API key found for client '${CLIENT_ID}'." >&2
  echo "  Looked for: ORBITA_API_KEY, ORBITA_PERSONAL_API_KEY, PERSONAL_ORBITA_API_KEY" >&2
  echo "  Searched:   ${ROOT}/.env, \$HOME/.orbita-personal.env, and the current environment" >&2
  echo "  If one of those files exists, check the variable NAME inside it before assuming the key is missing." >&2
  exit 1
fi

NOTE_ID="$(python3 -c 'import uuid; print(uuid.uuid4())')"
TOKEN="orbita-embed-probe-$(date -u +%Y%m%dT%H%M%SZ)-${RANDOM}"

echo "using client_id=${CLIENT_ID} api_base=${ORBITA_API_BASE%/} note_id=${NOTE_ID} (key and note body not echoed)"

PUT_BODY="$(TOKEN="$TOKEN" python3 -c '
import json, os
print(json.dumps({
  "title": "embed diagnose probe",
  "body": "probe token: " + os.environ["TOKEN"],
  "frontmatter": {"type": "diagnostic", "probe": "note-search-embed-diagnose"},
}))
')"

PUT_RESP="$(curl -4 -sS -w "\n%{http_code}" \
  -X PUT \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "x-orbita-client-id: ${CLIENT_ID}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d "$PUT_BODY" \
  "${ORBITA_API_BASE%/}/v1/notes/${NOTE_ID}")"

PUT_HTTP="$(printf '%s' "$PUT_RESP" | tail -n1)"
PUT_JSON="$(printf '%s' "$PUT_RESP" | sed '$d')"

if [[ "$PUT_HTTP" != "200" ]]; then
  echo "error: PUT /v1/notes/${NOTE_ID} → HTTP ${PUT_HTTP}" >&2
  printf '%s' "$PUT_JSON" | python3 -c '
import json, sys
raw = sys.stdin.read().strip()
if not raw:
  sys.exit(0)
try:
  d = json.loads(raw)
except json.JSONDecodeError:
  print("(non-JSON error body omitted)", file=sys.stderr)
  sys.exit(0)
safe = {k: v for k, v in d.items() if k != "body"}
print(json.dumps(safe, indent=2), file=sys.stderr)
' || true
  exit 1
fi

META_STATUS="$(printf '%s' "$PUT_JSON" | python3 -c '
import json, sys

data = json.loads(sys.stdin.read())
meta = data.get("embedding_meta")
if meta is None:
    print("missing_meta")
    sys.exit(0)
if meta.get("indexed") is True:
    print("indexed")
    sys.exit(0)
failure = meta.get("failure")
print("not_indexed\t" + json.dumps(failure if failure is not None else meta))
')"

case "$META_STATUS" in
  missing_meta)
    echo "error: PUT succeeded but response has no embedding_meta (API older than T-0062?)." >&2
    exit 1
    ;;
  indexed)
    echo "embedding_meta.indexed=true"
    ;;
  not_indexed*)
    FAILURE_JSON="${META_STATUS#not_indexed	}"
    echo "error: embedding_meta.indexed=false failure=${FAILURE_JSON}" >&2
    exit 1
    ;;
  *)
    echo "error: unexpected embedding_meta parse result" >&2
    exit 1
    ;;
esac

SEARCH_RESP="$(curl -4 -sS -G -w "\n%{http_code}" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "x-orbita-client-id: ${CLIENT_ID}" \
  -H "Accept: application/json" \
  --data-urlencode "q=${TOKEN}" \
  --data-urlencode "top_k=8" \
  "${ORBITA_API_BASE%/}/v1/notes/search")"

SEARCH_HTTP="$(printf '%s' "$SEARCH_RESP" | tail -n1)"
SEARCH_JSON="$(printf '%s' "$SEARCH_RESP" | sed '$d')"

if [[ "$SEARCH_HTTP" != "200" ]]; then
  echo "error: GET /v1/notes/search → HTTP ${SEARCH_HTTP}" >&2
  exit 1
fi

FOUND="$(NOTE_ID="$NOTE_ID" printf '%s' "$SEARCH_JSON" | python3 -c '
import json, os, sys

data = json.loads(sys.stdin.read())
note_id = os.environ["NOTE_ID"]
for note in data.get("notes") or []:
    if note.get("id") == note_id:
        print("yes")
        break
')"

if [[ "$FOUND" != "yes" ]]; then
  echo "error: GET /v1/notes/search returned no hit for probe id ${NOTE_ID} despite embedding_meta.indexed=true." >&2
  echo "  Unexpected — check embed/search path or indexing delay." >&2
  exit 1
fi

echo "ok: probe note indexed and found via GET /v1/notes/search (id=${NOTE_ID})"
