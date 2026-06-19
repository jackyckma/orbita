# Orbita — Agent-Native, API-First Agent System

**Status:** Draft v0.1 — design discussion output, intended as the foundation spec for implementation by a coding agent.

**Project relationship note:** This project is independent from Jacky's existing "OpenClaw" multi-agent orchestration system. No code or architecture is shared between them. It is also unrelated to the public `openclaw/openclaw` GitHub repository, which is a separate, human-facing personal-assistant project that happens to share a name.

---

## 1. Purpose & Core Premise

Orbita is an agent system whose **primary users are other AI systems** (e.g. Claude, Cursor AI, another LLM-driven orchestrator) — not humans interacting via chat. This single premise drives every architectural decision below and is the reason Orbita deliberately diverges from mature open-source agent systems like OpenClaw (public) and Hermes Agent, both of which are built around a human-facing, multi-channel chat gateway.

### Design tenets

- **API-first, not channel-first.** No chat platform bridges (WhatsApp/Telegram/Slack/etc.), no voice, no GUI dashboard, no native desktop/mobile apps. These are explicitly out of scope.
- **Session-based, not connection-based.** Callers hold a `session_id` and interact via stateless HTTP request/response. No persistent socket is required for normal operation.
- **Structured over natural language.** Since both caller and callee are AI systems, request/response payloads default to structured JSON fields rather than free-form natural language, wherever a structured representation is possible.
- **State lives outside the process.** No in-memory session state. Everything persists in an external store (Postgres/pgvector on Jacky's existing infrastructure) so the system can run identically on localhost, a remote server, or an auto-scaled PaaS deployment (e.g. Zeabur) without code changes.
- **Lean attack surface.** Every feature inherited "by default" from mature systems (OpenClaw/Hermes) must be an explicit yes/no decision — not an unconscious inheritance. See Section 11 for the full decision log.

---

## 2. Identity Model

Two distinct identity concepts, intentionally decoupled:

| Concept | Definition | Used for |
|---|---|---|
| **Caller** | The system/process making the API call, authenticated via API key | Auth, rate limiting, audit trail of *who called* |
| **Client ID** | The actual "owner" of state — can be a person, a project, or any logical entity | Memory scoping, session ownership, billing/quota grouping (future) |

**Relationship:** Many-to-many. A single API key (caller) may act on behalf of multiple Client IDs (e.g. one orchestration system serving multiple projects). A single Client ID may also be accessed via multiple different callers over time.

**Critical security rule:** The `client_id` a request operates under is **not freely declarable** by the caller. Each API key has an explicit allow-list of `client_id`s it may act on behalf of, checked server-side on every request. This prevents a compromised or buggy caller from reading/writing another client's long-term memory.

```
api_key  →  [allowed client_ids]  →  client_id (declared per-request) → session → memory
```

---

## 3. Authentication & Onboarding

### v1: Pre-issued API Keys

No self-service registration, no OAuth login page, no email verification flow — these are explicitly deferred (see Roadmap).

```
POST /v1/admin/api-keys          (admin-only)
{
  "allowed_client_ids": ["project-german-recruiting"],
  "scopes": ["sessions:create", "sessions:use"],
  "expires_at": "..."
}
→ returns plaintext key ONCE; only a hash is stored thereafter

DELETE /v1/admin/api-keys/{key_id}   (revocation — required even in v1)
```

Every request authenticates via `Authorization: Bearer <api_key>`. Revocation must exist from day one even though only Jacky issues keys initially.

### Roadmap (not v1)
- Self-service registration / multi-tenant onboarding flow, once this becomes a product surface beyond personal/internal use.

---

## 4. Session Lifecycle

Sessions are explicit, persisted objects — not tied to a connection.

```
POST   /v1/sessions                         create a session
GET    /v1/sessions/{id}                    fetch session state
GET    /v1/sessions/{id}/messages?since=... fetch history (supports polling / async patterns)
POST   /v1/sessions/{id}/messages           send input, get a response (sync or streamed)
POST   /v1/sessions/{id}/compress           manually trigger early context compression
DELETE /v1/sessions/{id}                    end session
```

**Asynchronous-friendly by design:** because callers are AI systems that may dispatch a task and "come back later," `GET /v1/sessions/{id}/messages?since=...` is a first-class polling mechanism, not an afterthought.

`agent_profile` is selected explicitly at session creation (no automatic routing by inferred identity — Jacky's call: routing should be deliberate, not inferred).

---

## 5. Context Management

- **No automatic compression by default mode toggle.** Instead: a hard ceiling (token-count based) that force-triggers compression as a safety net, **plus** an explicit endpoint the caller can use to compress early:
  ```
  POST /v1/sessions/{id}/compress
  ```
- **Prompt cache continuity is a hard constraint.** Because LLM API cost is materially affected by prompt caching, the serialized history format must remain byte-stable across turns whenever possible. This has direct implications for:
  - Skills must be **bound at session creation and immutable for the session's lifetime** (see Section 7) — dynamic mid-session skill loading would break cache prefixes.
  - History edits/deletions mid-session should be avoided or treated as cache-breaking operations explicitly flagged in the response metadata.

---

## 6. Long-Term Memory

- Memory is **scoped to Client ID**, not to caller and not necessarily to "the human behind the caller." Any session operating under the same Client ID shares the same long-term memory store.
- This is a deliberate, important decision: it allows memory to represent a *person* or a *project*, decided per use case at the Client ID level — the system itself is agnostic to which.

---

## 7. Skills System

**Decision: include, but v1 scope is deliberately minimal** to avoid the trade-offs below.

Trade-offs considered:
1. **Security** — a Skill is effectively externally-loadable instructions/code; it's a prompt/code-injection surface. v1 avoids this by not supporting dynamic third-party skill upload.
2. **Cache stability** — skill changes mid-session break prompt cache (see Section 5).
3. **Complexity** — dynamic load/discover/inject machinery conflicts with the "stay lean" principle.

**v1 implementation:** Skills are static markdown/config files, selected as a set at session creation via `agent_profile`, and **locked for the session's lifetime**. No hot-reloading, no mid-session skill mutation, no third-party skill marketplace.

**Roadmap:** Dynamic/hot-pluggable skills, community/shared skill sources — only once the security and cache implications have a concrete mitigation design.

---

## 8. Tools & Sandboxed Execution

Sandbox execution tiers are **kept** (unlike browser/desktop automation, which is explicitly excluded — see Section 11). Supported backend tiers, pluggable:

| Backend | Isolation | Ops burden | Startup |
|---|---|---|---|
| Local | Minimal | Lowest | Fastest |
| Docker (self-hosted) | Container-level | Self-managed lifecycle/cleanup | Fast |
| SSH (remote host) | Depends on remote host hardening | Self-managed remote host | Medium |
| E2B (managed cloud sandbox service) | Strong — fresh isolated sandbox per execution | Near-zero (third-party managed), but adds external dependency + cost | Slower (cold start) |

E2B is a managed third-party service that spins up an ephemeral, strongly isolated cloud sandbox per execution, then discards it. Treated as one pluggable backend option, not a v1 requirement — relevant if self-hosted Docker isolation is judged insufficient later.

**Rationale for keeping sandboxing:** AI callers may produce unexpected tool-call chains more readily than human users typing commands, so this tier is considered necessary risk mitigation, not optional polish.

---

## 9. Secrets / Credential Management

**Principle: callers and the LLM context never see plaintext credentials.**

```
POST /v1/credentials              (admin-only)
{
  "client_id": "...",
  "name": "notion_token",
  "secret": "...",                 // write-once; never returned in plaintext again
  "scope": ["notion:write"]
}

GET  /v1/credentials              // lists names + scopes only, never plaintext
```

Tool definitions reference credentials indirectly:
```json
{ "credential_ref": "notion_token" }
```
At execution time, the system resolves the reference, injects the secret into the outbound tool call (e.g. an HTTP header), and discards it immediately after. The LLM context only ever observes "tool succeeded/failed" — never the secret value. Trajectory/audit logs must explicitly redact credential values, recording only the credential reference and call outcome.

---

## 10. Multi-Provider / Model Failover

- **Included in v1.** Motivation: Jacky uses multiple LLM API providers, several on subscription plans with quota/rate limits — failover provides practical continuity, similar in spirit to OpenRouter / OpenClaw's model-switching.
- **Failover trigger:** based on provider error codes (rate limit, quota exhausted, etc.) — no independent usage-tracking layer in v1.
- **Transparency requirement:** when failover occurs, the response **must** disclose this via structured metadata (not left for the caller to infer from natural language):
  ```json
  {
    "output": { ... },
    "execution_meta": {
      "model_used": "claude-sonnet-4-6",
      "failover_occurred": true,
      "primary_provider_error": "rate_limit_exceeded"
    }
  }
  ```
- **No automatic multi-agent routing by inferred source.** Routing to a specific `agent_profile` / workspace is always an explicit caller decision via request parameters — not inferred automatically from caller identity.

---

## 11. Structured I/O Convention

Because both ends of the conversation are AI systems, Orbita defaults to **structured JSON fields over natural language** wherever a structured representation is possible. Natural language remains supported, but only as one explicit mode — not the default carrier of meaning.

**Input** supports both modes explicitly:
```json
{ "input": { "type": "structured", "intent": "summarize_document", "params": { "doc_id": "...", "max_length": 500 } } }
```
```json
{ "input": { "type": "text", "text": "..." } }
```

**Output** separates structured data from any natural-language rendering:
```json
{
  "output": {
    "structured": { "summary": "...", "key_points": [...] },
    "natural_language": "..."   // optional, only if caller requests it
  },
  "execution_meta": { ... }
}
```

`GET /v1/capabilities` exposes supported `intent`/`params` as a machine-parsable schema (JSON Schema–like), so a caller AI can validate compatibility programmatically rather than inferring it from documentation prose.

---

## 12. Scheduler

**Included in v1, built-in (not natural-language scheduling).** Since callers are other agents/systems, scheduling is configured via structured API calls, not natural-language requests.

```
POST /v1/sessions/{id}/jobs
{
  "schedule": "cron-expression-or-equivalent",
  "task": { ... },
  "output_routing": {
    "mode": "poll" | "webhook" | "external_write",
    "webhook_url": "...",            // if mode = webhook
    "external_target": { ... }       // if mode = external_write, e.g. Notion/Google Docs — requires its own tool credential scope, see Section 9
  }
}
```

Output routing is configured **per job**, not globally. The three modes (poll/webhook/external_write) are not mutually exclusive in the system design — a job could in principle support more than one — but v1 requires exactly one declared mode per job to keep behavior unambiguous.

Jobs that write to external systems require their own scoped credentials (Section 9), since they execute unattended without a caller present to supervise.

---

## 13. Observability / Trajectory Logging

- **Included in v1, exposed via API**, not just internal logs:
  ```
  GET /v1/sessions/{id}/trajectory
  ```
- Output is structured (JSON), not prose — designed so a caller AI can parse, audit, and potentially replay execution steps, not just a human reading logs.
- Must redact secrets per Section 9.

### Roadmap (not v1)
- Automated evaluation / self-verification (LLM judge, PRM-style scoring). Considered important for long-term reliability, but deferred.

---

## 14. Deployment Model

Designed to run identically across three target environments without code changes, following 12-factor-app principles:

1. **Localhost CLI** (e.g. launched by Cursor AI / Claude Code on the same machine)
2. **Remote server** (Jacky's home server or DigitalOcean droplet, behind Cloudflare Tunnel)
3. **Zeabur** (GitHub-connected auto-deploy, environment-variable configuration) — the preferred target

### Requirements for cross-environment compatibility
- **All configuration via environment variables** (`PORT`, `DATABASE_URL`, `SECRETS_VAULT_KEY`, `DEFAULT_MODEL_PROVIDER`, etc.) — no hardcoded paths/hosts.
- **No in-process state.** Sessions, memory, trajectory logs all persist to the external Postgres/pgvector store. This is required for correctness under Zeabur's potential multi-replica deployment, and for surviving local/remote restarts.
- **No assumptions about the system's own public URL.** Webhook targets are always caller-supplied, not self-inferred — relevant since the deployment may sit behind a reverse proxy / Cloudflare Tunnel.
- **Health check endpoint required in v1:**
  ```
  GET /v1/health
  ```

### Environment-specific notes
- **Localhost:** binds to `127.0.0.1` by default (no external exposure); API key auth still required even on localhost, to avoid accidental exposure later if a port is forwarded.
- **Remote server:** TLS required (reuse existing Cloudflare Tunnel setup); strict auth + rate limiting required.
- **Zeabur:** must support GitHub-connected auto-deploy with env-var-only configuration; verify secrets vault initialization works correctly across (re)deploys and potential multi-replica scaling.

### Priority order for implementation
1. Docker container (build/test locally against existing home-server Docker infrastructure)
2. Zeabur (same Docker image, different host)
3. Localhost CLI / packaged binary (deferred — requires separate packaging/distribution work, lower priority)

### Explicitly out of scope for v1
- Serverless/edge function deployment (e.g. Cloudflare Workers, Lambda) — philosophically compatible with the stateless design, but not a v1 target due to execution time limits on long-running agent tasks. Worth validating compatibility later as a sanity check on the "stateless + external state" principle, not as an active deliverable.
- Embedding Orbita as an in-process library/SDK (bypassing HTTP entirely) — would require maintaining two parallel interfaces (HTTP + library) and is deferred unless a concrete need arises.

---

## 15. Explicit Feature Decisions (Inclusion / Exclusion Log)

This log exists specifically to prevent unconscious inheritance of features from mature systems like OpenClaw (public) and Hermes Agent.

| Feature | Decision | Notes |
|---|---|---|
| Context compression | ✅ Include | Hard ceiling + caller-triggered early compression (not a mode toggle) |
| Prompt cache continuity | ✅ Include (hard constraint) | Drives skills immutability, history-edit avoidance |
| Session lineage / fork | ❌ Excluded (v1) | Especially complex with tool usage involved |
| Long-term cross-session memory | ✅ Include | Scoped to Client ID, not caller |
| Skills system | ✅ Include (minimal v1) | Static, session-locked, no dynamic/third-party loading in v1 |
| Subagent delegation / agent-to-agent | ❌ Excluded (v1) | Roadmap item; most needs met by a single first-layer agent for now |
| Sandboxed tool execution (Local/Docker/SSH/E2B) | ✅ Include | Risk mitigation for AI-driven tool-call chains |
| Scheduler / cron jobs | ✅ Include | Structured API only, no natural-language scheduling |
| Browser automation / desktop control | ❌ Excluded | Not relevant to an API-first, non-GUI system |
| Multi-provider model failover | ✅ Include | Error-code-driven; failover is disclosed in response metadata |
| Multi-agent routing by inferred identity | ❌ Excluded | Routing is always an explicit caller parameter |
| Trajectory / execution logging | ✅ Include | Structured, API-exposed, secret-redacted |
| Evaluation / self-verification | 🗓 Roadmap | Important for reliability, not required in v1 |
| Voice (wake word, TTS) | ❌ Excluded | |
| Live visual canvas / A2UI | ❌ Excluded | |
| Chat platform bridges (WhatsApp/Telegram/etc.) | ❌ Excluded | |
| Native desktop/mobile apps, push notifications | ❌ Excluded | |
| DM pairing / human-stranger verification flow | ❌ Excluded | Irrelevant threat model; replaced by pre-issued API key model (Section 3) |
| Self-service multi-user registration | 🗓 Roadmap | Only needed if this becomes a multi-tenant product |

---

## 16. Open Items (Not Yet Decided — Flagged for Next Discussion)

- **API versioning policy.** `/v1/` prefix is the starting point, but the policy for breaking changes and version deprecation windows is not yet defined.
- **Standardized error response format.** No unified error envelope has been defined yet for 4xx/5xx responses; needed for predictable machine parsing by caller AIs.
- **Rate limiting specifics.** Acknowledged as necessary (AI callers may have very different traffic patterns than humans) but concrete limits/algorithm not yet defined.
- **Credential rotation workflow details** beyond the basic write-once/read-never-plaintext model.
- **Multi-replica coordination details** for the scheduler (avoiding duplicate job execution if Zeabur scales to multiple instances).

---

## 17. Glossary

- **Caller** — the authenticated system making an API request (identified by API key).
- **Client ID** — the logical owner of session/memory state; may represent a person or a project; decoupled from caller identity.
- **Session** — a persisted, addressable unit of conversation/context, identified by `session_id`, not tied to a live connection.
- **Agent Profile** — a named configuration bundle (model, skills, tool permissions) selected explicitly at session creation.
- **Credential Reference** — an indirect, named pointer to a secret stored in the credential vault; never resolved to plaintext in caller-visible contexts.
