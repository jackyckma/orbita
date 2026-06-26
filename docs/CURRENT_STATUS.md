# Current status

**Last updated:** 2026-06-25

## Summary

Orbita **W0–W24 shipped**; API version **0.0.1-w24** adds admin scheduler jobs list, usage/sessions observability, waitlist approve→invite.

**Parallel:** MA track MA0–MA4 complete. X publish blocked until Bearer token.

**Next:** Phase 1 waitlist E2E in prod; W17 metering prep (per-key usage, rate-limit visibility); W15 multi-user (deferred).

## Waves

| Wave | Status |
|------|--------|
| W0–W14 | ✅ Shipped |
| **w15–w20** | ✅ Waitlist, inbound email, ZSend, approve→invite |
| **w21–w24** | ✅ Admin usage, sessions, scheduler jobs; cache-bust + date fixes |
| **W15–W16** (roadmap) | 📋 Multi-user accounts, system admin |
| **W17+** | 📋 Billing SaaS (Phase 2 product) |

## Product phases (`docs/api-as-product.md`)

| Phase | Status |
|-------|--------|
| **Phase 0** | 🔄 Self-use stabilize (ongoing polish) |
| **Phase 1** | ✅ Waitlist + approve → key + invite email |
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
