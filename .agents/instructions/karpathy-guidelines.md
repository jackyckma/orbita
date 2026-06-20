# Karpathy-Inspired Coding Guidelines

Canonical project copy of the Karpathy-inspired guidelines from https://github.com/forrestchang/andrej-karpathy-skills/tree/main.

All agent entry points should reference this file instead of duplicating the full text.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them instead of picking silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop, name what is confusing, and ask.

### Auto-clarity (when brevity risks misread)

Prefer concise replies, but use **full, unambiguous sentences** when:

- Confirming **destructive or irreversible** actions (delete data, drop tables, force-push, production deploy).
- Issuing **security warnings** (credential exposure, auth bypass, injection).
- Describing **multi-step sequences** where fragment order could be misread.
- Explaining **public API or schema breaks** downstream lanes depend on.

Resume normal tone after the critical part is clear.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No flexibility or configurability that was not requested.
- No error handling for impossible scenarios.
- If 200 lines could be 50, simplify before finishing.

Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### Scope boundary (contracts win)

Simplicity optimizes **how** to implement — not **whether** to implement.

- **Issue acceptance criteria**, lane `INTERFACE.md`, and JSON Schema contracts define what must exist. Do not skip or defer an AC item or contract field via YAGNI or "minimum code" reasoning.
- When AC or a contract seems over-scoped, **stop and ask** (see `decision-authority.md`) — do not silently omit required behavior.
- YAGNI applies to **unrequested** work: scaffolding "for later", extra abstractions, new dependencies, or features not in the current issue/INTERFACE.

### Solution selection ladder

When implementing something that **is** in scope, stop at the first rung that works:

1. **Stdlib or language built-in** — use it before custom code.
2. **Native platform feature** — e.g. `<input type="date">`, CSS over JS, DB constraint over app logic.
3. **Already-installed dependency** — use it; do not add a new package for what a few lines can do.
4. **One line** — if one line is correct on edge cases, prefer it.
5. **Minimum that satisfies AC** — only when the rungs above do not cover the requirement.

Two rungs both work → take the higher (simpler) one and move on. The ladder is a reflex, not a research project.

### `defer:` comment convention

When you deliberately ship a simpler implementation than the "ideal" design, mark it in code so the next agent (or human) sees intent, not oversight:

```text
// defer: <current limitation>. upgrade: <trigger or path to proper solution>
```

Use the project's comment style (`#`, `//`, etc.). Examples:

```python
# defer: global lock. upgrade: per-account locks if throughput becomes bottleneck
```

```typescript
// defer: linear scan O(n). upgrade: index when n > 10k
```

Rules:

- Only for **in-scope** shortcuts — not for skipping AC or contract requirements.
- Name both the **ceiling** (what this simplification cannot handle) and the **upgrade trigger** (when to revisit).
- If you cannot name an upgrade path, the simplification may be wrong — reconsider or ask.

To list all markers: load `.agents/skills/deferred-shortcuts/SKILL.md` (read-only scan).

### Never simplify away

Do not remove or skip these to save lines:

- Input validation at **trust boundaries** (HTTP handlers, public CLI, webhooks).
- Error handling that **prevents data loss** or silent corruption.
- **Security** measures required by the issue, INTERFACE, or project guidelines.
- **Accessibility** basics when shipping user-facing UI.
- Anything **explicitly listed** in acceptance criteria or contracts.

User or founder insists on a fuller implementation → build it; do not re-argue.

## 3. Surgical Changes

**Touch only what is required. Clean up only your own mess.**

When editing existing code:

- Do not improve adjacent code, comments, or formatting as a drive-by change.
- Do not refactor things that are not broken.
- Match existing style, even if you would choose a different style.
- If you notice unrelated dead code, mention it instead of deleting it.

When your changes create orphans:

- Remove imports, variables, functions, or files that your changes made unused.
- Do not remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass."
- "Fix the bug" → "Write a test that reproduces it, then make it pass."
- "Refactor X" → "Ensure tests pass before and after."

For multi-step tasks, state a brief plan:

```text
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let agents loop independently. Weak criteria such as "make it work" require clarification.

These guidelines are working if diffs contain fewer unnecessary changes, implementations avoid needless abstractions, and clarifying questions come before implementation rather than after mistakes.
