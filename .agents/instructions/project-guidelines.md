# Project Agent Guidelines — Orbita

Shared methodologies live in `.agents/instructions/` (from [ai-dev-methodologies](https://github.com/jackyckma/ai-dev-methodologies)).

## Communication language

- Respond to the user in **English** unless they ask for another language.
- Keep code, commands, file paths, and quoted source in original language.

## What this project is

**Orbita** is an agent-native, API-first agent system whose primary users are other AI systems (not human chat). See the foundation spec:

- `usr/ORBITA_DESIGN.md` — authoritative design document (read before implementation)

**Not related to:** Jacky's OpenClaw multi-agent orchestration system, or the public `openclaw/openclaw` repo.

## Core architectural constraints (from design)

- API-first, session-based HTTP — no chat bridges, GUI, voice, or browser automation
- Structured JSON I/O by default; natural language is an explicit mode only
- State externalized to Postgres/pgvector — no in-process session state
- Caller (API key) ≠ Client ID (memory/session owner); `client_id` allow-list enforced per key
- Skills bound at session creation and immutable for session lifetime (prompt cache continuity)
- Multi-provider model failover in v1; failover disclosed in `execution_meta`
- Sandbox execution tiers: Local / Docker / SSH / E2B (pluggable)
- Credentials vault: write-once secrets, never exposed to LLM or callers
- Deploy target priority: Docker → Zeabur → localhost CLI (deferred)

## Stack

| Item | Value |
|------|-------|
| Language | TypeScript (strict), Node 22 |
| HTTP | Hono + @hono/zod-openapi |
| Validation | Zod |
| Database | Postgres + pgvector via Drizzle ORM |
| Monorepo | pnpm workspaces |
| Container | Docker (primary deploy artifact) |
| Test runner | Vitest |
| App host | `apps/orbita-api` |

## Git branching

| Branch | Purpose |
|--------|---------|
| `main` | Production / deploy branch |
| `feat/*` | Feature branches |

Workflow: branch from `main` → PR → `main`.

## Deploy

| Item | Value |
|------|-------|
| Platform | Zeabur (GitHub-linked) — preferred target |
| Also supported | Localhost, remote server (Cloudflare Tunnel) |
| Zeabur project ID | Ask founder if missing |
| Service ID | Ask founder if missing |
| Public URL | TBD |
| Deploy branch | `main` |
| Health check | `GET /v1/health` (required in v1) |

Load Zeabur agent skills when doing deploy/log/env operations. Ask for IDs — do not guess.

## DNS / email (optional)

| Item | Value |
|------|-------|
| DNS provider | Cloudflare |
| Domain | TBD |
| Cloudflare token | Ask founder when DNS changes needed — never commit |

## AI providers

Orbita is a multi-provider system with failover in v1. **For testing and development:**

| Priority | Provider | Env vars |
|----------|----------|----------|
| **Primary** | MiniMax-M3 | `MINIMAX_API_KEY`, `MINIMAX_MODEL`, `MINIMAX_BASE_URL` |
| **Fallback** | Anthropic | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` |

When failover occurs, responses must include `execution_meta.failover_occurred: true`.

**Orchestration:** `CURSOR_API_KEY` is for `/orchestrate` multi-agent cloud development — not for Orbita runtime LLM calls.

Never print secret values. Keys live in `.env` (gitignored). See `.env.example`.

See `.agents/defaults/ai-providers.md` for founder defaults.

## Documentation to read before non-trivial work

1. `usr/ORBITA_DESIGN.md` — foundation spec
2. `docs/README.md`
3. `docs/CURRENT_STATUS.md`
4. `docs/SESSION_HANDOFF.md` (when resuming)
5. `docs/AGENT_ENV.md` (local vs Cloud Agent capabilities)

Update status docs in the same session when behavior or capabilities change materially.

## Methodology adoption

| Tier | Adopt? | Notes |
|------|--------|-------|
| A (core) | ✅ | All projects |
| B (lane-based) | ✅ | Multi-module API product — adopt as implementation begins |
| C (verification) | ✅ | `agent-verify.sh`, AGENT_ENV |
| D (founder defaults) | ✅ | Zeabur, Cloudflare, AI providers |

## Spec implementation notes

When implementing the design, maintain `docs/implementation-notes.md`:

- Design decisions
- Deviations from `usr/ORBITA_DESIGN.md`
- Tradeoffs
- Open items from Section 16 of the design doc

## Verification before handoff

- Local / Cloud: `./scripts/agent-verify.sh` when present
- Cloud Agents: L0+L1 only unless AGENT_ENV says otherwise
- After deploy: smoke `GET /v1/health` on staging URL (L4)
