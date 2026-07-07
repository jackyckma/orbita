---
status: active
maintained_by: jacky + ai-agents
created: 2026-07-07
purpose: How applications and AI orchestrators embed Orbita as a low-coupling Agent System Backend.
related: usr/ORBITA_DESIGN.md, docs/site/technical.html, docs/harness-design.md, docs/DEVELOPMENT_LANES.md
---

# Embed Orbita as an Agent System Backend

Orbita is an **Agent System Backend**: a separate HTTP service that runs agent turns (LLM + tools + memory + scheduling) while your application keeps domain logic, UI, and data ownership.

This matches `usr/ORBITA_DESIGN.md` — not a new product direction, but the clearest way to explain who calls Orbita and why.

---

## Two callers, one backend

| Caller | Example | Orbita role |
|--------|---------|-------------|
| **AI orchestrator** | Cursor, Codex, custom cron agent | Direct API client — creates sessions, sends turns |
| **Application** | ai-transformation.io, your SaaS | Domain app + optional thin integration layer; agent work delegated to Orbita |

Both use the same API: `Authorization: Bearer …` + `x-orbita-client-id: …`.

```text
┌─────────────────────┐         ┌──────────────────────────────┐
│  Your application   │         │  Orbita (Agent Backend)      │
│  UI, DB, business   │  HTTP   │  sessions · memory · tools   │
│  rules, publish     │◄───────►│  harness cron · trajectory   │
└─────────────────────┘         └──────────────────────────────┘
         ▲                                    ▲
         │                                    │
    Human users                          AI agent turns
```

**Low coupling:** the app never embeds an LLM loop. It stores object IDs, shows review UI, or forwards webhooks. Orbita holds agent state under a `client_id`.

---

## Deployment patterns

### A — Sidecar / separate service (recommended)

Run Orbita as its own process (Zeabur service, Docker container, or VM). Your app calls it over HTTPS.

- **Pros:** scale independently, rotate API keys, no agent code in app deploy
- **Cons:** network hop (usually fine for async/cron workloads)

### B — Self-hosted stack

Postgres + `orbita-api` on your infra. See `docs/self-host.md`.

### C — Hosted (Phase 1)

`api.get-orbita.com` with invite/waitlist API keys — same integration model as self-host.

**Not required:** Orbita inside your app process. State is externalized to Postgres by design.

---

## Minimal integration (5 steps)

1. **Issue API key** — admin or waitlist flow; allow-list one or more `client_id`s.
2. **Choose profile** — `default`, `research`, `marketing`, or custom static profile (`GET /v1/profiles`).
3. **Create session** — `POST /v1/sessions` with `{ "agent_profile": "…" }`.
4. **Send turns** — `POST /v1/sessions/{id}/messages` with structured `input`.
5. **Read outcomes** — assistant output, trajectory, and/or **client memory** keys your agent wrote (`GET /v1/memories/{key}`).

For **recurring work**, prefer **Harness** instead of app-managed cron:

```http
POST /v1/harnesses
{ "template_id": "cron-agent@v1", "name": "nightly-job", "overrides": { … } }
```

Templates: `cron-agent` (generic), `editorial-supply@v1` (dogfood preset).

---

## Reference pattern: ai-transformation.org (AT1b)

| Layer | Owner | Responsibility |
|-------|-------|----------------|
| **AT platform** | Application | Objects API, `/editorial`, publish, human review |
| **Orbita** | Agent backend | Research, draft writing, memory, daily cron |
| **Founder** | Human gate | Approve/reject on `/editorial` |

Flow:

1. Harness cron (07:00 UTC) → agent turn → `http_post` drafts to AT.
2. Agent writes `drafts/org/daily/{date}` and `editorial/*` memory keys.
3. Human reviews on AT (not in Orbita).
4. Poll harness (18:00 UTC) or app poll → append `editorial/feedback` memory.
5. Next supply run reads feedback and improves.

Orbita does **not** own publish state. The app does.

---

## What to put in Orbita vs your app

| Put in **Orbita** | Put in **your app** |
|-------------------|---------------------|
| Agent profiles, prompts, skills | Product UI, permissions, tenancy |
| Tool allow-list, credentials vault | Domain APIs (CRUD, workflows) |
| Long-term memory (`client_id` scope) | Canonical business records |
| Session turns, trajectory audit | Webhooks to your users |
| Scheduled harness runs | Human approval queues |

Use **memory key conventions** in your app layer (e.g. `editorial/feedback`, `drafts/pending/{id}`) — Orbita stores strings; schema is yours.

---

## Security model (embed checklist)

- [ ] One `client_id` per app/tenant/project (or deliberate sharing)
- [ ] API key allow-list includes only intended `client_id`s
- [ ] HTTP tool domains restricted (admin allow-list)
- [ ] Secrets in credentials vault — never in prompts
- [ ] Trajectory for audit; app stores external IDs for correlation

---

## Callbacks (optional, Phase 1+)

Harness config supports `output.mode: webhook` in schema; H1 default is **poll** (`GET /v1/harnesses/{id}/runs`, trajectory). Apps can:

- Poll run status after trigger
- Read memory keys the agent updated
- Subscribe to webhooks when platform ships generic event delivery

---

## Next docs

- [Technical reference](https://get-orbita.com/docs/technical.html) — auth, memory, tools
- [Harness design](./harness-design.md) — Loop 1 + 3 cron
- [Self-host](./self-host.md) — Docker/Zeabur
- [ORBITA_DESIGN](../usr/ORBITA_DESIGN.md) — long-term memory model (Client ID scope)
