---
title: Setup
description: Install Orbita locally or use the hosted API — database, env, and admin.
nav_order: 1
---

# Setup

## Hosted API (fastest)

Production API: **https://api.get-orbita.com**

1. Join the [waitlist](https://get-orbita.com/waitlist.html) for hosted access (invite-only during early access).
2. Or **self-host** below and point your orchestrator at your own base URL.

## Self-host prerequisites

- **Node.js** ≥ 20, **pnpm** ≥ 9
- **Docker** (for local Postgres + optional sandbox)
- LLM keys: **MiniMax** (primary) and/or **Anthropic** (fallback)

## Clone and install

```bash
git clone https://github.com/jackyckma/orbita.git
cd orbita
pnpm install
docker compose up -d postgres
cp .env.example .env
# Edit DATABASE_URL, ORBITA_ADMIN_TOKEN, ORBITA_SECRETS_KEY, LLM keys
pnpm db:migrate
pnpm dev
```

Verify: `curl http://127.0.0.1:3000/v1/health`

## Environment variables (essential)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string |
| `ORBITA_ADMIN_TOKEN` | Protects `/v1/admin/*` and Admin UI |
| `ORBITA_SECRETS_KEY` | Encrypts credential vault (min 16 chars) |
| `MINIMAX_API_KEY` / `ANTHROPIC_API_KEY` | LLM providers |
| `ORBITA_HTTP_ALLOWED_DOMAINS` | Optional HTTPS allow-list for `http_get` / `http_post` |

Optional:

- `ORBITA_INSTANCE_FROM_EMAIL` — outbound sender for service signups (see [instance email](https://github.com/jackyckma/orbita/blob/main/docs/instance-email.md))
- `ORBITA_INBOUND_EMAIL_TOKEN` — shared secret for Cloudflare Email Worker → `POST /v1/inbound/email`

Full list: `.env.example` in the repo.

## Admin console

Open `http://127.0.0.1:3000/admin` (or production `/admin`).

Use it to:

- Create **API keys** with `allowed_client_ids`
- Store **credentials** (Resend, third-party APIs) — never inline secrets in prompts
- Configure **HTTP domain policy** for tools

Deep guide: [docs/self-host.md](https://github.com/jackyckma/orbita/blob/main/docs/self-host.md)

## Deployment split

| Component | Where |
|-----------|--------|
| `apps/orbita-api` | Zeabur (or your container host) |
| `apps/orbita-web` | Cloudflare Pages (`get-orbita.com`) |
| `apps/orbita-email-worker` | Cloudflare Worker (inbound mail adapter) |

See [docs/website-cloudflare.md](https://github.com/jackyckma/orbita/blob/main/docs/website-cloudflare.md) and [docs/cloudflare-email-worker.md](https://github.com/jackyckma/orbita/blob/main/docs/cloudflare-email-worker.md).
