# Current status

**Last updated:** 2026-06-20

## Summary

Orbita **W0–W8 implemented** in TypeScript monorepo. E2E harness: Tier A (mock LLM + Docker Postgres) in CI; Tier B (live MiniMax) via `E2E_LLM=1` / nightly workflow.

**Production (Zeabur):** `0.0.1-w7` live; `0.0.1-w8` pending redeploy after push.

## What works

- **W0–W7:** (see prior waves — platform through cron/webhook + rate limits)
- **W8:** `ORBITA_E2E_MOCK` runner; `scripts/e2e-tier-a.sh` + `scripts/e2e-tier-b.sh`; `scripts/smoke-prod.sh` (trajectory + tool checks); GitHub Actions CI + nightly
- **Zeabur (Ocean):** https://orbita-api.zeabur.app — Git deploy from `main`

## Known gaps / deferred

- Anthropic failover path does not run tool loop (plain text only)
- Credential rotation
- Skill library minimal (`core` only); tools registry small (W9 target)

## Wave roadmap (prioritized)

| Wave | Focus | Status |
|------|-------|--------|
| **W8** | E2E harness + prod smoke automation | ✅ Done |
| **W9** | Practical tools expansion + skill/profile library | ⏳ Next |
| **W10** | Ops hardening: trajectory replay, multi-replica notes, eval tooling | ⏳ Planned |

See `docs/product-architecture.md` for per-lane next steps.
