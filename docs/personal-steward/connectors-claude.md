---
status: active
maintained_by: jacky
created: 2026-07-07
---

# Connector: Claude (Projects + Claude Code)

Claude has no built-in Orbita link in PA0. Two practical modes:

## A — Claude Code / CLI (same as Cursor)

Use **identical curl** pattern with Shell/bash tool.

1. Put credentials in `~/.orbita-personal.env` (see [setup.md](setup.md))
2. Add **Project instructions** (Claude.ai Project or `CLAUDE.md` in repo):

```markdown
## Orbita personal memory

When I ask to save/search Orbita personal memory:
- Source ~/.orbita-personal.env
- API base: $ORBITA_API_BASE (https://api.get-orbita.com)
- client_id: personal-jacky
- Endpoints: GET/PUT /v1/notes, GET /v1/notes/search, GET/PUT /v1/memories/{key}
- Conventions: docs in jackyckma/orbita docs/personal-steward/
- Project slugs: agent-mindset, orbita, at-io, at-org, vios, melody-thesis, …
```

3. You say: *「把這段整理後存入 Orbita，project melody-thesis」* → Claude runs curl.

## B — Claude.ai web (no terminal)

**Manual assist loop** (PA0):

1. You: paste content + ask Claude to produce JSON body for a note
2. Claude: outputs `curl` command block
3. You: run in terminal **or** paste output to a steward turn via setup.md session API

For frequent use, prefer **Claude Code** or **Cursor** where Shell is available.

## C — Claude MCP (PA1 ✅)

Add to Claude Desktop / Claude Code MCP config:

```json
{
  "mcpServers": {
    "orbita": {
      "url": "https://api.get-orbita.com/v1/mcp",
      "headers": {
        "Authorization": "Bearer <ORBITA_PERSONAL_API_KEY>",
        "x-orbita-client-id": "personal-jacky"
      }
    }
  }
}
```

Tools: `memory_list`, `memory_get`, `memory_put`, `note_list`, `note_get`, `note_put`, `note_link`, `note_search`, `note_neighbors`, `note_links`, `orbita_whoami`.

Prefer MCP over curl when available. Curl (sections A/B) still works as fallback.

## Steward turn from terminal

When you want Claude to **orchestrate** but Orbita agent to **execute tools**:

```bash
source ~/.orbita-personal.env
# Paste Claude-drafted user message into:
curl -sS -X POST …/v1/sessions/$SESSION/messages \
  -d '{"input":{"type":"text","text":"<Claude summary + task>"}}'
```

Orbita `personal-steward` profile runs `note_search`, `note_put`, etc. server-side.
