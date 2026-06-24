# Session handoff

**Last updated:** 2026-06-21 (end of day — resume tomorrow)

## Metadata

| Item | Value |
|------|--------|
| Branch | `main` |
| Latest commit | `27be07f` — Prefer Zeabur ZSend over Resend for outbound instance email |
| Push | ✅ on `origin/main` |
| Prod API | https://api.get-orbita.com — **`0.0.1-w18`** (health checked) |
| Marketing site | https://get-orbita.com — docs at `/docs/` |

## Active task

**Instance email closed loop** — receive registration/verification mail → agent processes → outbound reply.

**Done means:** ZSend credential in vault, `api.zeabur.com` on HTTP allow-list, real mail to `orbita@get-orbita.com` triggers Worker → agent turn, agent can `http_post` to ZSend to reply (smoke-tested or documented).

**Not in scope this thread:** Multi-user accounts (W15–W16 roadmap), X API publish (MA3 deferred by user).

## Current status

| Area | Status |
|------|--------|
| Waitlist API + Admin | ✅ `POST /v1/waitlist`, prod CORS |
| Scheduler `agent_message` | ✅ weekly marketing job pattern |
| Memory tools + `marketing` profile | ✅ |
| Public docs site | ✅ `docs/site/` → `pnpm build:docs` / deploy-web |
| Inbound API `POST /v1/inbound/email` | ✅ smoke OK (~27s LLM turn) |
| Cloudflare Email Worker | ✅ deployed `orbita-email-worker` + secret synced |
| Email Routing `orbita@` → Worker | ✅ rule via `scripts/cloudflare-email-routing-orbita.sh` |
| Outbound via **Zeabur ZSend** | ⏸ **user preference** — vault + allow-list not configured yet |
| Resend | ❌ not needed — docs/scripts switched to ZSend (`27be07f`) |

## Verified in

| Environment | Level | Notes |
|-------------|-------|--------|
| Local | build + unit/e2e tier A | `pnpm build`, `pnpm test` green before w16 push |
| Production | health + inbound API | `GET /v1/health` → w18; `POST /v1/inbound/email` → 200 + session_id |
| Production | Worker deploy | `wrangler deploy` with `CLOUDFLARE_ACCOUNT_ID` |
| Production | ZSend outbound | **not verified** — no `ZEABUR_ZSEND_API_KEY` in env yet |
| Production | real mail → Worker | **not verified** — send to `orbita@get-orbita.com` manually tomorrow |

## Top priority next (pick up here)

1. **ZSend setup** — create/list key: `npx zeabur@latest email keys create --name orbita --permission send_only -i=false`
2. **Run** `./scripts/setup-instance-email-prod.sh` with prod `ORBITA_ADMIN_TOKEN` + `ZEABUR_ZSEND_API_KEY` (merges `api.zeabur.com` into HTTP allow-list, vault credential `zsend` for `orbita-instance`).
3. **Domain** — if sending from `orbita@get-orbita.com`: `npx zeabur@latest email domains add --domain get-orbita.com` + DNS verify (see `zeabur-email` skill).
4. **E2E smoke** — email to `orbita@get-orbita.com` → check trajectory; optional agent reply via ZSend.

## What was already tried

| Attempt | Result |
|---------|--------|
| Resend as default outbound | User prefers **Zeabur ZSend** — docs/scripts updated, no Resend account needed |
| `wrangler deploy` without `CLOUDFLARE_ACCOUNT_ID` | Failed `/memberships` auth — **fix:** export account id from CF API in `deploy-email-worker.sh` |
| Zeabur CLI parse admin token from `variable list` | Fragile (ANSI / wrong line) — use Dashboard token or explicit export |
| HTTP allow-list PUT with only `api.resend.com` | **Overwrites** list — setup script now **merges** existing domains |

## How to run / verify

```bash
# Local
docker compose up -d postgres && pnpm db:migrate && pnpm dev

# Docs site
./scripts/build-web-docs.sh
./scripts/deploy-web.sh          # needs CLOUDFLARE_API_TOKEN in .env

# Email Worker
./scripts/cloudflare-email-routing-orbita.sh
export ORBITA_INBOUND_EMAIL_TOKEN=...   # same as Zeabur ORBITA_INBOUND_* (no secrets in this file)
./scripts/deploy-email-worker.sh

# Outbound (ZSend) — tomorrow
export ORBITA_ADMIN_TOKEN=...           # prod admin from Zeabur Dashboard
export ZEABUR_ZSEND_API_KEY=...
./scripts/setup-instance-email-prod.sh

# Inbound API smoke (no real mail)
export ORBITA_INBOUND_EMAIL_TOKEN=...
./scripts/smoke-inbound-email.sh

# Prod health
curl -sS https://api.get-orbita.com/v1/health
```

**Zeabur API service ID:** `6a37d3a09f5fe35a4aa63552`  
**Zeabur project ID:** `6a37d39a6d107f2b4271712f`

## Key file paths

| Symptom / topic | Path |
|-----------------|------|
| Inbound HTTP handler | `apps/orbita-api/src/inbound-email.ts` |
| Cloudflare mail adapter | `apps/orbita-email-worker/src/index.ts` |
| ZSend / instance email design | `docs/instance-email.md` |
| Worker + routing ops | `docs/cloudflare-email-worker.md` |
| Prod email setup script | `scripts/setup-instance-email-prod.sh` |
| Public docs source | `docs/site/*.md` → `scripts/build-web-docs.sh` |
| Doc maintenance strategy | `docs/DOCUMENTATION.md` |
| Marketing dogfooding | `docs/marketing-agent-plan.md`, gitignored `marketing-agent/` |

## Architecture reminder (email)

```
Receive:  mail → orbita@get-orbita.com
          → Cloudflare Email Routing
          → orbita-email-worker (MIME parse)
          → POST /v1/inbound/email
          → session turn (default profile: marketing, client: orbita-instance)

Send:     agent http_post
          → https://api.zeabur.com/api/v1/zsend/emails
          → credential_ref: zsend (vault Bearer token)
```

Inbound is **not** a command channel — only for registration replies / verification links.

## Warnings

- **No secrets in git** — `ORBITA_INBOUND_EMAIL_TOKEN`, `ORBITA_ADMIN_TOKEN`, ZSend keys live in Zeabur / `.env` only.
- **Local `.env` `ORBITA_ADMIN_TOKEN`** is dev — prod admin differs; use Zeabur Dashboard for prod ops.
- **Uncommitted local files** (do not commit casually): `AGENTS.md`, `.cursor/hooks/state/*` — continual-learning noise.
- **Session profile snapshot is immutable** — new session after profile/tool changes.
- **CF API token** — Pages deploy works with zone token; Worker deploy needs account access; set `CLOUDFLARE_ACCOUNT_ID` if wrangler fails.
- **Prod HTTP allow-list** currently includes `api.twitter.com`, `api.x.com`, `api.resend.com` — run setup script to add `api.zeabur.com` (merge, not replace).

## Still open (founder input eventually)

- X API Bearer for MA3 publish channel
- Multi-user / system admin (W15–W16)
- Billing SaaS (Phase 2)
- Credential rotation policy

## Last session closed

Previous handoff (W7 era) superseded by w15–w18 work above. Resume from **ZSend setup + outbound E2E** tomorrow.
