# Session handoff

**Last updated:** 2026-10-08

## Latest change (2026-10-08)

`/v1/mcp` access log is one info line `mcp request` for every status: JSON-RPC method names, per-message result or error code (message truncated to 300), and `tools/list` tool count. GET SSE is not read. `ORBITA_MCP_ACCESS_LOG=0` turns it off (unset or `1` stays on). Response bodies are unchanged. Not deployed yet — after deploy, a ChatGPT `tools/list` should show `tool_count` or a JSON-RPC error code inside HTTP 200.

## Previous change (2026-10-08)

Stateless `POST /v1/mcp` drops `MCP-Protocol-Version: 2026-07-28` before the v1 transport (that header was HTTP 400 in ~5ms, so ChatGPT never listed tools). Other unknown protocol versions still 400. `server/discover` is still unimplemented.

## Earlier (2026-09-30)

Cron harness tick no longer wedges after one failed slot: `next_run_at` advances on every terminal cron outcome (`last_run_at` still means last success), and a repeat fingerprint warns `harness run skipped: already attempted for this slot; advanced next_run_at`. After deploy, `portfolio-git-collect` (`c46c8213-308b-4391-abfe-f00eb037d4b6`) runs at the next 06:00 UTC; a collector that is still failing logs `harness run failed`.

## Metadata

| Item | Value |
|------|--------|
| Branch | `main` |
| Prod API | https://api.get-orbita.com — **`0.0.1-w35`** |
| Marketing site | https://get-orbita.com |
| Autopilot | Maker/Checker twice daily — see `docs/autopilot/` |

## Active focus

1. **Autopilot fuel** — E-02 notes export (T-0010…), E-03 harness status (T-0020), E-04 note_search (T-0030).
2. **Founder decision D-001** — personal notes seed approach (default: manual via Claude Desktop).
3. **L2 dogfood** — re-verify supply/poll after pause when ready.

## Do not

- Merge unrelated `cursor/*` PRs without `T-xxxx` in title (Checker filter enforces this).
- Invent personal-jacky note content in Maker without D-001 → B.

## Verify

```bash
curl -fsS https://api.get-orbita.com/v1/health
node scripts/autopilot/decide-next-action.mjs --lane maker
node scripts/autopilot/queue-status.mjs
```

## Key paths

| Topic | Path |
|-------|------|
| Autopilot | `docs/autopilot/` |
| Personal steward | `docs/personal-steward/` |
| Lanes | `docs/DEVELOPMENT_LANES.md` |
