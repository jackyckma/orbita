---
status: active
maintained_by: ai-agents
created: 2026-06-12
last_updated: 2026-06-12
purpose: Portable methodology for lane-based planning, implementation, and status reporting with AI coding agents. Canonical copy in jackyckma/ai-dev-methodologies.
archive_when: Superseded by a newer methodology version with explicit migration notes.
---

# Lane-Based Development Methodology

> **For AI agents:** Read this document when the user asks you to adopt lane-based development, report lane status, or structure a new project using lanes. It is **self-contained** — you do not need access to the Powerhouse repository to follow it.
>
> **Reference implementation:** [Powerhouse](https://github.com/jackyckma/powerhouse) (lanes 0–9, `.agents/`, `packages/lane-*/`, `docs/product-architecture.md`).

---

## 1. What this is

**Lane-based development** splits a product into **parallel, contract-bound modules** called **lanes**. Each lane:

- Owns one slice of business capability (e.g. auth, billing, matching, web shell).
- Exposes **machine-readable contracts** (JSON Schema + HTTP/CLI surface).
- Ships with an **agent skill** so Cursor, Claude Code, Codex, and Copilot can edit the right files without cross-contaminating other lanes.
- Reports status in a **fixed table**: *last shipped* / *next up* per lane.

Lanes are a **planning and agent-coordination** model. They are not a runtime framework. Runtime code lives in normal packages; lanes are how humans and agents **divide work and memory**.

---

## 2. When to use lanes

Use this methodology when:

- Multiple **AI agents** (or parallel human+agent workstreams) touch the same repo.
- You want **API-first** delivery: logic testable without a browser.
- The product has **clear pipelines** (input → process → output) that can be isolated.
- You need **repeatable status updates** (“what shipped / what’s next”) without re-explaining the whole project every session.

Skip or simplify when:

- The repo is a single tiny script or one-page app with no module boundaries.
- You cannot maintain at least three live docs (architecture, progress, traceability).

---

## 3. Core concepts

| Concept | Definition |
|---------|------------|
| **Lane** | A numbered or named module with one primary responsibility. Example: Lane 5 = Matching. In a new project you might use `lane-auth`, `lane-orders` instead of numbers. |
| **INTERFACE.md** | Per-lane **boundary contract**: owns, provides, consumes, allowed paths, verification. Required before serious implementation. |
| **contracts/** | JSON Schemas for requests/responses. Production and simulators must validate against the same schemas. |
| **Simulator fixtures** | Static JSON under `data/simulators/<lane>/` so agents and CLI can test without external services. |
| **Agent skill** | `SKILL.md` per lane — short instructions: scope, rules, how to verify, what not to import. |
| **Live docs** | Three documents agents update every session so the next session inherits state. |
| **Traceability index** | One table mapping lane → package → skill → INTERFACE → fixtures. |
| **Thin UI lane** | One lane (often the highest number) for web/CLI that **only calls lane APIs** — no business logic in pages. |

### Dependency rule (critical)

Lanes depend on each other **only through published contracts** (HTTP paths, schema files, documented IDs). **Never** import another lane’s `src/` directly. If lane B needs lane A, lane B calls A’s API or validates against A’s response schema.

### Layer order (build sequence)

```text
1. Lane package + API + contracts     ← source of truth
2. Agent skill per lane               ← how to edit safely
3. UI / CLI (thin)                    ← calls APIs only
4. Simulators + smoke tests           ← close the loop without browser
```

---

## 4. Recommended repository layout

Copy and rename for your project:

```text
your-repo/
├── .agents/
│   ├── instructions/
│   │   ├── lane-based-development-methodology.md   # this file
│   │   ├── karpathy-guidelines.md                  # coding discipline (optional)
│   │   └── project-guidelines.md                 # your deploy, language, checklists
│   └── skills/
│       ├── README.md                             # lane → skill index
│       ├── lane-<name>/
│       │   └── SKILL.md
│       └── status-update/
│           └── SKILL.md                          # how to report progress
├── packages/
│   ├── api-platform/                             # shared HTTP envelope, errors (optional)
│   └── lane-<name>/
│       ├── INTERFACE.md
│       ├── contracts/
│       └── src/
├── apps/<main-app>/                              # hosts HTTP routes; thin UI
├── data/simulators/<lane-name>/                  # fixtures
├── docs/
│   ├── README.md
│   ├── product-brief.md
│   ├── product-architecture.md                   # lanes, data flow, lane status table
│   ├── project-progress.md                       # milestones, waves, decisions
│   ├── traceability-index.md
│   └── errors-and-learnings.md
├── AGENTS.md                                     # pointer to .agents/instructions/
├── CLAUDE.md
└── .cursor/rules/*.mdc                           # alwaysApply → instructions
```

**Rule:** Agent entry points (`AGENTS.md`, `CLAUDE.md`, `.cursor/rules`) stay **short** and point to `.agents/instructions/`. Do not duplicate long process text in five places.

---

## 5. Live documents (cross-session memory)

Maintain exactly these roles:

| Document | Role | Update when |
|----------|------|-------------|
| **product-brief.md** | Why the product exists; open questions | Founder changes direction |
| **product-architecture.md** | Lane map, system wiring, per-lane build status | Lane scope or data flow changes |
| **project-progress.md** | Milestones, waves, ✅🔄⏳❌, decisions log | Every implementation session |
| **traceability-index.md** | Lane → package → skill → INTERFACE | New lane or package |
| **errors-and-learnings.md** | Deploy surprises, API quirks, agent mistakes | Something blocked you |

### Document frontmatter (required)

Every active `docs/**` file and each `INTERFACE.md` should start with:

```yaml
---
status: active
maintained_by: ai-agents
created: YYYY-MM-DD
last_updated: YYYY-MM-DD
purpose: One sentence — why this file exists now.
archive_when: When to deprecate or move to docs/archive/.
---
```

---

## 6. INTERFACE.md template

Create one per lane before coding. Minimal sections:

```markdown
---
status: active
maintained_by: ai-agents
created: YYYY-MM-DD
last_updated: YYYY-MM-DD
purpose: Boundary contract for Lane X — <one line>.
---

# Lane X — <Name> INTERFACE

## Summary
One paragraph: what this lane does and what it does *not* do.

## Owns
- `packages/lane-x-*/`
- `data/simulators/lane-x/`
- `apps/.../api/...` routes (if any)

## Provides
| Method | Path | Request schema | Response schema |
|--------|------|----------------|-----------------|

## Consumes (upstream lanes)
| Lane | Contract | Used for |
|------|----------|----------|

## Downstream consumers
| Lane | Consumes |
|------|----------|

## Allowed paths (PR scope)
List directories/files agents may modify for this lane.

## Verification
- CLI: `...`
- Tests: `...`
- Fixtures: `data/simulators/lane-x/...`
```

---

## 7. Agent skill template (`SKILL.md`)

One skill per lane under `.agents/skills/lane-<name>/SKILL.md`:

```markdown
---
name: lane-<name>
description: Lane X — <name>. Load before editing packages/lane-x-* or related API routes.
---

# Lane X — <Name>

## Scope
- INTERFACE: `packages/lane-x-*/INTERFACE.md`
- Package: `packages/lane-x-*/`

## Rules
1. UI stays thin — fetch from lane APIs only.
2. Use simulator fixtures for stub-first development.
3. Do not import other lanes' `src/` — contracts only.
4. Deliberate simplifications → `defer:` comments per `karpathy-guidelines.md` §2.

## Verify
- <command>
- <test path>
```

Add a **status-update** skill that defines how to answer “進度 / status / roadmap” (see §9).

---

## 8. Session workflows

### 8.1 Session start (every agent, every session)

Before implementing, read in order:

1. `docs/README.md`
2. `docs/traceability-index.md`
3. `docs/product-architecture.md`
4. `docs/project-progress.md`
5. `docs/errors-and-learnings.md`
6. `packages/lane-XX-*/INTERFACE.md` for the lane you will edit
7. `.agents/skills/lane-XX-*/SKILL.md`

Then tell the user (briefly):

- **Lane** and milestone from `project-progress.md`
- **How this work fits the product** (1–2 sentences)
- **Exit criteria** for this slice
- **Branch** (if applicable)

### 8.2 While implementing

- Set milestone to 🔄 in `project-progress.md` when you start.
- API or schema change → update `INTERFACE.md`, `contracts/`, and lane skill in the **same session**.
- Non-obvious pitfall → add to `errors-and-learnings.md` before continuing.

### 8.3 Session end (before handoff)

| Step | Action |
|------|--------|
| 1 | `project-progress.md` — ✅ with commit SHA, or 🔄/❌ with honest reason |
| 2 | `product-architecture.md` — lane status matches codebase |
| 3 | `traceability-index.md` + `docs/README.md` — new docs indexed |
| 4 | Lane `INTERFACE.md` + skill — match reality |
| 5 | **Lane status snapshot** — update `lastShipped` / `nextUp` (§9) |
| 6 | Frontmatter `last_updated` on every doc you touched |

### Status icons

| Icon | Meaning |
|------|---------|
| ✅ | Complete |
| 🔄 | In progress |
| ⏳ | Not started |
| ❌ | Blocked (state reason) |

---

## 9. Status reporting (founder-facing)

When the user asks for **進度 / status / roadmap / lane 現況**, use a **fixed table** — do not improvise from memory.

### Required response shape

Lead with:

| Lane | 上次完成的功能 | 下次要做的功能 |
|------|----------------|--------------|
| 0 | … | … |
| … | … | … |
| N | … | … |

Also include one line each:

- **Deploy ref** (branch @ commit or environment URL)
- **MVP focus** (current product loop in one sentence)

### Canonical source

Pick **one** machine-readable source in your repo, for example:

- `docs/lane-status.md`, or
- `src/content/lane-status.ts` exporting `getLaneStatusSnapshot()`, or
- `product-architecture.md` § Current lane status

Agents must **read that file first**, then format the table. A dedicated **status-update** skill should point to the canonical path.

### Maintenance rule

When shipping lane work:

1. Update `lastShipped` / `nextUp` for affected lanes.
2. Bump `deployRef` and `updatedAt` when deployed.
3. Sync `project-progress.md` for waves and decisions — the short table is for quick founder reads; progress doc is for history.

---

## 10. Decision authority

Bias toward progress, but do not silently change architecture.

### Non-critical — decide and proceed

Minor, reversible choices (naming inside conventions, test fixture shape, doc typos, order of two small tasks in one lane): **implement without asking**. Note briefly if useful.

### Important — ask with options + recommendation

Architecture, lane boundaries, public API / JSON Schema breaks, major milestones, compliance, irreversible migrations: **stop and ask**. Present 2–4 options with tradeoffs and a clear recommendation.

### Record decisions

When the user chooses, log in `project-progress.md` § Decisions Log with date, options, and chosen path.

---

## 11. Bootstrap checklist (new project)

Use this when adopting lanes from zero:

- [ ] Define lanes (3–10 modules) and draw data flow in `product-architecture.md`
- [ ] Create `traceability-index.md` with lane → package → skill mapping
- [ ] For each lane: `INTERFACE.md` (even if draft) + `SKILL.md`
- [ ] Add `AGENTS.md` / `CLAUDE.md` / `.cursor/rules` pointing to `.agents/instructions/`
- [ ] Copy this methodology file + optional `karpathy-guidelines.md`
- [ ] Add `status-update` skill + one canonical lane-status source
- [ ] Add one simulator fixture per lane that has an API
- [ ] Add one smoke or stub test path (CLI or `*.stub.test.ts`)
- [ ] Run first session end checklist after the pilot lane ships

---

## 12. Anti-patterns

| Anti-pattern | Why it fails |
|--------------|--------------|
| Business logic in UI pages | Breaks parallel lanes; untestable by CLI |
| Importing another lane’s `src/` | Hidden coupling; agents break unrelated lanes |
| No INTERFACE.md | Agents guess scope; PRs balloon |
| Status from agent memory | Founder gets inconsistent roadmap every session |
| Duplicating instructions in 5 agent files | Drift; one tool follows stale rules |
| Lane without verification path | “Done” means nothing reproducible |
| 15 lanes with no MVP loop | Reporting overhead without shipped circuit |

---

## 13. Naming: numbers vs names

Powerhouse uses **Lane 0–9** (0 = inputs/simulators, 9 = web shell). Your project can use:

- **Numbers** — good for stable reporting tables and investor demos.
- **Names** — `lane-auth`, `lane-billing` — good for domain clarity.

Either works if `traceability-index.md` and the status table stay consistent.

---

## 14. Minimal viable lane set

If starting small, use four lanes plus shell:

| Lane | Typical role |
|------|----------------|
| **0** | Inputs, fixtures, synthetic seed factory |
| **1–N−1** | Your core pipeline steps (2–4 lanes) |
| **N** | Web or CLI shell (thin) |
| **CLI** (optional) | Smoke tests and operator commands |

Ship **one closed loop** (e.g. input → profile → match → action) before adding more lanes.

---

## 15. How to invoke this in another project

1. Run [bootstrap-project.sh](../scripts/bootstrap-project.sh) from [ai-dev-methodologies](https://github.com/jackyckma/ai-dev-methodologies), or copy this file to `your-repo/.agents/instructions/lane-based-development.md`.
2. Ensure `AGENTS.md` / `CLAUDE.md` / `.cursor/rules` point to `.agents/instructions/`.
3. Tell the agent:

   > 請依照 `lane-based-development.md` 為本專案建立 lane 架構，並用 §9 格式報告現況。

4. Customize `project-guidelines.md` with your stack, deploy target, and language preferences.

---

## 16. Version

| Field | Value |
|-------|-------|
| Methodology version | 1.0 |
| Extracted from | Powerhouse repo practices (2026-06) |
| Changelog | Initial portable document |

When you evolve the methodology, bump `last_updated` and add a short changelog subsection here.
