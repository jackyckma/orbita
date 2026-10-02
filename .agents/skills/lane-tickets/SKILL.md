# Lane tickets skill

**Scope:** `packages/lane-tickets/` only (plus simulator fixtures under `data/simulators/lane-tickets/` when editing contracts).

## Rules

- Read `packages/lane-tickets/INTERFACE.md` before any edit
- Contracts before code: update JSON Schemas and INTERFACE when changing verbs or state machines
- Never import another lane's `src/`
- Do not modify notes API, `init.sql`, or `apps/orbita-api` routes unless a ticket task explicitly says so

## Verify

```bash
pnpm --filter @orbita/tickets test
node --test packages/lane-tickets/contracts/validate-contracts.test.mjs
```

## Do not

- Add runtime TypeScript under `src/` until the transition-engine task (T-0084) says so
- Implement recurring/auto-created tickets or in-Orbita LLM planning
- Treat soft_constraints as blocking by default — use **soft_breach** events instead
