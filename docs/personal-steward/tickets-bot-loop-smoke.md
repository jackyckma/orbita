# Tickets bot-loop smoke (tier A)

Synthetic **executor day** exercise for the Grok pilot: one mandate, one epic approval, one task lifecycle, and a `ticket_propose` / `ticket_resolve` round-trip over **REST only** (no LLM, no production).

## What it proves

- `ORBITA_TICKETS_ENABLED=1` with role derivation (`ORBITA_TICKETS_FOUNDER_KEY_IDS`, `ORBITA_TICKETS_INTEGRATOR_KEY_IDS`, `ORBITA_TICKETS_KEY_MANDATES`).
- Integrator creates a **draft** mandate; **founder** activates it.
- **Integrator** cannot activate a mandate (`ticket_approve` → HTTP 409, `ticket_error: ROLE_REQUIRED`); **executor** `ticket_approve` is denied at the REST gate (HTTP 403, `forbidden`).
- Executor creates a **proposed** epic; integrator **approves** with precheck OK.
- Executor creates an **approved** L0 task, **claim** → **progress** → **complete** with `result_refs`, **comment**.
- Executor **proposes**; integrator **resolves**.

## How to run

Prerequisites: Docker (Postgres), `pnpm install`, `jq`.

```bash
./scripts/tickets-bot-loop-smoke.sh
```

Default API port is **3100** (override with `PORT=`). Uses `ORBITA_E2E_MOCK=1` and local Postgres only.

CI: `scripts/e2e-tier-a.sh` invokes this script after ticket migration/repository e2e when tier A is enabled.

## Key binding pattern

The script uses a **two-phase** API boot:

1. Mint API keys and create a draft mandate with founder/integrator lists set.
2. Restart the API with `ORBITA_TICKETS_KEY_MANDATES` mapping the executor key id to the mandate uuid, then run `tests/e2e/tickets-bot-loop.test.ts`.

Do **not** enable tickets in production as part of this smoke; see [grok mandate seed](./tickets-grok-mandate-seed.md) and activation checklist (T-0104).

## Related

- `scripts/tickets-seed-grok-mandates.sh` — real mandate seed against a configured API (founder credentials).
- `docs/site/ticket-executors.md` — executor role and mandate binding.
