# Judgment rubrics

Decisions that normally need senior judgment, written as checklists any
model can execute. Complete the relevant rubric before acting; when two
outcomes both seem right, take the safer one (verify / escalate / ask) —
but only after running the rubric, not instead of it.

---

## 1. Definition of done

Claim "done" only when **all** of these hold:

- [ ] Every acceptance-criteria item has a **verification artifact**
      (test-run output, file read-back, HTTP response, screenshot) produced
      **after** the last change.
- [ ] Verification was execution or a fresh-context check (see
      `model-orchestration.md` §6) — not a re-read of your own diff.
- [ ] Build/test output shows no **new** warnings or errors.
- [ ] Required bookkeeping updated: session handoff, progress doc,
      `INTERFACE.md` if an API changed, index files if a file was added.

**Positive example:** "AC: POST /token returns 401 on bad key. After final
edit, ran `npm test -- token`: 4/4 pass, including the new test
`rejects invalid key`. Done."

**Negative example:** "I implemented the 401 branch and the code looks
correct, so this is done." — no artifact, self-review only. Not done.

## 2. After a failed attempt: retry, change approach, or escalate

Classify the failure before touching anything:

| Signal | Action |
|--------|--------|
| Same error, cause understood, fix mechanical | Retry once with that fix |
| New/different error, cause unclear | Stop editing; gather information (logs, minimal repro) first |
| Two attempts failed the same way, or fixes revert each other | The approach is wrong — change approach or escalate; never run attempt #3 of the same idea |
| Correct fix would require files outside allowed paths, or contradicts `INTERFACE.md` | Not a bug — a scope/contract issue; stop and ask |

**Positive example:** "Test fails on timezone handling. Attempt 1 changed
the format string — failed differently. Attempt 2 pinned TZ — failed like
attempt 1. Stopping: my hypothesis is wrong; checking whether the fixture
data itself is stale before touching code again."

**Negative example:** Editing the same regex five times with small
variations, hoping one passes. That is attempt #3–#6 of the same idea.

## 3. When to escalate to a stronger model / context

Escalate (per the `model-orchestration.md` §5 ladder) when **any** holds:

- [ ] The two-strike rule fired (same subtask failed twice at your tier).
- [ ] The task needs 3+ interacting constraints held at once (e.g. schema
      + auth + backward compatibility) and your outputs keep violating one
      of them.
- [ ] You cannot explain **why** your candidate fix works — it just makes
      the symptom disappear.
- [ ] The decision is on the `decision-authority.md` **Tier 3
      (block-and-ask) list** and no human is available right now —
      escalate for a second opinion while the question waits in the queue.

**Positive example:** "Race condition: two failed fixes at mid tier. Wrote
failure trail (attempt, error, hypothesis) and escalated to high tier."

**Negative example:** "The linter error was confusing, so I escalated to
the most expensive model" — a lint message with a documented fix is
cheap-tier work; look it up first.

## 4. When to stop and ask the user

**Ask** when any of these is true; otherwise do not interrupt:

- [ ] The choice is on the `decision-authority.md` **Tier 3
      (block-and-ask) list**: production deploy or merge to main,
      irreversible migration or data deletion, public API/schema breaks
      others consume, real money or missing credentials,
      security/compliance/privacy implications.
- [ ] Acceptance criteria are ambiguous **and** the interpretations diverge
      in a way that is expensive to reverse.
- [ ] Real scope is ≥2× what the issue describes.

Architecture choices with a viable reversible default are **Tier 2**:
queue a decision brief and keep working — do not block on them.

Do **not** ask about: naming within conventions, internal structure,
reversible defaults, which of two equivalent small tasks to do first —
decide, note it, continue. Non-urgent questions go to the decision queue
(`decision-authority.md`) and are batched, not fired one at a time.

**Positive example:** "Issue says 'store user preferences' — dedicated
table vs JSON column diverge on migration cost. Queued a decision brief
with a recommendation; meanwhile implementing behind an interface both
options satisfy."

**Negative example:** "Should the helper be `formatDate` or `dateFormat`?"
— never ask this; pick the one matching existing code.

## 5. Wrong-direction signals — change path, don't push harder

Stop and reconsider the plan (not the code) when **any** appears:

- [ ] Whack-a-mole: each fix breaks something else, two cycles in a row.
- [ ] The diff is ≈3× larger than the task plausibly requires.
- [ ] You are disabling tests, lint rules, or type checks "to make
      progress".
- [ ] You are working **around** the framework/library instead of with it
      (reimplementing routing, hand-parsing what a library parses).
- [ ] The plan now requires touching paths the issue excludes.

Recovery: write down the current state, re-read the issue and
`INTERFACE.md`, list at least two alternative approaches, then pick one or
ask (rubric 4). Reverting to the last good commit is a legitimate move.

**Positive example:** "Adding the third `as any` cast to silence the type
error — that's signal 3. Reverting; the type error is telling me the DTO
shape is wrong upstream."

**Negative example:** "Only four more test files to patch and the refactor
compiles" — while the original task was a one-line bug fix.

## 6. Quality floor — before any commit or handoff

Minimum bar regardless of what the issue says (AC may demand more, never
less):

- [ ] Build and tests pass, or every failure is pre-existing and named in
      the handoff.
- [ ] No secrets, tokens, or credentials anywhere in the diff.
- [ ] No leftover debug prints, commented-out blocks, or dead files from
      your own work.
- [ ] Every changed line traces to the request (`karpathy-guidelines.md`
      §3); deliberate shortcuts carry `defer:` markers.
- [ ] New files are indexed wherever the framework requires (docs index,
      `METHODOLOGIES.md` for framework work) — an unindexed file is
      invisible to the next agent.

**Positive example:** "Commit contains the fix, its test, and a handoff
note that `test_legacy_import` was already failing on main (issue #41)."

**Negative example:** "Committing now, will clean up the console.log lines
and the half-finished helper in a follow-up" — the follow-up never comes;
the floor exists precisely for this.
