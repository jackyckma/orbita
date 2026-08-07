# Cursor Automations Autopilot (optional)

Protocol for **unattended development via Cursor Automations** — a
deterministic Maker/Checker loop driven by repo state files, not by a
single long-lived chat session.

**Adoption gate:** list this practice in the project's
`project-guidelines.md` § Adopted optional practices (e.g.
`cursor-autopilot`). Projects that only need session batching should use
[`autonomous-loop.md`](autonomous-loop.md) (Tier B4) instead.

Depends on: `issue-quality.md`, `judgment-rubrics.md`,
`decision-authority.md`, `model-orchestration.md` (verification-not-by-author).

Validated on the Powerhouse / HiFi Job project; harvested into this bundle
as **v1.3.0**.

---

## 1. What this is (and is not)

| | Session loop (`autonomous-loop.md`) | Cursor Autopilot (this file) |
|--|--|--|
| Runner | One interactive agent session | Cron Cursor Automations |
| Queue | Issues / handoff | `docs/autopilot/backlog.json` |
| What to do next | Agent judgment | `decide-next-action.mjs` (deterministic) |
| Merge | Same session often merges | **Checker only** merges; Maker never merges |

The LLM **executes** one playbook action per tick. Choosing *which* action
is a script — that keeps the loop debuggable and prevents Maker/Checker
role collapse.

---

## 2. Architecture

```text
roadmap.json (founder-approved epics)
        │
        ▼
decisions.json ◀── SLA defaults ── Maker REPLAN
        │
        ▼
backlog.json ──► Maker IMPLEMENT ──► open PR
                        │
                        ▼
                 Checker REVIEW (verify-all) ──► merge main
                        │
                        ▼
                 Checker WATCHDOG (optional prod smoke)
                        │
                        ▼
                 Checker REPORT (daily/weekly)
```

| Lane | Hats | Must never |
|------|------|------------|
| **Maker** | Planner + Worker | Merge to main |
| **Checker** | Reviewer + Watchdog + Reporter | Write feature code |

UI surface: **two** Cursor Automations only. Behavior lives in
`docs/autopilot/playbook.md` + `scripts/autopilot/*` (version-controlled).
Do **not** edit long prompts in the Cursor UI after setup.

---

## 3. Install into a project

### 3.1 Files (bootstrap or sync)

From this bundle:

```text
docs/autopilot/          # README, playbook, automations, JSON scaffolds
scripts/autopilot/       # dispatcher + helpers (no npm deps)
instructions/cursor-autopilot.md   # this file → .agents/instructions/
```

Bootstrap copies them when present. On sync, treat **scripts + empty
scaffolds + playbook/automations/README** as framework-owned; treat
**filled** `backlog.json` / `decisions.json` / `roadmap.json` /
`reports/` as **project-owned** (never overwrite from upstream).

### 3.2 Project hooks (customize once)

| Hook | Purpose |
|------|---------|
| `scripts/agent-verify.sh` | L0/L1 — preferred default for `verify-all.mjs` |
| `docs/autopilot/project-hooks.md` | Optional: prod smoke command, PR branch prefix |
| Feature-flag convention | New user-facing work ships behind a flag, default **off** |

### 3.3 Cursor UI (manual — cannot be automated by this repo)

1. Create automation **Maker** — cron e.g. `0 */2 * * *`; paste prompt from
   `docs/autopilot/automations.md`.
2. Create automation **Checker** — cron e.g. `30 */2 * * *`; paste Checker
   prompt from the same file.
3. Grant repo permissions: push, open PR, merge (Checker), `gh` auth.
4. Disable any older 5-role Planner/Worker/Reviewer/… automations.

### 3.4 First fuel

1. Add one `approved` epic to `roadmap.json`.
2. Add 2–N `ready` tasks with **machine-checkable** `acceptance` commands.
3. Confirm `./scripts/agent-verify.sh` (or project verify) is green on main.
4. Wait for a Maker tick (or run the Maker prompt once manually).

---

## 4. Hard rules (non-negotiable)

1. **Green-only merge** — Checker never merges red `verify-all`.
2. **Lease on main first** — Maker writes `locks.json` + `in_progress` on
   **main** and pushes **before** creating a feature branch (prevents
   duplicate Maker grabs).
3. **Never `git add -A`** — stage only files for the task.
4. **Flags default off** — Automations must not flip prod feature flags.
5. **Roadmap-bounded** — Maker REPLAN only decomposes `approved` epics;
   new direction → `proposed` epic + decision.
6. **Judgment → `needs_human`** — do not autonomously replan architecture /
   compliance tasks.
7. **PR titles include `T-xxxx`** — Checker matches leases and closes
   duplicates.

---

## 5. Autonomy model: `log_veto`

- Reversible choices → Maker decides, logs in task `feedback`; founder may
  veto via the daily report.
- Product-direction / contract / compliance → `decisions.json` with options
  + recommendation; optional `default_if_silent` + `sla_days` so multi-day
  runs do not stall (null default = must wait for human).

Aligns with `decision-authority.md` tiers.

---

## 6. When not to adopt

- No reliable verify command yet.
- Founder wants every change interactively reviewed.
- Repo cannot grant an automation merge rights (use session loop + human merge).
- Product is compliance-heavy and almost every task is Tier-3.

---

## 7. Upstream harvest note

Project-specific smoke URLs, quarantine lists, and filled backlogs stay in
the project. Process lessons that generalize (lease-on-main, two-lane UI,
SLA defaults) belong here — tag `upstream-candidate:` in the project's
learnings doc when something new proves out.
