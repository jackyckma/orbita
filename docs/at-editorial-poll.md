---
status: active
maintained_by: jacky + ai-agents
last_updated: 2026-07-07
purpose: Phase 1 editorial outcome poll — Orbita/agent refetches AT object status after human review.
related: docs/development-plan.md, docs/harness-design.md, docs/at-platform-answers.md
---

# AT editorial outcome poll (Phase 1)

After human review on AT `/editorial`, Orbita closes the loop by **polling** object state — no webhooks.

## Flow

```text
Supply harness (07:00 UTC)  →  POST /objects/drafts  →  track ids in drafts/org/daily/{date}
Human /editorial review    →  approve/reject + optional editorial_comment
Poll harness (18:00 UTC)    →  GET /objects/{id}  →  append editorial/feedback
Next supply run             →  memory_get editorial/feedback
```

## AT read API

```http
GET https://ai-transformation.io/api/v1/objects/{id}
Authorization: Bearer <L11 write token — vault atx_write_org>
```

Response: `{ ok: true, object: { id, status, title, metadata, updatedAt, … } }`

### Metadata mapping (2026-07-07)

| Field | When set | Use |
|-------|----------|-----|
| `status` | always | `draft` = pending; `published` = approved path; `archived` = rejected path |
| `metadata.editorial_review` | human decision | `approved` \| `rejected` |
| `metadata.editorial_comment` | human approve/reject | **Primary learning signal** — founder note to submitting agent |
| `metadata.editorial_review_at` | human decision | ISO timestamp (prefer over `updatedAt` when set) |
| `metadata.editorial_agent` | agent advisory | `{ summary, substance_score, flags, … }` — non-blocking |

### Decision mapping

| AT state | Orbita `decision` |
|----------|-------------------|
| `status: draft` | pending — no feedback yet |
| `status: published` + `editorial_review: approved` | **approved** |
| `status: archived` + `editorial_review: rejected` | **rejected** |

## Orbita responsibilities

1. **Track** object ids in `drafts/org/daily/YYYY-MM-DD` (`objects[]` with `id`, `last_seen_status`, `feedback_appended`).
2. **Poll** each id where `feedback_appended !== true`.
3. **Append** structured entry to `editorial/feedback` (via harness `POST /v1/harnesses/{id}/feedback` or `memory_put`).
4. **Idempotency** — same object + terminal status must not duplicate feedback.

## Mechanisms

| Mechanism | Role |
|-----------|------|
| **Poll harness** (18:00 UTC, `at-editorial-poll` profile) | Steady-state — agent-initiated |
| **`scripts/at1b-poll-editorial-outcomes.sh`** | Operator fallback / post-review one-shot |
| **`at-agent/scripts/at1b-sync-review-outcomes.sh`** | Same logic in gitignored workspace copy |

Webhooks deferred (Phase 2+) — poll is caller-neutral for any agent using AT.

## Poll harness IDs (prod)

| Resource | ID |
|----------|-----|
| Supply harness | `dd839025-1200-4df4-b69b-b3454625416f` |
| Poll harness | `e4c0de60-9db6-4bb8-9845-b5c586afcc36` |

## Feedback entry shape

```json
{
  "date": "2026-07-07",
  "source": "at_poll",
  "object_id": "…",
  "title": "…",
  "decision": "approved|rejected",
  "editorial_comment": "optional founder note",
  "editorial_review_at": "ISO",
  "agent_summary": "optional from editorial_agent",
  "text": "Human-readable line for supply agent"
}
```
