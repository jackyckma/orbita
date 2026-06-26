# AT editorial supply skill

## Memory keys (client-scoped — always `memory_get` before each run)

| Key | Purpose |
|-----|---------|
| `editorial/feedback` | Founder/editor feedback JSON — **steers tone, topics, rejections** |
| `editorial/backlog` | Ideas queue: `{ version, items: [{ id, title, pillar, status, notes }] }` |
| `editorial/published-log` | Submitted drafts: titles, object ids, themes, dates — **consistency check** |
| `editorial/research-recommendations` | Optional founder URLs + search query hints (JSON) |
| `editorial/research-snapshot/YYYY-MM-DD` | Today's web research notes + source URLs |
| `drafts/org/daily/YYYY-MM-DD` | Batch summary after submit |

## Each run (order matters)

1. `memory_get` → feedback, backlog, published-log, research-recommendations
2. **Web research** — `web_search` (2–4 queries) and/or fetch recommended URLs via `http_get`
3. **Consistency** — do not repeat titles/themes in `published-log`; prefer `backlog` items with `status: todo`
4. Write 5 drafts; submit via `http_post` + `credential_ref: atx_write_org`
5. Update backlog (`done` / `deferred`), append `published-log`, `memory_put` daily summary + research snapshot

## Feedback

When feedback says reject a pattern (too hype, wrong frame, duplicate), append to `editorial/feedback` and apply on **future** runs — do not ignore prior feedback entries.

## Draft-only

Submit to `POST …/objects/drafts` only. Never call approve/publish endpoints.
