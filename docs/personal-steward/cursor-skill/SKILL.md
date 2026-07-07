---
name: orbita-personal-steward
description: >-
  Read and write Jacky's cross-project personal memory on Orbita (client_id
  personal-jacky). Use when the user says 存入 Orbita, 查 Orbita, search Orbita,
  save to Orbita, or asks about knowledge in another project (ViOS, melody thesis,
  AT, Orbita, etc.).
---

# Orbita personal memory (PA0)

## Credentials

Before any API call:

```bash
source ~/.orbita-personal.env
# ORBITA_API_BASE, ORBITA_PERSONAL_API_KEY, ORBITA_PERSONAL_CLIENT_ID
```

Every request needs:

```bash
-H "Authorization: Bearer $ORBITA_PERSONAL_API_KEY"
-H "x-orbita-client-id: $ORBITA_PERSONAL_CLIENT_ID"
```

Setup: `orbita` repo → `docs/personal-steward/setup.md`

## When to use

| User intent | Action |
|-------------|--------|
| Save draft / summary / excerpt | `PUT /v1/notes/{uuid}` with frontmatter.project |
| Cross-project question | `GET /v1/notes/search?q=…` then maybe `GET /v1/notes/{id}` |
| Small status / pointer | `PUT /v1/memories/{key}` |
| Organize many notes | `POST /v1/sessions` profile `personal-steward` + message |

## Project slugs

`agent-mindset`, `orbita`, `at-io`, `at-org`, `apprenticeship`, `powerhouse`, `ai-business-life`, `vios`, `jackyma-site`, `melody-thesis`

Full map: `docs/personal-steward/project-registry.md`

## Note frontmatter

```yaml
project: melody-thesis
type: chapter|spec|field-note|registry
tags: []
source: cursor
```

## Examples

Search:

```bash
curl -sS -G -H "Authorization: Bearer $ORBITA_PERSONAL_API_KEY" \
  -H "x-orbita-client-id: $ORBITA_PERSONAL_CLIENT_ID" \
  --data-urlencode "q=ViOS UI" \
  "$ORBITA_API_BASE/v1/notes/search"
```

Save (generate uuid first):

```bash
curl -sS -X PUT -H "Authorization: Bearer $ORBITA_PERSONAL_API_KEY" \
  -H "x-orbita-client-id: $ORBITA_PERSONAL_CLIENT_ID" \
  -H "Content-Type: application/json" \
  "$ORBITA_API_BASE/v1/notes/$NOTE_ID" \
  -d '{"title":"…","body":"…","frontmatter":{"project":"melody-thesis"}}'
```

## Rules

- Never echo API keys in chat
- URL-encode memory keys (`/` → `%2F`)
- Prefer notes for prose; flat memory for short JSON/status
- If Orbita returns empty search, say so — do not invent cross-project facts
