---
status: active
maintained_by: jacky
created: 2026-07-07
purpose: PA0 — Personal knowledge steward on Orbita (cross-project, agent-accessible).
related: docs/embed-as-backend.md, docs/development-plan.md, usr/memory-design-from-book.md
---

# Personal steward (PA0)

Orbita as **your** cross-project memory — separate from AT dogfood (`content-ai-transformation-org`), same API.

## Goal

One canonical store agents can read/write:

- Cursor projects (8+ repos) share context via Orbita notes + memory keys
- ChatGPT / Claude chats can **push/pull on your instruction** (PA0 = manual trigger, not auto-sync)
- Long prose + links in **notes graph**; small state in **flat memory**

## Quick start

1. **Setup** — `docs/personal-steward/setup.md` (API key + `client_id: personal-jacky`)
2. **Connect agents** — pick your tool:
   - [Cursor](connectors-cursor.md)
   - [Claude](connectors-claude.md)
   - [ChatGPT](connectors-chatgpt.md)
3. **Conventions** — [memory & note layout](memory-conventions.md)
4. **Project map** — [registry](project-registry.md)

## Architecture

```text
You (instruction)
   │
   ├── Cursor agent ──curl/MCP──┐
   ├── Claude ───────curl───────┼──► Orbita API (personal-jacky)
   └── ChatGPT Actions ─────────┘
              │
              ▼
        notes + memory (Postgres)
              ▲
   Optional: Orbita steward session (profile personal-steward)
   for "organize / link / summarize" turns
```

**Two call patterns (both valid in PA0):**

| Pattern | When | How |
|---------|------|-----|
| **Direct REST** | "Save this paragraph" / "Search ViOS" | `curl` → `/v1/notes`, `/v1/memories`, `/v1/notes/search` |
| **Steward turn** | "Organize my week's notes" | `POST /v1/sessions` + messages with profile `personal-steward` |

## Relation to AT dogfood

| | AT editorial | Personal steward |
|--|--------------|------------------|
| `client_id` | `content-ai-transformation-org` | `personal-jacky` |
| Profile | `at-editorial` | `personal-steward` |
| Loop | supply → review → poll | you instruct → read/write → optional steward turn |

Same Orbita deployment; isolated by `client_id`.

## Roadmap (after PA0)

| Phase | Deliverable |
|-------|-------------|
| PA0 | Manual REST + connector docs ✅ |
| PA1 | Cursor MCP server (thin wrapper over `/v1/notes/*`) |
| PA2 | Ingest harness (chat export, git hook) |
| W34 | Pre-inject relevant notes on steward turns |
