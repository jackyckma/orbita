# Autopilot — Cursor Automations loop (template)

> Source of truth for the unattended development loop. **Humans define work here;
> automations execute and report.** Acceptance criteria must be *machine-checkable*.
>
> Adopted from [ai-dev-methodologies](https://github.com/jackyckma/ai-dev-methodologies)
> (`instructions/cursor-autopilot.md`). Customize project hooks; do not put long
> prompts only in the Cursor UI.

## Principle

Every task is judged **pass/fail by a command**, not by opinion. If success can
only be judged by a human, mark the task `needs_human`.

## Two lanes

| Lane | Does | Never |
|------|------|-------|
| **Maker** | IMPLEMENT / REPLAN | Merge |
| **Checker** | REVIEW / CLOSE_STALE / WATCHDOG / REPORT | Feature code |

See `automations.md` (paste prompts) and `playbook.md` (action steps).
Dispatcher: `node scripts/autopilot/decide-next-action.mjs --lane maker|checker`.

## Guardrails

- Green-only merge via `verify-all.mjs`.
- Lease tasks on **main** before branching.
- Never `git add -A`.
- New user-facing features behind flags (default off); automations do not flip prod flags.
- Roadmap-bounded: only decompose `approved` epics.
- Verification not by author (Checker ≠ Maker).

## Setup checklist

1. Fill `roadmap.json` with at least one `approved` epic.
2. Add `ready` tasks in `backlog.json` with `acceptance` commands.
3. Set `scripts/agent-verify.sh` (or `AUTOPILOT_VERIFY_CMD`).
4. Optional: `project-hooks.json` → `prod_smoke_cmd` for WATCHDOG.
5. Create **two** Cursor Automations from `automations.md`.
6. Confirm `gh` auth and merge permissions for the Checker automation.

## Files

| File | Purpose |
|------|---------|
| `playbook.md` | Logic automations execute |
| `automations.md` | Thin Maker/Checker prompts + cron |
| `roadmap.json` | Founder-approved epics |
| `backlog.json` | Task queue |
| `decisions.json` | Batched decisions + SLA |
| `locks.json` / `pause-state.json` | Leases / kill-switch |
| `project-hooks.json` | Prod smoke command (optional) |
| `planner-preferences.md` | Decision-bias notes |
| `reports/` | Daily/weekly output |
