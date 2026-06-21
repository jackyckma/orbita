# Skill authoring conventions

Skills are static markdown files in `packages/lane-profiles/profiles/skills/`.

## File naming

- One file per skill id: `{skill_id}.md` (e.g. `core.md`, `research.md`).
- Reference skills by id in profile JSON `skills` arrays.

## Content style

- Short bullet lists (3–6 bullets).
- Describe **behavior** for the agent, not implementation details.
- Never embed secrets, API keys, or live URLs with tokens.

## Binding

- Skills are loaded at session creation and stored in `profile_snapshot.skill_contents`.
- Order in the system prompt follows sorted skill ids.
- Skills cannot be changed mid-session (prompt cache constraint).

## Profile pairing

- Each profile lists `skills` and `allowed_tools` that align with the skill intent.
- HTTP skills should pair with `http_get` / `http_post` in `allowed_tools`.
