---
status: decided-direction
maintained_by: jacky + ai-agents
created: 2026-06-28
last_updated: 2026-06-28
purpose: Loop Engineering as optional Orbita infrastructure — Harness API, templates, phased delivery, AT dogfood migration.
related: usr/ORBITA_DESIGN.md, docs/product-architecture.md, docs/dogfood-plan.md, docs/at-track-plan.md
---

# Harness — Loop Engineering infrastructure (design)

**Status:** Direction decided · **not implemented**  
**Trigger:** [Loop Engineering](https://www.langchain.com/blog/the-art-of-loop-engineering) — stack agent, verification, event-driven, and improvement loops; Orbita should offer this as **optional infrastructure**, not mandatory for every caller.

---

## 1. Decision summary

| Decision | Choice |
|----------|--------|
| First **canonical** platform template | **`cron-agent`** (generic Loop 1 + 3) |
| First **application** preset | **`editorial-supply@v1`** (extends `cron-agent`; AT dogfood) |
| Core Harness API | **No AT-specific fields** (`objectType`, `catalog`, `editorial_source`, etc.) |
| Loop 2 / Loop 4 | **Optional per harness**; default **off** at H1 |
| Escape hatch | Flat `POST /v1/sessions` + `POST /v1/sessions/{id}/jobs` **remain** |
| Human gates | First-class at each enabled layer (poll / webhook / admin) |

**Rationale:** Dogfood proves value via `editorial-supply` preset; platform API stays clean for MA, future customers, and generic cron agents.

---

## 2. Loop stack mapping

| Loop | Name | Orbita today | Harness H1 |
|------|------|--------------|------------|
| **1** | Agent | Session turn + tool loop (`@orbita/agent`) | `loops.agent` → profile + task |
| **2** | Verification | None (human / external AT review agent) | `loops.verify` — **schema only, default disabled** |
| **3** | Event-driven | `@orbita/scheduler` session jobs (cron/webhook) | `loops.trigger` |
| **4** | Hill-climbing | Trajectory API; manual memory (`editorial/feedback`) | `loops.improve` — **schema only, default disabled** |

Today AT1b is a **manual stack**: `at1b-setup-daily-job.sh` + prompts/skills + `at1b-ingest-feedback.sh`. Harness **declarativizes** the orchestration; application semantics stay in profile/skill/prompt/template metadata.

---

## 3. Resources (conceptual)

```text
client_id
  └── harness/{harness_id}          persisted config (from template + overrides)
        └── run/{run_id}            one trigger execution (cron tick, manual, webhook)
              └── links to session_id, trajectory, status machine
```

| Resource | Owner | Notes |
|----------|-------|-------|
| **Harness** | Caller API (`client_id` scoped) | Long-lived config |
| **Harness run** | Platform | Ephemeral execution record |
| **Template** | Platform (read-only catalog) | `cron-agent`, `editorial-supply@v1`, … |
| **Session** | Existing | One run may create or reuse a session per template policy |

---

## 4. H1 API sketch (additive)

Base path proposal: `/v1/harnesses` (caller-authenticated, `x-orbita-client-id`).

### 4.1 Templates (read-only at H1)

```
GET /v1/harness-templates
GET /v1/harness-templates/{template_id}
```

Response includes: `extends`, JSON-schema-like `parameters`, default `loops` block, optional `application` metadata (non-normative for core validator).

### 4.2 Harness CRUD

```
POST   /v1/harnesses              instantiate from template + overrides
GET    /v1/harnesses
GET    /v1/harnesses/{id}
PATCH  /v1/harnesses/{id}         enable/disable layers, update cron (new runs only)
DELETE /v1/harnesses/{id}         soft-disable; do not delete run history
POST   /v1/harnesses/{id}/trigger manual run (optional H1)
```

### 4.3 Runs

```
GET /v1/harnesses/{id}/runs
GET /v1/harness-runs/{run_id}
```

Run payload includes: `status`, `started_at`, `finished_at`, `session_id`, `trigger` (`cron` | `manual` | `webhook`), `loops_executed`, link to `GET /v1/sessions/{id}/trajectory`.

Run statuses (H1): `queued` → `agent_running` → `completed` | `failed` (H2 adds `verifying`, `awaiting_human`, `retrying`).

### 4.4 Feedback (H1.5 — optional Loop 4 sink)

```
POST /v1/harnesses/{id}/feedback
```

Generic structured append (like `at1b-ingest-feedback.sh` but platform-native): `{ "text", "tags?", "source?" }` → configured memory key or harness-owned store. Does **not** auto-rewrite prompts.

### 4.5 Capabilities

Extend `GET /v1/capabilities` with:

```json
{
  "harness": {
    "templates": ["cron-agent", "editorial-supply@v1"],
    "loops": { "agent": true, "trigger": true, "verify": false, "improve": false }
  }
}
```

---

## 5. Core schema — `cron-agent` (canonical)

Minimal harness body (no application-specific fields):

```json
{
  "template_id": "cron-agent",
  "client_id": "my-client",
  "name": "daily-research",
  "loops": {
    "agent": {
      "enabled": true,
      "profile_id": "research",
      "task": {
        "mode": "message",
        "message": "Run daily research brief."
      }
    },
    "verify": {
      "enabled": false
    },
    "trigger": {
      "enabled": true,
      "cron": "0 7 * * *",
      "timezone": "UTC"
    },
    "improve": {
      "enabled": false
    }
  },
  "output": {
    "mode": "poll",
    "webhook_url": null,
    "emit_trajectory": true
  }
}
```

**Platform responsibilities (boilerplate absorbed from scripts):**

- Persist harness; compute `next_run_at` (reuse scheduler cron parsing)
- On trigger: ensure session (create or reuse per `session_policy`: `per_run` | `sticky` — AT uses **sticky** today via `at-daily-session` memory)
- Post task as agent message; run tool loop; record run + trajectory
- Enforce quotas (`client_id` daily session/message limits)
- Idempotency key on cron tick (avoid double-run on multi-replica — see §8)

**Caller responsibilities:**

- Profile, skills, tools, external HTTP targets (via existing allow-list + vault)

---

## 6. Application preset — `editorial-supply@v1`

Extends `cron-agent` via template defaults only:

```json
{
  "template_id": "editorial-supply",
  "template_version": 1,
  "extends": "cron-agent",
  "loops": {
    "agent": {
      "profile_id": "at-editorial",
      "task": { "mode": "prompt_ref", "ref": "at-agent/prompts/daily-submit.md" }
    },
    "trigger": { "cron": "0 7 * * *" }
  },
  "application": {
    "memory_keys": [
      "editorial/feedback",
      "editorial/backlog",
      "editorial/published-log",
      "editorial/research-recommendations"
    ],
    "session_memory_key": "at-daily-session",
    "external_write": {
      "credential_ref": "atx_write_org",
      "endpoint": "https://ai-transformation.io/api/v1/objects/drafts"
    }
  }
}
```

| Field block | In core OpenAPI? | Notes |
|-------------|------------------|-------|
| `loops.*` | **Yes** | Validated |
| `application.*` | **No** (opaque metadata) | Documented in template; used by preset docs + future admin UI |
| AT draft JSON shape | **No** | Lives in `daily-submit.md` + `at-editorial` skill |

Dedup against `GET …/objects/catalog` remains **agent tool behavior**, not a harness required field. Optional H2 grader may wrap the same URL as a generic `http_get` check.

---

## 7. Optional loops (post-H1)

### 7.1 Loop 2 — Verification

```json
"verify": {
  "enabled": true,
  "max_retries": 2,
  "graders": [
    { "type": "deterministic", "check": "json_schema", "schema_ref": "…" },
    { "type": "http", "method": "GET", "url": "…", "expect_status": 200 },
    { "type": "llm_judge", "rubric_ref": "…" }
  ],
  "on_fail": "retry_agent" | "fail_run" | "await_human"
}
```

Tradeoffs: latency, token cost, tension with AT1b volume-as-corpus goal → **default off**; AT preset enables only deterministic checks first.

### 7.2 Loop 4 — Improve

```json
"improve": {
  "enabled": true,
  "sink": { "type": "memory", "key": "editorial/feedback" },
  "suggest_only": true
}
```

H3+: periodic job analyzes runs + feedback → **suggested** harness/prompt diff for human merge (never auto-apply to bound session profile — session snapshot immutability unchanged).

---

## 8. System design impact

### 8.1 New lane (proposed: `@orbita/harness` or extend `@orbita/scheduler`)

| Component | Role |
|-----------|------|
| **Harness registry** | Postgres: harness rows, template id, config JSON, enabled |
| **Run orchestrator** | State machine; invokes existing session/message APIs internally |
| **Template registry** | Static JSON in repo at H1; DB-backed later |
| **Scheduler integration** | Harness trigger registers **one** platform cron per harness (or maps existing job) |

**Do not** embed loop logic inside `@orbita/agent` runtime — keep single-turn execution; orchestration is outer layer (matches design doc §12 scheduler intent).

### 8.2 Relationship to existing scheduler

Current model (`session_jobs` table):

- Job bound to **session_id** + `task.type: agent_message` + `cron`
- AT prod job: `0067edfc-3951-4859-bfc4-9f7c2add276c` @ `0 7 * * *`

Harness H1 may **wrap** this internally:

```text
harness (editorial-supply instance)
  → creates/updates underlying session_job OR
  → platform-owned harness_jobs table that calls session API on tick
```

Prefer **harness_jobs** table referencing `harness_id` + optional `legacy_session_job_id` for migration transparency.

### 8.3 Multi-replica / idempotency

Scheduler tick today runs per deployment replica unless leader election exists. Harness runs need:

- `run_id` + unique `(harness_id, cron_fingerprint)` per tick
- DB lease or `INSERT … ON CONFLICT` guard before starting agent turn

Document as **H1 acceptance criterion** before disabling legacy AT cron.

### 8.4 Quota & observability

- Each run counts against existing `client_id` daily quotas
- Trajectory events tagged `harness_id`, `harness_run_id`
- Admin: list harnesses / runs alongside scheduler jobs (extend w21–w25 observability)

### 8.5 Security

- Harness scoped to API key `allowed_client_ids`
- `application.external_write` uses existing `credential_ref` resolution — secrets never in harness JSON plaintext after create
- Human gates: webhook HMAC optional; poll status `awaiting_human` for approve flows (H2)

---

## 9. Migration — AT1b (`0067edfc`)

**Current state (dogfood prod):**

| Item | Value |
|------|-------|
| Session | `AT_DAILY_SESSION_ID` in `at-agent/.env.local` |
| Cron job | `0067edfc-3951-4859-bfc4-9f7c2add276c` |
| Profile | `at-editorial` |
| Setup script | `at-agent/scripts/at1b-setup-daily-job.sh` |

**Migration steps (when H1 ships):**

1. Ship `GET /v1/harness-templates` + `POST /v1/harnesses` behind same auth as sessions.
2. Add script `at-agent/scripts/at1b-setup-harness.sh` (parallel to daily-job script):
   - `POST /v1/harnesses` with `template_id: editorial-supply`, overrides for `client_id: content-ai-transformation-org`
   - Store returned `harness_id` in `at-agent/.env.local` as `AT_DAILY_HARNESS_ID`
3. **Parallel run (one cron cycle):** legacy job + harness both disabled except one — verify run parity via trajectory.
4. Disable legacy `session_jobs` row `0067edfc`; enable harness trigger only.
5. Deprecate direct `POST …/sessions/{id}/jobs` for AT1b in runbook; keep documented as escape hatch.

**Rollback:** Re-enable `0067edfc`; disable harness — no AT platform changes required.

**Feedback migration (H1.5):** Replace `at1b-ingest-feedback.sh` with `POST /v1/harnesses/{id}/feedback` targeting same memory key semantics.

---

## 10. Phased delivery

| Phase | Deliverable | Optional layers |
|-------|-------------|-----------------|
| **H0** | This doc + template JSON in repo; no API | — |
| **H1** | Templates GET; Harness CRUD; cron trigger; runs + trajectory link | verify/improve **disabled** | ✅ scaffold shipped (`@orbita/harness`) |
| **H1.5** | `POST …/feedback`; manual `POST …/trigger` | improve sink only |
| **H2** | Loop 2 deterministic + http graders; `awaiting_human` | verify |
| **H3** | Improve suggest job (human-approved config diffs) | improve |
| **H4** | Customer-defined templates; marketplace | — |

**Wave numbering:** Track as **W27 — Harness (Loop infrastructure)** in `docs/product-architecture.md` (post-dogfood platform work; does not block AT1b ongoing review).

---

## 11. Non-goals (H1)

- Auto-publish to AT or any external system without human editorial gate
- AT-specific fields in core OpenAPI schemas
- Hot-reload skills mid-session (profile snapshot immutability preserved)
- Fully automated Loop 4 prompt rewrites without human approval
- Replacing `/editorial` or AT editorial-review agent

---

## 12. Open questions — resolved (2026-06-28)

| Question | Decision |
|----------|----------|
| **Session policy default** | Template-level: `cron-agent` default **`sticky`** (reuse session + optional memory key); allow **`per_run`** override for stateless workers |
| **Harness PATCH versioning** | Increment **`config_version`** string on cron/config PATCH; runs record harness id only at H1 (config stamp in H2) |
| **Admin UI** | **API-only at H1** — list harnesses/runs via caller API; `/admin` harness panel deferred to H2 |
| **Webhook output** | **Deferred to H2** — H1 supports `output.mode: poll` only at runtime |

---

## 13. References

- Loop Engineering: https://www.langchain.com/blog/the-art-of-loop-engineering
- Orbita foundation: `usr/ORBITA_DESIGN.md` §12 Scheduler, §13 Trajectory
- AT dogfood: `docs/at-track-plan.md`, `at-agent/runbooks/editorial-pipeline.md`
- Current cron setup: `at-agent/scripts/at1b-setup-daily-job.sh`
- Editorial feedback (application-layer today): `at-agent/scripts/at1b-ingest-feedback.sh`, skill `packages/lane-profiles/profiles/skills/at-editorial.md`
