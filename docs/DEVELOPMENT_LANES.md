---
status: active
maintained_by: jacky + ai-agents
last_updated: 2026-07-07
purpose: Reduce parallel task sprawl — one page for lanes, loose ends, and what is off the radar.
related: docs/CURRENT_STATUS.md, docs/development-plan.md, docs/harness-design.md, AGENTS.md
---

# Development lanes

**Goal:** Fewer mental tabs. Work rolls up into **four lanes**; waves (W*) and tracks (AT*, MA*) are implementation detail inside a lane.

**Full wave plan:** `docs/development-plan.md` (W32–W35 memory graph).

---

## Lane map

| Lane | Outcome | Active work | Off radar when |
|------|---------|-------------|----------------|
| **L1 — Platform core** | Reliable API for agents | W32 notes graph; W33 hybrid retrieve | Stable prod + docs match code |
| **L2 — AT dogfood loop** | ai-transformation.org daily supply + learn | Human `/editorial`; cron stability check | 7-day green: supply + poll + feedback |
| **L3 — GTM / MA** | Portfolio brands via Orbita | AI Business Life after AT loop green | MA cadence self-serve |
| **L4 — Ops / infra** | Deploy, handoff, admin | Zeabur deploys, docs sync | No stale STATUS / no failed builds |

```text
L1 Platform ──► L2 AT loop (dogfood proof) ──► L3 MA / marketing
        ▲                    │
        └──── L4 Ops ────────┘
```

---

## L2 — AT editorial loop (current focus)

| Step | Owner | Mechanism | Status |
|------|-------|-----------|--------|
| Supply ~5 drafts/day | **Agent** (harness 07:00 UTC) | Loop 1+3, `session_policy: per_run` | ✅ w31 verified |
| Human review | **You** | AT `/editorial` | ongoing |
| Poll outcomes | **Agent** (harness 18:00 UTC) | poll-outcomes prompt | 📋 verify cron 7/2–7/7 |
| Poll fallback | **Operator script** | `at1b-sync-review-outcomes.sh` | 📋 ready |
| Manual notes | **You** (optional) | `at1b-ingest-feedback.sh` | ✅ |

**Design note:** Daily automation is **agent-initiated** via Harness cron. Shell scripts are **bootstrap + fallback**, not the steady-state loop.

---

## L1 — Memory graph (in progress)

| Wave | Status |
|------|--------|
| W32 notes + links + tools | 🚧 in progress |
| W33 neighbors + search | 📋 planned |
| W34 harness pre-inject | 📋 planned |
| W35 export + AT graph dogfood | 📋 planned |

Flat `client_memories` stays for small keys; notes for prose + graph.

---

## Loose ends — close or defer

### Close now (no founder judgment)

- [x] w31 `session_policy: per_run` wired + prod patch
- [x] Poll harness + sync scripts documented
- [ ] W32 notes schema + API + tools
- [ ] Spot-check prod cron since 7/1 (supply + poll)

### Needs you (human gate)

- [ ] Review pending/rejected drafts on `/editorial`
- [ ] AT: `editorial_comment` on reject (optional backlog)
- [ ] Marketing case study copy when L2 is green 7 days

### Defer / off radar

- Webhooks to AT (Phase 2 poll)
- Orbita Loop 4 auto-improve (H2/H3)
- W15 multi-user, W17 billing
- X publish (blocked)

---

## Parallel OK this week

| Stream | Work |
|--------|------|
| A | You: `/editorial` + AT UI |
| B | Orbita: W32–W33 memory graph |
| C | Docs: `development-plan.md`, STATUS sync |

---

## How to use this doc

1. **Weekly:** Pick **one lane** primary (now: L2).
2. **Daily:** L2 table + `/editorial` queue.
3. **When something ships:** Update `CURRENT_STATUS.md` — don't duplicate task lists.

---

## IDs (AT1b prod)

| Resource | ID |
|----------|-----|
| Supply harness | `dd839025-1200-4df4-b69b-b3454625416f` |
| Poll harness | `e4c0de60-9db6-4bb8-9845-b5c586afcc36` |
| Session (rotates with per_run) | see harness `session_id` |
| API | `https://api.get-orbita.com` |
