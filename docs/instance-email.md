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
| **`ORBITA_INSTANCE_FROM_EMAIL`** | Public-facing sender address (e.g. `orbita@get-orbita.com`) |
| **Vault `zsend`** | Zeabur Email (ZSend) API key — agent sends via `http_post` |
| **Cloudflare Email Routing** | **Receive** on your domain (`orbita@` → Worker → Orbita API) |
| **Third-party SMTP APIs** | Optional alternatives (Resend, SendGrid) — same `http_post` + vault pattern |

Orbita does **not** embed a mail provider SDK. Any outbound provider is just an HTTPS API + Bearer token in the credential vault.

## Zeabur Email (ZSend) — recommended for hosted Orbita

Same stack you may already use on other Zeabur projects.

| Step | Action |
|------|--------|
| Domain | `npx zeabur@latest email domains add --domain get-orbita.com --region ap-northeast-1` |
| DNS | Configure records from `email domains get` |
| API key | `npx zeabur@latest email keys create --name orbita --permission send_only` |
| Send API | `POST https://api.zeabur.com/api/v1/zsend/emails` |

Example body:

```json
{
  "from": "orbita@get-orbita.com",
  "to": ["recipient@example.com"],
  "subject": "Subject",
  "html": "<p>...</p>",
  "text": "..."
}
```

Agent call pattern: `http_post` with `credential_ref: zsend` (vault stores the ZSend API key as `Authorization: Bearer`).

## Typical flows

1. **Service registration** — Agent uses `ORBITA_INSTANCE_FROM_EMAIL` on signup forms; verification mail arrives at `orbita@` (Cloudflare → Worker → agent turn).
2. **Transactional send** — Agent `http_post` to ZSend after approval (invite, reply, newsletter draft).
3. **Waitlist ops** — Postgres + Admin today; optional: approve → ZSend invite email.

## Setup (hosted)

```bash
# Zeabur / .env
ORBITA_INSTANCE_FROM_EMAIL=orbita@get-orbita.com
ZEABUR_ZSEND_API_KEY=...   # from: npx zeabur@latest email keys create ...

# Or via Admin API
POST /v1/admin/credentials
{ "client_id": "orbita-instance", "name": "zsend", "secret": "<zsend-key>", "scope": ["emails:send"] }

PUT /v1/admin/settings/http-domains
{ "domains": ["api.zeabur.com", ...] }
```

One-shot script:

```bash
export ORBITA_ADMIN_TOKEN=...   # prod admin from Zeabur
export ZEABUR_ZSEND_API_KEY=...
./scripts/setup-instance-email-prod.sh
```

## Inbound adapter (w16)

For **parsed inbound mail → agent turn** (registration replies, not command-by-email):

| Piece | Role |
|-------|------|
| **`POST /v1/inbound/email`** | API endpoint; auth via `x-orbita-inbound-token` |
| **`apps/orbita-email-worker`** | Cloudflare Worker; Email Routing → Orbita API |
| **`ORBITA_INBOUND_*` env** | Token, client_id, agent profile on API host |

Setup: `docs/cloudflare-email-worker.md`

## What is Resend? (optional alternative)

[Resend](https://resend.com) is a **standalone** transactional email SaaS (`api.resend.com`). We mentioned it early as a common choice for agent `http_post`, but it is **not required**. If you already use Zeabur ZSend elsewhere, use `zsend` in the vault and allow `api.zeabur.com` — no Resend account needed.

## Non-goals

- Email as an agent **command channel** (use API / scheduler / webhooks instead).
- Built-in SMTP server inside Orbita API.
- Replacing Admin for API key issuance.

## Next steps (when needed)

- Optional `send_email` tool wrapper (validate from-address, templates).
- Waitlist approve → send invite via ZSend.
- ZSend webhooks for bounce/complaint handling.
