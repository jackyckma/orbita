---
status: active
maintained_by: ai-agents
created: 2026-06-20
last_updated: 2026-06-20
purpose: Boundary contract for Lane 1 — Auth & Identity.
---

# Lane 1 — Auth INTERFACE

## Summary

Pre-issued API key management and request authentication. Enforces the caller → allowed `client_id` → session/memory chain from design Section 2.

## Owns

- `packages/lane-auth/src/`
- `POST /v1/admin/api-keys`
- `DELETE /v1/admin/api-keys/{key_id}`
- Bearer auth middleware
- `api_keys` Postgres table

## Provides

- `createAuthMiddleware(authDb)` — validates Bearer token + `x-orbita-client-id`
- `requireScope(scope)` — scope gate for future session routes
- `createAdminRoutes(authDb, guard)` — key issuance and revocation
- Plaintext key returned **once** on create; only SHA-256 hash stored

## Consumes

- Lane 0: `OrbitaError`, error envelope

## Request contract

**Authenticated routes:**

```http
Authorization: Bearer orb_...
x-orbita-client-id: project-my-app
```

**Admin routes:**

```http
x-orbita-admin-token: <ORBITA_ADMIN_TOKEN>
```

## Allowed paths

```
packages/lane-auth/**
packages/lane-auth/drizzle/**
data/simulators/auth/**
```

## Does not

- Issue OAuth or self-service registration
- Infer client_id from caller identity
- Store session or message data

## Verification

```bash
# Create key (requires ORBITA_ADMIN_TOKEN in env)
curl -s -X POST http://127.0.0.1:3000/v1/admin/api-keys \
  -H "x-orbita-admin-token: $ORBITA_ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"allowed_client_ids":["test-client"],"scopes":["sessions:create","sessions:use"]}'

# Verify auth
curl -s http://127.0.0.1:3000/v1/whoami \
  -H "Authorization: Bearer $KEY" \
  -H "x-orbita-client-id: test-client"
```

## Open items

- Rate limiting per API key
- Credential rotation workflow (design Section 16)
