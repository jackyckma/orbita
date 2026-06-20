# Current status

**Last updated:** 2026-06-20

## Summary

Orbita **W0–W4 implemented** in TypeScript monorepo. End-to-end agent turns work via MiniMax-M3 (primary) with Anthropic fallback. Sessions, memory context injection, trajectory logging, and basic scheduler are in place.

## What works

- **W0:** Health, auth, admin API keys, error envelope
- **W1:** Agent profiles (static, session-bound), full session lifecycle + message polling
- **W2:** Agent runtime — MiniMax-M3 primary, Anthropic failover, `execution_meta`
- **W3:** Client-scoped long-term memory (text store, injected into system prompt)
- **W4:** Trajectory API (`GET /v1/sessions/{id}/trajectory`), scheduler jobs (`POST .../jobs`)
- `GET /v1/capabilities`
- Docker Compose + `scripts/db-migrate.sh`

## Known gaps / deferred

- Credentials vault lane (Section 9) — not yet implemented
- Tools & sandbox lane — not yet implemented (only profile `allowed_tools` metadata)
- Context compression is a no-op stub (token ceiling tracked)
- pgvector semantic memory — using simple text rows for now
- Cron expression parsing — scheduler uses `every_seconds` interval
- Rate limiting, credential rotation (design Section 16)
- Zeabur deploy not configured yet

## Next steps

1. Lane 6–7: credentials vault + local sandbox tool execution
2. Real compression/summarization for context ceiling
3. Zeabur deploy + staging smoke test
4. pgvector embeddings for memory retrieval
