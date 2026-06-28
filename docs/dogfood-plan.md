---
status: active
maintained_by: jacky + ai-agents
created: 2026-06-26
last_updated: 2026-06-26
purpose: Dogfood milestone — validate Orbita by running real agent workflows across owned projects.
related: docs/loose-ends-checklist.md, docs/marketing-agent-plan.md, docs/api-as-product.md
---

# Dogfood milestone

**Goal:** Prove Orbita is usable end-to-end for real work — not ship W15 multi-user yet.

**Prerequisite:** Close items in `docs/loose-ends-checklist.md`.

## Platform approach (decided)

**No Orbita plugin system for now.** Use:

- Per-project **workspaces** (gitignored caller folders, e.g. `marketing-agent/`)
- **Shared profiles/skills** in repo where generic
- A **curated / tested skills catalog** for MA depth (document + dogfood before promoting)

## First Dogfood cycle — ai-transformation.org (AT)

**Why first:** API-native research + writing fits Orbita; `.org` platform is owned and easier to verify than broad social posting.

**Throughput:** Prove pipeline at **2–4 drafts** first; ramp toward **~5/day** only after quality and approve flow hold — not 1+1 per week as steady state.

| Step | Description |
|------|-------------|
| **AT0** | Discover org Agent API; scaffold workspace + `orbita-connection.md` |
| **AT0b** | Orbita admin: client_id, HTTP allow-list, vault `atx_write_org` |
| **AT1a** | Proof batch (2–4 drafts): quality + draft → approve → live |
| **AT1b** | Ramp with gates (target up to ~5/day if sustainable) |
| **AT2** | Feedback → `feedback-to-orbita.md`; promote reusable skills to catalog; optional migrate AT1b cron to W27 Harness (`docs/harness-design.md`) |

Orbita MA for get-orbita.com continues in parallel but is **not** the first complete weekly loop.

## Marketing / MA brand order

| Priority | Brand | Notes |
|----------|-------|-------|
| 1 | **ai-transformation.org** | Dogfood track (above); research + writing agent |
| 2 | **AI Business Life** | Most ready for MA next; tone = **early participants welcome, feedback wanted** — not “we are already a business” |
| 3 | **Agent Mindset** (book) | MA when published (~2–3 weeks) |
| 4 | **Apprenticeship** | Support initiative under **Powerhouse** + **ai-transformation.org**; prioritize Powerhouse candidates; AT.org as platform |
| — | **Orbita** (get-orbita.com) | Ongoing MA1+ drafts; not first full cycle |
| — | **Powerhouse** | Via apprenticeship + portfolio; no separate MA slot yet |

## Social posting guardrails

A prior X account was **banned** after high-volume agent posts classified as spam.

MA / scheduler publishing must:

- Post **meaningful** content (insight, draft quality), not repetitive promo
- Prefer draft → human approve → publish (MA3 flow)
- Rate-limit and vary copy; avoid burst posting

## Tracks vs waves

| Symbol | Meaning |
|--------|---------|
| **W0–W26** | Platform shipped (`packages/*`, API) |
| **MA0–MA4** | Marketing Agent application — ✅ |
| **AT0–ATn** | ai-transformation.org dogfood (this doc) |
| **W15+** | Deferred until dogfood + more invite users |

## Changelog

| Date | Change |
|------|--------|
| 2026-06-26 | Throughput: proof batch then ramp (~5/day), not weekly 1+1 |
| 2026-06-26 | Initial plan: AT first, AI-business next MA, skills-catalog route, X spam guardrails |
