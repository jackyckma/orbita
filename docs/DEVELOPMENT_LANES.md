---
status: active
maintained_by: jacky + ai-agents
last_updated: 2026-07-01
purpose: Reduce parallel task sprawl — one page for lanes, loose ends, and what is off the radar.
related: docs/CURRENT_STATUS.md, docs/harness-design.md, AGENTS.md
---

# Development lanes

**Goal:** Fewer mental tabs. Work rolls up into **four lanes**; waves (W*) and tracks (AT*, MA*) are implementation detail inside a lane.

---

## Lane map

| Lane | Outcome | Active work | Off radar when |
|------|---------|-------------|----------------|
| **L1 — Platform core** | Reliable API for agents | Harness H1/H1.5, session policy, quotas | Stable prod + docs match code |
| **L2 — AT dogfood loop** | ai-transformation.org daily supply + learn | per_run fix, poll harness, sync fallback | 7-day green: supply + poll + feedback |
| **L3 — GTM / MA** | Portfolio brands via Orbita | AI Business Life after AT loop green | MA cadence self-serve |
| **L4 — Ops / infra** | Deploy, handoff, admin | Zeabur deploys, dogfood mailbox | No stale STATUS / no failed builds |

```text
L1 Platform ──► L2 AT loop (dogfood proof) ──► L3 MA / marketing
        ▲                    │
        └──── L4 Ops ────────┘
```

---

## L2 — AT editorial loop (current focus)

| Step | Owner | Mechanism | Status |
|------|-------|-----------|--------|
| Supply ~5 drafts/day | **Agent** (harness 07:00 UTC) | Loop 1+3 | ⚠️ fix per_run (w31) |
| Human review | **You** | AT `/editorial` | ongoing |
| Poll outcomes | **Agent** (harness 18:00 UTC) | Loop 1+3 poll prompt | 📋 setup script ready |
| Poll fallback | **Operator script** | `at1b-sync-review-outcomes.sh` | 📋 ready |
| Manual notes | **You** (optional) | `at1b-ingest-feedback.sh` | ✅ |

**Design note:** Daily automation is **agent-initiated** via Harness cron. Shell scripts are **bootstrap + fallback**, not the steady-state loop.

---

## Loose ends — close or defer

### Close now (no founder judgment)

- [x] w30 date refresh deploy
- [ ] w31 `session_policy: per_run` wired + prod patch
- [ ] `at1b-sync-review-outcomes.sh` + poll harness scripts
- [ ] Verify manual supply trigger after w31

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

## How to use this doc

1. **Weekly:** Pick **one lane** primary (now: L2).
2. **Daily:** Only check L2 table + `/editorial` queue.
3. **When something ships:** Move it to "Off radar" in `CURRENT_STATUS.md` — don't keep duplicate task lists.

---

## IDs (AT1b prod)

| Resource | ID |
|----------|-----|
| Supply harness | `dd839025-1200-4df4-b69b-b3454625416f` |
| Session (rotates with per_run) | see harness `session_id` |
| API | `https://api.get-orbita.com` |
