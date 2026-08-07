# Shared Agent Instructions

Cross-agent instructions for this project. Bootstrapped from [ai-dev-methodologies](https://github.com/jackyckma/ai-dev-methodologies).

| Tool | Entry point |
|------|-------------|
| Cursor | `.cursor/rules/shared-instructions.mdc` |
| Claude Code | `CLAUDE.md` |
| Codex | `AGENTS.md` |

All three entry points name the **same four always-read files**, then point
here. Keep them in parity — if you change one, change all three.

## Instruction files — read by trigger

| File | Read when |
|------|-----------|
| `instructions/karpathy-guidelines.md` | Always, before non-trivial work |
| `instructions/judgment-rubrics.md` | Always — re-check before claiming done, when stuck, before asking the user |
| `instructions/project-guidelines.md` | Always — **customize per project** (stack, deploy, language) |
| `instructions/agent-tooling-guardrails.md` | Always — mandatory before adding dependencies or browser/E2E tooling |
| `instructions/decision-authority.md` | Any decision beyond trivial; at session end to present queued decision briefs |
| `instructions/session-handoff.md` | Pausing, resuming, or switching agents/environments |
| `instructions/model-orchestration.md` | Before dispatching subagents or choosing models/effort |
| `instructions/autonomous-loop.md` | Founder approves an unattended multi-issue **session** run |
| `instructions/cursor-autopilot.md` | Project adopts Cursor Automations Maker/Checker loop (`docs/autopilot/`) |
| `instructions/issue-quality.md` | Creating or triaging issues for agent work |
| `instructions/framework-adoption.md` | Bootstrapping or syncing this methodology bundle |
| `instructions/framework-evolution.md` | Changing the framework itself; tagging `upstream-candidate:` learnings |
| `instructions/agent-native-practices.md` | A Tier E practice is adopted in project-guidelines, or the founder asks about them |
| `instructions/lane-based-development.md` | Lane-based projects only |
| `instructions/METHODOLOGIES.md` | Choosing which methodologies apply to this project |

## Methodology pin

| File | Purpose |
|------|---------|
| `METHODOLOGY.lock` | Bundle version synced into this project — read before manual updates |
| `instructions/framework-adoption.md` | Import rules and manual sync process |

## Optional skills

| Skill | Purpose |
|-------|---------|
| `skills/complexity-review/` | PR diff review for over-engineering |
| `skills/deferred-shortcuts/` | Scan `defer:` comments into a ledger |

## Optional defaults

See `defaults/` for founder Zeabur / Cloudflare / AI provider conventions.
