#!/usr/bin/env bash
# Create Cloudflare Email Routing rule: orbita@get-orbita.com → orbita-email-worker
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOMAIN="get-orbita.com"
ADDRESS="orbita@${DOMAIN}"
WORKER_NAME="orbita-email-worker"
RULE_NAME="Orbita inbound → Worker"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "CLOUDFLARE_API_TOKEN required"
  exit 1
fi

CF_API="https://api.cloudflare.com/client/v4"
auth=(-H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json")

ZONE_JSON=$(curl -4 -sf "${CF_API}/zones?name=${DOMAIN}" "${auth[@]}")
ZONE_ID=$(python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('result',[]); print(r[0]['id'] if r else '')" <<<"$ZONE_JSON")

if [[ -z "$ZONE_ID" ]]; then
  echo "Zone not found for $DOMAIN"
  exit 1
fi

echo "==> zone $DOMAIN ($ZONE_ID)"

RULES_JSON=$(curl -4 -sf "${CF_API}/zones/${ZONE_ID}/email/routing/rules" "${auth[@]}")
EXISTING=$(python3 -c "
import json,sys
rules=json.load(sys.stdin).get('result',[])
for r in rules:
    for m in r.get('matchers',[]):
        if m.get('field')=='to' and m.get('value')=='$ADDRESS':
            print(r.get('id',''))
            raise SystemExit
" <<<"$RULES_JSON")

if [[ -n "$EXISTING" ]]; then
  echo "==> updating existing rule $EXISTING for $ADDRESS"
  curl -4 -sf -X PUT "${CF_API}/zones/${ZONE_ID}/email/routing/rules/${EXISTING}" "${auth[@]}" \
    -d "$(jq -n \
      --arg name "$RULE_NAME" \
      --arg addr "$ADDRESS" \
      --arg worker "$WORKER_NAME" \
      '{
        name: $name,
        enabled: true,
        matchers: [{ type: "literal", field: "to", value: $addr }],
        actions: [{ type: "worker", value: [$worker] }]
      }')" | jq '{success, id: .result.id, actions: .result.actions}'
else
  echo "==> creating rule for $ADDRESS → Worker $WORKER_NAME"
  curl -4 -sf -X POST "${CF_API}/zones/${ZONE_ID}/email/routing/rules" "${auth[@]}" \
    -d "$(jq -n \
      --arg name "$RULE_NAME" \
      --arg addr "$ADDRESS" \
      --arg worker "$WORKER_NAME" \
      '{
        name: $name,
        enabled: true,
        matchers: [{ type: "literal", field: "to", value: $addr }],
        actions: [{ type: "worker", value: [$worker] }]
      }')" | jq '{success, id: .result.id, actions: .result.actions}'
fi

echo "==> done. Send test mail to $ADDRESS"
