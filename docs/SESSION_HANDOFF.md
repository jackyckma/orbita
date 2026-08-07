# Session handoff

**Last updated:** 2026-08-07

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
