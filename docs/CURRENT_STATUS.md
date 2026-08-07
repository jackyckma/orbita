# Current status

**Last updated:** 2026-08-07

**Navigation:** `docs/DEVELOPMENT_LANES.md` · `docs/development-plan.md` · `docs/at-editorial-poll.md` · `docs/autopilot/`

## Summary

Orbita **W0–W35 shipped** on prod; API **`0.0.1-w35`** (PA1.5 MCP OAuth for Claude Custom Connector). Next platform ship target for notes export: **`0.0.1-w36`** (Autopilot epic E-02).

**Focus:** Autopilot Maker/Checker (twice daily) fueled for W35 export + L2 ops visibility; AT dogfood loop was primary before pause — cron health to be re-checked (T-0020).

## Dogfood — AT1b

| Piece | Status |
|-------|--------|
| AT1a proof E2E | ✅ |
| Harness supply 07:00 UTC | ✅ historically; **re-verify after pause** |
| Editorial poll | ✅ scripts + poll harness |
| Agent poll 18:00 UTC | 📋 re-verify |
| Human `/editorial` | ongoing when dogfood resumes |

## Infrastructure

| URL | Role |
|-----|------|
| https://api.get-orbita.com | Production API (`0.0.1-w35`) |
| https://api.get-orbita.com/v1/mcp | PA1 MCP + PA1.5 OAuth |
| https://get-orbita.com | Marketing + docs |

## Personal steward

| Piece | Status |
|-------|--------|
| PA0 `personal-jacky` | ✅ `~/.orbita-personal.env` + Cursor skill |
| PA1 MCP | ✅ |
| PA1.5 Claude Custom Connector | ✅ OAuth + DCR (user connected) |

## Autopilot

| Piece | Status |
|-------|--------|
| Cadence | Maker `0 7,19 * * *` UTC; Checker `0 8,20 * * *` UTC |
| Fuel | E-02 W35 export, E-03 harness status, E-04 note_search — see `docs/autopilot/` |
| Checker PR filter | Title must include `T-xxxx` |

## Deferred (off radar)

W15 multi-user · W17 billing · AT webhooks Phase 2 · Orbita Loop 4 auto-improve · E-06 AT graph dogfood (until L2 green)
