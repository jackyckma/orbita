# AT agent workspace

Dogfood workspace for **ai-transformation.org** — Orbita as caller, AT platform as write target.

- **Git:** contents gitignored except this README. Never commit API keys or write tokens.
- **Plan:** `docs/at-track-plan.md`, `docs/dogfood-plan.md`
- **AT repo runbooks:** `ai-transformation-io/.editorial-orbita/` (mirror contract; this folder is the Orbita-side operator view)

## Layout

```text
at-agent/
  README.md
  orbita-connection.md       # Orbita API + client_id + vault names
  at-platform-connection.md  # AT Agent API endpoints (read + write)
  platform-discovery.md      # AT0 notes (capabilities probe, gaps)
  products/ai-transformation-org/
    brand-voice.md           # pointer + summary
  runbooks/
    at0b-setup.md
    editorial-pipeline.md
  scripts/
    at0-verify-capabilities.sh
    at0b-setup-orbita.sh
    at0b-test-draft.sh
    at1a-submit-proof-batch.py
    at1b-setup-daily-job.sh      # once — session + cron
    at1b-setup-harness.sh        # W27 — harness editorial-supply (parallel migration)
    at1b-disable-legacy-job.sh   # migration A — disable legacy session_jobs cron (admin PATCH)
    at1b-run-daily-submit.sh     # manual trigger
    at1b-init-editorial-memory.sh  # seed backlog/feedback memory
    at1b-ingest-feedback.sh      # append founder feedback
    at1b-sync-review-outcomes.sh # operator fallback — poll AT → feedback memory
    at1b-setup-poll-harness.sh   # agent-initiated poll harness (18:00 UTC)
    at1b-patch-harness-per-run.sh # one-time — fix sticky session on supply harness
    at1b-setup-research.sh       # Tavily allow-list + vault
    at1b-build-daily-prompt.py   # prompt composer
    at-verify-published-object.sh  # post-approve verify (objects API)
  prompts/
    series-brief.md              # framework + consistency rules
    daily-submit.md              # daily workflow prompt
    poll-outcomes.md             # poll AT review outcomes → feedback memory
  data/
    editorial-backlog-seed.json
    research-recommendations.json
  feedback-to-orbita.md
  .env.local.example
```

## Status

- ✅ AT0 — capabilities probe + workspace
- ✅ AT platform Q&A — `docs/at-platform-answers.md`
- ✅ **AT0b** — vault `atx_write_org` + HTTP allow-list
- ✅ **AT1a** — 4-draft proof batch published via `/editorial`
- ✅ **AT1b** — daily supply via **Harness** `editorial-supply@v1` (`at1b-setup-harness.sh`, cron `0 7 * * *` UTC); legacy `session_jobs` disabled after migration A
