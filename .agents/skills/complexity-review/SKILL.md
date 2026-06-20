---
name: complexity-review
description: >
  Review a diff or PR for over-engineering only — what to delete or shrink,
  not correctness or security. One line per finding with location, tag, and
  replacement. Load before merging large agent-generated PRs or when the user
  asks for a complexity / bloat review.
---

# Complexity review

Review diffs for **unnecessary complexity**. Correctness, security, and performance belong in a separate review pass.

Format: one line per finding — location, tag, what to cut, what replaces it.

## Format

```text
L<N>: <tag>: <what to cut>. <replacement or "nothing">.
```

For multi-file diffs, prefix with the file path: `src/foo.ts:L12: ...`

### Tags

| Tag | Meaning |
|-----|---------|
| `delete:` | Dead code, unused flexibility, speculative feature. Replacement: nothing. |
| `stdlib:` | Hand-rolled logic the standard library already provides. Name the function. |
| `native:` | Dependency or code duplicating a platform feature. Name the feature. |
| `yagni:` | Abstraction with one implementation, unused config, extra layer with one caller. |
| `shrink:` | Same logic, fewer lines. Show the shorter form. |

## Examples

Bad (verbose):

> "This EmailValidator class might be more complex than necessary — have you considered whether all these validation rules are needed?"

Good:

```text
L12-38: stdlib: 27-line validator class. `"@" in email`, 1 line; real validation is the confirmation mail.
L4: native: moment.js for one format call. Intl.DateTimeFormat, 0 deps.
L88: yagni: AbstractRepository with one impl. Inline until a second impl exists.
L52-71: delete: retry wrapper around idempotent local call. Nothing replaces it.
```

## Scoring

End with: `net: -N lines possible.` (estimate total removable lines.)

If nothing to cut: `Lean already. Ship.` and stop.

## Boundaries

- **Do not** flag: trust-boundary validation, contract-required error handling, security checks, accessibility basics, or a single smoke test / assert self-check required by the lane INTERFACE.
- **Do not** apply fixes — list findings only unless the user asks to implement.
- **Do not** suggest removing behavior required by issue AC, `INTERFACE.md`, or JSON Schema contracts.
- `defer:` comments (see `karpathy-guidelines.md`) document intentional shortcuts — review them for clarity, not deletion, unless the shortcut violates a contract.
