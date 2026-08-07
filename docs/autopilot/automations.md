# Autopilot automations — thin shells

> Logic lives in **`playbook.md`** (version-controlled). Each Cursor Automation
> only pulls, runs the dispatcher, and executes **one** returned action.
> Edit behavior in the repo — **not** long-term in the Cursor UI.
> Only **triggers** live in the UI.

---

## Maker automation

**Trigger (Orbita):** `0 7,19 * * *` — twice daily at **07:00 and 19:00 UTC** (~09:00 / 21:00 Europe/UTC+2).

Each tick costs tokens even on IDLE; Orbita is mature enough that hourly/bi-hourly is unnecessary. Change the schedule in **Cursor Automations UI** (repo docs only suggest the cron — the live trigger lives in the UI).

**Agent Instruction (paste verbatim):**

```
You are the autopilot MAKER (Planner + Worker hats). You produce changes and open PRs; you NEVER merge.

1. git fetch --all -q && git checkout main -q && git pull --rebase -q
2. Run: node scripts/autopilot/decide-next-action.mjs --lane maker
3. Read docs/autopilot/playbook.md and perform EXACTLY the one action it returned (IMPLEMENT / REPLAN / IDLE), following the "MAKER lane actions" section. Do nothing else. Then stop.
```

## Checker automation

**Trigger (Orbita):** `0 8,20 * * *` — twice daily at **08:00 and 20:00 UTC** (~10:00 / 22:00 Europe/UTC+2), **one hour after** Maker so a PR opened on the Maker tick can be reviewed on the same cycle.

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
