# Current status

**Last updated:** 2026-06-20

## Summary

Orbita **Wave W0 scaffold is in place**: TypeScript monorepo with platform lane (health, errors, logging) and auth lane (API keys, client_id allow-list, admin CRUD). Docker Compose includes Postgres with initial migration.

## What works

- `GET /v1/health` — health check
- `GET /v1/openapi.json` — OpenAPI spec
- `POST /v1/admin/api-keys` / `DELETE /v1/admin/api-keys/{id}` — key management
- `GET /v1/whoami` — Bearer + client_id auth smoke test
- Standardized error envelope with `request_id`
- Unit tests for platform errors and auth key hashing
- Lane docs: `product-architecture.md`, `traceability-index.md`, INTERFACE.md (lanes 0–4 stubs)

## Known gaps

- Sessions, agent runtime, memory, tools, scheduler, trajectory — not started (W1+)
- Rate limiting not implemented
- Zeabur project/service IDs not configured
- `ORBITA_ADMIN_TOKEN` and `DATABASE_URL` must be set in `.env` for local dev

## Next steps

1. **W1:** Lane 3 (sessions) — CRUD + message storage without LLM
2. **W2:** Lane 4 (agent runtime) — first turn via MiniMax-M3
3. Lane 2 (profiles/skills) — static bundles for session creation
