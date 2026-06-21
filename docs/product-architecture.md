---
status: active
maintained_by: ai-agents
created: 2026-06-20
last_updated: 2026-06-21
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
| Database | Postgres + pgvector |
| Monorepo | pnpm workspaces |
| Primary LLM | MiniMax-M3 (`MINIMAX_API_KEY`) |
| Fallback LLM | Anthropic (`ANTHROPIC_API_KEY`) |

## Lane status

| Lane | Name | Package | Status | Last shipped | Next up (prioritized) |
|------|------|---------|--------|--------------|------------------------|
| 0 | Platform | `@orbita/platform` | ✅ Shipped | Errors, health, 429 + Retry-After | W8 E2E; ops notes (W10) |
| 1 | Auth | `@orbita/auth` | ✅ Shipped | API keys, per-key rate limits | W8 rate-limit E2E |
| 2 | Profiles & Skills | `@orbita/profiles` | ✅ Shipped | `default`, `research`, `coding` + skills | W10 eval profiles |
| 3 | Sessions | `@orbita/sessions` | ✅ Shipped | API + LLM compression | Tune keep-recent; E2E compress scenarios (W8) |
| 4 | Agent Runtime | `@orbita/agent` | ✅ Shipped | MiniMax + Anthropic tool loops | W10 replay hooks |
| 5 | Memory | `@orbita/memory` | ✅ Shipped | pgvector + memory API | E2E semantic retrieval (W8); embedding options |
| 6 | Credentials | `@orbita/credentials` | ✅ Shipped | AES vault, admin + list | Rotation; E2E credential+http_get (W8) |
| 7 | Tools & Sandbox | `@orbita/tools` | ✅ Shipped | 7 tools + HTTP domain policy | Docker sandbox (roadmap) |
| 8 | Scheduler | `@orbita/scheduler` | ✅ Shipped | `every_seconds`, cron, webhook | W8 cron E2E scenarios |
| 9 | Trajectory | `@orbita/trajectory` | ✅ Shipped | turn + `tool_call_*` events | **W10:** replay tooling |

## Build waves

| Wave | Lanes / scope | Status |
|------|---------------|--------|
| **W0** | 0, 1 | ✅ Done |
| **W1** | 2, 3 | ✅ Done |
| **W2** | 4 | ✅ Done |
| **W3** | 5 + failover | ✅ Done (text memory → pgvector in W6) |
| **W4** | 8, 9 | ✅ Done |
| **W5** | 6, 7 + tool loop | ✅ Done |
| **W6** | 3 compression + 5 pgvector | ✅ Done |
| **W7** | 8 cron/webhook + 0/1 rate limiting | ✅ Done |
| **W8** | E2E harness + prod smoke automation | ✅ Done |
| **W9** | 2 skills library + 7 practical tools + tool trajectory | ✅ Done |
| **W10** | 9 replay/eval + multi-replica ops | ⏳ Next |

### W8 — E2E harness (elevated)

Cross-cutting quality lane, not a product feature lane:

- **Tier A:** Docker Compose + Postgres/pgvector; HTTP contract tests without live LLM (mock `AgentTurnRunner` / summarizer).
- **Tier B:** Optional `E2E_LLM=1` integration tests with real MiniMax keys.
- **`scripts/smoke-prod.sh`:** Zeabur smoke (health → key → session → tool turn → memory → trajectory).
- Wire into `scripts/agent-verify.sh` or CI nightly.

## W9 — Tools & skills (shipped)

- Tools: `echo`, `http_get`, `http_post`, `json_parse`, `json_stringify`, `hash_sha256`, `uuid_v4`
- HTTP: `ORBITA_HTTP_ALLOWED_DOMAINS`, `ORBITA_HTTP_TIMEOUT_MS`
- Profiles: `default`, `research`, `coding` — see `docs/skills-authoring.md`
- Trajectory: `tool_call_start`, `tool_call_complete`

## HTTP surface

| Method | Path | Lane |
|--------|------|------|
| GET | `/v1/health` | 0 |
| GET | `/v1/openapi.json` | 0 |
| GET | `/v1/capabilities` | 4 |
| POST/DELETE | `/v1/admin/api-keys` | 1 |
| POST | `/v1/admin/credentials` | 6 |
| GET | `/v1/credentials` | 6 |
| POST/GET/DELETE | `/v1/sessions` | 3 |
| GET/POST | `/v1/sessions/{id}/messages` | 3 + 4 |
| POST | `/v1/sessions/{id}/compress` | 3 |
| PUT | `/v1/memories/{key}` | 5 |
| GET | `/v1/memories` | 5 |
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
2. Zeabur (Ocean) — https://orbita-api.zeabur.app — Git deploy from `main`
3. Localhost CLI — deferred

## W7 delivery note

Cloud orchestrate run failed (invalid worker model). W7 was implemented directly on `main` (cron scheduler, webhook delivery, Postgres rate limits).

