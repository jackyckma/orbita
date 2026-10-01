---
status: active
maintained_by: ai-agents
purpose: Shared contract for projects reporting into a portfolio hub — three lines, six sections, opt-in gate, evolution process.
---

# Portfolio hub reporting (Tier B6, optional)

> **For AI agents:** Read this when a project is asked to "report to the hub", "expose a report endpoint", "enable `orbita_hub`", or when writing or consuming a period report. Check §3 first — most projects implement **nothing**.

The founder runs several projects in parallel and cannot hold them all in working memory. A hub (currently **Orbita**) collects reports so one agent session can brief across the portfolio without crawling every repo and dashboard.

**The value is comparability.** Six projects with six bespoke shapes is worse than no reports, because the reader re-learns each one. So the contract is framework-owned: a project may choose *whether* it is covered, never *what shape* the report has.

---

## 1. Three lines

A project's state lives in three different places, with three different owners:

| | **repo** | **deploy** | **runtime** |
|---|---|---|---|
| Question | What did development do? | Did it reach production? | Is the live product doing anything useful? |
| Knows about | merged PRs, backlog health, `needs_human`, decisions, Autopilot runs | builds, releases, rollbacks, which commit is actually serving | traffic, signups, queue depth, error rates, content pipeline |
| Source of truth | the git repo | the hosting platform (Zeabur, etc.) | the running service and its database |
| Who produces it | **hub**, by reading committed state | **hub**, by querying the platform API | **the project**, at request time |
| Project-side work | none | none | an endpoint |

**No line can answer for another.** A production service does not know what is in `backlog.json`. A git repo does not know last night's error rate. And neither knows whether the build succeeded.

### Why deploy is its own line

`merged ≠ deployed`. When a build fails, the backlog still says `done`, and a naive production smoke check can still **pass** — because the URL is happily serving the *previous* successful deployment. Of the three, this is the failure most likely to go unnoticed by eye, which is exactly why it deserves a line.

### The correlation key

Use the **git commit sha** (`source_sha`). It is what turns three feeds into one picture:

```text
T-0002  →  PR #141  →  sha abc123  →  deployment #88  →  serving in prod
```

With it, the hub can say "this task merged but its deployment failed". Without it, the hub correlates on timestamps — which is guesswork, and guesswork must never be relayed to the founder as fact.

---

## 2. Direction of travel

```text
git repo        ──┐
hosting platform ──┼──▶  hub collects  ──brief──▶  founder + agent discussion
running service ──┘         │
                            └──instruction──▶  project's Autopilot backlog
```

Everything is **pull**. A project never needs an outbound hub client, hub credentials, or any knowledge that the hub exists.

Instruction dispatch (the return path) is **not** covered here — it goes through `docs/autopilot/backlog.json`, gated by founder discussion. A report is read-only output.

---

## 3. What a project actually has to do

**Usually nothing.** Check honestly before writing code:

| Line | Project action |
|---|---|
| repo | **None.** Maker/Checker already commit `backlog.json`, `locks.json`, `roadmap.json` on every run. The hub reads them. Optionally commit `docs/autopilot/reports/latest.json` if you want the project's own framing recorded — a convenience, not a requirement |
| deploy | **None.** One platform credential in the hub covers every project |
| runtime | An endpoint — **and only when the product has signals worth steering on** |

Consequence: onboarding a project to the hub is a **row in the hub's registry**, not a task in that repo.

**Runtime opt-in gate.** Build the runtime endpoint only if both hold:

1. `docs/autopilot/project-hooks.json` has `"orbita_hub": true` and lists `runtime` in `orbita_hub_edges`
2. `project-guidelines.md` § Adopted optional practices lists `portfolio-hub-reporting`

A pre-launch product reporting zeroes has bought a public surface and a credential in exchange for nothing. Wait.

---

## 4. The six sections (fixed)

Every report — any line — has exactly these six, in this order. The *questions* are constant; what fills them depends on the line.

| `id` | repo | deploy | runtime |
|------|------|--------|---------|
| `intent_vs_actual` | did we build last period's `ask`? | did what merged actually release? | did the product behave as expected? |
| `shipped` | merged PRs | successful deployments + serving sha | what the runtime produced |
| `needs_founder` | `needs_human` tasks, stale decisions | releases blocked or repeatedly failing | calls only a human can make |
| `autopilot` | Maker/Checker runs, task states, locks | build queue health, rollbacks | harness / cron / worker health |
| `risks` | retries, stale `ready` tasks | merged-but-undeployed commits, flaky builds | error rates, cost trend, abuse |
| `ask` | **at most one** | **at most one** | **at most one** |

Rules:

- An empty section keeps its key with body `"none"`. **Never omit a key** — missing is indistinguishable from a broken generator.
- **Do not pre-filter by importance.** Send everything for the period and let the hub triage. A project cannot see that its "minor" refactor collides with another project's plan; only the hub can. Severity is a *hint*, never a filter.
- `ask` is capped at one per line. If everything is the top ask, nothing is.
- Project-specific colour goes **inside** these sections, never as a seventh.
- Set `provenance` per section — `measured` / `derived` / `asserted` — so the hub never launders a guess into a fact.

---

## 5. Payload

```json
{
  "schema_version": "1.2",
  "project": "ai-business",
  "edge": "repo",
  "source_sha": "abc1234",
  "generated_at": "2026-08-07T14:00:00Z",
  "period": { "since": "2026-08-06T00:00:00Z", "until": "2026-08-07T00:00:00Z" },
  "status": "ok",
  "sections": [
    { "id": "intent_vs_actual", "title": "Intent vs last period", "body": "...", "provenance": "derived" },
    { "id": "shipped",          "title": "Shipped / delivered",   "body": "...", "provenance": "measured" },
    { "id": "needs_founder",    "title": "Blocked / needs founder", "body": "none", "provenance": "derived" },
    { "id": "autopilot",        "title": "Automation health",     "body": "...", "provenance": "measured" },
    { "id": "risks",            "title": "Risks / drift",         "body": "none", "provenance": "derived" },
    { "id": "ask",              "title": "Ask",                   "body": "...", "provenance": "asserted" }
  ]
}
```

| Field | Rule |
|-------|------|
| `schema_version` | `"1.2"`. Bump only via §7. |
| `project` | Stable lowercase slug matching the hub registry. Never rename casually — the hub keys history on it. |
| `edge` | `repo` \| `deploy` \| `runtime`. Optional; absent means `repo`. |
| `source_sha` | Git commit described. Include wherever the line can know it — see §1. |
| `generated_at` | ISO-8601 UTC. |
| `period` | `{since, until}`; `since` inclusive, `until` exclusive. |
| `status` | Health of **report generation**, not of the product. Product problems belong in `risks`. |
| `sections[]` | Exactly six, §4 order. `body` is Markdown. |

Machine-checkable: [`report.schema.json`](../templates/docs/autopilot/report.schema.json). Example: [`report.example.json`](../templates/docs/autopilot/report.example.json).

---

## 6. Runtime endpoint (the only line a project serves)

```text
GET /orbita/report?since=<ISO>&until=<ISO>
Authorization: Bearer <per-project read-only token>
→ 200 application/json   ("edge": "runtime")
```

- **Read-only.** Never mutates state, never accepts instructions.
- **Its own credential**, scoped to this route. Never reuse an admin token.
- `since` / `until` optional; default last 24h.
- Bad auth → `401`, never a partial payload.
- Cannot build a real report? Return `200` with `"status": "failed"` and the reason in `intent_vs_actual`. An honest failed report beats a `500` — the hub can then tell "unhealthy" from "unreachable".
- Extend via `sections[]`, not new routes.

---

## 7. Evolving this contract

It **will** change. It changes **here**, once, for everyone — never in a product repo.

| Class | Examples | Version | Migration |
|---|---|---|---|
| **Clarification** | wording, examples, sharper definitions | bundle only | none |
| **Additive** | new optional field; new enum value; widened definition | minor (`1.1`→`1.2`) | none forced; old payloads stay valid |
| **Breaking** | rename/remove/reorder a section; change a field's meaning; make an optional field required | major (`1.x`→`2.0`) | every covered project migrates |

`edge` (1.1) and the `deploy` value (1.2) are both worked examples of the **additive** path: optional, defaulted, nothing had to migrate on the day.

**Breaking change process:** propose in the framework repo, stating why the additive route was rejected — it is almost always available and almost always better. Bump `schema_version` here *and* in the schema. **The hub accepts both versions for the whole migration window** — this rule is load-bearing: several projects will never migrate on the same day, and a hub that accepts only the newest version blinds the founder to every project that has not caught up. Migrate one project at a time as ordinary backlog tasks. Retire the old version only after reading each project's latest report to confirm — not by assuming.

**Who decides:** the founder, at the framework repo. An agent that finds the contract wrong says so in a PR or a `needs_founder` line. It does **not** patch its local copy — a project that edits its own `report.schema.json` has silently left the portfolio while still appearing in it.

---

## 8. Anti-patterns

| Anti-pattern | Why it fails |
|--------------|--------------|
| One line answering for another | Each line can only honestly speak about itself; the rest gets invented |
| Building a per-project API for the repo or deploy line | The data is already in git and in the platform; you would be adding credentials and staleness for nothing |
| Trusting a prod smoke as deploy verification | It passes on the previous successful deployment |
| Omitting empty sections | Cannot distinguish "nothing happened" from "generator broke" |
| Pre-filtering by importance at the project | Only the hub sees cross-project significance |
| Several items in `ask` | No prioritisation happened |
| Building the runtime edge before the product has users | Public surface and a credential, in exchange for zeroes |
| Locally editing `report.schema.json` | Project silently leaves the portfolio |
| Hand-writing reports from memory | The hub then briefs the founder on fiction |

---

## 9. Version

Contract `schema_version` **1.2** (bundle 1.6.0). 1.0 and 1.1 remain valid. See [CHANGELOG.md](../CHANGELOG.md). Hub-side design: `jackyckma/orbita docs/personal-steward/portfolio-hub.md` and `portfolio-collectors.md`. If a hub doc and this file disagree on the wire format, **this file wins** — the hub is one consumer, the contract is shared.
