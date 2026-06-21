# Implementation notes

## 2026-06-21 — W7 scheduler cron/webhook update

- Scheduler cron parsing uses `cron-parser` for structured cron expressions only.
- `session_jobs` now supports two explicit schedule modes:
  - fixed-window interval via `every_seconds`
  - cron expression via `cron` + persisted `next_run_at`
- Job creation enforces exactly one schedule mode (`every_seconds` XOR `cron`) to keep scheduler behavior deterministic.
- Webhook delivery only posts to caller-supplied `output_routing.webhook_url`; the system never infers its own public URL.

## 2026-06-21 — W7 per-key rate limiting update

- Rate limiting uses a fixed-window-per-minute algorithm for predictable behavior and simple operational debugging.
- Effective limit resolves as `api_keys.rate_limit_per_minute` override when present, otherwise `RATE_LIMIT_PER_MINUTE` env default.
- Counter state is persisted in Postgres (`rate_limit_counters`) with atomic `INSERT ... ON CONFLICT ... DO UPDATE` increments for multi-replica correctness.
- Precise token-bucket/sliding-window behavior is intentionally deferred; fixed-window is the current tradeoff for v1 simplicity + replica safety.
