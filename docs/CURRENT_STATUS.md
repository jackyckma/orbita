# Current status

**Last updated:** 2026-06-20

## Summary

Orbita **W0–W6 implemented** in TypeScript monorepo. End-to-end agent turns work via MiniMax-M3 (primary) with Anthropic fallback, tool-calling loop, LLM-backed context compression, and pgvector semantic memory retrieval.

## What works

- **W0:** Health, auth, admin API keys, error envelope
- **W1:** Agent profiles (static, session-bound), full session lifecycle + message polling
- **W2:** Agent runtime — MiniMax-M3 primary, Anthropic failover, `execution_meta`
- **W3:** Client-scoped long-term memory (text store, injected into system prompt)
- **W4:** Trajectory API, scheduler jobs (`every_seconds`)
- **W5:** Credentials vault, tools (`echo`, `http_get`), MiniMax tool loop
- **W6:** LLM session summarization + `context_summary`, semantic memory (MiniMax `embo-01` + pgvector), `PUT/GET /v1/memories`
- **Zeabur (Ocean):** https://orbita-api.zeabur.app — Git deploy from `main`

## Known gaps / deferred

- Cron expression parsing — scheduler uses `every_seconds` interval
- Anthropic failover path does not run tool loop (plain text only)
- Rate limiting, credential rotation (design Section 16)

## Next steps

1. **W7:** Scheduler cron/webhook + rate limiting
2. **W8:** Ops hardening (multi-replica, eval/replay)
