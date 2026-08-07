# Agent-native practices (optional — Tier E)

Practices that redesign human-centric conventions around what agents are
actually good at (fast bulk reading, cheap re-generation, text interfaces,
externalized state). **None of these is a framework default.** Each entry
states the problem it solves, its cost, and when to adopt — the decision
belongs to each project.

**Adoption gate:** to enable a practice, add it to the project's
`project-guidelines.md` under `## Adopted optional practices`. An optional
practice not listed there is not in effect, even if this file is present in
the repo.

---

## E1. Structured state file

**Problem:** live-doc markdown requires parsing and is easy to half-update;
state scattered across docs diverges when Claude, Codex, and Cursor rotate
over the same repo.

**Practice:** one machine-readable state file — `.agents/state.json` (or
SQLite for heavy use) — holding current milestone, lane statuses, pending
decision briefs, loop log. Founder-facing markdown (status tables) becomes
a **view** regenerated from it, not a second source of truth.

**Cost:** tooling discipline (agents must write JSON before markdown);
merge conflicts in JSON are uglier; humans can't skim it.

**Adopt when:** ≥2 agent tools work the repo in the same week, or the
autonomous loop runs regularly. **Skip when:** one agent, occasional
sessions — markdown live-docs are enough.

## E2. AI-first document and log formats

**Problem:** human-styled prose docs burn context tokens and bury facts.

**Practice:** for agent-facing docs (not founder-facing ones): tables and
`key: value` blocks over paragraphs; one fact per line; stable IDs over
narrative cross-references; grep-able markers (`defer:`,
`upstream-candidate:`, `decision:`). Information density and parseability
beat readability.

**Cost:** less pleasant for humans; founder-facing docs must stay
human-first, so you maintain two registers.

**Adopt when:** project docs exceed what one session can comfortably read,
or multi-agent parallel work makes context budget tight.

## E3. Machine-verifiable docs

**Problem:** docs drift from reality; agents trust stale docs and act on
them.

**Practice:** commands quoted in docs are executed by a doc-check script in
CI or `agent-verify.sh`; INTERFACE tables generated from JSON Schemas where
possible, so the contract file cannot disagree with the schema.

**Cost:** build effort; maintenance of the checker.

**Adopt when:** lanes + contracts already exist and the project will live
for months. **Skip when:** prototype pace.

## E4. Fixture-first external world

**Problem:** implementing against live external APIs makes verification
slow, flaky, rate-limited, or expensive — which breaks the verify-early
loops everything else here depends on.

**Practice:** stub every external API with recorded or synthetic fixtures
(`data/fixtures/`) before implementing against the live service; unit tests
never call live APIs. (Lane projects already do this via simulators; this
generalizes it to non-lane projects.)

**Cost:** fixtures go stale and need refreshing against the real API.

**Adopt when:** external APIs are paid, slow, or rate-limited — which is
nearly always for LLM APIs.

---

## Evaluated and not adopted (2026-07-10)

Recorded so future sessions don't re-litigate from scratch:

- **AI-first programming language** — no mature, tooling-complete option
  exists today. Revisit only when a candidate has a real compiler/runtime
  ecosystem and model training coverage.
- **Framework-specific runtime library** — would require constraining
  supported languages first, and adds a maintenance surface the framework
  cannot yet afford. Revisit if upstream harvests show the same utility
  code being rebuilt across ≥3 projects.

---

## Adoption gate format (copy into project-guidelines.md)

```markdown
## Adopted optional practices

- agent-native-practices.md E1 (state file): .agents/state.json
- agent-native-practices.md E4 (fixture-first): data/fixtures/
```
