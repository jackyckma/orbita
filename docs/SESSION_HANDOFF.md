# Session handoff

**Last updated:** 2026-06-20

## Completed

- W0–W4 implementation pushed to `main`
- Verified live MiniMax-M3 turn via `POST /v1/sessions/{id}/messages`
- Auto-commit/push policy noted in project guidelines

## Run locally

```bash
docker compose up -d postgres
pnpm db:migrate   # uses docker exec if psql missing
PORT=3002 pnpm dev   # 3000/3001 may be occupied
```

## Critical decisions still open (need founder input eventually)

- Zeabur project/service IDs for deploy
- Public domain / Cloudflare setup
- Whether to enable sandbox tool execution tier first (Local vs Docker)
- pgvector embedding model choice for semantic memory

## Non-critical decisions taken autonomously

- Scheduler uses `every_seconds` instead of cron expressions (v1 simplification)
- Memory is text-key store (not pgvector yet)
- MiniMax thinking blocks stripped from assistant output
- Default `agent_profile`: `default` with MiniMax-M3 + Anthropic fallback
