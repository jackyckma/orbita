# Current status

**Last updated:** 2026-06-20

## Summary

Orbita **W0–W19 shipped**; API version **0.0.1-w20** adds waitlist approve → API key + optional ZSend invite email.

**Parallel:** MA track MA0–MA4 complete. X publish blocked until Bearer token.

**Next platform wave:** W15 multi-user accounts (deferred). **Next product:** usage/observability polish; optional admin sessions read-only view.

## Waves

| Wave | Status |
|------|--------|
| W0–W14 | ✅ Shipped |
| **w15–w19** | ✅ Waitlist, scheduler, inbound email, ZSend outbound, async inbound |
| **w20** | ✅ Waitlist approve → API key + ZSend invite |
| **W15–W16** (roadmap) | 📋 Multi-user accounts, system admin |
| **W17+** | 📋 Billing SaaS (Phase 2 product) |

## Product phases (`docs/api-as-product.md`)

| Phase | Status |
|-------|--------|
| **Phase 0** | 🔄 Self-use stabilize (ongoing polish) |
| **Phase 1** | ✅ Waitlist + approve → key + invite email (`PATCH /v1/admin/waitlist/{id}`) |
| **Phase 2** | 📋 Paid SaaS |

## Infrastructure

| URL | Role |
|-----|------|
| https://get-orbita.com | Marketing site |
| https://get-orbita.com/waitlist.html | Hosted API waitlist |
| https://api.get-orbita.com | Production API |

## Key docs

- `docs/product-architecture.md` — lanes + W waves
- `docs/api-as-product.md` — invite-only → SaaS (decided)
- `docs/marketing-agent-plan.md` — MA0–MA4 ✅
- `docs/self-host.md` — self-host guide
