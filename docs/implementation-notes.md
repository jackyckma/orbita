# Implementation notes

## 2026-06-21 — W7 scheduler cron/webhook update

- Scheduler cron parsing uses `cron-parser` for structured cron expressions only.
- `session_jobs` now supports two explicit schedule modes:
  - fixed-window interval via `every_seconds`
  - cron expression via `cron` + persisted `next_run_at`
- Job creation enforces exactly one schedule mode (`every_seconds` XOR `cron`) to keep scheduler behavior deterministic.
- Webhook delivery only posts to caller-supplied `output_routing.webhook_url`; the system never infers its own public URL.
