---
title: Embed as backend
description: Run Orbita as a separate Agent System Backend for your application or AI orchestrator.
nav_order: 5
---

# Embed Orbita as an Agent System Backend

Orbita is a **separate HTTP service** that runs agent turns while your application keeps domain logic, UI, and data.

## Who calls Orbita?

| Caller | Role |
|--------|------|
| **AI orchestrators** (Cursor, custom agents) | Direct API clients |
| **Your application** | Owns product data; delegates agent work to Orbita |

Same API for both: `Authorization: Bearer …` and `x-orbita-client-id: …`.

## Typical layout

```text
Your app (UI + domain API)  ←→  Orbita (sessions, memory, tools, cron)
```

Deploy Orbita on Zeabur, Docker, or self-host — **not** inside your app process.

## Quick integration

1. API key + `client_id`
2. `POST /v1/sessions` with an agent profile
3. `POST /v1/sessions/{id}/messages` for turns
4. Read results via message output, trajectory, or `GET /v1/memories/{key}`

For daily jobs, use **Harness** (`POST /v1/harnesses`, template `cron-agent@v1`).

## Dogfood example

**ai-transformation.org** uses Orbita to research and submit drafts; the AT platform owns editorial review and publish. See the full pattern in [embed-as-backend on GitHub](https://github.com/jackyckma/orbita/blob/main/docs/embed-as-backend.md).

## Related

- [Technical reference](./technical.html) — memory, tools, auth
- [Quick start](./quick-start.html) — first session
- [Examples](./examples.html) — memory tools
