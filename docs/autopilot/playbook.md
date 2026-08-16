# Autopilot playbook — the file the automations execute

> **This file IS the automation logic.** Each Cursor Automation is a thin shell:
> pull → run dispatcher → do exactly one action below → stop.
>
> - **Maker** — produces changes; **never merges.**
> - **Checker** — verifies, merges, optional prod guard, reports; **never writes feature code.**

## Every run

```bash
git fetch --all -q && git checkout main -q && git pull --rebase -q
node scripts/autopilot/decide-next-action.mjs --lane <maker|checker>
```

Execute only the returned JSON `action`. If `IDLE`, stop.

Prefer dependency-free verify commands documented in `docs/AGENT_ENV.md`.

**`FORCE_NEEDS_HUMAN` is not a failure state to avoid — it is the loop working
correctly.** A lock older than `STALE_LOCK_HOURS` (default 4) with its task
still sitting in the state that lock represents means every run that touched it
crashed before reaching its own bounce-to-`ready` or bounce-to-`needs_human`
step — the normal retry/escalation bookkeeping never got a chance to fire. The
dispatcher catches this from `locks.json.since` alone, so it fires regardless of
*why* those runs crashed. Execute it exactly as instructed below and stop; do
not investigate the crash as part of this tick, and do not treat receiving this
action as something to route around.

---

## MAKER lane actions

### `FORCE_NEEDS_HUMAN` (payload: `taskId`, `ageHours`, `reason`)

On **main**:

1. `backlog.json`: task → `status: needs_human`. Append to `feedback`: one
   entry noting the lock age and that it was auto-escalated (not a bounce from
   a completed run — no run this tick actually touched the task).
2. `locks.json`: remove the `<taskId>` entry entirely.
3. Commit + push to `main`. **Do not** attempt to diagnose or fix the
   underlying task in the same tick — that is a fresh `IMPLEMENT` after a human
   re-approves it, not a continuation of this one.

### `IMPLEMENT` (payload: `taskId`, `task`)

**Lock on `main` first — never only on the feature branch.**

1. `git checkout main && git pull --rebase`.
2. Lease on **main**:
   - `backlog.json`: task `status: in_progress`.
   - `locks.json`: `"locks": { "<taskId>": { "by": "maker", "since": "<ISO>", "branch": null, "pr": null } }`.
   - Commit + **push to `main`**. Only then create a feature branch.
3. `git checkout -b cursor/…` from that tip. Implement per task `description`.
   New user-facing behavior **must** use the task's `flag` (default off).
   Stage only changed files — **never `git add -A`**. Prefer not editing
   backlog/locks on the feature branch.
4. Run every `acceptance` command (+ project base verify). All must exit 0.
   - Green → `gh pr create` with title including **`T-xxxx`**. Draft OK.
     On **main**: `status: in_review`, set lock `pr` + `branch`, append
     `feedback`, push **main**. **Do NOT merge.**
   - Mechanical fail & retries left → on main: clear lock, `ready`,
     increment `retries`, log error, push.
   - Judgment fail / retries exhausted → on main: clear lock,
     `needs_human`, push. Never replan judgment tasks yourself.

### `REPLAN`

Edit **only** `docs/autopilot/*`. No app code / flags / PR merges.

1. `node scripts/autopilot/apply-decision-defaults.mjs` — flip `unblocks` tasks to `ready` when auto-decided.
2. `node scripts/autopilot/queue-status.mjs`.
3. Decompose the next `approved` epic into small `ready` tasks
   (contract → API → thin UI), each with machine-checkable `acceptance`.
   - Reversible → ready tasks (decide-and-log).
   - Direction / contract / compliance → `decisions.json` (options + recommendation;
     `default_if_silent` null only for high-stakes).
   - Never invent direction → `proposed` epic + decision.
4. Optionally append durable patterns to `planner-preferences.md`.
5. Commit + push `docs/autopilot/*` to main (no PR).

### `IDLE`

Stop.

---

## CHECKER lane actions

> Exclude branches containing `learner` from auto-merge (founder-gated process PRs).
> Only review open PRs whose **title includes a task id** (`T-xxxx`) — Maker must put
> the task id in the PR title. Unrelated `cursor/*` drafts are ignored.

### `FORCE_NEEDS_HUMAN` (payload: `taskId`, `pr`, `ageHours`, `reason`)

On **main**:

1. `backlog.json`: task → `status: needs_human`. Append to `feedback`: one
   entry noting the lock age and that REVIEW kept failing to complete before it
   could bounce the task itself.
2. `locks.json`: remove the `<taskId>` entry entirely.
3. Commit + push to `main`. **Leave the pull request itself untouched** — do
   not close it, do not merge it. It stays open on GitHub for a human to
   inspect; the dispatcher will not offer it for `REVIEW` again once its task
   is `needs_human`, so later PRs in the queue get their turn instead of
   waiting behind this one.

### `CLOSE_STALE` (`pr`, `branch`, `taskId?`)

If task is `done` on main or `locks.json` points at another PR for the same
`T-xxxx`: close this PR as superseded. Do not change backlog for the winner.

### `REVIEW` (`pr`, `branch`)

You did not author this PR.

1. Superseded? → `CLOSE_STALE`.
2. Checkout PR head; `node scripts/autopilot/verify-all.mjs`. FAIL → comment,
   bounce task to `ready` or `needs_human`, never merge.
3. Scope: diff matches task description; new UX behind flag.
4. Sensitive paths (auth/API/DB) → security review if available; block on high-confidence findings.
5. Green → `gh pr ready` then `gh pr merge --merge --delete-branch`.
   On main: task `done`, clear lock, push. Close duplicate `T-xxxx` PRs.

### `WATCHDOG`

1. Allow deploy time after merge if the project auto-deploys.
2. `node scripts/autopilot/deploy-watchdog.mjs`.
   - PASS → stop.
   - FAIL → pause set (`by=deploy-watchdog`). Revert the bad merge if safe,
     note `needs_human`, re-run watchdog after recovery.

If no `prod_smoke_cmd` is configured, watchdog only records the main sha (see
`project-hooks.json`).

### `REPORT` (`kind` = daily | weekly)

- daily: `node scripts/autopilot/render-report.mjs > docs/autopilot/reports/$(date -u +%F).md`
- weekly: `node scripts/autopilot/weekly-report.mjs > docs/autopilot/reports/weekly-$(date -u +%F).md`
- Commit + push reports. No feature code.

### `IDLE`

Stop.
