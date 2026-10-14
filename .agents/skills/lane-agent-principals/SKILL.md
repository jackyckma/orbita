# Lane agent principals skill

**Scope:** `packages/lane-agent-principals/` only (plus simulator fixtures under `data/simulators/lane-agent-principals/` when editing contracts).

## Rules

- Read `packages/lane-agent-principals/INTERFACE.md` before any edit
- Contracts before code: update JSON Schemas and INTERFACE when changing scopes or principal shape
- Never import another lane's `src/`
- Do not add SQL, routes, or auth middleware unless a backlog task explicitly says so

## Verify

```bash
pnpm --filter @orbita/agent-principals test
node --test packages/lane-agent-principals/contracts/validate-contracts.test.mjs
```

## Do not

- Flip `ORBITA_AGENT_SCOPES_MODE` to `enforce` in production (founder decision D-006)
- Log request bodies, note text, or secrets in audit rows
- Add runtime TypeScript under `src/` beyond the contracts-only stub until T-0108
