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

## Hub briefs — list/filter contract (`GET /v1/notes`)

Use this when a fresh Claude/Cursor session needs **deterministic** hub retrieval
(“reports for project X since date Y”) without re-reading lane-memory source.
Semantic search (`GET /v1/notes/search`) is unchanged and separate — do not use
it for date/project filters.

### Endpoint

`GET /v1/notes` on the authenticated client (`personal-jacky` for the steward).
Auth is the same Bearer + `x-orbita-client-id` pattern as other PA0 REST calls.
Results are scoped to that client only; ordered by `updated_at` descending;
default page size is 50 (no extra pagination params in this contract).

### Query params (exact names)

| Param | Semantics |
|-------|-----------|
| `project` | Match frontmatter `project` **exactly** (case-insensitive). Omit = no project constraint. |
| `type` | Match frontmatter `type` **exactly** (case-insensitive). Omit = no type constraint. |
| `since` | ISO-8601 timestamp; filter on note `updated_at`, **inclusive** lower bound. Invalid/empty → ignored (no constraint). |
| `until` | ISO-8601 timestamp; filter on note `updated_at`, **exclusive** upper bound. Invalid/empty → ignored. |

Omitted params mean no constraint. Unknown query keys are ignored (not errors).
`project` / `type` match string frontmatter fields only — non-string or missing
fields fail the filter.

### Frontmatter required to be findable

A note is returned by these filters only if its frontmatter carries the fields
you filter on. For hub workflow notes (see `portfolio-hub.md` **H0**):

| Field | Value |
|-------|--------|
| `project` | Stable **slug** (e.g. `powerhouse`, `orbita`, `ai-transformation`) — same slug space as the portfolio registry. |
| `type` | One of hub workflow types: **`report`** · **`instruction`** · **`decision`** · **`taxonomy`**. Knowledge types (`chapter` / `spec` / …) also filter if present, but hub briefs usually ask for `type=report`. |

Example frontmatter for a findable report:

```yaml
---
project: powerhouse
type: report
period_since: 2026-08-01
period_until: 2026-08-07
---
```

### Curl — “reports for project X since date Y”

```bash
source ~/.orbita-personal.env
AUTH=(-H "Authorization: Bearer $ORBITA_PERSONAL_API_KEY" \
      -H "x-orbita-client-id: personal-jacky")

# Reports for powerhouse updated on/after 2026-08-01 (inclusive)
curl -sS "${AUTH[@]}" \
  "$ORBITA_API_BASE/v1/notes?project=powerhouse&type=report&since=2026-08-01T00:00:00.000Z" \
  | jq .
```

Optional upper bound (exclusive): add `&until=2026-08-08T00:00:00.000Z`.
Response shape: `{ "notes": [{ "id", "title", "updated_at" }, ...] }`.

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
