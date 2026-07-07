# Current status

**Last updated:** 2026-07-07

**Navigation:** `docs/DEVELOPMENT_LANES.md` (lanes) · `docs/development-plan.md` (W32–W35 roadmap)

## Summary

Orbita **W0–W32** in progress; API target **0.0.1-w32** (memory graph foundation: notes + links).

**Focus lane:** **L2 AT dogfood loop** — daily supply + outcome poll + feedback memory.

**Platform lane:** **L1 W32** — `notes` / `note_links` tables, `/v1/notes` API, agent tools.

## Dogfood — AT1b

| Piece | Status |
|-------|--------|
| AT1a proof E2E | ✅ |
| Harness supply 07:00 UTC | ✅ w31 per_run verified |
| Agent poll 18:00 UTC | 📋 verify cron stability |
| Operator poll fallback | 📋 `at1b-sync-review-outcomes.sh` |
| Human `/editorial` | ongoing |

## Infrastructure

| URL | Role |
|-----|------|
| https://api.get-orbita.com | Production API (w31 → w32 deploying) |
| https://ai-transformation.io | AT write + editorial target |

## Deferred (off radar)

W15 multi-user · W17 billing · AT webhooks Phase 2 · Orbita Loop 4 auto-improve
