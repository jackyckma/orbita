# Issue quality standards

Standards for GitHub Issues (or equivalent) that **AI coding agents** will implement. An issue without acceptance criteria is not actionable.

## Required fields

### 1. Title format

```text
[PROJ-xxx] Verb + specific feature/component
```

- Use a sequential project prefix (e.g. `APP-023`, `PH-023`) — check existing issues for the next number.
- Verb examples: `Implement`, `Add`, `Fix`, `Document`, `Refactor`, `Remove`.
- Be specific: `[APP-023] Implement POST /api/session/token error handling` not `[APP-023] Fix token`.

### 2. Body structure

```markdown
### What & Why
One paragraph: what this issue implements and why it's needed now.
Reference the relevant spec doc if applicable.

### BLOCKS / BLOCKED_BY (if any)
BLOCKS: #N
BLOCKED_BY: #N

### Allowed paths
- src/features/session/**
- src/lib/**
- **/*.test.ts

List directories/files agents may modify. Required for scoped agent work.

### Validation
- npm run typecheck
- npm test

Commands to run before commit (one shell command per bullet).

### Acceptance criteria
- [ ] Specific, testable condition 1
- [ ] Specific, testable condition 2
- [ ] Validation command passes

### Effort hint
size: S   <!-- S = <4h, M = 1 day, L = 2-3 days. Split L issues. -->
```

### 3. Labels (adapt to your project)

- Type: `enhancement` / `bug` / `documentation`
- `agent-ready` — only when the [agent-ready checklist](#agent-ready-checklist) below is satisfied
- Optional: milestone or phase label

## Agent-ready checklist

Apply the `agent-ready` label (or assign to an agent) **only** when all are true:

| Check | Requirement |
|-------|-------------|
| Acceptance criteria | Each item is **testable** — observable pass/fail, not vague ("make it robust") |
| Allowed paths | Listed; agent knows which directories/files may change |
| Validation | At least one command the agent can run before handoff |
| Scope | `size: S` or `M`; `L` issues split with `BLOCKS:` links |
| Dependencies | No open `BLOCKED_BY` issues |
| Contract alignment | If the issue touches a lane API or schema, `INTERFACE.md` / contracts are updated or explicitly marked draft |

**Do not dispatch** issues missing AC, allowed paths, or validation — add them first or keep the issue in backlog.

Agents optimize **implementation** within AC (see `karpathy-guidelines.md` §2 Solution selection ladder). They do **not** drop AC items or contract fields to simplify code. If AC looks over-scoped, the agent stops and asks — it does not YAGNI-skip required behavior.

## Anti-patterns

| Anti-pattern | Why it fails |
|--------------|--------------|
| Title references internal task ID only | No product meaning for agents |
| No acceptance criteria | Agent cannot know when done |
| No allowed paths | Scope creep; unrelated files changed |
| Scope too large (`size: L`) | Split into ≤M issues with BLOCKS links |
| BLOCKED_BY issue still open | Not actionable yet |
| `agent-ready` without checklist | Agent guesses scope or "done" |
| Vague AC ("improve UX", "handle errors well") | Cannot verify completion |

## Before creating a new issue

1. Does an open issue already cover this scope? Comment instead of duplicating.
2. Is scope larger than `size: M`? Split with `BLOCKS:` links.
3. Does this align with current product objective / roadmap?
