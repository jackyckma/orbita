---
status: active
maintained_by: jacky + ai-agents
last_updated: 2026-10-02
purpose: Reduce parallel task sprawl — one page for lanes, loose ends, and what is off the radar.
related: docs/CURRENT_STATUS.md, docs/development-plan.md, docs/harness-design.md, docs/autopilot/, AGENTS.md
---

# Development lanes

**Goal:** Fewer mental tabs. Work rolls up into **four lanes**; waves (W*) and tracks (AT*, MA*) are implementation detail inside a lane.

**Full wave plan:** `docs/development-plan.md`. **Autopilot fuel:** `docs/autopilot/roadmap.json`.

---

## Lane map

| Lane | Outcome | Active work | Off radar when |
|------|---------|-------------|----------------|
| **L1 — Platform core** | Reliable API for agents | E-14 harness hardening follow-ups (T-0081 leader lock); E-04 embedding visibility | Stable prod + docs match code |
| **L2 — AT dogfood loop** | ai-transformation.org daily supply + learn | Resume `/editorial` when ready | 7-day green: supply + poll + feedback |
| **L3 — GTM / MA** | Portfolio brands via Orbita | ⏸️ after L2 green | MA cadence self-serve |
| **L4 — Ops / infra** | Deploy, handoff, Autopilot | Maker/Checker twice daily; ConsultOS epics E-16+ | No stale STATUS / no failed builds |

```text
L1 Platform ──► L2 AT loop (dogfood proof) ──► L3 MA / marketing
        ▲                    │
        └──── L4 Ops ────────┘
```

---

## L2 — AT editorial loop

| Step | Owner | Mechanism | Status |
|------|-------|-----------|--------|
| Supply ~5 drafts/day | **Agent** (harness 07:00 UTC) | Loop 1+3, `session_policy: per_run` | ✅ use `scripts/at1b-harness-status.sh` to confirm |
| Human review | **You** | AT `/editorial` | when dogfood resumes |
| Poll outcomes | **Agent** (harness 18:00 UTC) | poll harness | ✅ use harness status script |
| Poll fallback | **Operator script** | `scripts/at1b-poll-editorial-outcomes.sh` | ✅ |

---

## L1 — Memory graph

| Wave | Status |
|------|--------|
| W32 notes + links + tools | ✅ |
| W33 neighbors + search | ✅ |
| W34 harness pre-inject | ✅ |
| PA1 MCP + PA1.5 OAuth | ✅ (w35) |
| W35 export (Autopilot **E-02**) | ✅ `GET /v1/notes/export` → API `0.0.1-w36` |
| E-06 AT graph dogfood | ⏸️ paused |

---

## Loose ends

### Close now

- [x] Stale Cursor architecture-audit draft PRs (#2–#5) closed 2026-08-07
- [x] Autopilot Checker filters on `T-xxxx` PR titles
- [x] AT harness cron visibility script (**T-0020** / epic **E-03**) — `scripts/at1b-harness-status.sh`

### Needs you

- [x] **D-001** personal notes seed → option **A** (manual via Claude Desktop; see `docs/autopilot/decisions.json`)
- [ ] Resume `/editorial` when ready for L2 green streak

### Defer

- Webhooks to AT · Loop 4 · W15 · W17 · X publish · E-06 AT graph

---

## IDs (AT1b prod)

| Resource | ID |
|----------|-----|
| Supply harness | `dd839025-1200-4df4-b69b-b3454625416f` |
| Poll harness | `e4c0de60-9db6-4bb8-9845-b5c586afcc36` |
| API | `https://api.get-orbita.com` |
