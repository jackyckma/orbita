# AT1b harness cron status

Read-only operator view for the two prod harnesses used by ai-transformation.org dogfood.

| Role | Harness ID | Expected cron (UTC) |
|------|------------|---------------------|
| Supply | `dd839025-1200-4df4-b69b-b3454625416f` | `0 7 * * *` |
| Poll | `e4c0de60-9db6-4bb8-9845-b5c586afcc36` | `0 18 * * *` |

## How to check

```bash
./scripts/at1b-harness-status.sh
# optional: refresh this file with live timestamps
./scripts/at1b-harness-status.sh --write-report
```

Credentials: `AT_ORBITA_API_KEY` (+ `AT_ORBITA_CLIENT_ID`, default `content-ai-transformation-org`) from `at-agent/.env.local`, repo `.env`, or `~/.orbita-personal.env`. The script never prints secrets and never PATCHes harnesses.

## Freshness

- **OK** — both harnesses `enabled: true` and `last_run_at` within ~36 hours.
- **STALE** — disabled, never ran, or `last_run_at` older than 36h (exit code 2).
- Missing credentials → exit 1 with a clear message.

Live `last_run_at` / `next_run_at` are not embedded in git (they change every day). Re-run the script locally or in an env with AT client credentials to see current freshness.
