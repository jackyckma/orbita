# Current status

**Last updated:** 2026-07-09

**Navigation:** `docs/DEVELOPMENT_LANES.md` · `docs/development-plan.md` · `docs/at-editorial-poll.md`

## Summary

Orbita **W0–W34** in progress; API target **0.0.1-w34** (harness memory pre-inject + MCP `/v1/mcp`).

**Focus lane:** **L2 AT dogfood loop** — editorial poll sync ran after founder review (**12 outcomes** → `editorial/feedback`).

## Dogfood — AT1b

| Piece | Status |
|-------|--------|
| AT1a proof E2E | ✅ |
| Harness supply 07:00 UTC | ✅ w34 memory_inject on run |
| Editorial poll (GET /objects/{id}) | ✅ `scripts/at1b-poll-editorial-outcomes.sh` + poll harness |
| Agent poll 18:00 UTC | 📋 cron verify |
| Human `/editorial` | ✅ review complete (2026-07-07) |

## Infrastructure

| URL | Role |
|-----|------|
| https://api.get-orbita.com | Production API (w34) |
| https://api.get-orbita.com/v1/mcp | PA1 MCP (Streamable HTTP, Bearer + `x-orbita-client-id`) |
| https://ai-transformation.io | AT write + editorial target |

## Personal steward

| Piece | Status |
|-------|--------|
| PA0 `personal-jacky` | ✅ Cursor skill + `~/.orbita-personal.env` |
| PA1 MCP | ✅ `/v1/mcp` — Claude / ChatGPT can connect |

## Deferred (off radar)

W15 multi-user · W17 billing · AT webhooks Phase 2 · Orbita Loop 4 auto-improve
