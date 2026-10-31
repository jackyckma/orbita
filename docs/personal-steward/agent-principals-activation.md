# Agent principals — founder activation checklist (D-006)

Step-by-step runbook for turning on **E-17 agent principals** in production: optional DDL, admin principals for Grok bots, and a safe **`shadow` → `enforce`** rollout under [D-006](../autopilot/decisions.json).

The Autopilot Maker/Checker loop **does not** set Zeabur env, mint API keys, create principals in prod, or flip `ORBITA_AGENT_SCOPES_MODE`.

**Related:**

- [Agent principals pilot](./agent-principals-pilot.md) — scope model, deny list, and bot charter limits (ships with E-17 tier 1)
- [Shared-computer trust domain](./shared-computer-trust.md) — union-of-keys on one Grok VM
- [Grok Bot pilot activation](./grok-bot-pilot-activation.md) — tickets (D-005) and combined D-006 narrative
- [Lane INTERFACE](../../packages/lane-agent-principals/INTERFACE.md) — flags, scopes, audit events

---

## PRE-FLIGHT (repo + local verify, no production)

Complete on **main** before Zeabur changes. Reversible by leaving flags off.

| # | Check | How |
|---|--------|-----|
| 1 | E-17 contracts landed (**T-0107**) | `pnpm --filter @orbita/agent-principals test` |
| 2 | Optional DDL + repo (**T-0108**) merged | `optional-agent-principals.sql` in allowlist; tier-A applies DDL twice when flag on |
| 3 | Admin routes (**T-0110**) merged | `POST/GET/PATCH /v1/admin/agent-principals` documented in INTERFACE |
| 4 | Verify script exists | `test -f scripts/agent-principals-verify-local.sh` |

Local proof (no prod secrets on the wire unless you choose):

```bash
# Syntax + intended endpoints only
DRY_RUN=1 ./scripts/agent-principals-verify-local.sh

# Against a local tier-A API with mock LLM (after T-0108: start API with ORBITA_AGENT_PRINCIPALS_ENABLED=1)
ORBITA_E2E_MOCK=1 ORBITA_API_BASE=http://127.0.0.1:3099 \
  ORBITA_ADMIN_TOKEN=<from .env> ./scripts/agent-principals-verify-local.sh
```

If the server reports principals **off**, the script exits **0** with a skip message — expected until you flip the flag locally or in prod.

**Tickets pilot:** if Grok bots use mandates, complete [D-005](./grok-bot-pilot-activation.md#d-005--enable-tickets-orbita_tickets_enabled) (`ORBITA_TICKETS_ENABLED=1`) before binding `mandate_ids` on bot principals.

---

## Step 1 — Enable principals DDL (`ORBITA_AGENT_PRINCIPALS_ENABLED`)

**Founder-only** on production API service (`https://api.get-orbita.com`).

| Variable | Value | Notes |
|----------|--------|--------|
| `ORBITA_AGENT_PRINCIPALS_ENABLED` | `1` | Applies optional migrations at **boot** (same pattern as tickets). Bad DDL **prevents boot**. |
| `ORBITA_AGENT_SCOPES_MODE` | `shadow` | **Do not** start at `enforce` — see Step 4 and D-006. |

### Scratch database (recommended before prod)

1. Point `DATABASE_URL` at disposable Postgres (Docker or Zeabur scratch).
2. Build API; run migrations with flag **off**, then **on**, then **on** again (idempotent `IF NOT EXISTS`).
3. Confirm `agent_principals` / `agent_audit` exist; process exits cleanly twice.

### Production flip

1. Set `ORBITA_AGENT_PRINCIPALS_ENABLED=1` and `ORBITA_AGENT_SCOPES_MODE=shadow` on Zeabur.
2. Redeploy; watch logs for optional agent-principals migrations applied.
3. `GET /v1/health` — confirm feature reports enabled (field name may vary; see verify script).
4. Run `./scripts/agent-principals-verify-local.sh` against prod **only** from a machine with `ORBITA_ADMIN_TOKEN` in env (never commit or paste tokens).

On first boot with flag on, existing API keys map to built-in **`legacy-full`** principals (all scopes) so nothing breaks until you create least-privilege rows.

### Rollback

1. Set `ORBITA_AGENT_PRINCIPALS_ENABLED=0` and restart.
2. No principal enforcement; **rows remain** in Postgres (additive DDL).
3. Re-open [D-006](../autopilot/decisions.json) if you need a formal record.

---

## Step 2 — Create `external-agent` principals (admin API)

**Founder-only.** Use Admin console token header `x-orbita-admin-token` (not `Authorization`). Never put real keys, tokens, or key **secrets** in git or this doc.

### 2a — Mint one API key per Grok bot

Admin UI → create key with label + purpose (e.g. `grok-market-research`), short **expiry**, `allowed_client_ids` = `personal-jacky` only. Store the secret in the bot host vault — not on shared disk (see [shared-computer-trust.md](./shared-computer-trust.md)).

Note the key **id** (uuid) for binding — not the secret string.

### 2b — Create principal per bot

`POST /v1/admin/agent-principals` with JSON body (shape per [principal.schema.json](../../packages/lane-agent-principals/contracts/principal.schema.json)):

| Field | Grok bot value |
|-------|----------------|
| `kind` | `external-agent` |
| `client_id` | `personal-jacky` |
| `name` | Human label matching the key purpose |
| `bound_api_key_id` | The executor key **id** from 2a |
| `mandate_ids` | One active mandate uuid per bot (after D-005 POST-ACTIVATION) |
| `scopes` | Least privilege for ticket executor work only — see [agent-principals-pilot.md](./agent-principals-pilot.md) |

Example request shape (placeholders only):

```bash
curl -sS -X POST "$ORBITA_API_BASE/v1/admin/agent-principals" \
  -H "x-orbita-admin-token: $ORBITA_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "external-agent",
    "client_id": "personal-jacky",
    "name": "grok-market-research",
    "bound_api_key_id": "<executor-key-id>",
    "mandate_ids": ["<mandate-uuid>"],
    "scopes": ["tickets:read", "tickets:claim", "tickets:write:dev"]
  }'
```

List and patch via `GET` / `PATCH /v1/admin/agent-principals` (revoke, suspend, rebind). Details: [INTERFACE.md](../../packages/lane-agent-principals/INTERFACE.md).

### 2c — Verify identity from the bot key

From the **executor** key (MCP or REST `orbita_whoami`):

- `principal_id` matches the row you created
- `scopes` and `mandate_ids` match intent
- `ticket_role` = `executor` when tickets are enabled

Do **not** connect bots to untrusted web until Step 4 sign-off.

---

## Step 3 — Stay in `shadow` until D-006 sign-off

While `ORBITA_AGENT_SCOPES_MODE=shadow`:

- Scope checks **run** and **`would-deny`** rows append to `agent_audit`.
- Callers **still succeed** — this is audit-only, not protection.

Founder actions during shadow:

1. Exercise each bot key through its normal MCP daily loop (see [ticket executors](../site/ticket-executors.md)).
2. Review audit for unexpected **would-deny** on allowed work; fix scopes or mappings.
3. Confirm **would-deny** appears for forbidden tools (`github_*`, `trigger_automation`, `ticket_approve`, admin routes) once scope mapping (T-0111) and bot rules (T-0112) are on main.
4. Complete [shared-computer trust](./shared-computer-trust.md) union-of-keys review for the Grok host.

**Do not** set production to `enforce` until the checklist in Step 4 is checked and [D-006](../autopilot/decisions.json) is updated.

---

## Step 4 — Switch to `enforce` (founder-only, after sign-off)

Per **D-006**, only the founder sets `ORBITA_AGENT_SCOPES_MODE=enforce` in production.

Prerequisites:

- [ ] E-17 tier 1 enforcement paths merged (scope table T-0111, bot subtree T-0112, `untrusted_author` on reads)
- [ ] Dedicated **external-agent** principals for every Grok bot; hub integrator keys audited or left on `legacy-full` intentionally
- [ ] Shadow audit reviewed — no false **would-deny** on required executor paths
- [ ] Mandates **active** and `ORBITA_TICKETS_KEY_MANDATES` or principal `mandate_ids` aligned ([grok-bot-pilot-activation.md](./grok-bot-pilot-activation.md#post-activation-mandates--bot-verification))
- [ ] Charter `hard_limits` + bot system prompt include the same never-do list as [agent-principals-pilot.md](./agent-principals-pilot.md)

Sequence:

1. Set `ORBITA_AGENT_SCOPES_MODE=enforce` on Zeabur; restart API.
2. Re-smoke each bot key — expect **403** / `scope_denied` on forbidden tools; allowed ticket paths succeed.
3. Record decision on [D-006](../autopilot/decisions.json) (option **A**: shadow then enforce).

**Emergency:** suspend principal or API key in Admin before revoking; see [shared-computer-trust.md](./shared-computer-trust.md#founder-checklist).

---

## Checklist summary

```text
[ ] PRE-FLIGHT: T-0107 tests, T-0108 DDL on scratch ×2, DRY_RUN verify script
[ ] Step 1: Zeabur ORBITA_AGENT_PRINCIPALS_ENABLED=1 + ORBITA_AGENT_SCOPES_MODE=shadow
[ ] Step 1: health + agent-principals-verify-local (admin list JSON OK)
[ ] Step 2: one key per bot + POST external-agent principal (no secrets in repo)
[ ] Step 2: orbita_whoami from each executor key
[ ] Step 3: shadow audit clean; trust-domain checklist done
[ ] Step 4: enforce only after D-006 sign-off + 403 smoke on forbidden tools
```

**Maker note:** This document does not activate production. Flag and mode changes remain founder actions under D-006.
