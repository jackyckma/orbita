---
title: Quick start
description: Create an API key, session, and first agent turn over HTTP.
nav_order: 2
---

# Quick start

Replace `API_KEY`, `CLIENT_ID`, and `API` with your values. Production base URL: `https://api.get-orbita.com`.

## 1. Create an API key (admin)

```bash
export API=https://api.get-orbita.com
export ADMIN_TOKEN=your-admin-token

curl -sS -X POST "$API/v1/admin/api-keys" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"label":"my-agent","allowed_client_ids":["my-project"]}'
```

Save the returned `api_key` (shown once).

## 2. Create a session

```bash
export API_KEY=orb_...
export CLIENT_ID=my-project

curl -sS -X POST "$API/v1/sessions" \
  -H "Authorization: Bearer $API_KEY" \
  -H "x-orbita-client-id: $CLIENT_ID" \
  -H "Content-Type: application/json" \
  -d '{"agent_profile":"default"}'
```

Note the `id` in the response.

## 3. Send a message (one turn)

```bash
export SESSION_ID=...

curl -sS -X POST "$API/v1/sessions/$SESSION_ID/messages" \
  -H "Authorization: Bearer $API_KEY" \
  -H "x-orbita-client-id: $CLIENT_ID" \
  -H "Content-Type: application/json" \
  -d '{"input":{"type":"text","text":"Use the echo tool with text HELLO and summarize the result."}}'
```

Each `POST .../messages` runs an internal **ReAct loop** (tool calls until the model finishes or hits the iteration cap).

## 4. Inspect trajectory

```bash
curl -sS "$API/v1/sessions/$SESSION_ID/trajectory" \
  -H "Authorization: Bearer $API_KEY" \
  -H "x-orbita-client-id: $CLIENT_ID"
```

## Verify scripts

From repo root after local setup:

```bash
./scripts/agent-verify.sh      # local smoke
./scripts/smoke-prod.sh        # production smoke
```

## Next

- [Examples](./examples.html) — memory, HTTP tools, scheduler
- [Technical reference](./technical.html) — auth, profiles, OpenAPI
