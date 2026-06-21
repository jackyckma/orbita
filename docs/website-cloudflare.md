# Website & Cloudflare (get-orbita.com)

Marketing site lives in **`apps/orbita-web`** (static assets + Cloudflare Workers deploy).

| App | Role |
|-----|------|
| `apps/orbita-api` | Orbita HTTP API (Zeabur) |
| `apps/orbita-web` | Public intro site (Cloudflare Workers) |

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

## Cloudflare API token — IP allowlist

This environment uses:

| Address | Use |
|---------|-----|
| **`62.156.6.120`** | IPv4 (add to token IP filter) |
| **`2003:e9:ff31:4024:443:36c:f139:6bed`** | IPv6 (if token blocks IPv6 egress) |

Token verify may succeed on one path while zone APIs fail on the other — whitelist **both**, or disable IP filtering for automation.

Use **IPv4** for API scripts: `curl -4` (see `scripts/cloudflare-dns-get-orbita.sh`).

## Domain setup (get-orbita.com)

As of last check, **`get-orbita.com` is not yet a zone** on this Cloudflare account. Steps:

1. Cloudflare Dashboard → **Add site** → `get-orbita.com`
2. Update nameservers at your registrar to Cloudflare’s pair
3. Wait until zone status is **Active**
4. Deploy worker: `./scripts/deploy-web.sh`
5. Workers & Pages → **orbita-web** → **Domains & Routes** → Add **get-orbita.com** and **www.get-orbita.com**
6. Or run `./scripts/cloudflare-dns-get-orbita.sh` to inspect DNS

API remains at **https://orbita-api.zeabur.app** — the marketing site links there; no need to CNAME API to get-orbita.com unless you want a unified domain later.

## Env

```bash
CLOUDFLARE_API_TOKEN=...   # Needs Workers Scripts:Edit + Account:Read (deploy) and Zone:DNS:Edit (DNS scripts)
```

Never commit tokens. `.env` is gitignored.
