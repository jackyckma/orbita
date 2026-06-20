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

## Docs

- [`docs/product-architecture.md`](docs/product-architecture.md) — lanes and build status
- [`docs/CURRENT_STATUS.md`](docs/CURRENT_STATUS.md) — what works today
- [`AGENTS.md`](AGENTS.md) — agent entry point

## LLM providers (testing)

| Priority | Provider | Env |
|----------|----------|-----|
| Primary | MiniMax-M3 | `MINIMAX_API_KEY`, `MINIMAX_MODEL` |
| Fallback | Anthropic | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` |

Multi-agent development: `CURSOR_API_KEY` for `/orchestrate`.
