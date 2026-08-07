# Decision authority

Bias toward progress without silently changing architecture. The founder's
attention is the scarcest resource in this system: **batch questions, don't
drip them**, and never block work that a reversible default could keep
moving.

---

## The three tiers

### Tier 1 — Decide, log, continue (the default)

Reversible choices where being wrong costs less than an interruption:
naming within conventions, internal structure, test fixture shape, doc
wording, order of small tasks, choosing among libraries already in the
project.

**Action:** implement; add a one-line note to progress/handoff if useful.
Never ask about these.

### Tier 2 — Queue for batch (important, not blocking)

Decisions the founder should make but that don't have to stop work now:
scope trade-offs, UX alternatives, architecture preferences with a viable
default, adoption of optional practices, next-wave priorities.

**Action:** write a **decision brief** (format below), add it to the
pending-decisions section of `docs/SESSION_HANDOFF.md`, then keep working —
either on other tasks or on this one using a clearly-marked reversible
default. Present the whole queue **grouped** at the next natural sync point
(session end, milestone, or whenever the founder shows up). One message
with four decisions beats four interruptions.

### Tier 3 — Block and ask (hard stops)

Only these block a line of work:

- Production deploy or merge to `main` (unless project guidelines document
  an approved sandbox)
- Irreversible migrations, data deletion, anything unrecoverable
- Public API or schema breaks that other lanes/consumers depend on
- Spending real money; credentials or secrets you don't have
- Compliance, security, or privacy implications

**Action:** stop **that** line of work and ask with a decision brief. If
other queued work exists, continue there while waiting.

---

## Decision brief format (Tier 2 and 3)

```markdown
**Decision:** <one-line question>
**Context:** <2–4 lines: why this matters now>
**Options:** <2–4, each with a one-line tradeoff>
**Recommendation:** <which one, one line of why>
**Default if no answer:** <what was done meanwhile; how reversible>
**Decide by:** <date or trigger after which deferral stops being free>
```

Example:

> **Decision:** Store user preferences in a dedicated table or a JSON column?
> **Context:** Issue APP-031 needs preferences persisted; the two options
> diverge on migration cost once rows exist.
> **Options:** (a) table — queryable, one migration now; (b) JSON column —
> zero migrations later, opaque to SQL.
> **Recommendation:** (a); we already query by preference in APP-034.
> **Default if no answer:** implemented behind `PreferencesStore` interface
> with (a); swapping to (b) touches one file.
> **Decide by:** before APP-034 starts.

---

## Deferral tactics — keep moving while a decision is pending

1. **Show, then ask** — implement the recommended option with stub/fixture
   data so the founder decides while looking at real output instead of a
   hypothetical.
2. **Interface hedge** — implement behind an interface or flag that every
   option satisfies; the decision then swaps an implementation, not a
   design.
3. **Narrow first** — ship the part all options share; defer only the
   divergent slice.

Mark deferred spots in code with `defer:` comments
(`karpathy-guidelines.md` §2).

---

## Record decisions

When the founder decides, log it in `docs/project-progress.md` § Decisions
Log (create the file and section if the project does not have them yet) and
remove it from the pending queue.
An undecided brief older than its **Decide by** trigger gets re-surfaced at
the top of the next sync, not silently dropped.

---

## Priority when unstuck (general PM posture)

When no explicit steering exists, apply in order:

1. **Keep the feedback loop alive** — fix broken build, tests, or deploy
   pipeline first.
2. **Complete in-progress work** — one done beats three started.
3. **Advance the current milestone** — push defined tasks forward.
4. **Derive next work from product mission** — or improve
   AI-manageability (tests, API boundaries, docs).
