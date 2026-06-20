---
status: active
maintained_by: ai-agents
purpose: Rules for importing this methodology into a project and manually syncing when the bundle updates.
---

# Framework adoption and updates

> **For AI agents:** Read this when the user asks to bootstrap, import, or **update** the development methodology from [ai-dev-methodologies](https://github.com/jackyckma/ai-dev-methodologies). Updates are **manual** — the founder notifies each project; there is no automatic pull.

---

## 1. One-time import (bootstrap)

### Command

```bash
git clone https://github.com/jackyckma/ai-dev-methodologies.git /tmp/ai-dev-methodologies
/tmp/ai-dev-methodologies/scripts/bootstrap-project.sh /path/to/your-project
```

Bootstrap **copies** files into the target repo. It does not link or submodule. Each project owns its copy.

### After bootstrap — project must customize

| File | Action |
|------|--------|
| `.agents/instructions/project-guidelines.md` | Fill stack, Zeabur IDs, domain, language |
| `docs/AGENT_ENV.md` | Fill verification commands, staging URL, local-only notes |
| `scripts/agent-verify.sh` | Set `VERIFY_L0` / `VERIFY_L1` |
| `docs/CURRENT_STATUS.md` | Project summary and phase |

Do **not** re-run full bootstrap with `--force` on an active project — it can overwrite customized files (see §3).

### Version pin

Bootstrap writes `.agents/METHODOLOGY.lock` recording which bundle version the project imported. Agents read this before any update.

---

## 2. File tiers (what to touch on update)

When the founder says the methodology was updated, apply changes **by tier** — not by re-importing everything.

### Framework-owned — safe to replace from upstream

Copy from a fresh clone of `ai-dev-methodologies` at the target version (tag or commit):

```text
.agents/instructions/METHODOLOGIES.md
.agents/instructions/karpathy-guidelines.md
.agents/instructions/session-handoff.md
.agents/instructions/decision-authority.md
.agents/instructions/agent-tooling-guardrails.md
.agents/instructions/issue-quality.md
.agents/instructions/lane-based-development.md   # if project uses lanes
.agents/instructions/framework-adoption.md
.agents/defaults/*.md
.agents/README.md
.agents/skills/**/SKILL.md                        # bundled skills only, not lane-* skills
AGENTS.md
CLAUDE.md
.cursor/rules/shared-instructions.mdc
scripts/setup-cloud-agent-env.sh
```

Replace the project's copy with the upstream file. If the project never adopted a new file (e.g. no `framework-adoption.md` yet), **add** it.

### Project-owned — never overwrite from upstream

```text
.agents/instructions/project-guidelines.md
docs/CURRENT_STATUS.md
docs/SESSION_HANDOFF.md
docs/product-*.md
docs/project-progress.md
docs/traceability-index.md
docs/errors-and-learnings.md
packages/**/INTERFACE.md
.agents/skills/lane-*/SKILL.md
```

Keep the project's version. If upstream adds a **new optional** section to a template, merge manually — do not blind overwrite.

### Hybrid — merge carefully

| File | Rule |
|------|------|
| `scripts/agent-verify.sh` | Keep project's `VERIFY_L0` / `VERIFY_L1`; take upstream structural changes only if CHANGELOG says so |
| `docs/AGENT_ENV.md` | Keep project-specific matrix; merge new rows from [agent-capability-matrix.template.md](../compatibility/agent-capability-matrix.template.md) if needed |
| `.cursor/rules/shared-instructions.mdc` | Keep project-specific bullets (e.g. language); merge new shared rules from upstream |

If the project edited a **framework-owned** file locally, treat it as hybrid: note the path in `METHODOLOGY.lock` → `customized_files` and merge by hand on update.

---

## 3. Manual update process

Triggered when the founder says e.g. *「methodology 更新到 1.2.0，請 sync」*.

### Step 1 — Read upstream release notes

```bash
git clone https://github.com/jackyckma/ai-dev-methodologies.git /tmp/ai-dev-methodologies
cd /tmp/ai-dev-methodologies && git checkout v1.2.0   # or the commit the founder names
cat CHANGELOG.md
```

Read what changed. Note `[breaking]` or migration sections.

### Step 2 — Compare with project lock

Read `.agents/METHODOLOGY.lock` in the target project:

- `version` — what the project has now
- `customized_files` — paths to skip or merge manually

Tell the founder briefly: **from → to**, which framework-owned files will change, any hybrid merges needed.

### Step 3 — Apply framework-owned files

Copy only files listed in §2 Framework-owned (and any paths named in CHANGELOG). Do **not** run `bootstrap-project.sh --force` unless the founder explicitly requests a full reset.

### Step 4 — Hybrid merges

For each hybrid file, diff project vs upstream and merge. Preserve project-specific values.

### Step 5 — Update lock and verify

Update `.agents/METHODOLOGY.lock`:

```yaml
version: "1.2.0"
source_commit: "<git rev-parse HEAD in framework repo>"
synced_at: "YYYY-MM-DD"
synced_by: "agent session / founder name"
customized_files: []   # keep or extend; do not remove entries without checking
notes: "Optional one-line summary of what was merged"
```

Run `./scripts/agent-verify.sh` if present. Note result in handoff or commit message.

### Step 6 — Record (optional)

Add one line to `docs/project-progress.md` § Decisions Log or a short commit:

```text
Synced ai-dev-methodologies 1.1.0 → 1.2.0 (framework-owned files only)
```

---

## 4. When to update vs skip

| Situation | Recommendation |
|-----------|----------------|
| Patch (1.0.x) — typo, clarification | Update when founder asks; low risk |
| Minor (1.x.0) — new instruction or skill | Update between waves or when founder asks |
| Major (x.0.0) — structure or breaking change | Founder decides timing; read migration notes first |
| Mid-deploy or hot migration in progress | Defer sync until stable |
| CHANGELOG says change N/A to this project | Skip those files (e.g. lane doc if project has no lanes) |

There is **no** scheduled auto-sync. With a small portfolio (~5–8 projects), the founder notifies each project when ready.

---

## 5. Anti-patterns

| Anti-pattern | Why it fails |
|--------------|--------------|
| Re-run `bootstrap-project.sh --force` on active project | Overwrites `project-guidelines.md` and other customized files |
| Edit framework-owned files for project-specific rules | Drift; use `project-guidelines.md` instead |
| Sync without reading CHANGELOG | Miss breaking migrations or skip new required files |
| No update to `METHODOLOGY.lock` | Next agent cannot tell which version the project runs |
| Replace project-owned docs from upstream templates | Wipes live project state |

---

## 6. Agent prompt (copy for founder)

When notifying a project:

> Methodology 更新到 **vX.Y.Z**。請讀 `.agents/METHODOLOGY.lock` 和 upstream `CHANGELOG.md`，依 `framework-adoption.md` §3 手動 sync framework-owned 檔案，不要 `--force` bootstrap。完成後更新 lock 並跑 `agent-verify.sh`。

---

## 7. Version

See [VERSION](../VERSION), [CHANGELOG.md](../CHANGELOG.md), and maintainer [CHANGELOG-GUIDE.md](../CHANGELOG-GUIDE.md) in the canonical repo.
