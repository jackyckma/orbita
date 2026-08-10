# Note search troubleshooting (`note_search` / `GET /v1/notes/search`)

## Symptom

`note_put` / `PUT /v1/notes/{id}` succeeds and `GET /v1/notes/{id}` returns the
note, but `note_search` / `GET /v1/notes/search?q=…` returns `{ "notes": [] }`.

## Root cause (code, fixed in T-0030)

`packages/lane-memory/src/embed.ts` previously called MiniMax through the OpenAI
SDK (`embeddings.create({ model, input })`). MiniMax `/embeddings` is **not**
OpenAI-compatible:

| | OpenAI-style (broken here) | MiniMax (required) |
|---|---|---|
| Body | `{ model, input }` | `{ model, texts: [...], type }` |
| `type` | n/a | `db` when indexing notes/memories; `query` when searching |
| Reply | `data[0].embedding` | `vectors[0]` (+ `base_resp`) |

Failures were swallowed (`catch { return null }`), so `upsertNote` still wrote
the row with `embedding IS NULL`. Search only considers rows with non-null
embeddings, so results were empty.

## After the fix

1. Redeploy API with the MiniMax-native embed client.
2. Confirm env on the API service (no secret values in chat):
   - `MINIMAX_API_KEY` set
   - `MINIMAX_BASE_URL` (default `https://api.minimax.io/v1`)
   - `EMBEDDING_MODEL=embo-01`
   - `EMBEDDING_DIMENSIONS=1024` (must match `vector(1024)` in migrations)
   - optional `MINIMAX_GROUP_ID` if your MiniMax region requires `?GroupId=`
3. **Re-index existing notes** — old rows stay `embedding IS NULL` until rewritten:
   - `PUT /v1/notes/{id}` with the same body (or a batch re-put), or
   - SQL check: `SELECT count(*) FILTER (WHERE embedding IS NULL) FROM notes WHERE client_id = …`
4. Smoke:
   - put a short note → search a related phrase → expect a hit.

## Still empty after redeploy?

| Check | What it means |
|---|---|
| Embed HTTP 4xx/5xx or `base_resp.status_code != 0` | Key / model / region issue — env-only; do not rotate secrets in chat |
| Vector length ≠ `EMBEDDING_DIMENSIONS` | Model dims ≠ `vector(1024)` — needs a coordinated migration + env change (`needs_human`) |
| Notes still null after put | Embed still failing at runtime — inspect API logs around `/embeddings` |
| Wrong `client_id` | Auth client scope; search never crosses clients |

## Code map

- Embed client: `packages/lane-memory/src/embed.ts`
- Env: `loadMemoryEnv` in `packages/lane-memory/src/config.ts`
- Index path: `upsertNote` → `embedText(..., { purpose: "db" })`
- Search path: `searchNotes` → `embedText(..., { purpose: "query" })`
- HTTP: `GET /v1/notes/search` in `packages/lane-memory/src/routes/notes.ts`
- Tool: `note_search` in `packages/lane-tools`
