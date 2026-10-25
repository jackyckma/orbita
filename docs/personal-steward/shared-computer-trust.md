# Shared-computer trust domain (Grok executors)

Founder-facing model for running **multiple Grok bots** on **one virtual computer** (shared VM, chat group, or co-hosted agent runtime). This doc is the durable reference; the activation checklist in [grok-bot-pilot-activation.md](./grok-bot-pilot-activation.md) links here for D-006.

**Related:**

- [Agent principals pilot](./agent-principals-pilot.md) — per-bot principals, scopes, and enforce mode (ships with E-17 tier 1)
- [Ticket executors (public)](../site/ticket-executors.md) — MCP daily loop, roles, and never-do list

---

## What “shared computer” means

When several external executors run on the **same host**, they typically share:

- **Filesystem** — home directory, downloads, temp files, clipboard-adjacent paths
- **Browser sessions** — cookies, logged-in tabs, local storage
- **Process environment** — env vars, secret files mounted for “the machine,” not per bot
- **Network egress** — one IP reputation and one outbound identity

Treat that host as a **single trust domain**: any bot on the machine may be able to read another bot’s Orbita API key, mandate notes, or browser state. Design permissions as if the **union of all keys on that computer** were one combined principal.

---

## Union-of-keys rule

| Question | Rule |
|----------|------|
| “Is this key safe alone?” | Not enough — ask whether **key A + key B + …** on the same disk is acceptable. |
| Ticket mandates | Each bot should bind to **one mandate**; combined mandates must not cover spending, admin, or cross-project hub control you would not grant to one actor. |
| MCP tools | If any bot key can call `github_*`, `trigger_automation`, or broad `notes:write`, **every** bot on that host effectively has that power. |
| Audit | Still mint **one API key per bot** (short expiry) so suspend/revoke is per-bot even though the host is shared. |

Keep **spending**, **founder identity** (founder ticket role, admin token), **vault credentials**, and **personal hub master keys** off this computer. Use ticket-bound executor keys with least privilege; run integrator/founder work from a separate machine.

---

## Threat model (short)

1. **Cross-bot read** — Bot A writes a secret to disk; Bot B reads it.
2. **Session hijack** — Shared browser profile lets one bot act as another’s logged-in session.
3. **Prompt injection via shared context** — Untrusted web/email text is not “from you”; see [ticket executors — never do](../site/ticket-executors.md#never-do-executors).
4. **Union escalation** — Two “small” keys together equal one powerful key.

Server-side scopes ([agent principals pilot](./agent-principals-pilot.md)) reduce blast radius once `ORBITA_AGENT_SCOPES_MODE=enforce`, but they **do not** split a shared filesystem or browser. Environment-class `hard_limits` in mandate charters still matter.

---

## Founder checklist

Before connecting Grok bots to untrusted web on a shared host:

- [ ] **One principal per bot** — Dedicated API key + (when E-17 is on) dedicated `external-agent` principal; label and purpose in Admin.
- [ ] **Union review** — List every key on this computer; confirm combined ticket + MCP power is acceptable.
- [ ] **No secrets on shared disk** — No `~/.orbita-personal.env`, admin tokens, vault exports, or long-lived founder keys in repo checkouts on the Grok VM.
- [ ] **Suspend before revoke** — On compromise or misbehaviour: **Suspend** the key/principal first (immediate deny), then investigate, then **revoke** if needed.
- [ ] **Mandates active** — `ORBITA_TICKETS_KEY_MANDATES` maps each executor key id to exactly one mandate uuid; re-read charter `hard_limits` enforcement class (`server` | `environment` | `instruction`).
- [ ] **Enforce when ready** — Do not rely on shadow mode for hostile web; flip to enforce per [D-006](../autopilot/decisions.json) only after tier 1 principals ship and audit looks clean.
- [ ] **Standing rules in two places** — Charter principles + Grok system prompt; same never-do list as [ticket executors](../site/ticket-executors.md#never-do-executors).

---

## When this doc is “done” vs activation

Writing or reading this doc does **not** change production. Flipping `ORBITA_TICKETS_ENABLED`, binding mandates, and setting `ORBITA_AGENT_SCOPES_MODE` remain founder actions under [grok-bot-pilot-activation.md](./grok-bot-pilot-activation.md) and [D-005 / D-006](../autopilot/decisions.json).
