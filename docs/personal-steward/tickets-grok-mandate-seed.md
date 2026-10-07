# Grok pilot — mandate seed script

`scripts/tickets-seed-grok-mandates.sh` creates **two draft mandates** on the personal hub via `POST /v1/tickets`:

| Project | Title | Function |
|---------|-------|----------|
| `grok-market-research` | Market research mandate | `research` |
| `grok-bizdev` | Business development mandate | `sales` |

Charters mirror the founder spec in Orbita note `24f91ab7-26f9-44af-934c-bf46c71af918` (hard_limits with `server` / `environment` / `instruction`, soft_constraints, guardrails, exception_types, and the standing untrusted-input rule in `principles`).

## When to run

- **After** production (or staging) has `ORBITA_TICKETS_ENABLED=1` and tickets DDL applied — see [D-005](../autopilot/decisions.json) and the activation checklist in `grok-bot-pilot-activation.md` (T-0104).
- **Before** binding bot API keys and running the bot-loop smoke (T-0103).
- Safe to re-run: idempotent by `project` + `title` (and stable `idempotency_key` on first create).

The Maker/Checker loop **does not** run this against production; founders run it locally with hub credentials.

## Required environment

Loaded from repo `.env` or `~/.orbita-personal.env` (same as `scripts/portfolio-git-collect-setup-harness.sh`):

| Variable | Purpose |
|----------|---------|
| `ORBITA_API_BASE` | API origin (default `https://api.get-orbita.com`) |
| `ORBITA_CLIENT_ID` or `ORBITA_HUB_CLIENT_ID` | Hub tenant (e.g. `personal-jacky`) |
| `ORBITA_API_KEY` / `ORBITA_PERSONAL_API_KEY` / `PERSONAL_ORBITA_API_KEY` | Founder or integrator key (never logged) |

Target API must have **`ORBITA_TICKETS_ENABLED=1`**. If `GET /v1/tickets` returns 404, tickets are not mounted — flip the flag first.

Optional: `DRY_RUN=1` prints charter JSON without calling the API.

```bash
./scripts/tickets-seed-grok-mandates.sh
```

## Founder-only: activate mandates

Mandates are created in **`draft`**. Only a **founder** key may move `draft` → `active` (`ticket_approve` / mandate activation). Integrators may create draft mandates but not activate them.

After seeding:

1. Review each mandate with `ticket_get` (charter, hard_limits, soft_constraints).
2. Activate with a founder-authenticated transition (see `packages/lane-tickets/INTERFACE.md` mandate lifecycle).
3. Do **not** create epics or tasks in this step unless you are exercising the pilot manually.

## Bind bot keys later (until E-17)

Per-agent principals land in **E-17**. Until then:

1. Mint **one API key per bot** (short expiry, least privilege).
2. Set server env **`ORBITA_TICKETS_KEY_MANDATES`** so each key maps to exactly one mandate id (JSON map: key id → mandate uuid list).
3. Replace charter `assigned_principals` placeholders (`principal-grok-*-pending-e17`) when principals exist.
4. Verify with `orbita_whoami` from the bot key before giving the bot untrusted web access.

See D-006 in `docs/autopilot/decisions.json` for `ORBITA_AGENT_SCOPES_MODE` (shadow vs enforce).

## What this script does not do

- Does not set Zeabur env or flip `ORBITA_TICKETS_ENABLED`.
- Does not create epics, tasks, or decisions.
- Does not store secrets in git.
