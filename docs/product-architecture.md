---
status: active
maintained_by: ai-agents
created: 2026-06-20
last_updated: 2026-06-20
purpose: Lane map, build status, and system wiring for Orbita.
---

# Orbita — Product Architecture

Agent-native, API-first agent system. Foundation spec: `usr/ORBITA_DESIGN.md`.

## Stack

| Layer | Choice |
|-------|--------|
| Language | TypeScript (strict), Node 20+ |
| HTTP | Hono + @hono/zod-openapi |
| Validation | Zod |
| Database | Postgres (pgvector image; semantic search deferred) |
| Monorepo | pnpm workspaces |
| Primary LLM | MiniMax-M3 (`MINIMAX_API_KEY`) |
| Fallback LLM | Anthropic (`ANTHROPIC_API_KEY`) |

## Lane status

| Lane | Name | Package | Status | Last shipped | Next up |
|------|------|---------|--------|--------------|---------|
| 0 | Platform | `@orbita/platform` | ✅ Shipped | Errors, health, I/O types, logging | Rate limiting |
| 1 | Auth | `@orbita/auth` | ✅ Shipped | API keys, client_id allow-list | Rate limits per key |
| 2 | Profiles & Skills | `@orbita/profiles` | ✅ Shipped | Static profiles, session-bound snapshot | Additional profiles |
| 3 | Sessions | `@orbita/sessions` | ✅ Shipped | Full session API + polling | Real compression |
| 4 | Agent Runtime | `@orbita/agent` | ✅ Shipped | MiniMax + Anthropic failover | Tool loop |
| 5 | Memory | `@orbita/memory` | 🔄 Partial | Text memory per client_id | pgvector embeddings |
| 6 | Credentials | `@orbita/credentials` | ⏳ Planned | — | Write-once vault |
| 7 | Tools & Sandbox | `@orbita/tools` | ⏳ Planned | — | Local sandbox tier |
| 8 | Scheduler | `@orbita/scheduler` | 🔄 Partial | `every_seconds` jobs | Cron expressions |
| 9 | Trajectory | `@orbita/trajectory` | ✅ Shipped | API + turn logging | Replay tooling |

## Build waves

| Wave | Lanes | Status |
|------|-------|--------|
| **W0** | 0, 1 | ✅ Done |
| **W1** | 2, 3 | ✅ Done |
| **W2** | 4 | ✅ Done (MiniMax verified) |
| **W3** | 5 + failover | 🔄 Memory text store; failover ✅ |
| **W4** | 8, 9 | 🔄 Trajectory ✅; scheduler partial |

## HTTP surface

| Method | Path | Lane |
|--------|------|------|
| GET | `/v1/health` | 0 |
| GET | `/v1/openapi.json` | 0 |
| GET | `/v1/capabilities` | 4 |
| POST/DELETE | `/v1/admin/api-keys` | 1 |
| POST/GET/DELETE | `/v1/sessions` | 3 |
| GET/POST | `/v1/sessions/{id}/messages` | 3 + 4 |
| POST | `/v1/sessions/{id}/compress` | 3 |
| GET | `/v1/sessions/{id}/trajectory` | 9 |
| POST | `/v1/sessions/{id}/jobs` | 8 |

## Identity flow

```text
Authorization: Bearer <api_key>
x-orbita-client-id: <client_id>

api_key → allowed_client_ids[] → client_id → session → memory
```

## Deployment

1. Docker (local + home server) — `docker compose up`
2. Zeabur — **not configured yet** (needs project/service IDs)
3. Localhost CLI — deferred
