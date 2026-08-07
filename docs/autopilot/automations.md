# Autopilot automations — thin shells

> Logic lives in **`playbook.md`** (version-controlled). Each Cursor Automation
> only pulls, runs the dispatcher, and executes **one** returned action.
> Edit behavior in the repo — **not** long-term in the Cursor UI.
> Only **triggers** live in the UI.

---

## Maker automation

**Trigger (suggested):** `0 */2 * * *` (every 2 hours at :00).  
Slow on purpose — each tick costs tokens even on IDLE.

**Agent Instruction (paste verbatim):**

```
You are the autopilot MAKER (Planner + Worker hats). You produce changes and open PRs; you NEVER merge.

1. git fetch --all -q && git checkout main -q && git pull --rebase -q
2. Run: node scripts/autopilot/decide-next-action.mjs --lane maker
3. Read docs/autopilot/playbook.md and perform EXACTLY the one action it returned (IMPLEMENT / REPLAN / IDLE), following the "MAKER lane actions" section. Do nothing else. Then stop.
```

## Checker automation

**Trigger (suggested):** `30 */2 * * *` (every 2 hours at :30).

**Agent Instruction (paste verbatim):**

```
You are the autopilot CHECKER (Reviewer + Watchdog + Reporter hats). You verify, merge, guard prod, and report; you NEVER write feature code. You are the ONLY role that merges to main.

1. git fetch --all -q && git checkout main -q && git pull --rebase -q
2. Run: node scripts/autopilot/decide-next-action.mjs --lane checker
3. Read docs/autopilot/playbook.md and perform EXACTLY the one action it returned (REVIEW / CLOSE_STALE / WATCHDOG / REPORT / IDLE), following the "CHECKER lane actions" section. Do nothing else. Then stop.
```

## Permissions

- Maker: push to main (for leases / REPLAN docs), create branches, open PRs.
- Checker: push to main, merge PRs, run verify + optional prod smoke.

## Migration from many roles

If you previously had separate Planner / Worker / Reviewer / Watchdog / Reporter
automations: **disable them** and use only Maker + Checker above.
