---
name: deferred-shortcuts
description: >
  Scan the repo for defer: comments (see karpathy-guidelines.md) and produce a
  read-only ledger of deliberate simplifications — ceiling and upgrade path per
  marker. Use when the user asks for deferred shortcuts, defer ledger, technical
  debt from defer comments, or before a milestone review to see what was
  intentionally left simple.
---

# Deferred shortcuts ledger

Agents mark in-scope simplifications with `defer:` comments (see `karpathy-guidelines.md` §2). This skill **collects** them into one report so shortcuts do not rot into undocumented debt.

**Read-only by default** — changes nothing unless the user asks to write the report to a file.

## Scan

From the repo root, search comment lines only. Skip `node_modules`, `.git`, and common build output (`dist`, `build`, `.next`, `coverage`, `__pycache__`).

```bash
grep -rnE '(#|//|/\*)[[:space:]]*defer:' . \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
  --exclude-dir=build --exclude-dir=.next --exclude-dir=coverage \
  --exclude-dir=__pycache__
```

Add other comment prefixes if the stack uses them (e.g. `--` for SQL, `%` for Erlang).

Each hit is one ledger row. Prose that merely mentions the word "defer" without the convention does not count — the marker must be `defer:` at the start of the comment payload.

## Parse each row

Expected shape (flexible spacing):

```text
defer: <ceiling/limitation>. upgrade: <trigger or path>
```

Extract:

| Field | Source |
|-------|--------|
| **Location** | `file:line` from grep |
| **Ceiling** | Text after `defer:` before `upgrade:` |
| **Upgrade** | Text after `upgrade:` |

If `upgrade:` is missing or empty, tag the row **`no-trigger`** — highest rot risk; suggest filling in the comment or resolving the shortcut.

Optional: `git blame -L <line>,<line> <file>` for owner/date when the user wants accountability.

## Output format

Group by file. One row per marker:

```text
<file>:<line> — ceiling: <...>. upgrade: <...>. [no-trigger]
```

End with a summary:

```text
Summary: N defer: marker(s), M with no upgrade trigger.
```

If nothing found:

```text
No defer: markers. Ledger clean.
```

## Persist (only when asked)

If the user wants the ledger saved, write to **`docs/deferred-shortcuts.md`** with frontmatter consistent with other live docs:

```yaml
---
status: active
maintained_by: ai-agents
created: YYYY-MM-DD
last_updated: YYYY-MM-DD
purpose: Ledger of defer: simplifications harvested from the codebase.
archive_when: All markers resolved or migrated to issues.
---
```

Replace body with the latest scan. Bump `last_updated`. Do **not** auto-commit unless the user asks.

## When to run

- User asks for defer ledger / deferred shortcuts / defer debt
- Milestone or lane status review — surface shortcuts that may block the next wave
- Before complexity-review on a large PR — context for which simplifications are intentional

## Boundaries

- **Does not** delete code, resolve shortcuts, or create issues unless the user asks
- **Does not** treat missing `defer:` markers as "no debt" — only reports what was marked
- **Does not** conflict with issue AC or INTERFACE — if a marker documents skipping required behavior, flag it to the user separately; that is a contract violation, not ledger debt
- `complexity-review` skill handles diff bloat; this skill handles **documented** in-scope shortcuts only
