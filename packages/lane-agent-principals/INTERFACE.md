---
status: planned
maintained_by: ai-agents
created: 2026-10-14
purpose: Per-agent identity and tool-level scopes (E-17 tier 1).
related: docs/autopilot/roadmap.json (E-17), docs/autopilot/decisions.json (D-006)
---

# Lane — Agent principals (E-17)

## Summary

This lane owns **`packages/lane-agent-principals/`** only. It answers: **which agent** called Orbita, **what it was allowed to do**, and an **append-only audit** of allow/deny decisions — without logging payload bodies.

Runtime persistence, auth wiring, and enforcement land in later E-17 tasks (T-0108+). This slice is **contracts + INTERFACE only**.

## Feature flags

| Env | Values | Default | Meaning |
|-----|--------|---------|---------|
| `ORBITA_AGENT_PRINCIPALS_ENABLED` | `0` \| `1` | `0` | When `0`, no DDL, no principal rows, no behaviour change. When `1`, optional migrations and repository run at API boot (T-0108). |
| `ORBITA_AGENT_SCOPES_MODE` | `off` \| `shadow` \| `enforce` | `off` | **`off`**: no scope evaluation. **`shadow`**: evaluate scopes, write **`would-deny`** audit rows, never block. **`enforce`**: deny with stable error codes when scope missing. |

Parsing follows existing Orbita convention: explicit `0`/`1` for the enable flag; scopes mode is a string enum.

**Founder-only (D-006):** switching production from `shadow` to `enforce`, and creating principals for real external agents, are not automated by Maker/Checker.

## Tenancy

- Every `agent_principal` and `agent_audit` row carries **`client_id`** from the authenticated context only.
- Repository queries must include a **`client_id` predicate** on every read/write (T-0108).
- Principals never span tenants; `mandate_ids` refer to mandates within the same `client_id`.

## Principals (`principal.schema.json`)

| Field | Notes |
|-------|--------|
| `kind` | `human` \| `claude` \| `cursor` \| `external-agent` \| `internal-worker` |
| `bound_api_key_id` | Binds one API key id or stable OAuth grant id to this principal |
| `scopes` | See scope vocabulary below |
| `mandate_ids` | Ticket mandate roots this agent may operate under |
| `status` | `active` \| `suspended` \| `revoked` |

### Built-in legacy principal (runtime, T-0110)

When the feature is enabled, existing API keys map to a built-in **`legacy-full`** principal holding **all** scopes so nothing breaks until new least-privilege principals are created.

### Trust and external agents (T-0112)

`kind=external-agent` content is **untrusted**: reads return `untrusted_author` markers (documented here; golden tests in T-0112). Scopes for bots are narrow by default.

## Scope vocabulary (`scopes.schema.json`)

| Scope | Typical use |
|-------|-------------|
| `tickets:read` | List/get tickets in bound mandate subtree |
| `tickets:claim` | `ticket_claim` |
| `tickets:write:<function>` | Create/progress tickets for function `dev` \| `infra` \| … |
| `tickets:approve` | Human integrator/founder approvals (replaces key-id allowlists when enforce is on) |
| `notes:read` | Note get/list |
| `notes:write` | Note put (restricted by mandate/project in T-0112) |
| `github:read` | `github_*` MCP tools |
| `automation:trigger` | `trigger_automation` |
| `admin` | Admin token routes |
| `sessions:use` | Legacy OAuth scope; retained for existing connectors |

Every MCP tool must declare required scopes in one mapping table at runtime (T-0111); a test must fail if a tool lacks a mapping.

## Audit events (`agent-audit-event.schema.json`)

Append-only **`agent_audit`** rows record:

- `principal_id`, `surface` (`rest` \| `mcp`), `operation` (route template or tool name)
- `decision`: `allow` \| `deny` \| `would-deny`
- `reason_code` — stable code, **no** request/response bodies, note text, or secrets
- `at`

Shadow mode writes **`would-deny`** instead of blocking; enforce mode writes **`deny`** and returns 403.

## Rollout modes (behaviour summary)

```
off     → no evaluation; identical to pre-E-17
shadow  → evaluate + audit would-deny; callers still succeed
enforce → evaluate + audit deny; caller blocked when scope missing
```

OAuth MCP: replace the privileged placeholder key id `"oauth"` with a **stable per-grant** id so integrator mapping does not require allowlisting `"oauth"` (T-0110).

## Contracts

- `contracts/common.schema.json` — shared enums
- `contracts/scopes.schema.json` — scope vocabulary
- `contracts/principal.schema.json` — `agent_principal` record
- `contracts/agent-audit-event.schema.json` — audit row shape

Validate:

```bash
node --test packages/lane-agent-principals/contracts/validate-contracts.test.mjs
```

Golden fixture: `data/simulators/lane-agent-principals/sample-principals.json`

## Does not (this slice)

- No SQL / DDL (T-0108)
- No HTTP routes or MCP scope checks (T-0110–T-0112)
- No changes to `api_keys` format or existing keys

## Verification

```bash
pnpm --filter @orbita/agent-principals test
```
