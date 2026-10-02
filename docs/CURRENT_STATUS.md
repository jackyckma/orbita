# Current status

**Last updated:** 2026-10-02

**Navigation:** `docs/DEVELOPMENT_LANES.md` · `docs/development-plan.md` · `docs/at-editorial-poll.md` · `docs/autopilot/`

## Summary

Orbita **W0–W36 shipped** on prod; API **`0.0.1-w36`** includes `GET /v1/notes/export` (Obsidian-friendly Markdown + wikilinks; Autopilot **E-02** ✅). **E-03** ✅ (`scripts/at1b-harness-status.sh` for AT supply/poll harness visibility). **D-001** ✅ (manual personal notes seed, option A). Harness hardening (**E-14** strands 1–3) merged; docs catch-up is **T-0075**.

**Focus:** Autopilot Maker/Checker (twice daily) on ConsultOS epics (**E-16** lane-tickets next in sequence); AT dogfood can resume when `/editorial` is back.

## Dogfood — AT1b

| Piece | Status |
|-------|--------|
| AT1a proof E2E | ✅ |
| Harness supply 07:00 UTC | ✅ confirm with `scripts/at1b-harness-status.sh` |
| Editorial poll | ✅ scripts + poll harness |
| Agent poll 18:00 UTC | ✅ confirm with harness status script |
| Human `/editorial` | ongoing when dogfood resumes |

## Infrastructure

| URL | Role |
|-----|------|
| https://api.get-orbita.com | Production API (`0.0.1-w36`) |
| https://api.get-orbita.com/v1/mcp | PA1 MCP (16 tools) + PA1.5 OAuth |
| https://get-orbita.com | Marketing + docs |

## Personal steward

| Piece | Status |
|-------|--------|
| PA0 `personal-jacky` | ✅ `~/.orbita-personal.env` + Cursor skill |
| PA1 MCP | ✅ 16 tools (`packages/lane-mcp`) |
| PA1.5 Claude Custom Connector | ✅ OAuth + DCR (user connected) |
| Notes export `GET /v1/notes/export` | ✅ w36 (see `memory-conventions.md`) |
| D-001 notes seed | ✅ manual / Claude Desktop (not Autopilot-invented) |

## Autopilot

| Piece | Status |
|-------|--------|
| Cadence | Maker `0 7,19 * * *` UTC; Checker `0 8,20 * * *` UTC |
| Fuel | E-14 ConsultOS foundation (in progress); E-02/E-03 done — see `docs/autopilot/roadmap.json` |
| Checker PR filter | Title must include `T-xxxx` |

## Deferred (off radar)

W15 multi-user · W17 billing · AT webhooks Phase 2 · Orbita Loop 4 auto-improve · E-06 AT graph dogfood (until L2 green) · harness multi-replica leader lock (**T-0081**, blocked)
