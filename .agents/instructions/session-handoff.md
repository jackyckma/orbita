# Session handoff (cross-session continuity)

When pausing work for **more than a short break** (end of day, context limit, switching agents or environments, or before the user steps away), create or update:

**`docs/SESSION_HANDOFF.md`**

## What to include

Keep it scannable and factual (not a narrative dump):

1. **Metadata** — date, branch, latest commit hash + one-line message, push status.
2. **Active task** — issue/ticket ID or roadmap item and what "done" means.
3. **Current status** — what works vs what is broken (table is fine).
4. **Verified in** — which environment completed which verification level (see [compatibility/local-vs-cloud-agents.md](../compatibility/local-vs-cloud-agents.md)):
   - Example: `Cloud agent: L0+L1 @ abc123` / `Local: L2 pending` / `Staging URL: not yet smoke-tested`
5. **Top priority next** — the single bug or feature to pick up first.
6. **What was already tried** — avoid repeating failed approaches.
7. **How to run / verify** — commands, URLs, env files (no secrets).
8. **Key file paths** — small table mapping symptom → file.
9. **Warnings** — tooling constraints, uncommitted files, deploy quirks, local-only tasks.

## When to read

- **Start of a session** when the user says "continue", "pick up where we left off", or the task spans deploy + validation.
- **When switching** between local Cursor and a Cloud Agent — read handoff **first**.
- Read **after** `docs/CURRENT_STATUS.md` (status = stable facts; handoff = last session + exact next commands).

Do **not** treat handoff as a substitute for roadmap or architecture docs.

## When resuming

1. Read **`docs/SESSION_HANDOFF.md`** first.
2. Then `docs/AGENT_ENV.md` (if present), roadmap/progress docs, and domain docs as needed.
3. Update or clear stale sections as you make progress.

## Rules

- **Overwrite/update** `docs/SESSION_HANDOFF.md` in place — one canonical "current pause" file.
- Do **not** put API keys, tokens, or passwords in the handoff.
- If the handoff is obsolete (work shipped and verified), replace with a short "Last session closed" note.
- Milestones and decisions belong in `docs/project-progress.md` or a development journal — not in handoff.
- Include handoff updates in the **same commit** as end-of-session doc changes when the user asks to commit or end for the day.
