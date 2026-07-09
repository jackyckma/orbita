---
status: active
maintained_by: jacky
created: 2026-07-07
---

# PA0 setup — personal-jacky on Orbita

## 1. Environment variables (local)

Add to `~/.orbita-personal.env` (or merge into existing `.env` — **never commit**):

```bash
export ORBITA_API_BASE=https://api.get-orbita.com
export ORBITA_PERSONAL_CLIENT_ID=personal-jacky
export ORBITA_PERSONAL_API_KEY=orb_…   # from step 2
```

Load in shell: `source ~/.orbita-personal.env`

## 2. Issue API key (admin, one-time)

Requires prod `ORBITA_ADMIN_TOKEN`:

```bash
curl -sS -X POST "$ORBITA_API_BASE/v1/admin/api-keys" \
  -H "x-orbita-admin-token: $ORBITA_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "allowed_client_ids": ["personal-jacky"],
    "scopes": ["sessions:create", "sessions:use"],
    "label": "jacky personal steward PA0"
  }'
```

Save the returned **secret** as `ORBITA_PERSONAL_API_KEY`. Prefix is safe to log; secret is shown once.

## 3. Smoke test

```bash
source ~/.orbita-personal.env
AUTH=(-H "Authorization: Bearer $ORBITA_PERSONAL_API_KEY" \
      -H "x-orbita-client-id: $ORBITA_PERSONAL_CLIENT_ID")

curl -sS "${AUTH[@]}" "$ORBITA_API_BASE/v1/whoami" | jq .
curl -sS "${AUTH[@]}" "$ORBITA_API_BASE/v1/memories" | jq .
```

## 4. Seed registry note (optional)

```bash
NOTE_ID="$(uuidgen | tr '[:upper:]' '[:lower:]')"
curl -sS -X PUT "${AUTH[@]}" \
  "$ORBITA_API_BASE/v1/notes/$NOTE_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "AI transition infrastructure map",
    "body": "See https://jackyma.info/blog/ai-transition-infrastructure/ and docs/personal-steward/project-registry.md in orbita repo.",
    "frontmatter": { "type": "registry", "project": "jackyma-site", "tags": ["meta", "portfolio"] }
  }' | jq .
echo "Registry note id: $NOTE_ID"
```

Store `NOTE_ID` in `projects/meta/registry_note_id` memory when ready.

## 5. Steward agent turns (optional)

For organize/summarize tasks (not simple get/put):

```bash
SESSION=$(curl -sS -X POST "${AUTH[@]}" "$ORBITA_API_BASE/v1/sessions" \
  -H "Content-Type: application/json" \
  -d '{"agent_profile":"personal-steward"}' | jq -r .session_id)

curl -sS -X POST "${AUTH[@]}" \
  "$ORBITA_API_BASE/v1/sessions/$SESSION/messages" \
  -H "Content-Type: application/json" \
  -d '{"input":{"type":"text","text":"List my notes and suggest links between Orbita and ViOS."}}'
```
