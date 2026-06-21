## W8 — E2E harness

### Tier A (default in CI)

- `bash scripts/e2e-tier-a.sh` — Docker Postgres + API with `ORBITA_E2E_MOCK=1` and `E2E_TIER_A=1`
- Tests: `tests/e2e/tier-a-api.test.ts` (health, mock turn, memory, cron job, rate limit 429)
- CI: `.github/workflows/ci.yml` job `e2e-tier-a`
- Local: `RUN_E2E_TIER_A=1 ./scripts/agent-verify.sh`

### Tier B (live MiniMax)

- Requires `MINIMAX_API_KEY`; set `E2E_LLM=1`
- `bash scripts/e2e-tier-b.sh` or `RUN_E2E_TIER_B=1 ./scripts/agent-verify.sh`
- Nightly: `.github/workflows/e2e-nightly.yml` (repo secrets: `MINIMAX_API_KEY`, `ORBITA_ADMIN_TOKEN`)

### Production smoke

- `scripts/smoke-prod.sh` — health, tool echo turn, trajectory `turn_complete`, memory upsert
- `RUN_SMOKE_PROD=1 ./scripts/agent-verify.sh` with `ORBITA_ADMIN_TOKEN`
