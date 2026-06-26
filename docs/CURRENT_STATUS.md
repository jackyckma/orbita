# Current status

**Last updated:** 2026-06-26

## Summary

Orbita **W0–W26 shipped**; API version **0.0.1-w26** adds W17 daily quota hard-stop (`quota_exceeded`), API key metering, waitlist invite E2E.

**Parallel:** MA track MA0–MA4 complete. X publish blocked until Bearer token.

**Next:** Enable hosted quotas on prod (optional env); W15 multi-user (deferred); Stripe/billing (W17 full).

## Waves

| Wave | Status |
|------|--------|
| W0–W14 | ✅ Shipped |
| **w15–w20** | ✅ Waitlist, inbound email, ZSend, approve→invite |
| **w21–w26** | ✅ Admin observability, metering, quotas, invite E2E |
| **W15–W16** (roadmap) | 📋 Multi-user accounts, system admin |
| **W17+** | 🔄 Quota prep shipped; billing/abuse TBD |

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
