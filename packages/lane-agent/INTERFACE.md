---
status: planned
maintained_by: ai-agents
created: 2026-06-20
last_updated: 2026-06-20
purpose: Boundary contract for Lane 4 — Agent Runtime (not yet implemented).
---

# Lane 4 — Agent Runtime INTERFACE

## Summary

Turn loop, LLM provider adapters, multi-provider failover, streaming, `execution_meta`, `GET /v1/capabilities`.

## LLM testing policy

1. **Primary:** MiniMax-M3 via `MINIMAX_API_KEY` / `MINIMAX_MODEL`
2. **Fallback:** Anthropic via `ANTHROPIC_API_KEY` when MiniMax fails (rate limit, quota, etc.)

Failover must set `execution_meta.failover_occurred: true` in responses.

## See also

- Design spec Sections 10–11
