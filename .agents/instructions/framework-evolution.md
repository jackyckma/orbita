# Framework evolution (maintainer process)

How `ai-dev-methodologies` itself changes without drifting out of shape.
Audience: any agent asked to modify the framework repo. Downstream project
agents: you only need §4 (how to tag things for upstream harvest).

---

## 1. Ground rules

- Framework changes happen **in the framework repo, via this process** —
  never as drive-by edits during downstream project work. If project work
  reveals a framework flaw, tag it for harvest (§4) and move on.
- New or heavily-revised framework content is written in **English**.
- One concern per instruction file; target ≤200 lines; prefer executable
  checklists and rubrics with examples over explanatory prose.
- **An unindexed file does not exist.** Every new instruction file gets: a
  `METHODOLOGIES.md` catalog row, an `instructions/README.md` row, a
  trigger row in `templates/.agents/README.md`, and — only if always-load
  core — entries in all three entry-point templates.
- Never create a second copy of a canonical list. Canonical locations:
  - Framework-owned sync list → `framework-adoption.md` §2
  - File → trigger map → `templates/.agents/README.md`
  - Methodology catalog → `METHODOLOGIES.md`
  Everything else links to these; it does not restate them.

## 2. Intake — where changes come from

1. **Founder request** — "add X", "I keep hitting Y".
2. **External reference** — a methodology, tool, or framework repo the
   founder points at. Read it, extract what applies, ignore the rest.
3. **Upstream harvest** — §4.

Flow: analyze → proposal (§3) → founder confirms → implement → release
(§5). For small unambiguous fixes (typo, broken link, obvious
inconsistency) skip the proposal, keep the release checklist.

## 3. Proposal format

```markdown
**Problem:** <what breaks or costs founder attention today; evidence>
**Change:** <files added/changed; tier; one line per file>
**Default or optional:** <default only if high-confidence AND applies to
nearly all projects; otherwise optional with an explicit adoption gate>
**Downstream impact:** <which framework-owned files change on sync;
migration steps if any>
```

The default-vs-optional call is the most common judgment error: when
confidence is low or applicability is project-dependent, ship it as an
explicitly-marked optional section that states the problem it solves, its
cost, and which projects fit — let each project decide.

## 4. Upstream harvest — the feedback loop from projects

Downstream learnings must flow back or the framework fossilizes.

**In projects (any agent, continuously):** when something feels like a
framework flaw rather than a project quirk, add one line to the project's
`docs/errors-and-learnings.md` prefixed **`upstream-candidate:`**.

**In the framework repo (when the founder says "run the upstream
harvest"):**

1. For each active project repo, read `docs/errors-and-learnings.md`
   (grep `upstream-candidate:`), the `defer:` ledger if present, and the
   Decisions Log since the last harvest — skipping any of these the
   project does not maintain.
2. Keep patterns that appear in ≥2 projects, or single occurrences with
   high cost.
3. Write one §3 proposal line per candidate; present as a batch.
4. Founder picks; implement and release (§5).
5. Note the harvest date in the next CHANGELOG entry.

## 5. Release coherence checklist — run before every release

All checks are mechanical; a mid-tier model can run them without judgment:

- [ ] `CHANGELOG.md` has a section for this version; every changed
      framework-owned path is named (format: `CHANGELOG-GUIDE.md`).
- [ ] `VERSION` bumped per the semver table in `CHANGELOG-GUIDE.md`.
- [ ] `METHODOLOGIES.md`: a catalog row exists for every file in
      `instructions/`; the reading order references only existing files;
      the version table matches `VERSION`.
- [ ] `instructions/README.md` tier table matches the `METHODOLOGIES.md`
      catalog — same files, same tier codes.
- [ ] Entry-point parity: `templates/AGENTS.md`, `templates/CLAUDE.md`,
      `templates/.cursor/rules/shared-instructions.mdc` name the **same**
      core file list.
- [ ] `templates/.agents/README.md` trigger table lists every
      `instructions/*.md` file.
- [ ] `scripts/bootstrap-project.sh` copies every new path
      (`instructions/*.md` is automatic; new `templates/` files need an
      explicit `copy_file` line — check).
- [ ] `framework-adoption.md` §2 sync list updated for any added, renamed,
      or removed framework-owned file.
- [ ] No dangling references:
      `grep -rn "<old-name>" --include="*.md" .` returns nothing for every
      renamed/removed file.
- [ ] Optional content is explicitly gated: marked *optional* where it
      lives, and adoption requires a line in the project's
      `project-guidelines.md`.

If any box fails, fix before release — a release that skips this list is
how drift starts.

## 6. Anti-patterns

| Anti-pattern | Why it fails |
|--------------|--------------|
| Editing one entry point without the other two | Tools follow different rules; parity break |
| Inventing a second changelog/version mechanism | Two sources of truth diverge |
| Appending exceptions to rubrics mid-project | Rubric erosion; judgment files change only via this process |
| Merging a file without indexing it | Invisible to every future session |
| Unrequested translation or reformatting of old content | Review noise that hides real changes |
| Bumping VERSION without CHANGELOG (or vice versa) | Projects cannot sync reliably |
