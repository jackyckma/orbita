---
status: draft
maintained_by: jacky + ai-agents
created: 2026-06-24
purpose: Outbound email identity per Orbita deployment — for service signups and sending mail, not for receiving commands.
related: docs/api-as-product.md, docs/use-cases/marketing-agent.md, packages/lane-credentials
---

# Instance email (outbound identity)

Orbita callers use **HTTP API** for commands. A deployment-level **from-address** is for **outbound** identity when the agent (via tools) registers for services or sends mail — not an inbox for human or email-based control.

## Model

| Concept | Role |
|---------|------|
| **`ORBITA_INSTANCE_FROM_EMAIL`** | Public-facing sender address for this deployment (e.g. `orbita@get-orbita.com`) |
| **Vault `resend` / `sendgrid`** | API key for outbound send (`http_post` to provider) |
| **Cloudflare Email Routing** | Optional **receive** for humans (`waitlist@` → Gmail); separate from agent outbound |

Each running instance (self-host or Zeabur) can set its own from-address and mail provider credential. Agents never need an inbox to accept instructions — API keys + sessions remain the control plane.

## Typical flows

1. **Service registration** — Agent fills a signup form via `http_post` with contact email = `ORBITA_INSTANCE_FROM_EMAIL`; verification link goes to that mailbox (forward to human) or a dedicated ops inbox.
2. **Transactional send** — Agent calls Resend/SendGrid API with `credential_ref` to send invite, waitlist reply, or newsletter **after approval**.
3. **Waitlist ops** — Today: entries in Postgres + Admin UI; optional future: approved → auto-send invite email via outbound API.

## Setup (hosted)

```bash
# Zeabur / .env
ORBITA_INSTANCE_FROM_EMAIL=orbita@get-orbita.com

# Admin vault (per client_id if needed)
POST /v1/admin/credentials
{ "client_id": "...", "name": "resend", "secret": "re_...", "scope": ["emails:send"] }

# HTTP allow-list
PUT /v1/admin/settings/http-domains
{ "domains": ["api.resend.com"] }
```

Configure Cloudflare Email Routing so `orbita@get-orbita.com` can **receive** verification messages if providers require inbox confirmation.

## Inbound adapter (w16)

For **parsed inbound mail → agent turn** (registration replies, not command-by-email):

| Piece | Role |
|-------|------|
| **`POST /v1/inbound/email`** | API endpoint; auth via `x-orbita-inbound-token` |
| **`apps/orbita-email-worker`** | Cloudflare Worker; Email Routing → Orbita API |
| **`ORBITA_INBOUND_*` env** | Token, client_id, agent profile on API host |

Setup: `docs/cloudflare-email-worker.md`

Production helpers:

```bash
export ORBITA_ADMIN_TOKEN=...   # prod admin from Zeabur
export RESEND_API_KEY=re_...    # optional — vault credential
./scripts/setup-instance-email-prod.sh
```.

## Non-goals

- Email as an agent **command channel** (use API / scheduler / webhooks instead).
- Built-in SMTP server inside Orbita API.
- Replacing Admin for API key issuance.

## Next steps (when needed)

- Optional `send_email` tool wrapper around Resend (validate from-address, template helpers).
- Waitlist approve → send invite template via outbound mail.
- Document DNS (SPF/DKIM) for the instance from-domain.
