# Agent Instructions (Codex / OpenAI coding agents)

Read **`.agents/instructions/`** before non-trivial work:

1. [METHODOLOGIES.md](https://github.com/jackyckma/ai-dev-methodologies/blob/main/METHODOLOGIES.md) — or local copy if vendored
2. `.agents/instructions/karpathy-guidelines.md`
3. `.agents/instructions/project-guidelines.md`
4. `.agents/instructions/agent-tooling-guardrails.md`
5. `.agents/instructions/session-handoff.md` — when resuming or ending a session
6. `.agents/instructions/framework-adoption.md` — when bootstrapping or syncing methodology

When **resuming**, read `docs/SESSION_HANDOFF.md` first.

Optional: `.agents/instructions/lane-based-development.md` for multi-module products.

Do not duplicate long policy here — keep this file a thin pointer.

## Git workflow

Branch from **`main`**, open PR to **`main`**, unless `project-guidelines.md` states otherwise.

## Cloud Agent sessions

Run `scripts/setup-cloud-agent-env.sh` if present, then `scripts/agent-verify.sh` before handoff.

See `docs/AGENT_ENV.md` for local vs cloud capability matrix.

## Wave completion

After each **shipped wave**, update the marketing site version log (`apps/orbita-web/public/updates.html` by date) and deploy with `./scripts/deploy-web.sh`. Full checklist: `.agents/instructions/project-guidelines.md` → **Wave completion checklist**.

## Learned User Preferences

- Auto commit and push after each meaningful wave without asking, unless a critical irreversible decision is pending.
- Advance through implementation waves (W0, W1, …) autonomously; stop only for critical irreversible decisions.
- For non-critical or easily reversible decisions, proceed with best judgment rather than blocking for confirmation.
- After deployment, smoke-test production (`GET /v1/health` and a representative API flow) before continuing to the next wave.
- Poll orchestrate runs regularly; merge when workers complete, report status, then advance to the next wave.
- Prefer a single monorepo for API and marketing web (`apps/orbita-api`, `apps/orbita-web`, shared `packages/*`).
- Prefer 繁體中文 for product alignment, planning, and status discussions (English for code/commits unless asked otherwise).

## Learned Workspace Facts

- Orbita is an agent-native, API-first HTTP system whose primary users are other AI systems (not human chat).
- Authoritative design spec: `usr/ORBITA_DESIGN.md`; W0–W14 shipped; ongoing waves in `docs/product-architecture.md`.
- Not related to Jacky's OpenClaw orchestration or the public `openclaw/openclaw` repo.
- pnpm monorepo: `apps/orbita-api` (API), `apps/orbita-web` (marketing), lane packages (`@orbita/*`).
- Split deploy: production API on Zeabur at `https://api.get-orbita.com`; marketing site `get-orbita.com` on Cloudflare Pages (static HTML, not Workers routes).
- Public changelog at `get-orbita.com/updates`; GitHub `jackyckma/orbita`, branch `main`.
- API-as-product: invite-only phased launch (waitlist → billing SaaS); see `docs/api-as-product.md`.
- Personal use and self-host roadmap in `docs/self-host-and-extensions.md`.
- Marketing agent use case is a doc-only draft at `docs/use-cases/marketing-agent.md` (not implemented).
- Cloudflare API token IP allowlists may block wrangler IPv6; Pages deploy uses IPv4 (see `scripts/deploy-web.sh`).
- LLM stack: MiniMax-M3 primary, Anthropic fallback; disclose failover in `execution_meta`.
- Postgres + pgvector via Drizzle; all session/memory state externalized (no in-process session state).
