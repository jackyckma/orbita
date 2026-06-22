# Self-host Orbita

Run Orbita on **localhost** or a **remote server** with the same steps.

## Requirements

- Docker (for Postgres) or managed Postgres with pgvector
- Node 22+ and pnpm (for dev)
- LLM keys: `MINIMAX_API_KEY` and/or `ANTHROPIC_API_KEY`

## Quick start

```bash
git clone https://github.com/jackyckma/orbita.git
cd orbita
pnpm install

cp .env.example .env
# Edit: ORBITA_ADMIN_TOKEN, ORBITA_SECRETS_KEY, MINIMAX_API_KEY, DATABASE_URL

docker compose up -d postgres
pnpm dev
```

Open:

| URL | Purpose |
|-----|---------|
| http://127.0.0.1:3000/v1/health | API health |
| http://127.0.0.1:3000/admin | Admin console (keys, credentials, HTTP domains) |
| http://127.0.0.1:3000/v1/profiles | Profile catalog |
| http://127.0.0.1:3000/v1/capabilities | Tools + auth discovery (requires API key) |

## Admin console

1. Visit `/admin`
2. Sign in with `ORBITA_ADMIN_TOKEN`
3. Create a **caller API key** and note `allowed_client_ids`
4. Add **credentials** for third-party APIs (Firecrawl, etc.)
5. Set **HTTP allowed domains** (empty = any HTTPS host)

Remote server without SSH UI: use device flow:

```bash
ORBITA_API_URL=https://your-host ./scripts/admin-device-login.sh
```

## First API call

```bash
export ORBITA_API_URL=http://127.0.0.1:3000
export API_KEY=orb_...        # from admin console
export CLIENT_ID=my-project

curl -s -X POST "$ORBITA_API_URL/v1/sessions" \
  -H "Authorization: Bearer $API_KEY" \
  -H "x-orbita-client-id: $CLIENT_ID" \
  -H "Content-Type: application/json" \
  -d '{"agent_profile":"default"}'
```

## Environment reference

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | yes | Postgres + pgvector |
| `ORBITA_ADMIN_TOKEN` | yes | Protects `/v1/admin/*` and `/admin` login |
| `ORBITA_SECRETS_KEY` | yes | Encrypts credential vault (16+ chars) |
| `MINIMAX_API_KEY` | for LLM | Primary model |
| `ANTHROPIC_API_KEY` | optional | Fallback model |
| `ORBITA_HTTP_ALLOWED_DOMAINS` | optional | Comma-separated; overridable in admin UI |
| `ORBITA_PUBLIC_BASE_URL` | optional | Public URL for device flow links (defaults to localhost) |
| `HOST` | optional | `0.0.0.0` for Docker / remote |

## Docker Compose (API + Postgres)

```bash
docker compose up --build
```

API listens on port 3000. Migrations run on startup (`apps/orbita-api/migrations/init.sql`).

## Verify

```bash
./scripts/self-host-smoke.sh
./scripts/agent-verify.sh
```

## Custom domain (API)

Point `api.yourdomain.com` to your host (CNAME to Zeabur or reverse proxy). Set `ORBITA_PUBLIC_BASE_URL=https://api.yourdomain.com`.

Marketing site is separate: `apps/orbita-web` → Cloudflare Pages (`get-orbita.com`).

## Skills & tools

See `docs/self-host-and-extensions.md` and `docs/skills-authoring.md`.

## Multi-user

Not enabled in single-user builds. Roadmap: W15 whitelist register — `docs/admin-ui-brainstorm.md`.
