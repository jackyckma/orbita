---
status: proposed
maintained_by: jacky
created: 2026-08-07
updated: 2026-08-07
purpose: Mid-line product direction — Orbita as multi-project central hub (reports in, instructions out).
related: docs/personal-steward/, docs/autopilot/roadmap.json (E-07), docs/DEVELOPMENT_LANES.md, ai-dev-methodologies
---

# Portfolio hub (mid-line)

Sketch: [portfolio-hub-sketch.png](./portfolio-hub-sketch.png)

## Intent

Reduce founder mental load across portfolio projects by making Orbita the **agent-facing hub**:

1. **Collect** — Orbita **pulls** project reports on a schedule (unified report API per project).
2. **Brief** — you talk to Claude/ChatGPT; they read Orbita and summarize what happened / what needs you.
3. **Dispatch** — after discussion at the **Claude layer** (human gate), instructions land in Orbita and flow into each repo’s Autopilot → commit `main` → that repo’s CI deploys.

Near-term Autopilot fuel remains E-02…E-04. This doc is the mid-line contract.

**How to execute (founder):** [`docs/autopilot/founder-guide.md`](../autopilot/founder-guide.md) — feeding Orbita Autopilot tasks + coordinating other repos / Claude / framework.

## Founder leanings (2026-08-07)

| Topic | Decision / lean |
|-------|-----------------|
| Tag / type vocabulary | **A** — curated registry with description + scope (not free-string tags as first-class) |
| Hub note `type` (v1) | **Decided:** `report` · `instruction` · `decision` · `taxonomy` (+ keep existing knowledge types: `chapter`/`spec`/`field-note`/`meeting`/`registry`) |
| Report body (v1) | **Decided:** six fixed sections below — same for PH / AT / Orbita first pull |
| Report direction | **Pull**: projects expose a report API; Orbita fetches. Protocol lives in **AI Dev Framework** (opt-in per project) |
| Human gate | At **Claude discussion** layer (macro dispatch), not per-repo PR review as the primary UX |
| Write path after gate | Allowed to update repo Autopilot fuel / `main` once Claude-level intent is settled; staging/prod split later when public production matters |
| Autopilot coverage | Goal: **all** framework projects get Autopilot via methodology sync |
| Deploy | Stays per-repo CI (GitHub → Zeabur etc.); Orbita does not orchestrate deploy |
| First report projects | **Powerhouse**, **ai-transformation**, **Orbita** |
| Runtime loop | Future: runtime not only reports **out** but can receive **runtime instructions** in (e.g. AT editorial). Lower urgency, design for extension |
| AT L2 | Same hub frame: AT is one project edge (report + later runtime instruction), not a separate product story |
| Failure / recover | Prefer next pull cycle to surface failed Autopilot work in reports; Claude/Orbita can adjust tasks — occasional manual recover OK |
| H2 retrieval | Structured **list/filter** is an agent **tool**, not a bypass of the agent layer (see below) |

## H0 vocabulary (decided)

Store a living `taxonomy` note (and/or framework doc) agents should read. Each entry needs: `id`, one-line **purpose**, **scope** (when to use), **not-for** (common misuse).

| `type` | Purpose | Scope |
|--------|---------|--------|
| `taxonomy` | Describes the vocabulary itself | One (or few) canonical notes; update when types change |
| `report` | Period snapshot pulled from a project | Hub ingest; always set `project` + period |
| `instruction` | Approved (or draft) dispatch intent | After Claude-layer discussion; may target repo and/or runtime |
| `decision` | Founder call with impact | Durable “why we chose X”; links to what it unblocked |
| `registry` / `chapter` / `spec` / `field-note` / `meeting` | Knowledge (PA0) | Unchanged; not hub workflow types |

Optional freeform `tags[]` may exist but **are not** required to have metadata until promoted into the taxonomy.

## H2 — list/filter vs “we are an agent platform”

Orbita is an **Agent System Backend**: primary callers are agents (Claude, Cursor, harnesses). That does **not** mean every read must go through an LLM session.

| Kind of need | Right primitive | Why |
|--------------|-----------------|-----|
| “Reports for `powerhouse` since Monday” | **Structured list/filter tool** | Deterministic, cheap, auditable |
| “Anything related to matching UX drift?” | **Semantic `note_search`** | Fuzzy / conceptual |
| “Summarize and propose next instructions” | **Agent turn** (Claude or Orbita session) | Judgment, cross-project synthesis |

Adding list/filter does **not** bypass the agent: Claude (your gate) **calls** that API as a tool, then reasons. What would be wrong is (a) forcing “list since date” through a billable reasoning loop, or (b) building a human-only dashboard that never uses agents. Structured retrieval + agent judgment is the intended stack (API-first tools; see `usr/ORBITA_DESIGN.md`).

**Platform gap (still real):** today `GET /v1/notes/search` is mainly `q` + `top_k`. Hub briefs need e.g. `project` + `type` + `since`/`until` on list or search. Ship as additive tool surface for agents — not a second product.

## Open design choices (still soft)

| Topic | Lean | Notes |
|-------|------|-------|
| Security for pull | Shared REST contract + per-project read credential in Orbita vault + domain allow-list | See “Report API sketch” below |

## Stages

| Stage | Outcome | Status of thinking |
|-------|---------|-------------------|
| **H0** | Controlled vocabulary with descriptions (`taxonomy` note) | **Decided** (types above) |
| **H1** | Framework opt-in → project report API; Orbita pull for PH / AT / Orbita | Six-section body **decided**; protocol next |
| **H2** | Claude brief via list/filter **tools** + optional semantic search | Platform list/filter still to ship |
| **H3** | Claude-level dispatch → Autopilot tasks; failure on next report pull | Gate placement agreed |
| **H4** | Close the loop to git/`main` (high value, failure-tolerant now; staging later) | Priority for design, not panic on risk |

## Two edges per project

```text
                    ┌── runtime edge ── report OUT / instruction IN (future)
  project slug ─────┤
                    └── repo edge ───── Autopilot tasks / commits / CI deploy
```

Today’s sketch emphasizes runtime **reports**. Later: runtime **instructions** (e.g. editorial steer) without forcing everything through git.

## Report API sketch (balance security vs complexity)

**Contract (methodology-owned, versioned):** e.g. `GET /orbita/report?since=ISO` → JSON:

- `project` (slug)
- `generated_at`
- `period` `{ since, until }`
- `status` (`ok` | `degraded` | `failed`)
- `sections[]` — typed blocks (see content ideas below)
- `schema_version`

**Orbita side:** harness/job per enabled project; credentials in vault; HTTP allow-list; store as note `type: report` + `project` + period in frontmatter.

**Project side:** implement the contract (scaffold from framework when `orbita_hub: true`). No outbound Orbita client required for the happy path.

**Extensibility:** same endpoint grows `sections` kinds (`dev`, `ops`, `editorial`, …) without new URLs at first; split routes later if needed.

## What a report contains (v1 — decided)

Same six sections for Powerhouse / AT / Orbita. Keep each short; empty section = `"none"` / omit body, not omit the key (so briefs stay comparable).

| `section` id | Title | Why |
|--------------|-------|-----|
| `intent_vs_actual` | Intent vs last period | Steering: did we do what we said |
| `shipped` | Shipped / merged | Proof of motion |
| `needs_founder` | Blocked / needs founder | Only judgment items (with impact one-liners) |
| `autopilot` | Autopilot health | Last runs, open/failed tasks + links |
| `risks` | Risks / drift | Goal wander |
| `ask` | Ask | At most one recommended next instruction |

Project-specific color goes **inside** these sections (e.g. AT queue depth under `needs_founder` or `shipped`), not as parallel competing schemas in v1.

## Non-goals (for now)

- One mega-Maker across all remotes (keep per-repo Autopilot)
- Orbita-owned multi-project deploy orchestration
- Perfect real-time failure paging (daily pull + Claude brief is enough initially)
