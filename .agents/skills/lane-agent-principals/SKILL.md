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

## Runbooks

- `docs/personal-steward/agent-principals-pilot.md` — external-agent charter limits and explicit deny list for the Grok pilot (no prod enforce flip; D-006).
- `docs/personal-steward/agent-principals-activation.md` — founder steps to enable `ORBITA_AGENT_PRINCIPALS_ENABLED` and verify DDL; keep `ORBITA_AGENT_SCOPES_MODE` at shadow until sign-off.
- `docs/personal-steward/shared-computer-trust.md` — shared virtual computer trust model and union-of-keys permissions for bot co-location.
- `docs/personal-steward/grok-bot-pilot-activation.md` — Grok bot pilot activation checklist and Orbita caller wiring.

## Do not

- Flip `ORBITA_AGENT_SCOPES_MODE` to `enforce` in production (founder decision D-006)
- Log request bodies, note text, or secrets in audit rows
- Add runtime TypeScript under `src/` beyond the contracts-only stub until T-0108
