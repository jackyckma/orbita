---
status: active
maintained_by: ai-agents
created: YYYY-MM-DD
last_updated: YYYY-MM-DD
purpose: Which verification levels and tasks work in local Cursor vs Cloud Agents.
archive_when: Project no longer uses Cloud Agents.
---

# Agent environment capability matrix

Fill this in per project. Agents read it before choosing verify commands or escalating to the founder.

## Environments

| Environment | Used for | Secrets source |
|-------------|----------|----------------|
| Local Cursor | L2/L3 integration, full stack | `.env` (gitignored) |
| Cloud Agent (Cursor / Claude / Codex) | L0+L1 coding, docs | Cloud UI injection |
| CI | L0+L1 on every PR | GitHub Actions secrets |
| Zeabur staging | L4 HTTP smoke | Zeabur env vars |

## Staging URL

- **URL:** `https://<!-- your-staging -->.zeabur.app/` (or custom domain)
- **Deploy branch:** `main` / `staging` / other: ___
- **Smoke command:** `curl -sf ...` or `./scripts/smoke-staging.sh`

## Verification commands

| Level | Command | Cloud-safe? |
|-------|---------|:-----------:|
| L0 | `<!-- e.g. npm run lint -->` | ✅ |
| L1 | `<!-- e.g. npm test -->` | ✅ |
| L2 | `<!-- e.g. docker compose up + integration test -->` | ❌ local only |
| L3 | `<!-- e.g. npm run dev -->` | ❌ local only |
| L4 | `<!-- staging smoke -->` | ✅ |

## Local-only tasks

List tasks Cloud Agents must **not** attempt (hand off via SESSION_HANDOFF):

- <!-- e.g. iOS simulator build -->
- <!-- e.g. manual Stripe webhook tunnel -->

## Optional services

| Service | Required for dev? | Stub available? |
|---------|:-----------------:|:---------------:|
| PostgreSQL | | |
| Redis | | |
| External LLM API | | fixtures in `data/fixtures/` |

## Founder defaults (optional)

- [ ] Zeabur deploy — see `.agents/instructions/` or vendor `defaults/zeabur.md`
- [ ] Cloudflare DNS/email
- [ ] Minimax default LLM
