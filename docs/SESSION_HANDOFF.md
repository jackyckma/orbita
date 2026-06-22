# Session handoff

**Last updated:** 2026-06-21

## Completed

- W0–W6 on `main` (W6 includes compression + pgvector memory API)
- W5 production smoke: tool loop (`echo`), trajectory
- Zeabur Ocean deploy live at https://orbita-api.zeabur.app (Git `main`)
- W7 orchestrate kickoff: scheduler cron/webhook + rate limiting

## Production note

Zeabur health may still report `0.0.1-w5` until Git redeploy picks up W6/W7. Smoke after each deploy.

## Run locally

```bash
docker compose up -d postgres
pnpm db:migrate   # uses docker exec if psql missing
PORT=3002 pnpm dev   # 3000/3001 may be occupied
```

## Wave roadmap (updated priorities)

| Wave | Scope |
|------|--------|
| **W7** (active) | Lane 8: cron + webhook scheduler; Lanes 0/1: rate limiting |
| **W8** | E2E harness Tier A+B, `scripts/smoke-prod.sh`, verify integration |
| **W9** | Skill/profile library (Lane 2); practical tools + tool trajectory (Lane 7) |
| **W10** | Trajectory replay, multi-replica ops hardening |

## Resolved (no longer open)

- Zeabur project/service IDs — documented in `project-guidelines.md`
- pgvector embedding — MiniMax `embo-01`, 1024-dim (W6)
- Sandbox: local in-process + optional Docker tier (`docker_echo` when `ORBITA_SANDBOX_DOCKER=1`) — `docs/sandbox.md`

## Still open (founder input eventually)

- Public domain / Cloudflare TLS polish beyond Zeabur subdomain
- Credential rotation policy
- Whether Docker sandbox tier is required before more dangerous tools

## Non-critical defaults (autonomous)

- Scheduler `every_seconds` until W7 cron lands
- MiniMax thinking blocks stripped from assistant output
- Default profile: `default` with MiniMax-M3 + Anthropic fallback
