# Autonomous work loop

Protocol for extended unattended runs **inside one agent session** — when the
founder says "work the queue", "keep going until X", "/loop", or approves a
batch of issues for autonomous execution. The goal: founder attention shifts
from per-task approval to batch review of results.

For **cron Cursor Automations** (Maker/Checker, `docs/autopilot/`), see
[`cursor-autopilot.md`](cursor-autopilot.md) instead — that is a different
runner with a deterministic dispatcher.

Depends on: `issue-quality.md` (agent-ready issues), `judgment-rubrics.md`
(done/stuck/ask), `decision-authority.md` (tiers, decision queue),
`model-orchestration.md` (dispatch and verification).

---

## 1. Preconditions — all must hold before the first iteration

- [ ] Verification exists: `VERIFY_L0`/`VERIFY_L1` set (or equivalent
      commands documented in `docs/AGENT_ENV.md`) **and** they currently
      pass on the starting commit. A loop without working verification is
      unreviewable output, not autopilot.
- [ ] Queue has issues that satisfy the agent-ready checklist
      (`issue-quality.md`): testable AC, allowed paths, validation command.
- [ ] Working branch agreed (never loop directly on `main`).
- [ ] A **budget** is set. If the founder gave none, default:
      **3 completed issues or the first Tier-3 decision, whichever comes
      first** — then stop and report.

If a precondition fails, fix that first (e.g. propose AC for one issue and
queue it for confirmation) — do not start looping.

## 2. The loop

```text
PICK → IMPLEMENT → VERIFY → COMMIT → RECORD → (stop check) → PICK …
```

1. **Pick** — next unblocked agent-ready issue, in priority order: broken
   feedback loop (build/tests/deploy) first, then in-progress work, then
   current milestone (`decision-authority.md` § Priority when unstuck).
2. **Implement** — per `karpathy-guidelines.md`, inside the issue's allowed
   paths. Dispatch mechanical subtasks per `model-orchestration.md`.
3. **Verify** — per `judgment-rubrics.md` §1: artifact per AC item,
   produced after the last change, not self-reviewed.
4. **Commit** — one issue = one commit (or PR). Message references the
   issue ID. Never bundle issues.
5. **Record** — update the loop log (§3) and, if a Tier-2 decision
   surfaced, add the brief to the pending-decisions queue and continue.
6. **Stop check** — §4. If nothing fired, go to 1.

## 3. Loop log — external memory, written every iteration

Append one row per iteration to the `## Loop log` section of
`docs/SESSION_HANDOFF.md` (add the section if the project's handoff
predates it):

```text
| # | Issue | Outcome | Commit | Verified by |
|---|-------|---------|--------|-------------|
| 1 | APP-031 | done | abc123 | npm test (14/14) |
| 2 | APP-032 | blocked — needs staging URL | — | — |
```

Write it **after every iteration**, not at the end. If the session dies
mid-loop, the log plus the last commit is the whole handoff.

## 4. Stop conditions — exit, write handoff, report

Stop the loop when **any** fires:

- Budget exhausted (issue count reached).
- A **Tier-3** decision is required (`decision-authority.md`).
- Two consecutive issues ended **blocked**.
- A wrong-direction signal (`judgment-rubrics.md` §5) fired twice within
  one issue.
- Queue is empty, or every remaining issue fails the agent-ready checklist.
- **Verification broke**: the verify commands themselves stopped working.
  Stop immediately — a loop that cannot check itself must not continue.

## 5. Exit report — one message, batch format

1. The loop log table (final state).
2. Queued decision briefs, grouped (`decision-authority.md` format).
3. Blockers with what was already tried.
4. Recommended next budget / next queue.

This single message replaces the stream of per-task questions the loop
exists to avoid.

## 6. Anti-patterns

| Anti-pattern | Why it fails |
|--------------|--------------|
| Looping past a broken verify command "because the code is probably fine" | Every subsequent "done" is unverifiable; the whole batch becomes review debt |
| Silently inventing AC for a non-ready issue | Agent-defined done ≠ founder-defined done; draft AC, queue it, move to the next ready issue |
| Spending the whole budget retrying one issue | Two-strike rule applies inside the loop; mark blocked, move on |
| One commit for five issues | Unreviewable; one issue = one commit |
| Loop log written only at session end | A crash loses the entire run's context |
