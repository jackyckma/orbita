# Implementation notes

**Maintained by:** ai-agents

## W7 — Scheduler cron + webhook

- Cron parsing uses `cron-parser` (structured expressions only; no natural-language scheduling).
- Jobs accept **exactly one** of `every_seconds` or `cron`.
- `next_run_at` is stored for cron jobs and recomputed after each run.
- Webhook delivery POSTs JSON to caller-supplied `webhook_url` only (never inferred). Failures are logged, not thrown from the tick loop.

## W7 — Rate limiting

- Fixed-window per-minute limiter backed by Postgres `rate_limit_counters` (multi-replica safe).
- Effective limit: `api_keys.rate_limit_per_minute` if set, else env `RATE_LIMIT_PER_MINUTE` (default 120).
- HTTP 429 with `rate_limited` code and `Retry-After` header when exceeded.
- Token-bucket / sliding-window deferred.
