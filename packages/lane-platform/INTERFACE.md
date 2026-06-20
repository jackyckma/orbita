---
status: active
maintained_by: ai-agents
created: 2026-06-20
last_updated: 2026-06-20
purpose: Boundary contract for Lane 0 — Platform.
---

# Lane 0 — Platform INTERFACE

## Summary

Shared HTTP infrastructure: standardized error envelope, request IDs, structured logging, health check, and OpenAPI base. Does **not** own business logic, auth, or agent behavior.

## Owns

- `packages/lane-platform/src/`
- `GET /v1/health`
- Error envelope schema (`error.code`, `error.message`, `error.request_id`)

## Provides

- `OrbitaError` + `toApiErrorBody()` — machine-parseable errors
- `requestIdMiddleware` — `x-request-id` on every response
- `createLogger()` — pino JSON logs with `request_id`
- `createHealthRoutes(version)` — health endpoint
- `loadPlatformEnv()` — env validation

## Consumes

- Nothing from other lanes

## Allowed paths

```
packages/lane-platform/**
apps/orbita-api/src/index.ts   (mount only — no platform logic here)
```

## Does not

- Validate API keys
- Store sessions or memory
- Call LLM providers

## Verification

```bash
curl -s http://127.0.0.1:3000/v1/health | jq .
# expect: { "status": "ok", "version": "...", "uptime_seconds": N }
```

## Open items

- Rate limiting middleware (design Section 16)
- API versioning deprecation policy
