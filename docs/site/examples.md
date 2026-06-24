---
title: Examples
description: Common Orbita API flows — tools, memory, scheduler, and inbound email.
nav_order: 3
---

# Examples

All requests need:

```
Authorization: Bearer <api_key>
x-orbita-client-id: <client_id>
```

## Echo tool (sanity check)

```http
POST /v1/sessions
{"agent_profile":"default"}

POST /v1/sessions/{id}/messages
{"input":{"type":"text","text":"Call echo with text ORBITA_OK"}}

GET /v1/sessions/{id}/trajectory
```

## Semantic memory

Store a note, then reference it in a later session (same `client_id`):

```http
PUT /v1/memories/project/notes
{"content":"Launch target: Q3 invite-only beta"}

POST /v1/sessions/{id}/messages
{"input":{"type":"text","text":"What do we know about launch timing? Check memory."}}
```

Agents with `memory_put` / `memory_get` tools can also read and write during turns.

## HTTP tools + credential vault

1. Admin → add credential `resend` (or other provider).
2. Admin → HTTP allow-list includes `api.resend.com`.
3. Session with `http_post` in profile — agent sends outbound mail using `credential_ref`, not raw secrets.

See [docs/instance-email.md](https://github.com/jackyckma/orbita/blob/main/docs/instance-email.md).

## Scheduled agent turns

Create a scheduler job with `task.type: "agent_message"` to run an LLM turn on a cron schedule (e.g. weekly marketing draft). Requires an existing session id.

## Inbound email (instance adapter)

For **replies to service signups** (verification links, not command-by-email):

1. Cloudflare Email Routing → `orbita@get-orbita.com` → **orbita-email-worker**
2. Worker `POST`s parsed mail to `/v1/inbound/email`
3. Orbita maps sender → session, stores raw mail in memory, runs one agent turn

Setup: [docs/cloudflare-email-worker.md](https://github.com/jackyckma/orbita/blob/main/docs/cloudflare-email-worker.md)

## Marketing agent profile

Dogfooding profile for draft-first content (no auto-publish):

```http
POST /v1/sessions
{"agent_profile":"marketing"}
```

Plan: [docs/use-cases/marketing-agent.md](https://github.com/jackyckma/orbita/blob/main/docs/use-cases/marketing-agent.md)
