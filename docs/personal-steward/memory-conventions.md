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
type: chapter|spec|field-note|meeting|registry
tags: [ui, research]
source: cursor|claude|chatgpt|manual
updated: 2026-07-07
---
```

**When to use notes vs memory:**

| Use | Store |
|-----|--------|
| Paragraphs, chapters, specs | `note_put` / `PUT /v1/notes/{id}` |
| Status, JSON state, pointers | `memory_put` / `PUT /v1/memories/{key}` |
| Relationships | `note_link` (`relates_to`, `depends_on`, `contradicts`, `see_also`) |

## Idempotency

- Prefer **stable note ids** (uuid you keep in project README) for living docs
- Append-only logs: new note + link to previous version

## Privacy

`personal-jacky` is **your** tenant on your Orbita Postgres. Do not share API keys across people. Separate from `content-ai-transformation-org` editorial memory.
