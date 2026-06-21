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

## W9 — Tools & skills

- Seven tools in `@orbita/tools`; HTTP tools enforce HTTPS + optional `ORBITA_HTTP_ALLOWED_DOMAINS`.
- Trajectory emits `tool_call_start` / `tool_call_complete` per invocation (args redacted).
- Profiles: `default`, `research`, `coding` with skill markdown in `profiles/skills/`.
- Anthropic failover runs the same tool loop as MiniMax when `allowed_tools` is non-empty.
