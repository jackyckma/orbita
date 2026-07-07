#!/usr/bin/env bash
# Poll AT for editorial outcomes on tracked draft ids → append Orbita editorial/feedback.
# Deterministic operator fallback; daily loop prefers at-editorial poll harness (agent-initiated).
#
# Usage:
#   ./scripts/at1b-poll-editorial-outcomes.sh
#   ./scripts/at1b-poll-editorial-outcomes.sh --dry-run
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AT_AGENT="$ROOT/at-agent"

if [[ -f "$AT_AGENT/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$AT_AGENT/.env.local"
  set +a
elif [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

: "${ORBITA_API_BASE:=${ORBITA_API_URL:-https://api.get-orbita.com}}"
: "${AT_API_BASE:=https://ai-transformation.io}"
: "${AT_ORBITA_API_KEY:?}"
: "${AT_ORBITA_CLIENT_ID:=content-ai-transformation-org}"
: "${AT_WRITE_BEARER:?Set AT_WRITE_BEARER in at-agent/.env.local}"
: "${AT_DAILY_HARNESS_ID:?Set AT_DAILY_HARNESS_ID}"
: "${AT_POLL_HARNESS_ID:=${AT_DAILY_HARNESS_ID}}"

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

AUTH=(-H "Authorization: Bearer $AT_ORBITA_API_KEY" -H "x-orbita-client-id: $AT_ORBITA_CLIENT_ID")

python3 - "$ORBITA_API_BASE" "$AT_API_BASE" "$AT_POLL_HARNESS_ID" "$DRY_RUN" <<'PY'
import datetime
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

orbita_base, at_base, harness_id, dry_run = sys.argv[1:5]
dry_run = dry_run == "true"
auth_headers = {
    "Authorization": f"Bearer {os.environ['AT_ORBITA_API_KEY']}",
    "x-orbita-client-id": os.environ.get("AT_ORBITA_CLIENT_ID", "content-ai-transformation-org"),
}
at_bearer = os.environ["AT_WRITE_BEARER"]

def http(method, url, headers=None, body=None):
    req = urllib.request.Request(url, method=method, headers=headers or {})
    req.add_header("User-Agent", "orbita-at-agent/1.0")
    if body is not None:
        req.data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())

def http_or_none(method, url, headers=None):
    try:
        return http(method, url, headers)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise

today = datetime.datetime.now(datetime.timezone.utc).date()
lookback = [today - datetime.timedelta(days=i) for i in range(8)]

mem_list = http("GET", f"{orbita_base}/v1/memories", auth_headers).get("memories", [])
daily_keys = sorted(
    m["key"] for m in mem_list if m.get("key", "").startswith("drafts/org/daily/")
)

if not daily_keys:
    print("==> no drafts/org/daily/* memory keys — nothing to poll")
    sys.exit(0)

appended = 0
updated_keys = []

for key in daily_keys:
    enc = urllib.parse.quote(key, safe="")
    row = http_or_none("GET", f"{orbita_base}/v1/memories/{enc}", auth_headers)
    if not row:
        continue
    try:
        batch = json.loads(row.get("content") or "{}")
    except json.JSONDecodeError:
        continue
    objects = batch.get("objects") or batch.get("drafts") or []
    if not isinstance(objects, list):
        continue
    changed = False
    for obj in objects:
        if not isinstance(obj, dict):
            continue
        oid = obj.get("id") or obj.get("object_id")
        if not oid:
            continue
        if obj.get("feedback_appended") and obj.get("last_seen_status") in ("published", "archived"):
            continue

        at_row = http(
            "GET",
            f"{at_base}/api/v1/objects/{oid}",
            {"Authorization": f"Bearer {at_bearer}"},
        )
        item = (at_row.get("object") or at_row) if isinstance(at_row, dict) else {}
        status = item.get("status")
        meta = item.get("metadata") or {}
        review = meta.get("editorial_review")
        title = obj.get("title") or item.get("title") or oid

        decision = None
        if status == "published" and review == "approved":
            decision = "approved"
        elif status == "archived" and review == "rejected":
            decision = "rejected"
        elif status in ("published", "archived"):
            decision = status

        if not decision or decision == "draft":
            obj["last_seen_status"] = status
            changed = True
            continue

        if obj.get("feedback_appended") and obj.get("last_seen_status") == status:
            continue

        agent = meta.get("editorial_agent") or {}
        agent_bit = ""
        if isinstance(agent, dict) and not agent.get("skipped"):
            agent_bit = f" AT agent: {agent.get('summary') or agent.get('score') or 'reviewed'}."

        comment = meta.get("editorial_comment")
        comment_bit = ""
        if comment:
            comment_bit = f' Founder comment: "{comment}".'

        review_at = meta.get("editorial_review_at") or item.get("updatedAt")

        text = (
            f"[{decision}] {title} (id={oid})."
            f"{comment_bit}"
            f"{agent_bit}"
            f" Batch {batch.get('batch_date') or key.split('/')[-1]}."
        )
        tags = ["at_poll", decision]
        if meta.get("pillar"):
            tags.append(str(meta["pillar"]))

        print(f"{'[dry-run] ' if dry_run else ''}feedback: {text[:120]}…")

        if not dry_run:
            http(
                "POST",
                f"{orbita_base}/v1/harnesses/{harness_id}/feedback",
                auth_headers,
                {"text": text, "tags": tags, "source": "at_poll"},
            )
            appended += 1

        obj["last_seen_status"] = status
        obj["feedback_appended"] = True
        obj["decision"] = decision
        changed = True

    if changed and not dry_run:
        http(
            "PUT",
            f"{orbita_base}/v1/memories/{enc}",
            auth_headers,
            {"content": json.dumps(batch)},
        )
        updated_keys.append(key)

print(f"==> appended {appended} feedback entries; updated {len(updated_keys)} batch keys")
PY
