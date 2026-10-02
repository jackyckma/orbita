# Orbita — Agent-Native, API-First Agent System

Foundation spec: [`usr/ORBITA_DESIGN.md`](usr/ORBITA_DESIGN.md)

## Quick start

```bash
# Install
pnpm install

# Start Postgres (includes schema init)
docker compose up -d postgres

# Add to .env (see .env.example):
#   DATABASE_URL=postgresql://orbita:orbita@localhost:5432/orbita
#   ORBITA_ADMIN_TOKEN=<your-admin-token>

# Dev server
pnpm dev

# Verify
curl -s http://127.0.0.1:3000/v1/health | jq .
./scripts/agent-verify.sh
```

## Stack

TypeScript · Node 22 · Hono · Zod · Drizzle · Postgres/pgvector · pnpm monorepo

## MCP (`/v1/mcp`)

Streamable HTTP MCP for agents (PA1). **16 tools** (see `packages/lane-mcp/src/index.ts`): `orbita_whoami`; `memory_*`; `note_*` (including `note_search`); `portfolio_brief`; `trigger_automation`; `github_get_file`, `github_list_commits`, `github_list_pull_requests`. OAuth for Claude Custom Connector: `@orbita/oauth` (PA1.5). Setup: [`docs/personal-steward/connectors-claude.md`](docs/personal-steward/connectors-claude.md).

## Docs

- [`docs/product-architecture.md`](docs/product-architecture.md) — lanes and build status
- [`docs/self-host.md`](docs/self-host.md) — local / remote setup
- [`docs/admin-ui-brainstorm.md`](docs/admin-ui-brainstorm.md) — admin UI & identity (planned W11+)
- [`docs/CURRENT_STATUS.md`](docs/CURRENT_STATUS.md) — what works today
- [`docs/website-cloudflare.md`](docs/website-cloudflare.md) — marketing site & get-orbita.com
- [`AGENTS.md`](AGENTS.md) — agent entry point

## Website

Static site: [`apps/orbita-web`](apps/orbita-web) — deploy with `./scripts/deploy-web.sh` (Cloudflare Pages). Live at https://get-orbita.com.

## LLM providers (testing)

| Priority | Provider | Env |
|----------|----------|-----|
| Primary | MiniMax-M3 | `MINIMAX_API_KEY`, `MINIMAX_MODEL` |
| Fallback | Anthropic | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` |

Multi-agent development: `CURSOR_API_KEY` for `/orchestrate`.
