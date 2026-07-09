---
status: active
maintained_by: jacky
created: 2026-07-07
---

# Connector: Cursor

PA0 = **you instruct** the agent; it uses the Shell tool + `curl` against Orbita REST API.

## Install personal skill (recommended)

Copy or symlink the repo skill into your user skills:

```bash
mkdir -p ~/.cursor/skills
ln -sf ~/orbita/docs/personal-steward/cursor-skill ~/.cursor/skills/orbita-personal-steward
```

Or install from repo: `docs/personal-steward/cursor-skill/SKILL.md`

## Trigger phrases (say in chat)

| You say | Agent should |
|---------|----------------|
| 「存入 Orbita」 / "save to Orbita" | `PUT /v1/notes/{id}` or `memory_put` via curl |
| 「查 Orbita」 / "search Orbita" | `GET /v1/notes/search?q=…` |
| 「Orbita 有咩關於 ViOS」 | search + optional `GET /v1/notes/{id}` |
| 「問 Orbita steward 整理」 | create session `personal-steward` + message turn |

## Auth pattern (every curl)

```bash
source ~/.orbita-personal.env
CURL_AUTH=( -H "Authorization: Bearer $ORBITA_PERSONAL_API_KEY" \
            -H "x-orbita-client-id: $ORBITA_PERSONAL_CLIENT_ID" )
```

## Common operations

### Search notes

```bash
curl -sS -G "${CURL_AUTH[@]}" \
  --data-urlencode "q=melody thesis" \
  --data-urlencode "top_k=5" \
  "$ORBITA_API_BASE/v1/notes/search" | jq .
```

### Put / update note

```bash
NOTE_ID="<uuid>"   # uuidgen for new
curl -sS -X PUT "${CURL_AUTH[@]}" \
  -H "Content-Type: application/json" \
  "$ORBITA_API_BASE/v1/notes/$NOTE_ID" \
  -d '{
    "title": "Melody chapter — interval description",
    "body": "## Draft\n…",
    "frontmatter": { "project": "melody-thesis", "type": "chapter" }
  }' | jq .
```

### Read memory key

```bash
curl -sS -G "${CURL_AUTH[@]}" \
  "$ORBITA_API_BASE/v1/memories/projects%2Fvios%2Fsummary" | jq .
```

(URL-encode `/` as `%2F` in path keys.)

### Write memory key

```bash
curl -sS -X PUT "${CURL_AUTH[@]}" \
  -H "Content-Type: application/json" \
  "$ORBITA_API_BASE/v1/memories/projects%2Fvios%2Fsummary" \
  -d '{"content":"ViOS: slow background UI OS experiment. …"}' | jq .
```

## Per-project Cursor rule (optional)

In a repo `.cursor/rules/orbita-personal.mdc`:

```markdown
When the user mentions Orbita personal memory, load ~/.orbita-personal.env
and use curl against ORBITA_API_BASE with ORBITA_PERSONAL_* credentials.
Follow docs/personal-steward/memory-conventions.md for project slugs.
```

## PA1: MCP (available)

Remote MCP at `https://api.get-orbita.com/v1/mcp` (Streamable HTTP).

- Auth: same as REST — `Authorization: Bearer <api_key>` + `x-orbita-client-id: personal-jacky`
- Tools: `memory_*`, `note_*`, `orbita_whoami` (11 total)
- Cursor: add to `~/.cursor/mcp.json` or project MCP config
- No Shell/curl needed once connected

See `docs/personal-steward/connectors-claude.md` and `connectors-chatgpt.md` for other clients.
