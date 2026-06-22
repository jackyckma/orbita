# Current status

**Last updated:** 2026-06-22

## Summary

Orbita **W0–W14 shipped**. Marketing site at https://get-orbita.com. Production API at **https://api.get-orbita.com** (`0.0.1-w14`). Git deploy from `main` → Zeabur.

**Next planned:** W15+ multi-user accounts, system admin; MA track dogfooding in parallel (`docs/marketing-agent-plan.md`).

## Waves

| Wave | Status |
|------|--------|
| W0–W10 | ✅ Shipped |
| **W11** | ✅ Admin console (`/admin`) — keys, credentials, HTTP domains |
| **W12** | ✅ Device auth flow + capabilities metadata |
| **W13** | ✅ Self-host docs, `GET /v1/profiles`, smoke scripts |
| **W14** | ✅ Optional Docker sandbox tier |
| **W15–W16** | 📋 Multi-user, system admin |

## Infrastructure

| URL | Role |
|-----|------|
| https://get-orbita.com | Marketing site (Cloudflare Pages) |
| https://api.get-orbita.com | Production API (Zeabur + Cloudflare) |
| https://get-orbita.com/updates.html | Public changelog |

## Key docs

- `docs/product-architecture.md` — lane map + roadmap
- `docs/self-host.md` — self-host guide
- `docs/admin-ui-brainstorm.md` — admin UI & identity
- `docs/marketing-agent-plan.md` — MA application track (parallel to W waves, not a lane)
- `docs/api-as-product.md` — SaaS direction (undecided)
