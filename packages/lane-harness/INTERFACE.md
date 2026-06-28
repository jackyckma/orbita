---
status: planned
maintained_by: ai-agents
created: 2026-06-28
purpose: Loop Engineering infrastructure — Harness registry, templates, runs.
related: docs/harness-design.md
---

# Lane — Harness (W27)

## Provides

- `GET /v1/harness-templates` — built-in template catalog
- `POST/GET/PATCH /v1/harnesses` — declarative Loop 1 + 3 config
- `POST /v1/harnesses/{id}/trigger` — manual run
- `GET /v1/harnesses/{id}/runs`, `GET /v1/harness-runs/{id}`
- `POST /v1/harnesses/{id}/feedback` — append to configured memory key (H1.5)

## H1 scope

- Templates: `cron-agent`, `editorial-supply@v1`
- Loops 2 (verify) and 4 (improve auto) rejected at create time
- Cron tick via `startHarnessTick` (5s poll, idempotent cron fingerprint)

## See also

- `docs/harness-design.md`
