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

## Founder leanings (2026-08-07)

| Topic | Decision / lean |
|-------|-----------------|
| Tag / type vocabulary | Prefer **explicit metadata** (description + scope) so agents know intent — curated registry, not every free string |
| Report direction | **Pull**: projects expose a report API; Orbita fetches. Protocol lives in **AI Dev Framework** (opt-in per project) |
| Human gate | At **Claude discussion** layer (macro dispatch), not per-repo PR review as the primary UX |
| Write path after gate | Allowed to update repo Autopilot fuel / `main` once Claude-level intent is settled; staging/prod split later when public production matters |
| Autopilot coverage | Goal: **all** framework projects get Autopilot via methodology sync |
| Deploy | Stays per-repo CI (GitHub → Zeabur etc.); Orbita does not orchestrate deploy |
| First report projects | **Powerhouse**, **ai-transformation**, **Orbita** (dev-steering reports first; content schema still open) |
| Runtime loop | Future: runtime not only reports **out** but can receive **runtime instructions** in (e.g. AT editorial). Lower urgency, design for extension |
| AT L2 | Same hub frame: AT is one project edge (report + later runtime instruction), not a separate product story |
| Failure / recover | Prefer next pull cycle to surface failed Autopilot work in reports; Claude/Orbita can adjust tasks — occasional manual recover OK |

## Open design choices (still soft)

| Topic | Lean | Notes |
|-------|------|-------|
| Security for pull | Shared REST contract + per-project read credential in Orbita vault + domain allow-list | See “Report API sketch” below |
| H2 query | Need Orbita list/filter by `project` + date range (today search is semantic `q` only) | Platform gap before Claude briefs are reliable |
| Report body | Dev-steering oriented while projects are pre-scale | See “What should a report contain?” |

## Stages

| Stage | Outcome | Status of thinking |
|-------|---------|-------------------|
| **H0** | Controlled vocabulary: types/tags with descriptions; note frontmatter conventions | Agreed direction |
| **H1** | Framework opt-in → project report API; Orbita pull harness for PH / AT / Orbita | Protocol + content schema |
| **H2** | Claude brief over filtered notes | Needs query API |
| **H3** | Claude-level dispatch → Autopilot tasks; failure visible on next report pull | Gate placement agreed |
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

## What should a report contain? (dev-steering era)

While products are still in development, reports are less “uptime dashboards” and more **steering signals**:

| Section | Why it helps you at Claude altitude |
|---------|-------------------------------------|
| **Intent vs last period** | What we said we’d move; what actually moved |
| **Shipped / merged** | Concrete deltas (PRs, deploys) — proof of motion |
| **Blocked / needs founder** | Only items that need *your* judgment (impact-tagged) |
| **Autopilot health** | Maker/Checker last run, open tasks, failed tasks + links |
| **Risks / drift** | “We wandered from the agreed goal” |
| **Ask** | One recommended next instruction (optional) |

Project-flavored extras later: AT editorial queue depth; Powerhouse matching/signal health; Orbita API version + failed prod smokes.

## Non-goals (for now)

- One mega-Maker across all remotes (keep per-repo Autopilot)
- Orbita-owned multi-project deploy orchestration
- Perfect real-time failure paging (daily pull + Claude brief is enough initially)
