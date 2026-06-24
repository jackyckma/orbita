# Website & Cloudflare (get-orbita.com)

Marketing site lives in **`apps/orbita-web`** (static assets deployed to **Cloudflare Pages**).

| App | Role |
|-----|------|
| `apps/orbita-api` | Orbita HTTP API (Zeabur) |
| `apps/orbita-web` | Public intro site (Cloudflare Pages) |

**One repo is fine** — shared docs, version alignment, single PR for API + copy updates. Split repos only if you need isolated access or unrelated release cadence.

## Local preview

```bash
cd apps/orbita-web
pnpm install
pnpm dev
```

## Deploy

```bash
# From repo root (uses CLOUDFLARE_API_TOKEN from .env)
./scripts/deploy-web.sh
```

Production URLs:

- https://get-orbita.com
- https://www.get-orbita.com
- https://orbita-web.pages.dev (default Pages hostname)

## Cloudflare API token — IP allowlist

This environment uses:

| Address | Use |
|---------|-----|
| **`62.156.6.120`** | IPv4 (add to token IP filter) |
| **`2003:e9:ff31:4024:443:36c:f139:6bed`** | IPv6 (if token blocks IPv6 egress) |

Token verify may succeed on one path while zone APIs fail on the other — whitelist **both**, or disable IP filtering for automation.

Use **IPv4** for API scripts: `curl -4` (see `scripts/cloudflare-dns-get-orbita.sh`).

## Domain setup (get-orbita.com)

Zone **`get-orbita.com`** is on this Cloudflare account (status **Active**).

1. Deploy site: `./scripts/deploy-web.sh`
2. Configure DNS + Pages custom domains: `./scripts/cloudflare-dns-get-orbita.sh`
3. Wait until Pages reports both hostnames **active** (SSL usually 1–3 minutes after DNS)

DNS records (proxied CNAME):

| Host | Target |
|------|--------|
| `get-orbita.com` | `orbita-web.pages.dev` |
| `www.get-orbita.com` | `orbita-web.pages.dev` |

**Workers Routes** are not used — the zone-scoped token does not need `Workers Routes:Edit`. Pages custom domains handle TLS and routing.

API: **https://api.get-orbita.com** — marketing site links there.

## Waitlist (Product Phase 1)

- Page: https://get-orbita.com/waitlist
- API: `POST https://api.get-orbita.com/v1/waitlist` (JSON `{ email, message? }`)
- CORS origins: `ORBITA_WAITLIST_ALLOWED_ORIGINS` (default `https://get-orbita.com`, `https://www.get-orbita.com`)
- Admin: https://api.get-orbita.com/admin → **Waitlist** panel (approve / reject)
- Deploy site: `./scripts/deploy-web.sh` (no FormSubmit)

Optional operator inbox: Cloudflare Email Routing on `waitlist@get-orbita.com` for human notifications (not required for API storage).

Instance outbound email design: `docs/instance-email.md`.

## Env

```bash
CLOUDFLARE_API_TOKEN=...   # Needs Account:Read, Cloudflare Pages:Edit, Zone:DNS:Edit (get-orbita.com)
```

Never commit tokens. `.env` is gitignored.
