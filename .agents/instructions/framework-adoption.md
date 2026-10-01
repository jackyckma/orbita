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

## 2. File classes (what sync may touch)

> **Authoritative list:** [`framework-manifest.json`](../framework-manifest.json)
> at the root of this repo (`schema_version`, `framework_version`, `entries[]`
> of `{source, dest, class, note?}`). This section is the human-readable copy
> and must name the same dest paths. If the two disagree, the manifest wins
> and this section is the bug.
>
> `scripts/framework-sync.mjs` reads the manifest. It does not re-parse this
> document. Mappings follow `scripts/bootstrap-project.sh`: framework
> `instructions/x.md` → project `.agents/instructions/x.md`; framework
> `templates/<p>` → project `<p>`, except templated rows whose source name
> differs from dest.

| Class | `--apply` behaviour |
|-------|---------------------|
| `overwrite` | Copy when missing. Replace when the project file matches a known baseline. Never overwrite a modified file; write a patch. |
| `merge` | Replace an unmodified baseline copy. Do not create the file when it is missing. Never overwrite a modified file; write a patch. |
| `project` | Never write. |
| `ignore` | Never write. Generated or runtime state. |
| `templated` | Bootstrap fills these in. Sync never copies them. |

A modified overwrite or merge file is left untouched. The tool writes `<project>/.framework-sync/<dest>.patch` (project file vs current template) and lists it as manual merge required. There is no automatic 3-way merge.

### overwrite

```text
.agents/README.md
.agents/compatibility/local-vs-cloud-agents.md
.agents/defaults/README.md
.agents/defaults/ai-providers.md
.agents/defaults/cloudflare.md
.agents/defaults/zeabur.md
.agents/instructions/METHODOLOGIES.md
.agents/instructions/agent-native-practices.md
.agents/instructions/agent-tooling-guardrails.md
.agents/instructions/autonomous-loop.md
.agents/instructions/cursor-autopilot.md
.agents/instructions/decision-authority.md
.agents/instructions/framework-adoption.md
.agents/instructions/framework-evolution.md
.agents/instructions/issue-quality.md
.agents/instructions/judgment-rubrics.md
.agents/instructions/karpathy-guidelines.md
.agents/instructions/lane-based-development.md
.agents/instructions/model-orchestration.md
.agents/instructions/portfolio-hub-reporting.md
.agents/instructions/session-handoff.md
.agents/skills/README.md
.agents/skills/complexity-review/SKILL.md
.agents/skills/deferred-shortcuts/SKILL.md
docs/autopilot/README.md
docs/autopilot/report.example.json
docs/autopilot/report.schema.json
scripts/autopilot/apply-decision-defaults.mjs
scripts/autopilot/deploy-watchdog.mjs
scripts/autopilot/dispatch-core.mjs
scripts/autopilot/queue-status.mjs
scripts/autopilot/render-report.mjs
scripts/autopilot/verify-all.mjs
scripts/autopilot/weekly-report.mjs
scripts/setup-cloud-agent-env.sh
```

`docs/autopilot/report.schema.json` is the shared hub-report contract. If the shape is wrong, fix it upstream and re-release. `dispatch-core.mjs` is overwrite. `decide-next-action.mjs` is merge.

### merge

```text
.agents/instructions/README.md
.cursor/rules/shared-instructions.mdc
AGENTS.md
CLAUDE.md
docs/README.md
docs/autopilot/automations.md
docs/autopilot/playbook.md
scripts/autopilot/decide-next-action.mjs
```

`decide-next-action.mjs`: a copy that lacks the 1.5 `IDLE` / `no-autopilot-scaffolds` preflight and otherwise matches an older baseline is replaced, so the preflight arrives with the template. A copy with local edits is not replaced; the preflight is only in the patch.

### project

```text
.agents/skills/lane-*/SKILL.md
docs/CURRENT_STATUS.md
docs/SESSION_HANDOFF.md
docs/autopilot/backlog.json
docs/autopilot/decisions.json
docs/autopilot/lessons.md
docs/autopilot/planner-preferences.md
docs/autopilot/project-hooks.json
docs/autopilot/roadmap.json
docs/errors-and-learnings.md
docs/product-*.md
docs/project-progress.md
docs/traceability-index.md
packages/**/INTERFACE.md
```

`project-hooks.json` keeps the project's `prod_smoke_cmd` and hub opt-in. Sync does not merge new keys into it. `backlog.json`, `roadmap.json`, and `decisions.json` are live project data.

### ignore

```text
docs/autopilot/locks.json
docs/autopilot/pause-state.json
docs/autopilot/reports/**
docs/autopilot/reports/README.md
docs/autopilot/watchdog-state.json
```

Generated reports (`docs/autopilot/reports/latest.json` and dated copies) stay in the project. Sync never writes under `reports/`.

### templated

Bootstrap substitutes values. Sync never byte-copies these. Dest paths:

```text
.agents/METHODOLOGY.lock
.agents/instructions/project-guidelines.md
docs/AGENT_ENV.md
scripts/agent-verify.sh
```

| Source in this repo | Project dest |
|---------------------|--------------|
| `templates/.agents/METHODOLOGY.lock` | `.agents/METHODOLOGY.lock` |
| `templates/project-guidelines.template.md` | `.agents/instructions/project-guidelines.md` |
| `compatibility/agent-capability-matrix.template.md` | `docs/AGENT_ENV.md` |
| `templates/scripts/agent-verify.sh` | `scripts/agent-verify.sh` |

`scripts/agent-verify.sh` keeps the project's `VERIFY_L0` / `VERIFY_L1`. `docs/AGENT_ENV.md` keeps the project's matrix; new rows from the capability-matrix template are a manual edit when CHANGELOG asks for them. `--apply` rewrites `.agents/METHODOLOGY.lock` to lock schema v2 (it does not copy the template over the lock). Existing keys, including `customized_files`, are kept.

If the project edited an overwrite-class file, sync will not replace it. Note the path in `customized_files` and apply the patch by hand.

---

## 3. Update process

Triggered when the founder says the methodology was updated. Run the tool from a checkout of **this** repo. The script is not copied into projects. Do not use `bootstrap-project.sh --force` to update an active project.

### Step 1 — Dry-run

```bash
git clone https://github.com/jackyckma/ai-dev-methodologies.git /tmp/ai-dev-methodologies
cd /tmp/ai-dev-methodologies && git checkout <tag-or-commit>
cat CHANGELOG.md
node scripts/framework-sync.mjs --project /path/to/your-project
```

Read the table. `IDENTICAL` needs nothing. `BEHIND(<id>)` matches an older baseline and has no local edit. `MODIFIED` matches no known hash (the closest baseline is named when the line diff can be measured). `MISSING` is absent. `N/A` is `project`, `ignore`, or `templated` and is never changed. Note `[breaking]` or migration sections in `CHANGELOG.md`.

### Step 2 — Locks empty, and consider pausing

- `docs/autopilot/locks.json` must have no active lease before `--apply`. An absent file is fine. If a lease is present, wait until that Maker/Checker tick finishes and the lock clears. The tool refuses `--apply` otherwise, and it never edits the file.
- Consider pausing the repo first (`docs/autopilot/pause-state.json` with `"paused": true`). The tool prints a warning when the loop is not paused. It does not pause for you and it never edits `pause-state.json` or any other autopilot JSON.

The project git working tree must be clean, or `--apply` refuses. `--allow-dirty` overrides that check only.

### Step 3 — Apply

```bash
node scripts/framework-sync.mjs --project /path/to/your-project --apply
```

`--apply` only copies missing `overwrite` files and replaces `overwrite` / `merge` files that are identical to a known baseline. It writes `.agents/METHODOLOGY.lock` at lock schema v2: existing keys including `customized_files` stay, and `files` records sha256 of each overwrite/merge file as it exists after the run. `version`, `source_commit` (framework `git rev-parse HEAD`; dirty trees are noted), `synced_at`, `lock_schema: 2`, and `manifest_version` are set. A v1 lock (no `files` map) is readable.

### Step 4 — Review patches and hand-merge

Modified files are listed as manual merge required. Each patch is `<project>/.framework-sync/<dest>.patch`. Review it and merge by hand. For `scripts/autopilot/decide-next-action.mjs`, an unmodified file that lacks the 1.5 `no-autopilot-scaffolds` preflight is replaced in step 3; a modified file gets that preflight only via the patch.

When a hand-merge intentionally keeps local content (typical for `AGENTS.md`, `CLAUDE.md`, `docs/README.md`, `.cursor/rules/shared-instructions.mdc`, `docs/autopilot/automations.md`, `docs/autopilot/playbook.md`, `scripts/autopilot/decide-next-action.mjs`), add that dest path to `customized_files` in `.agents/METHODOLOGY.lock`. The tool does not add paths for you. Then run `--relock`, then `--check`.

When the hand-merge instead makes the file match the template, leave it off `customized_files` and run `--relock` before committing. A hand-merge leaves the tree dirty; `--relock` is allowed on that tree. It rewrites only `.agents/METHODOLOGY.lock` (the `files` sha256 map, plus `version`, `source_commit`, `synced_at`, `lock_schema`, and `manifest_version`) and keeps `customized_files` and any other existing keys. It does not copy or patch anything else.

```bash
node scripts/framework-sync.mjs --project /path/to/your-project --relock
```

Delete `<project>/.framework-sync/` once the patches are merged. `--apply` lists that directory in `.git/info/exclude` so it is not committed by accident; it does not edit `.gitignore`.

### Step 5 — Commit and open a PR

Follow the project's own branch, commit, and PR conventions. Put the lock update and any hand-merged files in that commit. Do not invent a second workflow here.

### Step 6 — Check

```bash
node scripts/framework-sync.mjs --project /path/to/your-project --check
```

Exit 0 when every `overwrite` and `merge` file is `ok` (matches both the lock hash and the current template) or `customized` (listed in `customized_files` and matches the lock hash; the template is not compared). Otherwise exit 1 and report each other file as `behind`, `modified-since-sync`, or `missing`. The lock's `version` field is only a claim. `--check` is the authority on whether a project is current. The same command is the weekly drift check. `--check` writes nothing.

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
| Re-run `bootstrap-project.sh --force` on active project | Overwrites framework-owned files. An existing `.agents/METHODOLOGY.lock` (including `files` hashes and `customized_files`) and other project-state files stay unless `--reset-project-state` is also set. Use `framework-sync` to update. |
| Edit framework-owned files for project-specific rules | Drift; use `project-guidelines.md` instead |
| Sync without reading CHANGELOG | Miss breaking migrations or skip new required files |
| No update to `METHODOLOGY.lock` | Next agent cannot tell which version the project runs |
| Replace project-owned docs from upstream templates | Wipes live project state |
| Locally edit `report.schema.json` to fit one project | Breaks portfolio comparability — fix upstream instead |

---

## 6. Agent prompt (copy for founder)

When notifying a project:

> Methodology 更新到 **vX.Y.Z**。請讀 `.agents/METHODOLOGY.lock` 和 upstream `CHANGELOG.md`，依 `framework-adoption.md` §3 手動 sync framework-owned 檔案，不要 `--force` bootstrap。完成後更新 lock 並跑 `agent-verify.sh`。

---

## 7. Version

See [VERSION](../VERSION), [CHANGELOG.md](../CHANGELOG.md), and maintainer [CHANGELOG-GUIDE.md](../CHANGELOG-GUIDE.md) in the canonical repo. Maintainer change process: [framework-evolution.md](framework-evolution.md).
