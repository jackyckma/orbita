---
name: orbiter-handoff-check
description: >-
  On explicit user request only — read/write the shared Orbiter-AT-dogfood handoff
  folder (STATUS + inboxes) and summarize or act on cross-project items. Never run
  proactively at session start, each turn, or via hooks unless the user asks.
disable-model-invocation: true
---

# Orbiter handoff check

## When to run

**Only** when the user **explicitly** asks, for example:

- 「檢查 handoff」「poll inbox」「讀 Orbiter-AT-dogfood」
- 「Read `~/Orbiter-AT-dogfood`…」
- User invokes this skill by name

## When NOT to run

- **Do not** read or write `~/Orbiter-AT-dogfood` at session start, end, or each turn
- **Do not** poll inboxes because AT work is mentioned in passing
- **Do not** follow stale `stop` hook follow-ups — periodic poll is **disabled** (see `.cursor/hooks.json`)
- **Do not** update `STATUS.md` unless you are completing a user-requested handoff check

Optional automation (off by default): re-enable `stop` hook in `.cursor/hooks.json` per `~/Orbiter-AT-dogfood/PROTOCOL.md`.

## Steps (after user request)

1. Read `/home/jackyma/Orbiter-AT-dogfood/state/STATUS.md`
2. Read new or open files in `inbox/at-to-orbita/` (AT → Orbita)
3. If acting on outbound threads, read `inbox/orbita-to-at/`
4. Summarize in **繁體中文**; execute clear action items
5. Update `state/STATUS.md` when done; mark handoff files `status: done` when resolved

## Do not

- Put secrets in the handoff folder
- Duplicate long specs — link to repo docs instead

Protocol: `/home/jackyma/Orbiter-AT-dogfood/PROTOCOL.md`
