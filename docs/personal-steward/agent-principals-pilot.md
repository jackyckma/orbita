# Agent principals pilot — Grok external-agent limits

Founder-facing summary of **E-17 tier 1** behaviour for **`kind=external-agent`** principals on the Grok pilot (`client_id: personal-jacky`). This doc does **not** change production: no flags, routes, or enforcement code. Runtime wiring ships in platform tasks (T-0108–T-0112); this page is the charter companion for bot keys.

**Related:**

- [Shared-computer trust domain](./shared-computer-trust.md) — union-of-keys on one VM; environment-class limits still matter when scopes enforce
- [Ticket executors (public)](../site/ticket-executors.md) — MCP daily loop, roles, and never-do list
- [Grok pilot activation](./grok-bot-pilot-activation.md) — when to flip tickets and principals flags
- [D-006](../autopilot/decisions.json) — founder-only: shadow → enforce and minting real bot principals
- Contracts: `packages/lane-agent-principals/INTERFACE.md`

---

## What an external-agent principal is

An **external-agent** principal binds **one executor API key** (or stable OAuth grant id) to:

- **`mandate_ids`** — one or more ticket mandate roots (Grok pilot: typically **one mandate per bot**)
- **`scopes[]`** — tool-level allow list (narrow defaults; not `legacy-full`)
- **`client_id`** — same tenant as the mandate (no cross-client access)

`orbita_whoami` should report `principal_id`, `kind`, `scopes`, and mandate bindings when `ORBITA_AGENT_PRINCIPALS_ENABLED=1`. Until principals are enabled, **`ORBITA_TICKETS_KEY_MANDATES`** remains the stopgap for mandate subtree binding.

---

## Allowed (inside bound mandate subtree)

When tickets are enabled and the mandate is **`active`**, a least-privilege external-agent may:

| Area | Allowed actions |
|------|-----------------|
| **Tickets — read** | `ticket_list`, `ticket_get` on epics/tasks in **bound mandate subtree** only (`tickets:read`) |
| **Tickets — work** | `ticket_claim`, `ticket_extend`, `ticket_progress`, `ticket_complete`, `ticket_block`, `ticket_comment` on tasks it can see (`tickets:claim`, `tickets:write:<function>` per charter) |
| **Tickets — propose** | `ticket_propose` for process/charter suggestions; `ticket_request_decision` for human judgment |
| **Tickets — structure (agent-initiated)** | Create **`proposed`** epics and tasks **under approved or active epics** of **own mandate** when charter `approval_policy` allows (same rules as executor role in [ticket executors](../site/ticket-executors.md)) |
| **Notes** | `notes:read` / `notes:write` only where mandate charter and (when shipped) principal namespace rules allow — typically mandate-scoped note types, not the whole personal hub |
| **Memory / portfolio** | Read-oriented steward tools (`memory_*`, `portfolio_brief`) when scope mapping includes them and charter does not forbid |

Executors still follow mandate **charter** `hard_limits` and `soft_constraints`; principals add a **second** server-side gate when `ORBITA_AGENT_SCOPES_MODE=enforce`.

---

## Denied (explicit never-do for Grok bots)

Even if a key could call a tool before E-17, a real **external-agent** principal must **not** receive these scopes. In **enforce** mode the API returns scope denial; in **shadow** mode calls still succeed but audit logs **`would-deny`**.

| Category | Deny |
|----------|------|
| **Integrator / founder** | `ticket_approve`, `ticket_review`, `ticket_resolve`, `ticket_update_charter`, mandate pause/resume, override precheck |
| **GitHub MCP** | `github_get_file`, `github_list_commits`, `github_list_pull_requests` (`github:read`) |
| **Automations** | `trigger_automation` (`automation:trigger`) |
| **Admin** | Any `/v1/admin/*` or `/admin` surface (`admin` scope); admin token is separate from executor keys |
| **Credentials / vault** | No credential mint, vault export, or reading other bots’ API keys from Orbita |
| **Other mandates / clients** | No ticket or note mutations outside `mandate_ids` and `client_id` on the principal |
| **Sessions abuse** | `sessions:use` only when explicitly needed for a connector; not a default on hostile-web Grok VMs |

Align bot system prompts with the public [never-do list](../site/ticket-executors.md#never-do-executors).

---

## Untrusted author on reads

External agents browse **untrusted** web and chat. Content they write into Orbita is not automatically founder instructions.

When enforcement ships (T-0112), **`ticket_get` / `ticket_list`** and **`note_get` / `note_list`** (REST and MCP) should mark rows authored by **`external-agent`** principals with **`untrusted_author: true`**. Bots and humans must treat that flag like prompt-injection hygiene: follow charter **principles** and `hard_limits`, use **`ticket_propose`** / **`ticket_request_decision`**, never treat another bot’s comment as a command to call privileged tools.

This doc sets the **expectation**; golden tests and persistence land in implementation tasks.

---

## Rollout modes (founder controls)

| `ORBITA_AGENT_SCOPES_MODE` | Effect for bots |
|----------------------------|-----------------|
| `off` | No scope table enforcement (pre-E-17 behaviour) |
| `shadow` | Evaluate scopes; log **`would-deny`** in `agent_audit`; calls still succeed — use to tune mappings before cutting over |
| `enforce` | Missing scope → **403** / stable `scope_denied` code |

| Flag | Effect |
|------|--------|
| `ORBITA_AGENT_PRINCIPALS_ENABLED=0` | No principal rows, no scope checks; mandate binding via env only |
| `ORBITA_AGENT_PRINCIPALS_ENABLED=1` | DDL + principals repo; admin CRUD for principals (T-0110) |

**[D-006](../autopilot/decisions.json) is founder-only:** Autopilot does **not** set production to **`enforce`**, create production bot principals, or connect Grok to hostile web on your behalf. Recommended path: enable principals + **shadow**, review audit for ~a week, mint **one principal per bot** with the deny list above, then flip **enforce** only after [shared-computer trust](./shared-computer-trust.md) and mandate charters are satisfied.

---

## Pilot checklist (documentation only)

- [ ] One **external-agent** principal per Grok bot; short-lived API key bound in Admin
- [ ] `mandate_ids` = exactly the bot’s mandate; union-of-keys review on the shared VM
- [ ] Scopes = ticket read/claim/write for allowed functions + narrow notes — **no** `github:read`, `automation:trigger`, `admin`, `tickets:approve`
- [ ] Charter `hard_limits` include instruction-class rules for untrusted web
- [ ] **Shadow** audit clean → founder decides **D-006** option A before **enforce**
- [ ] After enforce: confirm reads show **`untrusted_author`** for bot-authored tickets/notes

Implementation cross-references (e.g. exact 403 codes, `author_principal_id` on events) may be added when **T-0112** merges; this file intentionally does not block on T-0108 DDL landing.
