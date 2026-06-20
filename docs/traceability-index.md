---
status: active
maintained_by: ai-agents
created: 2026-06-20
last_updated: 2026-06-20
purpose: Map lanes to packages, skills, contracts, and fixtures.
---

# Traceability index

| Lane | Package | Skill | INTERFACE | Contracts | Simulators |
|------|---------|-------|-----------|-----------|------------|
| 0 Platform | `packages/lane-platform` | `.agents/skills/lane-platform/SKILL.md` | `packages/lane-platform/INTERFACE.md` | `packages/lane-platform/contracts/` | — |
| 1 Auth | `packages/lane-auth` | `.agents/skills/lane-auth/SKILL.md` | `packages/lane-auth/INTERFACE.md` | `packages/lane-auth/contracts/` | `data/simulators/auth/` |
| 2 Profiles | `packages/lane-profiles` | `.agents/skills/lane-profiles/SKILL.md` | `packages/lane-profiles/INTERFACE.md` | TBD | TBD |
| 3 Sessions | `packages/lane-sessions` | `.agents/skills/lane-sessions/SKILL.md` | `packages/lane-sessions/INTERFACE.md` | TBD | TBD |
| 4 Agent | `packages/lane-agent` | `.agents/skills/lane-agent/SKILL.md` | `packages/lane-agent/INTERFACE.md` | TBD | TBD |
| 5 Memory | `packages/lane-memory` | `.agents/skills/lane-memory/SKILL.md` | `packages/lane-memory/INTERFACE.md` | TBD | TBD |
| 6 Credentials | `packages/lane-credentials` | `.agents/skills/lane-credentials/SKILL.md` | `packages/lane-credentials/INTERFACE.md` | TBD | TBD |
| 7 Tools | `packages/lane-tools` | `.agents/skills/lane-tools/SKILL.md` | `packages/lane-tools/INTERFACE.md` | TBD | TBD |
| 8 Scheduler | `packages/lane-scheduler` | `.agents/skills/lane-scheduler/SKILL.md` | `packages/lane-scheduler/INTERFACE.md` | TBD | TBD |
| 9 Trajectory | `packages/lane-trajectory` | `.agents/skills/lane-trajectory/SKILL.md` | `packages/lane-trajectory/INTERFACE.md` | TBD | TBD |
| App host | `apps/orbita-api` | — | — | — | — |

## Entry points

- Design spec: `usr/ORBITA_DESIGN.md`
- Architecture: `docs/product-architecture.md`
- Agent guidelines: `.agents/instructions/project-guidelines.md`
