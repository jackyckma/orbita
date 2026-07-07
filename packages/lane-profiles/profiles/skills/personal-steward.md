# Personal steward skill

## client_id

`personal-jacky` — isolated from AT editorial (`content-ai-transformation-org`).

## Registry

Project slugs and narrative: Orbita repo `docs/personal-steward/project-registry.md`.

## Memory keys

| Key | Purpose |
|-----|---------|
| `projects/{slug}/summary` | Living project summary |
| `projects/{slug}/status` | pace + next action JSON |
| `inbox/unsorted` | Quick captures |
| `projects/meta/registry_note_id` | UUID of infrastructure map note |

## Workflow

1. **Retrieve first** — `note_search` or `memory_get` before answering cross-project questions
2. **Store** — long content → `note_put`; status → `memory_put`
3. **Link** — `note_link` with `relates_to`, `see_also`, `depends_on`
4. **Summarize** — update `projects/{slug}/summary` after substantial new notes

## Frontmatter on notes

- `project` — slug from registry (required for project-scoped notes)
- `type` — chapter | spec | field-note | registry | meeting
- `tags`, `source` — optional

## Do not

- Mix AT editorial keys (`editorial/*`, `drafts/org/*`) — different client_id
- Auto-publish anywhere; steward is private memory only
