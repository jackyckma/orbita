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

## Learned User Preferences

- Auto commit and push after each meaningful wave without asking, unless a critical irreversible decision is pending.
- Advance through implementation waves (W0, W1, …) autonomously; stop only for critical irreversible decisions.
- For non-critical or easily reversible decisions, proceed with best judgment rather than blocking for confirmation.
- After deployment, smoke-test production (`GET /v1/health` and a representative API flow) before continuing to the next wave.

## Learned Workspace Facts

- Orbita is an agent-native, API-first HTTP system whose primary users are other AI systems (not human chat).
- Authoritative design spec: `usr/ORBITA_DESIGN.md`; wave roadmap in `docs/product-architecture.md`.
- Not related to Jacky's OpenClaw orchestration or the public `openclaw/openclaw` repo.
- pnpm monorepo with lane packages (`@orbita/*`) composed in `apps/orbita-api`.
- Deploy: Zeabur on Ocean dedicated server; GitHub `jackyckma/orbita`, branch `main`, public API `https://orbita-api.zeabur.app`.
- LLM stack: MiniMax-M3 primary, Anthropic fallback; disclose failover in `execution_meta`.
- Postgres + pgvector via Drizzle; all session/memory state externalized (no in-process session state).
- Development methodology from [ai-dev-methodologies](https://github.com/jackyckma/ai-dev-methodologies), synced into `.agents/instructions/`.
