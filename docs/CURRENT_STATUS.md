# Current status

**Last updated:** 2026-06-24

## Summary

Orbita **W0–W14 shipped**; API version **0.0.1-w15** adds waitlist + scheduler `agent_message`.

**Parallel:** MA track MA0–MA4 complete. X publish blocked until Bearer token.

**Next platform wave:** W15 multi-user accounts (deferred). **Next product:** waitlist approve → invite email; instance outbound email (`docs/instance-email.md`).

## Waves

| Wave | Status |
|------|--------|
| W0–W14 | ✅ Shipped |
| **w15** (API version) | ✅ Waitlist API, scheduler `agent_message`, memory tools |
| **W15–W16** (roadmap) | 📋 Multi-user accounts, system admin |
| **W17+** | 📋 Billing SaaS (Phase 2 product) |

## Product phases (`docs/api-as-product.md`)

| Phase | Status |
|-------|--------|
| **Phase 0** | 🔄 Self-use stabilize (ongoing polish) |
| **Phase 1** | ✅ Waitlist API + Admin review (`POST /v1/waitlist`) |
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
