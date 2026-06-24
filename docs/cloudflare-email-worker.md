# Cloudflare Email Worker (inbound → Orbita)

Adapter that receives mail on your domain and forwards parsed content to **`POST /v1/inbound/email`** on the Orbita API. This closes the loop for **service registration replies** (verification links, codes) — not for email-as-command-channel.

## Architecture

```
Mail to orbita@get-orbita.com
  → Cloudflare Email Routing
  → apps/orbita-email-worker (parse MIME)
  → POST https://api.get-orbita.com/v1/inbound/email
  → Orbita session turn (marketing profile by default)
```

Outbound send uses **Zeabur Email (ZSend)** via agent `http_post` + credential vault. See `docs/instance-email.md`.

## Prerequisites

1. **Email Routing** enabled on `get-orbita.com` (already used for waitlist forwarding).
2. **Orbita API** env on Zeabur:
   - `ORBITA_INBOUND_EMAIL_TOKEN` — random secret (min 16 chars), shared with Worker
   - `ORBITA_INBOUND_CLIENT_ID` — default `orbita-instance`
   - `ORBITA_INBOUND_AGENT_PROFILE` — default `marketing`
3. **Cloudflare API token** with Workers deploy permission (`CLOUDFLARE_API_TOKEN` in `.env`).

## Deploy Worker

```bash
cd orbita
pnpm install

# Same token as Zeabur ORBITA_INBOUND_EMAIL_TOKEN
export ORBITA_INBOUND_EMAIL_TOKEN=...
./scripts/deploy-email-worker.sh
```

Or configure routing + deploy in one flow:

```bash
./scripts/cloudflare-email-routing-orbita.sh   # orbita@ → Worker
./scripts/deploy-email-worker.sh
```

Worker vars (`wrangler.toml`):

| Var | Default |
|-----|---------|
| `ORBITA_API_URL` | `https://api.get-orbita.com` |

Secret (via wrangler):

| Secret | Value |
|--------|--------|
| `ORBITA_INBOUND_EMAIL_TOKEN` | Same as API host |

## Email Routing rule

In Cloudflare Dashboard → **Email** → **Routing** → **Routes**:

| Custom address | Action |
|----------------|--------|
| `orbita@get-orbita.com` | Send to Worker **`orbita-email-worker`** |

(Keep separate rules for `waitlist@` → Gmail if you use human notifications.)

## Local dev

Email Workers require remote mode:

```bash
cd apps/orbita-email-worker
pnpm dev   # wrangler dev --remote
```

Send a test message to `orbita@get-orbita.com` after routing is active.

## API contract

Worker sends JSON:

```json
{
  "from": "verify@example.com",
  "to": "orbita@get-orbita.com",
  "subject": "Confirm your email",
  "text": "Click https://...",
  "message_id": "<optional>"
}
```

Header: `x-orbita-inbound-token: <ORBITA_INBOUND_EMAIL_TOKEN>`

Orbita maps `from` → session via memory key `inbox-session/{from}`, stores raw mail at `inbox/{message_id}`, runs one agent turn.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Bounce from Cloudflare | Worker `setReject` — API returned non-2xx; check Zeabur logs |
| 403 from API | Token mismatch between Worker secret and `ORBITA_INBOUND_EMAIL_TOKEN` |
| No agent action | Profile lacks tools; create new session after profile changes |
| Empty body | HTML-only mail — Worker strips HTML to text; prefer plain in tests |

## Related

- `docs/instance-email.md` — outbound identity + Zeabur ZSend
- `docs/DOCUMENTATION.md` — public docs build workflow
- `apps/orbita-email-worker/src/index.ts` — handler source
