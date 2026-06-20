# Lane platform skill

**Scope:** `packages/lane-platform/` only.

## Rules

- Keep this lane free of auth, session, or LLM logic
- All errors must use `OrbitaError` → stable JSON envelope with `request_id`
- Read `packages/lane-platform/INTERFACE.md` before editing

## Verify

```bash
pnpm --filter @orbita/platform test
pnpm --filter @orbita/platform typecheck
curl -s http://127.0.0.1:3000/v1/health
```

## Do not

- Import from `@orbita/auth` or other lane packages
- Add business routes to platform — mount them in `apps/orbita-api`
