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
| **Vault `smtp2go`** | SMTP2GO API key — agent sends via `http_post` |
| **Cloudflare Email Routing** | **Receive** on your domain (`orbita@` → Worker → Orbita API) |
| **Other SMTP APIs** | Alternatives (Resend, SendGrid) — same `http_post` + vault pattern |

Orbita does **not** embed a mail provider SDK. Any outbound provider is just an HTTPS API + Bearer token in the credential vault.

## SMTP2GO — outbound provider for hosted Orbita

Zeabur Email (ZSend) is gone (Zeabur shut down Dec 2026); outbound mail now uses [SMTP2GO](https://www.smtp2go.com).

| Step | Action |
|------|--------|
| Domain | Add `get-orbita.com` as a sender domain in SMTP2GO; add its DKIM + return-path CNAMEs in DNS (grey cloud) and verify |
| API key | Sending → API Keys → Add: description `orbita`, permission `/email/send` only, tracking/archive off |
| Send API | `POST https://api.smtp2go.com/v3/email/send` |

Example body:

```json
{
  "sender": "orbita@get-orbita.com",
  "to": ["recipient@example.com"],
  "subject": "Subject",
  "html_body": "<p>...</p>",
  "text_body": "..."
}
```

Agent call pattern: `http_post` with `credential_ref: smtp2go` (vault stores the SMTP2GO API key; SMTP2GO accepts it as `Authorization: Bearer`).

## Typical flows

1. **Service registration** — Agent uses `ORBITA_INSTANCE_FROM_EMAIL` on signup forms; verification mail arrives at `orbita@` (Cloudflare → Worker → agent turn).
2. **Transactional send** — Agent `http_post` to SMTP2GO after approval (invite, reply, newsletter draft).
3. **Invite ops** — Admin approve → optional invite email via SMTP2GO.

## Setup (hosted)

Admin UI (`/admin`):

- **Add credential**: Client ID `orbita-instance`, Name `smtp2go`, Secret = the SMTP2GO API key.
- **HTTP allowed domains**: add `api.smtp2go.com`, Save.
- Env: `ORBITA_INSTANCE_FROM_EMAIL=orbita@get-orbita.com`.

Or via Admin API:

```
POST /v1/admin/credentials
{ "client_id": "orbita-instance", "name": "smtp2go", "secret": "<smtp2go-key>", "scope": ["emails:send"] }

PUT /v1/admin/settings/http-domains
{ "domains": ["api.smtp2go.com", ...] }
```

Note: `scripts/setup-instance-email-prod.sh` still describes the old Zeabur ZSend setup and is outdated.

## Inbound adapter (w16)

For **parsed inbound mail → agent turn** (registration replies, not command-by-email):

| Piece | Role |
|-------|------|
| **`POST /v1/inbound/email`** | API endpoint; auth via `x-orbita-inbound-token` |
| **`apps/orbita-email-worker`** | Cloudflare Worker; Email Routing → Orbita API |
| **`ORBITA_INBOUND_*` env** | Token, client_id, agent profile on API host |

Setup: `docs/cloudflare-email-worker.md`

## Non-goals

- Email as an agent **command channel** (use API / scheduler / webhooks instead).
- Built-in SMTP server inside Orbita API.
- Replacing Admin for API key issuance.

## Next steps (when needed)

- Optional `send_email` tool wrapper (validate from-address, templates).
- Admin invite approve → send invite via SMTP2GO.
- SMTP2GO webhooks for bounce/complaint handling.
