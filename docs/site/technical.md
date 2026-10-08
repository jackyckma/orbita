---
title: Technical reference
description: Auth, sessions, profiles, memory, tools, and API surface for integrators.
nav_order: 4
---

# Technical reference

## Mental model

| Concept | Description |
|---------|-------------|
| **Session** | One conversation thread; bound to an **agent profile** snapshot at creation |
| **Turn** | `POST /v1/sessions/{id}/messages` — one user input, internal tool loop, assistant output |
| **client_id** | Tenant scope for sessions, memory, credentials (from API key allow-list) |
| **Trajectory** | Append-only audit log of turns, tool calls, and system events |

Orbita is **API-first**: orchestrators (Cursor, custom agents, cron) call HTTP; there is no required human chat UI.

## Authentication

Every protected route:

```http
Authorization: Bearer orb_...
x-orbita-client-id: my-project
```

Admin routes use `ORBITA_ADMIN_TOKEN` instead of API keys.

## Agent profiles

Static bundles of system prompt, skills, and allowed tools. List:

```http
GET /v1/profiles
```

**Important:** profile snapshot is fixed when the session is created. After changing profiles or tools, create a **new session**.

Built-in profiles include `default`, `research`, and `marketing`.

## Memory

- **Session context**: messages + optional compression summary
- **Client memory**: key/value store with pgvector semantic retrieval (`PUT/GET /v1/memories/{key}`)
- **Tools**: `memory_put`, `memory_get` on supported profiles

## Tools & HTTP policy

Tools are registered per profile. HTTP tools respect:

- Deployment allow-list (`ORBITA_HTTP_ALLOWED_DOMAINS` or admin settings)
- Per-client credentials vault for outbound API calls

## Scheduler

Cron and webhook jobs can deliver payloads or run **`agent_message`** turns on bound sessions.

## Inbound email endpoint

Not for human command-by-email. Adapter-only:

```http
POST /v1/inbound/email
x-orbita-inbound-token: <shared secret>

{
  "from": "verify@service.com",
  "to": "orbita@get-orbita.com",
  "subject": "...",
  "text": "...",
  "message_id": "optional"
}
```

Requires `ORBITA_INBOUND_EMAIL_TOKEN` on the API host.

## OpenAPI

Machine-readable spec: `GET /v1/openapi.json` (public, no auth). The document covers **caller-facing** routes only; `/v1/admin/*` and `/v1/inbound/*` are intentionally omitted from the spec.

Compare with live health version: `GET /v1/health`

## MCP access log

Every `/v1/mcp` request writes one info line, `mcp request`: HTTP method and status, JSON-RPC method names, and for each response message whether it is a result or an error (error code and message, at most 300 characters). `tools/list` results include the tool count only. GET SSE streams log status and headers and do not read the body. The line never includes `Authorization`, tokens, params, tool arguments, or result bodies. `ORBITA_MCP_ACCESS_LOG` defaults on; set it to `0` to disable without a code deploy (`1` or unset keeps it on; any other value fails startup).

## Tickets lane (optional, `ORBITA_TICKETS_ENABLED`)

The ticket system (mandate → epic → task hierarchy, leases, idempotency) ships **off by default**. When `ORBITA_TICKETS_ENABLED` is unset or not `1`, the API applies only `init.sql` — no `tickets` tables and no `/v1/tickets` routes (later waves).

When the flag is `1` at **migration time**, startup also runs `apps/orbita-api/migrations/optional-tickets.sql` (mirrored from `packages/lane-tickets/drizzle/`). DDL is additive (`IF NOT EXISTS` only). Production enable is a founder decision ([D-005](https://github.com/jackyckma/orbita/blob/main/docs/autopilot/decisions.json)); verify with `bash scripts/e2e-tier-a.sh` (GitHub CI) before flipping Zeabur env.

**Postgres repository (`PgTicketRepository`):** writes for a `client_id` are serialised with `pg_advisory_xact_lock(hashtextextended(client_id, 0))` inside a short transaction (transaction-scoped only — never session-level advisory locks). The implementation loads the tenant into memory, runs the same transition engine as the fake repository, and flushes only mutated rows. This whole-tenant pattern is intended for **one tenant per server** at modest scale (hundreds of tickets per tenant). A per-row SQL repository is the upgrade path if tenants grow large or hot.

**Proposals (`ticket_propose` / `ticket_resolve`):** Bot suggestions escalate as `decision` tickets with `decision_class=proposal` (not a new role or task type). Charter **`proposal_policy`** and **`max_open_proposals`** gate who may resolve which `proposal_type` and how many open proposals a mandate may hold. Proposal text is returned to founder/integrator readers with an **`untrusted_author`** marker; executors only see proposals in their mandate subtree.

**Roles (REST / MCP):** Orbita derives `founder`, `integrator`, or `executor` from the authenticated key (`deriveTicketActor`). `ORBITA_TICKETS_FOUNDER_KEY_IDS` and `ORBITA_TICKETS_INTEGRATOR_KEY_IDS` are comma-separated API key id lists; `ORBITA_TICKETS_APPROVER_KEY_IDS` is a deprecated alias of the founder list when founder ids are unset. All other keys are **executors**; bind them to mandates with `ORBITA_TICKETS_KEY_MANDATES` (JSON map `api_key_id` → mandate uuid array). Executors cannot create or modify mandates or charters. Epic `ticket_approve` runs structural `precheckEpic`; integrators require `precheck.ok`, founders may pass `override_precheck`. Invalid JSON for key mandates fails API startup when `ORBITA_TICKETS_ENABLED=1`. Request bodies never include `actor`.

## Further reading

- [product-architecture.md](https://github.com/jackyckma/orbita/blob/main/docs/product-architecture.md)
- [ORBITA_DESIGN.md](https://github.com/jackyckma/orbita/blob/main/usr/ORBITA_DESIGN.md)
- [api-as-product.md](https://github.com/jackyckma/orbita/blob/main/docs/api-as-product.md)
