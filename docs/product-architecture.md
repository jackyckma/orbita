---
status: active
maintained_by: ai-agents
created: 2026-06-20
last_updated: 2026-06-22
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
| 0 | Platform | `@orbita/platform` | ✅ Shipped | Errors, health, 429 + Retry-After | W12 capabilities auth metadata; W16 admin metrics |
| 1 | Auth | `@orbita/auth` | ✅ Shipped | API keys, rate limits, list keys | **W12** device flow; **W15** accounts |
| 2 | Profiles & Skills | `@orbita/profiles` | ✅ Shipped | `default`, `research`, `coding` + skills | W13 `GET /v1/profiles`; W13 profile examples |
| 3 | Sessions | `@orbita/sessions` | ✅ Shipped | API + LLM compression | W13 E2E compress scenarios |
| 4 | Agent Runtime | `@orbita/agent` | ✅ Shipped | MiniMax + Anthropic tool loops | W12 capabilities auth discovery |
| 5 | Memory | `@orbita/memory` | ✅ Shipped | pgvector + memory API | W13 E2E semantic retrieval |
| 6 | Credentials | `@orbita/credentials` | ✅ Shipped | AES vault, admin list + create | W12 optional batch import |
| 7 | Tools & Sandbox | `@orbita/tools` | ✅ Shipped | 7 tools + HTTP policy + `docker_echo` | General sandbox commands; E2B |
| 8 | Scheduler | `@orbita/scheduler` | ✅ Shipped | `every_seconds`, cron, webhook | W16 scheduler leader / admin visibility |
| 9 | Trajectory | `@orbita/trajectory` | ✅ Shipped | replay API + eval helpers | W13 website examples; future LLM judge |

**Lane 10 — Admin console:** `@orbita/admin` — ✅ W11 shipped (`/admin` UI, session cookie, deployment HTTP domains). See `docs/admin-ui-brainstorm.md`.

## Application tracks (not lanes)

Work that **uses** Orbita but is **not** platform code — no `packages/lane-*` entry; private notes in **`marketing-agent/`** (gitignored).

| Track | Plan doc | Local workspace | Purpose |
|-------|----------|-----------------|---------|
| **Marketing Agent (MA)** | `docs/marketing-agent-plan.md` | `marketing-agent/` | Dogfood API as caller; gaps → `feedback-to-orbita.md` → may become **W** waves |

Milestones: **MA0, MA1, …** (parallel to **W0–Wn**, not lane numbers).

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
| **W10** | 9 replay/eval + multi-replica ops | ✅ Done |
| **W11** | Admin console Phase 1 (single-user) | ✅ Done |
| **W12** | Device auth flow + capabilities/OpenAPI auth | ✅ Done |
| **W13** | Self-host polish, E2E examples, api subdomain | ✅ Done |
| **W14** | Docker sandbox (tools) | ✅ Done (docker_echo tier) |
| **W15** | Multi-user accounts + whitelist register | 📋 Roadmap |
| **W16** | System admin role + observability | 📋 Roadmap |
| **W17+** | Hosted SaaS (if decided) | 📝 Draft — `docs/api-as-product.md` |

### W11 — Admin console Phase 1 (shipped)

- Package `@orbita/admin` — session cookie login, static UI at `/admin`
- `GET /v1/admin/api-keys`, settings, credentials list
- `PUT /v1/admin/settings/http-domains` — DB-backed HTTP tool policy override
- Docs: `docs/admin-ui-brainstorm.md`, `packages/lane-admin/INTERFACE.md`

### W12 — Auth UX & discovery (shipped)

- Device flow: `POST /v1/auth/device`, poll, `/admin/device` approval
- `GET /v1/capabilities` includes `auth` metadata
- `scripts/admin-device-login.sh`

### W13 — Self-host & examples (shipped)

- `GET /v1/profiles`, `GET /v1/profiles/{id}` — public profile catalog
- `docs/self-host.md`, `scripts/self-host-smoke.sh`, `scripts/cloudflare-dns-api.sh`
- Marketing site Examples section; Tier A profiles E2E test

### W14 — Docker sandbox (shipped)

- `ORBITA_SANDBOX_DOCKER=1` exposes `docker_echo` tool (`alpine:3.20`, `--network=none`)
- `docs/sandbox.md`

### W15–W16 — Multi-user (roadmap)

- W15: `accounts`, email whitelist register, `/v1/me/*`, revoke-all-access
- W16: system admin (ban users, cross-tenant monitoring, audit)
- Details: `docs/admin-ui-brainstorm.md` §8

### Product direction (draft)

- **Admin UI & identity** — decided direction: `docs/admin-ui-brainstorm.md`
- **Personal / self-host** — skills/tools guide, E2E ideas: `docs/self-host-and-extensions.md`
- **API as hosted SaaS** — not decided: `docs/api-as-product.md`

### W10 — Ops & trajectory replay (shipped)

- `GET /v1/sessions/{id}/trajectory/replay` — audit timeline + counts
- `buildTrajectoryReplay`, `evaluateTrajectory` in `@orbita/trajectory`
- `scripts/replay-trajectory.sh`, `scripts/eval-session.sh`
- `docs/ops-multi-replica.md`, `docs/eval-tooling.md`

### W8 — E2E harness (shipped)

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

## HTTP surface (today)

| Method | Path | Lane |
|--------|------|------|
| GET | `/v1/health` | 0 |
| GET | `/v1/openapi.json` | 0 |
| GET | `/v1/profiles` | 2 |
| GET | `/v1/profiles/{id}` | 2 |
| POST/DELETE/GET | `/v1/admin/api-keys` | 1 + 10 |
| POST/GET | `/v1/admin/credentials` | 6 + 10 |
| POST/GET/DELETE | `/v1/admin/session` | 10 |
| GET/PUT | `/v1/admin/settings` | 10 |
| GET | `/admin` | 10 (static console) |
| GET | `/v1/credentials` | 6 |
| POST/GET/DELETE | `/v1/sessions` | 3 |
| GET/POST | `/v1/sessions/{id}/messages` | 3 + 4 |
| POST | `/v1/sessions/{id}/compress` | 3 |
| PUT | `/v1/memories/{key}` | 5 |
| GET | `/v1/memories` | 5 |
| GET | `/v1/sessions/{id}/trajectory` | 9 |
| GET | `/v1/sessions/{id}/trajectory/replay` | 9 |
| POST | `/v1/sessions/{id}/jobs` | 8 |

**Planned:** `/v1/admin/*` observability (W16), `/v1/auth/device` (W12), `/v1/me/*` (W15), admin static UI (W11).

## Identity flow (today)

```text
Authorization: Bearer <api_key>
x-orbita-client-id: <client_id>

api_key → allowed_client_ids[] → client_id → session → memory
```

**Planned credential taxonomy:** `docs/admin-ui-brainstorm.md` §3.

## Deployment

1. Docker (local + home server) — `docker compose up`
2. Zeabur (Ocean) — https://orbita-api.zeabur.app — Git deploy from `main`
3. Marketing — https://get-orbita.com (`apps/orbita-web`, Cloudflare Pages)
4. Localhost CLI — deferred

## W7 delivery note

Cloud orchestrate run failed (invalid worker model). W7 was implemented directly on `main` (cron scheduler, webhook delivery, Postgres rate limits).
