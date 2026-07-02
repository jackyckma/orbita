# Current status

**Last updated:** 2026-07-01

**Navigation:** see **`docs/DEVELOPMENT_LANES.md`** for the four-lane map and what is off your radar.

## Summary

Orbita **W0–W31** in progress; API target **0.0.1-w31** (harness `session_policy: per_run` for editorial supply).

**Focus lane:** **L2 AT dogfood loop** — daily supply + outcome poll + feedback memory.

## Dogfood — AT1b

| Piece | Status |
|-------|--------|
| AT1a proof E2E | ✅ |
| Harness supply 07:00 UTC | ⚠️ w31 per_run fix deploying |
| Agent poll 18:00 UTC | 📋 `at1b-setup-poll-harness.sh` |
| Operator poll fallback | 📋 `at1b-sync-review-outcomes.sh` |
| Human `/editorial` | ongoing |

## Infrastructure

| URL | Role |
|-----|------|
| https://api.get-orbita.com | Production API |
| https://ai-transformation.io | AT write + editorial target |

## Deferred (off radar)

W15 multi-user · W17 billing · AT webhooks Phase 2 · Orbita Loop 4 auto-improve
