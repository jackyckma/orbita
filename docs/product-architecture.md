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
| 0 | Platform | `@orbita/platform` | ✅ Shipped | Errors, health, I/O types, logging | **W7:** rate-limit middleware |
| 1 | Auth | `@orbita/auth` | ✅ Shipped | API keys, client_id allow-list | **W7:** per-key rate limits |
| 2 | Profiles & Skills | `@orbita/profiles` | ✅ Shipped | `default` + `core` skill | **W9:** profile library + richer skills |
| 3 | Sessions | `@orbita/sessions` | ✅ Shipped | API + LLM compression | Tune keep-recent; E2E compress scenarios (W8) |
| 4 | Agent Runtime | `@orbita/agent` | ✅ Shipped | MiniMax failover, tool loop, summarizer | **W9:** Anthropic tool loop; tool trajectory hooks |
| 5 | Memory | `@orbita/memory` | ✅ Shipped | pgvector + memory API | E2E semantic retrieval (W8); embedding options |
| 6 | Credentials | `@orbita/credentials` | ✅ Shipped | AES vault, admin + list | Rotation; E2E credential+http_get (W8) |
| 7 | Tools & Sandbox | `@orbita/tools` | ✅ Shipped | `echo`, `http_get` (local) | **W9:** `http_post`, domain allow-list, more tools |
| 8 | Scheduler | `@orbita/scheduler` | ✅ Shipped | `every_seconds` + cron jobs, webhook delivery helper | Multi-replica execution coordination (W10) |
| 9 | Trajectory | `@orbita/trajectory` | ✅ Shipped | API + turn logging | **W10:** replay tooling; per-tool events (W9) |

## Build waves

| Wave | Lanes / scope | Status |
|------|---------------|--------|
| **W0** | 0, 1 | ✅ Done |
| **W1** | 2, 3 | ✅ Done |
| **W2** | 4 | ✅ Done |
| **W3** | 5 + failover | ✅ Done (text memory → pgvector in W6) |
| **W4** | 8, 9 | ✅ Trajectory + scheduler foundation shipped |
| **W5** | 6, 7 + tool loop | ✅ Done |
| **W6** | 3 compression + 5 pgvector | ✅ Done (code on `main`; prod deploy may lag) |
| **W7** | 8 cron/webhook + 0/1 rate limiting | 🔄 In progress (orchestrate) |
| **W8** | E2E harness + prod smoke automation | ⏳ Planned — **elevated priority** |
| **W9** | 2 skills library + 7 practical tools + tool trajectory | ⏳ Planned — **elevated priority** |
| **W10** | 9 replay/eval + multi-replica ops | ⏳ Planned |

### W8 — E2E harness (elevated)

Cross-cutting quality lane, not a product feature lane:

- **Tier A:** Docker Compose + Postgres/pgvector; HTTP contract tests without live LLM (mock `AgentTurnRunner` / summarizer).
- **Tier B:** Optional `E2E_LLM=1` integration tests with real MiniMax keys.
- **`scripts/smoke-prod.sh`:** Zeabur smoke (health → key → session → tool turn → memory → trajectory).
- Wire into `scripts/agent-verify.sh` or CI nightly.

### W9 — Skills & tools productization (elevated)

Aligns with design §7 (static session-locked skills) and §8 (sandbox tools):

**Skills (Lane 2):**
- Additional profiles (`research`, `coding`, …) with dedicated skill markdown sets.
- Expand `profiles/skills/` beyond `core.md`; document skill authoring conventions.
- Still no hot-reload or third-party upload in v1.

**Tools (Lane 7):**
- `http_post`, structured JSON helpers, common integrations (credential_ref pattern).
- HTTPS domain allow-list; timeouts; trajectory `tool_call_*` events.
- Docker sandbox tier remains roadmap (design §8), not W9 blocker.

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

## Orchestrate (W7)

Root planner kickoff goal: scheduler cron/webhook + per-key rate limiting.

Track: https://cursor.com/agents/bc-b223944d-223d-4de9-8dc8-910f7d8faee1

Local follow-up (after planner commits `state.json` to a branch):

```bash
bun <orchestrate>/scripts/cli.ts crawl /home/jackyma/orbita <branch> <root-slug>
bun <orchestrate>/scripts/cli.ts status .orchestrate/<root-slug>
```
