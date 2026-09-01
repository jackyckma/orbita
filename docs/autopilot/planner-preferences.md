# Planner preferences (founder decision patterns)

> Maker REPLAN reads this when framing `decisions.json` recommendations.
> Append durable patterns; keep short. Separate from `AGENTS.md` continual-learning.

## Standing preferences

- Prefer least-dependency, fastest verifiable slice.
- Avoid over-engineering; recommend the lean option.
- API-first, thin UI: contract → API → UI.
- Flag new user-facing features (default off); never flip prod flags autonomously.
- Ask (decisions.json) only for product direction, contracts, milestones, compliance.

## Learned patterns (append-only)

- Mechanical failures (typecheck, merge conflicts, rebase) that exhausted retries may be bounced `needs_human` → `ready` on REPLAN when the fix path is explicit — do not bounce judgment/env tasks (e.g. prod credential gaps).
- **runtime-activation tasks** (harness row, credential, cron, feature flag) must include acceptance that proves **observable output** — a report note written, a DB row created, a smoke call returning expected data — not only typecheck/tests/rg proving code exists. Example: portfolio collector tasks should require at least one `type=report` note or `portfolio_brief` no longer reporting staleness for a real project.
- **Split verify scripts from activation** when prod API keys block the Maker sandbox: one ready task authors `*-verify-output.sh` with `test -f` + `bash -n` acceptance; a dependent task runs setup harness + `./script` against prod (may go `needs_human` on missing `~/.orbita-personal.env`, same as T-0058).
