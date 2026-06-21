# Current status

**Last updated:** 2026-06-20

## Summary

Orbita **W0–W7 implemented** in TypeScript monorepo. End-to-end agent turns work via MiniMax-M3 (primary) with Anthropic fallback, tool-calling loop, LLM-backed context compression, pgvector semantic memory, cron/webhook scheduler, and Postgres-backed per-key rate limiting.

**Production (Zeabur):** redeploy pending after W7 push — expect `0.0.1-w7` in `/v1/health`.

## What works

- **W0:** Health, auth, admin API keys, error envelope
- **W1:** Agent profiles (static, session-bound), full session lifecycle + message polling
- **W2:** Agent runtime — MiniMax-M3 primary, Anthropic failover, `execution_meta`
- **W3:** Client-scoped long-term memory (text store, injected into system prompt)
- **W4:** Trajectory API, scheduler jobs (`every_seconds`)
- **W5:** Credentials vault, tools (`echo`, `http_get`), MiniMax tool loop
- **W6:** LLM session summarization + `context_summary`, semantic memory (MiniMax `embo-01` + pgvector), `PUT/GET /v1/memories`
- **W7:** Cron schedules + webhook delivery; per-key rate limits (429 + `Retry-After`)
- **Zeabur (Ocean):** https://orbita-api.zeabur.app — Git deploy from `main`

## Known gaps / deferred

- Anthropic failover path does not run tool loop (plain text only)
- Credential rotation
- E2E harness Tier B (live LLM) not wired in CI (W8 in progress)
- Skill library minimal (`core` only); tools registry small (W9 target)

## Wave roadmap (prioritized)

| Wave | Focus | Lanes | Status |
|------|-------|-------|--------|
| **W7** | Scheduler cron + webhook output routing; per-key rate limiting | 8, 0, 1 | ✅ Implemented locally |
| **W8** | E2E test harness (Tier A mock-LLM + Tier B live keys); `scripts/smoke-prod.sh`; prod smoke in verify flow | cross-cutting | 🔄 In progress |
| **W9** | Practical tools expansion + skill/profile library | 2, 7, 4 | ⏳ Planned |
| **W10** | Ops hardening: trajectory replay, multi-replica notes, eval tooling | 9, 0 | ⏳ Planned |

See `docs/product-architecture.md` for per-lane next steps.
