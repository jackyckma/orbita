# AT editorial poll skill

Poll ai-transformation.io for **human review outcomes** on Orbita-submitted drafts. **Do not write new articles.**

## Read first

`memory_get`:

- `editorial/published-log` — historical object ids
- `drafts/org/daily/YYYY-MM-DD` for last 14 days — batch summaries with `objects[]`
- `editorial/feedback` — avoid duplicating entries

## Poll AT (required)

For each tracked object id where `feedback_appended` is not `true`:

```http
GET https://ai-transformation.io/api/v1/objects/{id}
Authorization: Bearer <credential_ref atx_write_org>
```

Use `http_get` with `credential_ref: atx_write_org` if your deployment supports authenticated GET; otherwise use the vault token pattern from `api_http` skill.

### Mapping

| AT | Action |
|----|--------|
| `status: draft` | pending — update `last_seen_status` only |
| `published` + `metadata.editorial_review: approved` | **approved** → append feedback |
| `archived` + `metadata.editorial_review: rejected` | **rejected** → append feedback |

Include when present:

- `metadata.editorial_comment` — **founder note (highest priority for learning)**
- `metadata.editorial_review_at` — decision time
- `metadata.editorial_agent.summary` — advisory context only

## Append learning (required)

For each **new** terminal outcome:

1. Append to `editorial/feedback` via `memory_put` (merge JSON array or structured log).
2. Update the daily batch object: `last_seen_status`, `feedback_appended: true`, `decision`.

Example feedback line:

```text
[rejected] Title (id=…). Founder: "Too product-pitch; lead with practitioner pain." Agent advisory: substance 9/15.
```

**Idempotency:** never duplicate the same `object_id` + terminal `decision`.

## Rules

- Read-only on AT — never approve/publish/reject
- Prefer concise, actionable feedback for the next supply run
