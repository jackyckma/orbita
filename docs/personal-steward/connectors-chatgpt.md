---
status: active
maintained_by: jacky
created: 2026-07-07
---

# Connector: ChatGPT

## PA0 — Instruction + curl (Custom GPT or normal chat)

ChatGPT cannot reach your API unless you use **Custom GPT Actions** or copy curl yourself.

### Mode 1: You as human-in-the-loop (simplest)

1. ChatGPT drafts note body + frontmatter
2. You say: *「生成 curl 存入 Orbita」*
3. You run curl locally (same as [connectors-cursor.md](connectors-cursor.md))

Add to Custom GPT **Instructions**:

```text
Jacky uses Orbita (https://api.get-orbita.com) as personal memory under client_id personal-jacky.
When asked to save to Orbita, output a complete curl PUT /v1/notes/{uuid} command with JSON body.
Use frontmatter.project from: agent-mindset, orbita, at-io, at-org, vios, melody-thesis, powerhouse, ai-business-life, apprenticeship, jackyma-site.
Never invent API keys; use placeholder $ORBITA_PERSONAL_API_KEY.
```

### Mode 2: Custom GPT Actions (semi-automatic)

1. Create GPT → **Actions** → Import OpenAPI schema
2. Use trimmed schema: `docs/personal-steward/openapi-personal-gpt.yaml` (notes + memories read/write)
3. Authentication: **API Key** → Header `Authorization: Bearer …` and add custom header `x-orbita-client-id: personal-jacky`

**Caution:** API key lives in GPT config — rotate if shared. Prefer dedicated key with only `personal-jacky` allow-list.

### Mode 3: ChatGPT agent + Orbita steward session

ChatGPT composes the task text; you POST one message to Orbita `personal-steward` session (see [setup.md](setup.md)). Good for long organize/summarize jobs.

### Mode 4: MCP (PA1 ✅ — when client supports remote MCP)

If your ChatGPT / connector supports remote MCP:

- URL: `https://api.get-orbita.com/v1/mcp`
- Headers: `Authorization: Bearer …`, `x-orbita-client-id: personal-jacky`

Same 11 tools as Claude MCP. Custom GPT Actions (Mode 2) remains an alternative.

## What ChatGPT should not do without MCP/Actions

- Assume it already has your cross-project memory
- Auto-sync all chats (no export pipeline yet — PA2)

When in doubt: **search Orbita first** (`GET /v1/notes/search?q=…`) before answering cross-project questions.
