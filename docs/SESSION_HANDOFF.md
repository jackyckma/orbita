# Session handoff

**Last updated:** 2026-06-25

## Metadata

| Item | Value |
|------|--------|
| Branch | `main` |
| Latest commit | (pending) — ZSend prod setup executed |
| Prod API | https://api.get-orbita.com — **`0.0.1-w18`** |
| Marketing site | https://get-orbita.com/docs/ |

## Active task

**Instance email closed loop** — mostly complete; optional real-mail E2E to `orbita@get-orbita.com`.

## Current status

| Area | Status |
|------|--------|
| Inbound Worker + routing `orbita@` | ✅ |
| Inbound API smoke | ✅ ~23s turn |
| ZSend API key `orbita` | ✅ created (token in local `.env` only) |
| ZSend domain `get-orbita.com` | ✅ verified (DKIM/SPF/MX on Cloudflare) |
| Vault credential `zsend` (`orbita-instance`) | ✅ |
| HTTP allow-list | ✅ includes `api.zeabur.com` (+ X/Twitter/resend legacy) |
| ZSend outbound smoke | ✅ `orbita@get-orbita.com` → test recipient HTTP 200 |
| Real mail → Worker → agent | ⏸ not tested — send manual email to `orbita@get-orbita.com` |

## Top priority next

1. Send real email to `orbita@get-orbita.com` and confirm Worker + trajectory (`inbound_email` event).
2. Optional: agent reply E2E — session should use `http_post` + `credential_ref: zsend`.
3. Store `ZEABUR_ZSEND_API_KEY` on Zeabur API service if you want it outside vault-only (optional; vault already has `zsend`).

## How to verify

```bash
source .env   # ZEABUR_ZSEND_API_KEY, ORBITA_INBOUND_EMAIL_TOKEN added locally
./scripts/smoke-inbound-email.sh

# ZSend domain status
npx zeabur@latest email domains list -i=false

# Admin credentials (prod admin token required)
curl -sS https://api.get-orbita.com/v1/admin/credentials -H "x-orbita-admin-token: $ORBITA_ADMIN_TOKEN"
```

## Key paths

| Topic | Path |
|-------|------|
| ZSend setup script | `scripts/setup-instance-email-prod.sh` |
| Instance email design | `docs/instance-email.md` |
| Inbound worker | `apps/orbita-email-worker/` |

## Warnings

- ZSend API key shown once at creation — saved to **gitignored** `.env`; rotate in Zeabur if concerned.
- Prod `ORBITA_ADMIN_TOKEN` ≠ local dev token — use Zeabur Dashboard or `variable list`.
- `setup-instance-email-prod.sh` now auto-loads prod admin from Zeabur CLI when unset.
