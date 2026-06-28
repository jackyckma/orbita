---
status: active
maintained_by: ai-agents
created: 2026-06-20
last_updated: 2026-06-26
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
| 0 | Platform | `@orbita/platform` | ✅ Shipped | Errors, health, 429, quotas | Polish |
| 1 | Auth | `@orbita/auth` | ✅ Shipped | API keys, rate limits, device flow, daily quotas | **W15** accounts (deferred) |
| 2 | Profiles & Skills | `@orbita/profiles` | ✅ Shipped | `default`, `research`, `coding` | More examples; MA4 optional profile |
| 3 | Sessions | `@orbita/sessions` | ✅ Shipped | API + compression | E2E compress scenarios |
| 4 | Agent Runtime | `@orbita/agent` | ✅ Shipped | MiniMax + Anthropic tool loops | Structured output ideas (dogfood) |
| 5 | Memory | `@orbita/memory` | ✅ Shipped | pgvector + memory API | E2E semantic retrieval |
| 6 | Credentials | `@orbita/credentials` | ✅ Shipped | AES vault, admin | Batch import (optional) |
| 7 | Tools & Sandbox | `@orbita/tools` | ✅ Shipped | 7 tools + `docker_echo` | General sandbox; E2B |
| 8 | Scheduler | `@orbita/scheduler` | ✅ Shipped | cron, webhook, admin jobs list | Leader election (optional) |
| 9 | Trajectory | `@orbita/trajectory` | ✅ Shipped | replay + eval | LLM judge (future) |

**Lane 10 — Admin console:** `@orbita/admin` — ✅ W11+ (`/admin` UI, waitlist, usage, sessions, scheduler, key metering). See `docs/admin-ui-brainstorm.md`.

**Lane 12 — Harness:** `@orbita/harness` — 📋 W27 H1 (`cron-agent` + `editorial-supply` templates). See `docs/harness-design.md`.

**Lane 11 — Waitlist:** `@orbita/waitlist` — ✅ w20 approve → API key + optional ZSend invite.

## Application tracks (not lanes)

Work that **uses** Orbita but is **not** platform code — no `packages/lane-*` entry; private notes in per-project workspaces (gitignored).

| Track | Plan doc | Local workspace | Purpose |
|-------|----------|-----------------|---------|
| **Marketing Agent (MA)** | `docs/marketing-agent-plan.md` | `marketing-agent/` | Orbita + portfolio brands; gaps → `feedback-to-orbita.md` |
| **AT (ai-transformation.org)** | `docs/dogfood-plan.md` | TBD (AT workspace) | Research + writing via org Agent API — **first Dogfood week cycle** |

Milestones: **MA0…**, **AT0…** (parallel to **W0–Wn**, not lane numbers).

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
| **W15** | Multi-user accounts + whitelist register | ⏸️ Deferred (post-dogfood) |
| **W16** | Inbound email adapter + instance email | ✅ w16–w19 |
| **W17–W20** | Waitlist, approve, ZSend invite | ✅ Done |
| **W21–W26** | Admin observability, metering, daily quotas | ✅ Done |
| **W27** | Harness — optional Loop Engineering infra (`cron-agent` + templates) | 📋 Design — `docs/harness-design.md` |
| **W17+** | Billing / Stripe (Phase 2) | ⏸️ Deferred — `docs/api-as-product.md` |

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

### W15–W16 — Multi-user (deferred)

- W15: `accounts`, email whitelist register, `/v1/me/*`, revoke-all-access
- W16 (roadmap): system admin (ban users, cross-tenant monitoring, audit)
- **Shipped W16 lane work:** inbound email (`POST /v1/inbound/email`), instance outbound (ZSend)
- Details: `docs/admin-ui-brainstorm.md` §8

### W17–W26 — Phase 1 product + quota prep (shipped)

- Waitlist API + admin approve → API key + optional invite email (w20)
- Admin: usage summary, cross-client sessions, trajectory replay, scheduler jobs, per-key metering (w21–w25)
- Daily quota hard-stop: `ORBITA_QUOTA_SESSIONS_PER_DAY` / `ORBITA_QUOTA_MESSAGES_PER_DAY` (w26)

### Product direction

- **Next milestone:** Dogfood validation — `docs/dogfood-plan.md` (not W15 yet)
- **Loop infrastructure (optional):** W27 Harness — `docs/harness-design.md` (`cron-agent` canonical template; `editorial-supply@v1` preset for AT)
- **Admin UI & identity** — `docs/admin-ui-brainstorm.md`
- **API as hosted product** — Phase 1 ✅ invite + waitlist: `docs/api-as-product.md`
- **Loose ends** — `docs/loose-ends-checklist.md`

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

**Also shipped:** `/v1/waitlist`, `/v1/admin/waitlist/*`, `/v1/admin/usage/*`, `/v1/admin/sessions`, `/v1/admin/scheduler/jobs`, `/v1/inbound/email`, `/v1/auth/device` (W12).

**Planned:** `/v1/me/*` (W15).

## Identity flow (today)

```text
Authorization: Bearer <api_key>
x-orbita-client-id: <client_id>

api_key → allowed_client_ids[] → client_id → session → memory
```

**Planned credential taxonomy:** `docs/admin-ui-brainstorm.md` §3.

## Deployment

1. Docker (local + home server) — `docker compose up`
2. Zeabur (Ocean) — https://api.get-orbita.com — Git deploy from `main` (service `6a37d3a09f5fe35a4aa63552`)
3. Marketing — https://get-orbita.com (`apps/orbita-web`, Cloudflare Pages)
4. Localhost CLI — deferred

## W7 delivery note

Cloud orchestrate run failed (invalid worker model). W7 was implemented directly on `main` (cron scheduler, webhook delivery, Postgres rate limits).
