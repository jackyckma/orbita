# AI Development Methodologies — Master Index

> **For AI agents:** This is the entry point for methodology selection. Read this file first, then load only the instruction files relevant to the current project and task.
>
> **Canonical repo:** [jackyckma/ai-dev-methodologies](https://github.com/jackyckma/ai-dev-methodologies)

This bundle is **independent of OrbitaDev** and any autonomous PM/orchestrator. OrbitaDev-managed projects may consume this repo separately; their hosted PM adds its own rules on top.

---

## How to adopt

```bash
git clone https://github.com/jackyckma/ai-dev-methodologies.git /tmp/ai-dev-methodologies
/tmp/ai-dev-methodologies/scripts/bootstrap-project.sh /path/to/your-project
```

Then customize `.agents/instructions/project-guidelines.md`.

---

## Methodology catalog

### Tier A — Core (every AI-assisted project)

| # | Methodology | File |
|---|-------------|------|
| A1 | Shared agent instructions (thin entry points) | Bootstrap templates |
| A2 | Karpathy coding discipline | [karpathy-guidelines.md](instructions/karpathy-guidelines.md) |
| A3 | Project-specific guidelines | [project-guidelines.template.md](templates/project-guidelines.template.md) |
| A4 | Live documentation | [templates/docs/](templates/docs/) |
| A5 | Session handoff | [session-handoff.md](instructions/session-handoff.md) |
| A6 | Decision authority | [decision-authority.md](instructions/decision-authority.md) |
| A7 | Framework adoption and manual updates | [framework-adoption.md](instructions/framework-adoption.md) |

### Tier B — Planning & coordination (multi-module projects)

| # | Methodology | File |
|---|-------------|------|
| B1 | Lane-based development | [lane-based-development.md](instructions/lane-based-development.md) |
| B2 | Issue quality (AC + allowed paths) | [issue-quality.md](instructions/issue-quality.md) |
| B3 | API-first / thin UI | Lane doc §3 layer order |

### Tier C — Agent tooling & verification

| # | Methodology | File |
|---|-------------|------|
| C1 | Agent tooling guardrails (MCP-first) | [agent-tooling-guardrails.md](instructions/agent-tooling-guardrails.md) |
| C2 | Local vs Cloud compatibility | [local-vs-cloud-agents.md](compatibility/local-vs-cloud-agents.md) |
| C3 | Verification ladder (L0–L5) | Same |
| C4 | Complexity review (optional skill) | [templates/.agents/skills/complexity-review/](templates/.agents/skills/complexity-review/) |
| C5 | Deferred shortcuts ledger (optional skill) | [templates/.agents/skills/deferred-shortcuts/](templates/.agents/skills/deferred-shortcuts/) |

### Tier D — Optional founder defaults

| # | Default stack | File |
|---|---------------|------|
| D1 | Zeabur deploy | [defaults/zeabur.md](defaults/zeabur.md) |
| D2 | Cloudflare DNS/email | [defaults/cloudflare.md](defaults/cloudflare.md) |
| D3 | AI providers (Minimax default) | [defaults/ai-providers.md](defaults/ai-providers.md) |

---

## Agent reading order (session start)

### Any project

1. `docs/README.md`
2. `docs/CURRENT_STATUS.md`
3. `docs/SESSION_HANDOFF.md` (if resuming)
4. `.agents/instructions/karpathy-guidelines.md`
5. `.agents/instructions/project-guidelines.md`
6. `docs/AGENT_ENV.md` (if present — especially when using Cloud Agents)

### Lane-based project (add)

7. `docs/traceability-index.md`
8. `docs/product-architecture.md`
9. Target lane `INTERFACE.md` + lane `SKILL.md`

---

## Adoption matrix

| Project profile | Adopt |
|-----------------|-------|
| Solo script / tiny app | A1–A3, A5, C1 |
| Small product (1 agent) | A + B2 + C + D (optional) |
| Multi-module product | A + B1 + B2 + C + live docs |
| Local + Cloud Agents | A + C2 + `agent-verify.sh` + Zeabur staging (D1) |

---

## Files in this repo

| Path | Role |
|------|------|
| `instructions/` | Canonical methodology text |
| `defaults/` | Optional Zeabur / Cloudflare / AI provider defaults |
| `compatibility/` | Local Cursor vs Cloud Agent workflow |
| `templates/` | Copied into target projects by bootstrap |
| `scripts/` | Bootstrap and cloud env setup |
| `VERSION` | Current bundle semver |
| `CHANGELOG.md` | Release notes for manual project sync |
| `CHANGELOG-GUIDE.md` | Maintainer release checklist and entry template |

---

## Version

| Field | Value |
|-------|-------|
| Bundle version | 1.1.0 |
| Created | 2026-06-15 |
| Source | Practices from OrbitaDev + Powerhouse, generalized |

See [CHANGELOG.md](CHANGELOG.md). Bootstrapped projects pin version in `.agents/METHODOLOGY.lock`; update process in [framework-adoption.md](instructions/framework-adoption.md).
