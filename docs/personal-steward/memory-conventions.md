---
status: active
maintained_by: jacky
created: 2026-07-07
---

# Memory & note conventions (personal-jacky)

## Flat memory keys

| Key pattern | Content |
|-------------|---------|
| `projects/{slug}/summary` | 1–2 paragraph living summary (JSON or prose) |
| `projects/{slug}/status` | `{ "pace": "active|background|paused", "next": "…" }` |
| `inbox/unsorted` | Quick captures before steward organizes |
| `steward/last-sync` | ISO timestamp of last cross-tool ingest |

## Notes (markdown + frontmatter)

```yaml
---
project: vios          # slug from project-registry.md
type: report|instruction|decision|taxonomy|chapter|spec|field-note|meeting|registry
# Hub workflow types (report/instruction/decision/taxonomy): see portfolio-hub.md — each has purpose/scope in the taxonomy note.
# Knowledge types (chapter/spec/…): long-form PA0 content.
tags: [ui, research]   # optional freeform; promote into taxonomy before agents must rely on them
source: cursor|claude|chatgpt|manual|orbita-pull
updated: 2026-07-07
period_since: 2026-08-01   # required for type=report when known
period_until: 2026-08-07
---
```

**When to use notes vs memory:**

| Use | Store |
|-----|--------|
| Paragraphs, chapters, specs | `note_put` / `PUT /v1/notes/{id}` |
| Status, JSON state, pointers | `memory_put` / `PUT /v1/memories/{key}` |
| Relationships | `note_link` (`relates_to`, `depends_on`, `contradicts`, `see_also`) |

## Export notes (Obsidian-friendly Markdown)

`GET /v1/notes/export` returns JSON `{ "files": [{ "path", "body" }] }` for the authenticated `client_id`. Each file is Obsidian-ready Markdown (H1 title, body, outgoing `[[wikilinks]]` from note links). Auth is the same API-key pattern as other personal-steward REST calls — not OAuth.

```bash
source ~/.orbita-personal.env
AUTH=(-H "Authorization: Bearer $ORBITA_PERSONAL_API_KEY" \
      -H "x-orbita-client-id: personal-jacky")

curl -sS "${AUTH[@]}" "$ORBITA_API_BASE/v1/notes/export" | jq .
# optional: write each file under ./export/
# jq -r '.files[] | "\(.path)\t\(.body)"' …
```

## Idempotency

- Prefer **stable note ids** (uuid you keep in project README) for living docs
- Append-only logs: new note + link to previous version

## Privacy

`personal-jacky` is **your** tenant on your Orbita Postgres. Do not share API keys across people. Separate from `content-ai-transformation-org` editorial memory.
