# Current status

**Last updated:** 2026-06-20

## Summary

Orbita **W0–W5 implemented** in TypeScript monorepo. End-to-end agent turns work via MiniMax-M3 (primary) with Anthropic fallback, including a local tool-calling loop. Credentials vault, tools sandbox, sessions, memory, trajectory, and basic scheduler are in place.

## What works

- **W0:** Health, auth, admin API keys, error envelope
- **W1:** Agent profiles (static, session-bound), full session lifecycle + message polling
- **W2:** Agent runtime — MiniMax-M3 primary, Anthropic failover, `execution_meta`
- **W3:** Client-scoped long-term memory (text store, injected into system prompt)
- **W4:** Trajectory API, scheduler jobs (`every_seconds`)
- **W5:** Credentials vault (AES-256-GCM), admin store + client list, tools (`echo`, `http_get`), MiniMax tool loop
- `GET /v1/capabilities` (includes registered tools)
- Docker Compose + `scripts/db-migrate.sh`
- **Zeabur (Ocean):** https://orbita-api.zeabur.app — Git deploy from `main`

## Known gaps / deferred

- Context compression is a no-op stub (token ceiling tracked)
- pgvector semantic memory — using simple text rows for now
- Cron expression parsing — scheduler uses `every_seconds` interval
- Anthropic failover path does not run tool loop (plain text only)
- Rate limiting, credential rotation (design Section 16)

## Next steps

1. **W6:** Real compression/summarization + pgvector memory retrieval
2. **W7:** Scheduler cron/webhook + rate limiting
3. **W8:** Ops hardening (multi-replica, eval/replay)
