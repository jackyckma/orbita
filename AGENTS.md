# Agent Instructions (Codex / OpenAI coding agents)

Before non-trivial work, read (in order):

1. `.agents/instructions/karpathy-guidelines.md` — coding discipline
2. `.agents/instructions/judgment-rubrics.md` — done / stuck / escalate / ask
3. `.agents/instructions/project-guidelines.md` — stack, git, deploy, language
4. `.agents/instructions/agent-tooling-guardrails.md` — MCP-first browser; no silent E2E deps

Then consult **`.agents/README.md`** — it maps every other instruction file
to its trigger (decisions, handoff, model dispatch, loops, issues,
methodology sync).

When **resuming**, read `docs/SESSION_HANDOFF.md` first.

Do not duplicate long policy here — keep this file a thin pointer. The
three entry points (`AGENTS.md`, `CLAUDE.md`,
`.cursor/rules/shared-instructions.mdc`) must name the **same** core list;
if you change one, change all three.

## Git workflow

Branch from **`main`**, open PR to **`main`**, unless `project-guidelines.md` states otherwise.

## Cloud Agent sessions

Run `scripts/setup-cloud-agent-env.sh` if present, then `scripts/agent-verify.sh` before handoff.

See `docs/AGENT_ENV.md` for local vs cloud capability matrix.

## Wave completion

After each **shipped wave**, update the marketing site version log (`apps/orbita-web/public/updates.html` by date) and deploy with `./scripts/deploy-web.sh`. Full checklist: `.agents/instructions/project-guidelines.md` → **Wave completion checklist**.

## Marketing agent workspace

Local folder **`marketing-agent/`** (gitignored except `README.md`) holds brand voice, runbooks, and Orbita **caller** setup — not platform code. **`at-agent/`** is the parallel workspace for **ai-transformation.org** dogfood (`docs/at-track-plan.md`). **Cross-project handoff with ai-transformation-io:** `~/Orbiter-AT-dogfood/` (`state/STATUS.md`, `inbox/*`) — see `PROTOCOL.md` there; not in git. **On demand only:** skill **`orbiter-handoff-check`** or user says「檢查 handoff」/「讀 Orbiter-AT-dogfood」— **do not** auto-read each turn (stop hook disabled in `.cursor/hooks.json`). For marketing tasks: read that folder only when user requests handoff check; operate `api.get-orbita.com` as a user; do not modify `packages/*` unless fixing the platform.

## Learned User Preferences

- Auto commit and push after each meaningful wave without asking, unless a critical irreversible decision is pending.
- Advance implementation autonomously on reversible decisions; stop only for critical irreversibles; project is mature—prefer slower Autopilot cadence (Maker/Checker ~2×/day) and front-load judgment-heavy decisions so later days can run unattended; AT L2 dogfood can defer vs personal multi-project hub mid-line; W15 multi-user still deferred.
- After deployment, smoke-test production (`GET /v1/health` and a representative API flow) before continuing to the next wave.
- Prefer Autopilot Maker/Checker over ad-hoc orchestrate sprawl; when using orchestrate, poll regularly, merge when workers complete, report status, then advance.
- Prefer a single monorepo for API and marketing web (`apps/orbita-api`, `apps/orbita-web`, shared `packages/*`).
- Always respond in 繁體中文 for user-facing communication (English for code/commits unless asked otherwise).
- Prefer Zeabur ZSend (`api.zeabur.com`) over Resend for outbound instance email.
- Marketing beyond X; evaluate skills catalog vs plugins; dogfood **ai-transformation.org** first — proof batch then ramp (~5/day max), not weekly 1+1 steady state; MA brand: **AI Business Life** next, **Agent Mindset** when book ships (~2–3 weeks); apprenticeship under Powerhouse + AT.org.
- Handoff/inbox polls: **`~/Orbiter-AT-dogfood/` on demand only** (skill `orbiter-handoff-check` or explicit user request); **do NOT** auto-read each turn; **do NOT POST probe drafts** to AT on auth checks (avoids `/editorial` noise).
- Social posting: meaningful draft→approve only (prior X spam ban); MA depth via per-project workspaces + shared/tested skills catalog — not plugins.
- Prefer agent-operated Zeabur CLI (`npx zeabur@latest`) and Orbita Admin API over asking user to run prod SQL or Dashboard steps; Postgres `service exec`/`psql` often 524-times out; agent shells `source` gitignored env files (`orbita/.env`, `~/.orbita-personal.env`)—not user terminal `export`.
- Commit continual-learning outputs directly (`AGENTS.md`, `.cursor/hooks/state/continual-learning*.json`) without asking.

## Learned Workspace Facts

- Orbita is an agent-native **Agent System Backend** — API-first HTTP agent runtime for AI callers and low-coupling application backends (not human chat); aligns with `usr/ORBITA_DESIGN.md`, not a product pivot.
- Authoritative design spec: `usr/ORBITA_DESIGN.md`; W0–W35 shipped (w35 MCP OAuth); next Autopilot ship w36 notes export; wave roadmap `docs/development-plan.md`; Autopilot fuel `docs/autopilot/` (Maker `0 7,19` / Checker `0 8,20` UTC in Cursor UI); mid-line product direction: multi-project central hub (`docs/personal-steward/portfolio-hub.md`); editorial poll `docs/at-editorial-poll.md`; Loop 2/4 deferred (H2/H3); `@orbita/harness` = Loop Engineering API (no `/v1/loops`); optional future `/v1/goals` semantic layer above harness; four-lane map in `docs/DEVELOPMENT_LANES.md`.
- Not related to Jacky's OpenClaw orchestration or the public `openclaw/openclaw` repo.
- pnpm monorepo (`apps/orbita-api`, `apps/orbita-web`, `@orbita/*`); Postgres + pgvector via Drizzle; split deploy: production API on Zeabur at `https://api.get-orbita.com` (service ID `6a37d3a09f5fe35a4aa63552`, version track `0.0.1-w35`), marketing site `get-orbita.com` on Cloudflare Pages (static HTML, not Workers routes); prod `web_search` via self-hosted SearXNG at `https://orbita-searxng.zeabur.app` (`deploy/searxng/`, default `ORBITA_WEB_SEARCH_PROVIDER=searxng`); public changelog at `get-orbita.com/updates`; GitHub `jackyckma/orbita`, branch `main`.
- Personal steward PA0 (`docs/personal-steward/`, `client_id: personal-jacky`): cross-project knowledge hub; prod setup complete (`~/.orbita-personal.env`); Cursor user-level skill; PA1 MCP `GET/POST /v1/mcp` (11 tools); PA1.5 OAuth+DCR for Claude Custom Connector; Claude Code uses `type:http` or CLI headers; API key auth unchanged for Cursor/scripts; D-001 notes seed = A (manual via Claude Desktop / connectors, not invented by Maker).
- API-as-product phased launch: Phase 1 waitlist live at `get-orbita.com/waitlist`; invite-only before billing SaaS; see `docs/api-as-product.md`.
- Marketing Agent track (MA0–MAn) parallel to W waves; gitignored `marketing-agent/` (`docs/marketing-agent-plan.md`); **`at-agent/`** for ai-transformation.org dogfood — **AT1a ✅** (proof E2E, 2 knowledge articles live), **AT1b harness-only** (Migration A: legacy `session_jobs` disabled; agent-initiated supply harness **07:00 UTC** + poll harness **18:00 UTC**, ~5 drafts/run; `at1b-*.sh` scripts are bootstrap/fallback only); AT prod SQLite on Zeabur volume (`SQLITE_PATH=/data/app.db`); writes via `POST /api/v1/objects/drafts` + vault `atx_write_org`; Wave 19 dedup via AT `GET /objects/catalog`; editorial feedback loop **application-layer** (`editorial/feedback` + `at1b-ingest-feedback.sh` or H1.5 `POST /v1/harnesses/{id}/feedback`—not Orbita Loop 4 auto-improve; AT editorial-review agent is **AT-side**, separate from Orbita Loop 2); cross-project handoff `~/Orbiter-AT-dogfood/`; caller secrets in gitignored `.env.local`.
- Public docs: single source `docs/site/` → `./scripts/build-web-docs.sh` → `get-orbita.com/docs`.
- Instance email: Cloudflare Worker inbound to `POST /v1/inbound/email`; outbound via Zeabur ZSend (vault `zsend` on `orbita-instance`); waitlist invite also needs ZSend env on API service; not email-as-command-channel.
- Daily quota placeholder defaults: 200 sessions / 1000 messages per `client_id` (W17/W26 hard-stop).
- Admin UI: API keys, credentials, HTTP domain allow-list, waitlist, scheduler job enable/disable (w29 PATCH)—no session list, trajectory, or inbound mail viewer.
- LLM stack: MiniMax-M3 primary, Anthropic fallback; disclose failover in `execution_meta`; all session/memory state externalized (no in-process session state).
