---
status: planned
maintained_by: ai-agents
created: 2026-10-02
purpose: First-class tickets with mandate hierarchy and server-enforced state machines (E-16).
related: docs/autopilot/roadmap.json (E-16)
---

# Lane — Tickets (E-16)

## Summary

Tickets are **not** notes: atomic claim, versioning, append-only events, deterministic list queries, and mandate → epic → task hierarchy. This lane owns `packages/lane-tickets/` only. Runtime implementation is behind `ORBITA_TICKETS_ENABLED` (default off).

## Hierarchy and `parent_id`

| kind | parent_id | Notes |
|------|-----------|--------|
| `mandate` | `null` | Standing responsibility; carries `charter` |
| `epic` | mandate uuid | Bounded goal; integrator approves (or charter auto-approve policy) |
| `task` | epic uuid | Executor-created work within guardrails |
| `decision` | mandate, epic, or task uuid | Human decision requests |

Executors may create children only under parents in their mandate subtree (enforced at runtime).

## Mandate charter (`charter.schema.json`)

- **purpose**, **principles**, **guardrails** (allowed/forbidden risk tiers), **cadence**, **reporting**, **success_measures**, **review_date**, **assigned_principals**
- **`hard_limits`**: never adjustable by the executor. Each entry has **`enforcement`**: `server` (Orbita rejects), `environment` (capability absent), or `instruction` (policy text; checked after the fact). Default for ambiguous limits is **hard**.
- **`approval_policy`**: `epics` (`integrator` default | `auto_within_tier`) and `tasks` (`auto` default | `integrator`). Works with **`guardrails.max_auto_risk_tier`** for agent auto-approve on create (see `initialStatusOnCreate` in the pure engine).
- **`soft_constraints`**: **warn_threshold** only records **`soft_breach`**; **block_threshold** denies transitions with **`SOFT_BLOCK_THRESHOLD_EXCEEDED`** when observed ≥ threshold (constraints without `block_threshold` never block).

Charter changes are audited; changing **hard_limits** or loosening hard → soft requires a human-approved principal.

## State machines

### Mandate

```
draft → active → paused → retired
```

| From | Verb (conceptual) | To |
|------|-------------------|-----|
| draft | activate | active |
| active | pause | paused |
| paused | resume | active |
| active / paused | retire | retired |

### Epic

```
proposed → approved → active → done
                    ↘ cancelled (from proposed or approved)
```

| From | Verb | To | Actor |
|------|------|-----|-------|
| proposed | ticket_approve | approved | human (non-auto epic create paths) |
| approved | ticket_progress | active | agent |
| active | ticket_complete | done | agent |
| proposed / approved / active | ticket_cancel | cancelled | human (agents may not cancel approved/active epics) |

### Task and decision

```
proposed → approved → claimed → in_progress → in_review → done
          ↘ cancelled (proposed cancel: human)
Side: waiting_human, blocked (ticket_block), cancelled
```

| From | Verb | To | Notes |
|------|------|-----|-------|
| proposed | ticket_approve | approved | human (when create did not auto-approve) |
| approved | ticket_claim | claimed | atomic lease |
| claimed | ticket_progress | in_progress | lease holder |
| in_progress | ticket_progress | in_review | |
| in_review | ticket_complete | done | requires result_refs |
| * | ticket_block | blocked | sets blocked_on |
| approved+ | ticket_extend | (same) | renew lease |
| proposed | ticket_cancel | cancelled | human only |

Expired lease: runtime returns ticket to **approved** with an event (documented for T-0084+).

## Verbs (API surface)

All verbs share JSON bodies between **REST** (`/v1/tickets…`, separate from notes) and **MCP** tools named `ticket_*`. Schemas live under `contracts/verbs/*.schema.json`.

| Verb | Purpose |
|------|---------|
| `ticket_create` | Create mandate / epic / task / decision |
| `ticket_list` | Filtered cursor list |
| `ticket_get` | Single ticket (+ optional events) |
| `ticket_approve` | Human approval transitions |
| `ticket_claim` | Atomic claim + lease |
| `ticket_extend` | Lease renewal |
| `ticket_progress` | Status / owner / next_action updates |
| `ticket_complete` | Done with result links |
| `ticket_block` | Block with reason |
| `ticket_request_decision` | Spawn decision ticket |
| `ticket_comment` | Append-only comment event |
| `ticket_cancel` | Cancel (human rules on proposed) |

**Optimistic concurrency:** `expected_version` on mutating verbs. **Idempotency:** `(client_id, verb, idempotency_key)` unique at runtime.

## Git-sourced tickets (read-only)

Tickets with `source=git` reject **all** transition verbs with HTTP **409** and error code **`GIT_READ_ONLY`**, including `git_ref` pointer — see `errors.schema.json`. Native tickets only in early slices.

## Contracts

- `contracts/common.schema.json` — shared enums and envelopes
- `contracts/charter.schema.json` — mandate charter including **hard_limits** and **soft_constraints**
- `contracts/ticket.schema.json` — ticket record + parent rules
- `contracts/ticket-event.schema.json` — append-only events
- `contracts/soft-breach-event.schema.json` — **soft_breach** payload
- `contracts/errors.schema.json` — stable error shapes
- `contracts/verbs/*` — per-verb request/response

Validate: `node --test packages/lane-tickets/contracts/validate-contracts.test.mjs`

## Pure engine (T-0084 / T-0089)

- **`initialStatusOnCreate`**: mandate create is human-only → `draft`; epic/task/decision initial status from `approval_policy`, actor, parent, and `risk_tier`.
- **`mandate_status`** on transitions: when ancestor mandate is `draft`, `paused`, or `retired`, **agent** mutating verbs deny with **`MANDATE_NOT_ACTIVE`** (except `ticket_comment`, `ticket_block`, `ticket_request_decision`). Missing `mandate_status` on agent writes is also denied (fail-closed).
- **Ownership**: agent actors carry `mandate_ids`; **`OUTSIDE_MANDATE`** when not in the ticket’s mandate.
- **Fail-closed counters**: server **`hard_limits`** without supplied counters → **`HARD_LIMIT_COUNTERS_MISSING`**.

## Pause gate — what pausing or retiring a mandate does and does not do

Pausing or retiring a mandate makes the ticket API **reject that mandate’s agent writes** (`ticket_create`, `ticket_claim`, `ticket_progress`, `ticket_complete`, `ticket_cancel`, `ticket_extend`, `ticket_approve`) with **`MANDATE_NOT_ACTIVE`**, and agents that read the mandate see `status=paused` or `retired`. It does **not** stop an external agent’s own activity outside Orbita (Grok, Cursor Cloud, etc.) — those agents are governed by their own prompts and platforms.

Effective stops are: (1) the agent’s instructions to check mandate status before acting, (2) revoking or suspending the principal’s API key (E-17/E-19), (3) switching the agent off in its host platform. Only **Orbita-internal** agents (harness runs) can be halted by Orbita itself (`harnesses.enabled=false`).

## Repository (T-0085)

- `TicketRepository` + `FakeTicketRepository` for tests; Postgres SQL builders in `repository.pg.ts`.
- Tenant isolation: every query scoped by `client_id`.
- Append-only `ticket_events` with monotonic `seq`; `soft_breach` payloads recorded as events.
- `getMandateSubtreeHealth` — per-mandate status counts and last activity timestamp.

## Does not (this slice)

- No HTTP / MCP runtime (T-0086+)
- No notes API / MCP note_* changes
- No DDL or routes until later tasks

## Verification

```bash
pnpm --filter @orbita/tickets test
```

Golden fixture: `data/simulators/lane-tickets/mandate-epic-task-chain.json`
