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

## Marketing agent workspace

Local folder **`marketing-agent/`** (gitignored except `README.md`) holds brand voice, runbooks, and Orbita **caller** setup — not platform code. For marketing tasks: read that folder and operate `api.get-orbita.com` as a user; do not modify `packages/*` unless fixing the platform. Template: `docs/templates/marketing-agent-workspace.md`. Progress: `docs/marketing-agent-plan.md` (MA0–Mn); dogfooding feedback → `marketing-agent/feedback-to-orbita.md`.

## Learned User Preferences

- Auto commit and push after each meaningful wave without asking, unless a critical irreversible decision is pending.
- Advance through implementation waves (W0, W1, …) autonomously; stop only for critical irreversible decisions.
- For non-critical or easily reversible decisions, proceed with best judgment rather than blocking for confirmation.
- After deployment, smoke-test production (`GET /v1/health` and a representative API flow) before continuing to the next wave.
- Poll orchestrate runs regularly; merge when workers complete, report status, then advance to the next wave.
- Prefer a single monorepo for API and marketing web (`apps/orbita-api`, `apps/orbita-web`, shared `packages/*`).
- Always respond in 繁體中文 for user-facing communication (English for code/commits unless asked otherwise).
- Prefer Zeabur ZSend (`api.zeabur.com`) over Resend for outbound instance email.

## Learned Workspace Facts

- Orbita is an agent-native, API-first HTTP system whose primary users are other AI systems (not human chat).
- Authoritative design spec: `usr/ORBITA_DESIGN.md`; W0–W19 shipped (w16 inbound adapter, w19 async inbound); session profile snapshots immutable after creation; ongoing waves in `docs/product-architecture.md`.
- Not related to Jacky's OpenClaw orchestration or the public `openclaw/openclaw` repo.
- pnpm monorepo (`apps/orbita-api`, `apps/orbita-web`, `@orbita/*`); Postgres + pgvector via Drizzle; split deploy: production API on Zeabur at `https://api.get-orbita.com` (service ID `6a37d3a09f5fe35a4aa63552`, version track `0.0.1-w*`), marketing site `get-orbita.com` on Cloudflare Pages (static HTML, not Workers routes).
- Public changelog at `get-orbita.com/updates`; GitHub `jackyckma/orbita`, branch `main`.
- API-as-product phased launch: Phase 1 waitlist live at `get-orbita.com/waitlist`; invite-only before billing SaaS; see `docs/api-as-product.md`.
- Marketing Agent application track (MA0–MAn) runs parallel to W waves; gitignored workspace `marketing-agent/`; plan at `docs/marketing-agent-plan.md`.
- Platform ships `memory_put`/`memory_get` tools and `marketing` agent profile.
- Public docs: single source `docs/site/` → `./scripts/build-web-docs.sh` → `get-orbita.com/docs`.
- Instance email: Cloudflare Worker inbound to `POST /v1/inbound/email`; outbound via Zeabur ZSend (vault credential `zsend` on `orbita-instance`); for registration/reply handling, not email-as-command-channel.
- Admin UI: API keys, credentials, HTTP domain allow-list, waitlist—no session list, trajectory, or inbound mail viewer.
- LLM stack: MiniMax-M3 primary, Anthropic fallback; disclose failover in `execution_meta`; all session/memory state externalized (no in-process session state).
