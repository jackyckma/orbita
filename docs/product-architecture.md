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
| Language | TypeScript (strict), Node 22 |
| HTTP | Hono + @hono/zod-openapi |
| Validation | Zod |
| Database | Postgres + pgvector (Drizzle ORM) |
| Monorepo | pnpm workspaces |
| Primary LLM (testing) | MiniMax-M3 (`MINIMAX_API_KEY`) |
| Fallback LLM | Anthropic (`ANTHROPIC_API_KEY`) |

## Lane status

| Lane | Name | Package | Status | Last shipped | Next up |
|------|------|---------|--------|--------------|---------|
| 0 | Platform | `@orbita/platform` | 🔄 In progress | Error envelope, health, logging | Rate limiting hooks |
| 1 | Auth | `@orbita/auth` | 🔄 In progress | API keys, client_id allow-list, admin CRUD | Scope enforcement on session routes |
| 2 | Profiles & Skills | `@orbita/profiles` | ⏳ Planned | — | Static agent_profile bundles |
| 3 | Sessions | `@orbita/sessions` | ⏳ Planned | — | Session CRUD + message history |
| 4 | Agent Runtime | `@orbita/agent` | ⏳ Planned | — | Turn loop, MiniMax provider, failover |
| 5 | Memory | `@orbita/memory` | ⏳ Planned | — | Client-scoped pgvector memory |
| 6 | Credentials | `@orbita/credentials` | ⏳ Planned | — | Write-once vault |
| 7 | Tools & Sandbox | `@orbita/tools` | ⏳ Planned | — | Local/Docker sandbox tier |
| 8 | Scheduler | `@orbita/scheduler` | ⏳ Planned | — | Cron jobs |
| 9 | Trajectory | `@orbita/trajectory` | ⏳ Planned | — | Structured audit API |

## Build waves

| Wave | Lanes | Goal |
|------|-------|------|
| **W0** (current) | 0, 1 | Docker, `GET /v1/health`, admin API keys, auth middleware |
| **W1** | 2, 3 | Sessions without LLM — create, poll messages |
| **W2** | 4, 6, 7 | First agent turn via MiniMax-M3 |
| **W3** | 5 + failover | Memory + Anthropic fallback |
| **W4** | 8, 9 | Scheduler + trajectory |

## HTTP surface (W0)

| Method | Path | Auth | Lane |
|--------|------|------|------|
| GET | `/v1/health` | none | 0 |
| GET | `/v1/openapi.json` | none | 0 |
| POST | `/v1/admin/api-keys` | admin token | 1 |
| DELETE | `/v1/admin/api-keys/{id}` | admin token | 1 |
| GET | `/v1/whoami` | Bearer + client_id | 1 |

## Identity flow

```text
Authorization: Bearer <api_key>
x-orbita-client-id: <client_id>

api_key → allowed_client_ids[] → client_id → (future) session → memory
```

## Dependency rule

Lanes communicate via **HTTP contracts and JSON schemas only**. No cross-import of another lane's `src/`.

## Deployment

1. Docker (local + home server)
2. Zeabur (GitHub-linked)
3. Localhost CLI (deferred)
