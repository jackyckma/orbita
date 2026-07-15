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

## C — Claude MCP (PA1 / PA1.5 ✅)

### Claude Desktop — Custom Connector (recommended)

1. **Settings → Connectors → Add custom connector**
2. Fill in:

| 欄位 | 值 |
|------|-----|
| Name | `Orbita` |
| Remote MCP server URL | `https://api.get-orbita.com/v1/mcp` |
| OAuth Client ID | **留空**（DCR 自動註冊） |
| OAuth Client Secret | **留空** |

3. Claude 會觸發 OAuth → browser 開 `/oauth/authorize`
4. 在 consent 頁輸入你的 **Orbita API key** + 確認 `client_id`（預設 `personal-jacky`）→ **Authorize**
5. 完成後 Claude 用 OAuth token 呼叫 MCP tools

API key **唔會儲存**；只用作一次性驗證你擁有該 tenant。

規格：`docs/personal-steward/mcp-oauth-plan.md`

### Claude Code — JSON / CLI

`url` alone is **invalid**. You must set `type: http` (or `streamable-http`).

```json
{
  "mcpServers": {
    "orbita": {
      "type": "http",
      "url": "https://api.get-orbita.com/v1/mcp",
      "headers": {
        "Authorization": "Bearer <ORBITA_PERSONAL_API_KEY>",
        "x-orbita-client-id": "personal-jacky"
      }
    }
  }
}
```

Or via CLI:

```bash
source ~/.orbita-personal.env
claude mcp add --transport http orbita https://api.get-orbita.com/v1/mcp \
  --scope user \
  --header "Authorization: Bearer $ORBITA_PERSONAL_API_KEY" \
  --header "x-orbita-client-id: $ORBITA_PERSONAL_CLIENT_ID"
```

### Claude Desktop — fallback: `mcp-remote` stdio bridge

If Custom Connector OAuth fails, use `claude_desktop_config.json` with `mcp-remote` (see previous revision in git history).

Tools once connected: `memory_list`, `memory_get`, `memory_put`, `note_list`, `note_get`, `note_put`, `note_link`, `note_search`, `note_neighbors`, `note_links`, `orbita_whoami`.

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
