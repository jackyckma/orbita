# Lane auth skill

**Scope:** `packages/lane-auth/` and `data/simulators/auth/`.

## Rules

- `client_id` must always be validated against the key's allow-list server-side
- Never log or return plaintext API keys except on `POST /v1/admin/api-keys` create response
- Store only SHA-256 hash of keys
- Read `packages/lane-auth/INTERFACE.md` before editing

## Verify

```bash
pnpm --filter @orbita/auth test
pnpm --filter @orbita/auth typecheck
# integration: create key + GET /v1/whoami (see INTERFACE.md)
```

## Do not

- Import session or agent lane code
- Allow free-form client_id without allow-list check
