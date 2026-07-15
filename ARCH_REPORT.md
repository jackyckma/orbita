# Architecture Audit Report
Generated: 2026-07-15T01:20:04Z

---

## Summary Table

| Category | Total | HIGH | MED | LOW |
|---|---|---|---|---|
| Module Boundaries | 4 | 2 | 2 | 0 |
| Inconsistent Patterns | 8 | 8 | 0 | 0 |
| Separation of Concerns | 3 | 0 | 3 | 0 |
| Abstraction & DRY | 4 | 0 | 4 | 0 |
| Single Source of Truth | 4 | 3 | 1 | 0 |
| Dependency Direction | 4 | 2 | 2 | 0 |
| Configuration & Secrets | 6 | 5 | 1 | 0 |
| Documentation Drift | 6 | 2 | 4 | 0 |
| TOTAL | 39 | 22 | 17 | 0 |

---

## Findings

### [MOD] Module Boundaries
| Severity | File | Issue |
|---|---|---|
| HIGH | `packages/lane-admin/src/observability.ts` | Lines 47–168 and 286–534 query or mutate `sessions`, `messages`, `api_keys`, `rate_limit_counters`, `trajectory_events`, `session_jobs`, and `waitlist_entries` directly. Admin therefore bypasses the owning lanes' services and depends on undeclared table contracts; `packages/lane-admin/package.json:14-24` does not even declare several of those lane dependencies. |
| HIGH | `apps/orbita-api/src/inbound-email.ts` | Lines 27–29 and 104–130 store sender-to-session pointers and complete raw inbound messages in semantic `client_memories`. Integration control state is mixed with long-term knowledge, so opaque IDs and mail bodies can be embedded and retrieved as agent memory. |
| MED | `packages/lane-platform/src/types/io.ts` | Lines 3–45 define message input, model execution metadata, agent output, and prompt conversion even though `packages/lane-platform/INTERFACE.md:11-14` limits this lane to shared HTTP infrastructure and explicitly excludes agent behavior. |
| MED | `apps/orbita-api/src/index.ts` | Lines 143–215 implement memory enrichment, note mapping, tool trajectory semantics, and turn orchestration; lines 345–389 implement scheduled agent workflow. The composition root owns application behavior instead of only constructing and mounting dependencies. |

### [PAT] Inconsistent Patterns
| Severity | File | Issue |
|---|---|---|
| HIGH | `packages/lane-admin/src/middleware.ts` | Lines 8–11 bypass admin authentication for every path containing `/session`, not only the login endpoint. This includes cross-client routes such as `/sessions`, `/sessions/{id}`, and trajectory replay defined at `packages/lane-admin/src/observability-routes.ts:86-170`. |
| HIGH | `packages/lane-scheduler/src/routes/jobs.ts` | Lines 111–162 poll all jobs every five seconds and execute side effects before updating schedule state, with no transaction, claim, lease, or lock. Slow runs can overlap on one replica, and every additional API replica can execute the same job. |
| HIGH | `packages/lane-harness/src/tick.ts` | Lines 19–66 use a minute-truncated fingerprint and a select-then-insert claim; lines 98–123 do not advance `nextRunAt` after failure; lines 134–172 run an unguarded five-second interval. Concurrent claims can throw, second-level cron events collide, and one failed due run can permanently block that harness schedule. |
| HIGH | `packages/lane-agent/src/runtime.ts` | The provider `try/catch` blocks at lines 144–185 and 211–251 also wrap tool execution and trace serialization, then classify any failure as a provider error. Lines 358–389 fail over on every `ProviderCallError`, so a completed side-effecting tool can be replayed against the fallback provider. |
| HIGH | `packages/lane-sessions/src/routes/sessions.ts` | `include_natural_language` defaults to true at lines 141–144 and is passed at 170–177, but `AgentTurnRunner` has no such field (`services/history.ts:117-122`) and the runtime hardcodes true (`lane-agent/src/runtime.ts:296-305`). Caller choice and the structured-first design contract are ignored. |
| HIGH | `packages/lane-sessions/src/services/sessions.ts` | Lines 166–173 compute the next message sequence by reading the current maximum, then lines 190–234 insert user and assistant rows separately. The database has only a non-unique index (`apps/orbita-api/migrations/init.sql:26-37`), so concurrent turns can create duplicate or interleaved sequence numbers. |
| HIGH | `packages/lane-waitlist/src/service.ts` | Lines 100–151 mark an entry approved, create an API key, and send email as separate irreversible steps. A later failure leaves an approved row that lines 115–117 refuse to retry, potentially losing the only plaintext copy of a newly issued key. |
| HIGH | `apps/orbita-api/src/inbound-email.ts` | Lines 98–130 do not atomically claim `message_id`; lines 160–186 return `queued: true` for an in-process floating promise with no durable queue, retry, or outbox. Email retries can duplicate agent side effects, while process restarts can silently lose accepted work. |

### [SOC] Separation of Concerns
| Severity | File | Issue |
|---|---|---|
| MED | `apps/orbita-api/src/inbound-email.ts` | Lines 92–103 and 145–157 combine transport authentication, profile selection, sender-thread policy, prompt construction, ZSend endpoint selection, credential naming, and reply policy in one HTTP route adapter. |
| MED | `packages/lane-scheduler/src/routes/jobs.ts` | Lines 34–108 combine OpenAPI transport, validation, persistence, and response mapping; lines 111–163 place the background worker and webhook orchestration in the same route module. |
| MED | `packages/lane-tools/src/registry.ts` | The trace callback is typed as synchronous at line 42 and invoked without awaiting at lines 506–535. The API passes an asynchronous database write without returning it (`apps/orbita-api/src/index.ts:180-193`), so persistence failures and request completion are detached. |

### [DRY] Abstraction & DRY
| Severity | File | Issue |
|---|---|---|
| MED | `apps/orbita-api/src/index.ts` | Lines 112–120 create nine independent Postgres pools for the same URL. Their lane factories duplicate connection setup and declare maxima totaling 58 connections, rather than sharing an app-owned client and lifecycle. |
| MED | `packages/lane-agent/src/summarizer.ts` | Lines 21–57 duplicate OpenAI/Anthropic client construction and provider dispatch already implemented in `runtime.ts:97-290`. The duplicate has already diverged: raw SDK errors do not become `ProviderCallError`, so summarization failover behaves differently. |
| MED | `packages/lane-tools/src/registry.ts` | Lines 55–64 duplicate the sensitive-field regex and replacement policy in `packages/lane-trajectory/src/db/client.ts:56-63`. Both copies are shallow, so fixing one does not secure the other. |
| MED | `packages/lane-mcp/src/index.ts` | Lines 61–203 redefine memory and note commands already defined at `packages/lane-tools/src/registry.ts:206-406`. Validation has diverged: MCP accepts empty `memory_put.content`, while the LLM tool rejects it; MCP requires UUID note IDs, while the LLM tool accepts arbitrary strings. |

### [SST] Single Source of Truth
| Severity | File | Issue |
|---|---|---|
| HIGH | `apps/orbita-api/migrations/init.sql` | Lines 1–205 duplicate lane-owned Drizzle schemas and SQL migrations, while waitlist adds runtime DDL at `packages/lane-waitlist/src/service.ts:154-168`. The alternate runners are already inconsistent: `scripts/db-migrate.sh:20-27` omits scheduler cron and notes migrations, and `docker-compose.yml:12-19` omits notes. |
| HIGH | `packages/lane-scheduler/src/routes/jobs.ts` | Lines 15–23 accept arbitrary task records and `external_write`; runtime only recognizes `agent_message` (`agent-message.ts:12-30`) and treats unsupported tasks as not run, while `webhook.ts:15-17` reports every non-webhook routing mode as successful. The public schema is not the execution contract. |
| HIGH | `packages/lane-tools/src/registry.ts` | Tool JSON Schemas declare required fields, but `executeToolCall()` at lines 485–537 only parses JSON and delegates to ad hoc coercion. For example, the required `echo.text` field at lines 67–77 can be absent and still produce a successful empty echo. |
| MED | `packages/lane-trajectory/src/db/client.ts` | Lines 18–35 persist any `eventType: string` and untyped payload. Producers in `apps/orbita-api/src/index.ts:180-213` and consumers in `replay.ts:24-65` and `eval.ts:37-64` independently hardcode event names and payload fields, with no shared discriminated schema. |

### [DEP] Dependency Direction
| Severity | File | Issue |
|---|---|---|
| HIGH | `packages/lane-sessions/src/routes/sessions.ts` | Quota checks exist only in HTTP handlers at lines 68–80 and 169–177. Scheduler (`lane-scheduler/src/agent-message.ts:21-42`), harness (`lane-harness/src/service.ts:55-105`), and inbound email (`apps/orbita-api/src/inbound-email.ts:104-168`) call session services directly and bypass the advertised hard-stop policy. |
| HIGH | `packages/lane-credentials/src/service.ts` | Credential scopes are stored and listed at lines 14–77 but `resolveCredentialSecret()` at lines 80–97 decrypts by client and name without authorizing a required scope, purpose, or destination. Higher-level tools therefore depend on a vault implementation that does not enforce its own security contract. |
| MED | `packages/lane-waitlist/src/service.ts` | Lines 100–132 accept the concrete `AuthDb` and call `createApiKey` directly; `packages/lane-waitlist/package.json:12-19` exposes this cross-lane implementation dependency. Waitlist approval is tightly coupled to Auth persistence and transaction details. |
| MED | `packages/lane-agent/src/runtime.ts` | Lines 1–2 and 97–290 instantiate concrete Anthropic and OpenAI SDK clients inside turn orchestration; memory does the same for embeddings at `packages/lane-memory/src/embed.ts:1-23`. The provider-neutral tools lane also exports `OpenAI.ChatCompletionTool[]` at `lane-tools/src/registry.ts:448-463`, so swapping SDKs requires edits across core modules. |

### [CFG] Configuration & Secrets
| Severity | File | Issue |
|---|---|---|
| HIGH | `packages/lane-tools/src/registry.ts` | Lines 55–64 redact only top-level argument keys, and trajectory persistence repeats the same shallow behavior at `packages/lane-trajectory/src/db/client.ts:56-63`. Nested values such as `body.password`, headers, arrays, or nested tokens can be stored in `trajectory_events`, violating the vault redaction contract. |
| HIGH | `packages/lane-tools/src/http.ts` | Lines 19–33 validate only the initial URL and use default `fetch` redirect behavior. A permitted host can redirect `http_get` or `http_post` to an unapproved or private host; the same pattern exists in `web-search.ts:50-61,89-105`. |
| HIGH | `packages/lane-credentials/src/crypto.ts` | Lines 3–29 use one derived key and an unversioned IV/tag/ciphertext envelope, with no AAD binding to `client_id` or credential name. Ciphertexts can be substituted between rows, and rotating `ORBITA_SECRETS_KEY` makes all existing credentials unreadable. |
| HIGH | `scripts/smoke-prod.sh` | Lines 8–59 use `curl -k` while sending admin and API credentials; the same TLS bypass appears in `replay-trajectory.sh:19-25` and `eval-session.sh:23-29`. Production verification therefore accepts untrusted certificates and does not test the real TLS trust boundary. |
| HIGH | `deploy/searxng/settings.yml` | Lines 3–13 disable the limiter while enabling JSON search on a Zeabur-hosted service documented at `deploy/searxng/README.md:3-10`. The public search dependency has no application-level authentication or abuse control in this configuration. |
| MED | `packages/lane-tools/src/http-policy.ts` | Lines 6–15 keep policy in a process-global mutable singleton and lines 18–32 parse `process.env` independently of the validated platform config. Admin updates mutate only one process, so replicas and tests can observe different policies. |

### [DOC] Documentation Drift
| Severity | File | Issue |
|---|---|---|
| HIGH | `docs/traceability-index.md` | Lines 13–22 claim lane skills, contracts, and interfaces that do not exist. Seven of 14 lane packages lack `INTERFACE.md` (memory, credentials, tools, scheduler, trajectory, waitlist, MCP), while existing Profiles, Sessions, Agent, and Harness interfaces still say planned or not implemented despite active routes. |
| HIGH | `docs/SESSION_HANDOFF.md` | Lines 3–16 still identify the branch as `main`, production as w18, and inbound email as the active task. `docs/CURRENT_STATUS.md:3-20` records w34 and AT dogfood, yet agents are instructed to trust the stale handoff when resuming. |
| MED | `docs/harness-design.md` | Lines 10–13 say Harness is not implemented, and `docs/product-architecture.md:40-44,80` still marks W27 as design. The API mounts harness routes and starts its tick at `apps/orbita-api/src/index.ts:308-318,382-389`. |
| MED | `docs/site/quick-start.md` | Lines 17–23 use an unsupported admin `Authorization` header and tell users to read `api_key`; the implementation expects `x-orbita-admin-token` and returns `key`. A second runnable example reads `.session_id` at `docs/personal-steward/setup.md:70-78`, while session creation returns `.session.id`. |
| MED | `apps/orbita-web/public/index.html` | Lines 227–249 claim both auth headers are required on every request, advertise nonexistent `GET /v1/sessions`, and omit `{key}` from memory PUT/GET paths. The manually maintained public HTTP summary does not match mounted routes or OpenAPI. |
| MED | `docs/AGENT_ENV.md` | Lines 3–58 remain an unfilled template with placeholder dates, staging URL, verification commands, and service capabilities, despite `AGENTS.md` directing cloud agents to use it for environment decisions. |

---

## Recommended Action Queue

Ordered by severity. Each item must be self-contained and actionable.

1. [HIGH][PAT] `packages/lane-admin/src/middleware.ts:8-11` — Replace substring-based `/session` bypass with an exact method-and-path allow-list, and protect all cross-client session and trajectory routes.
2. [HIGH][CFG] `packages/lane-tools/src/registry.ts:55-64` — Establish one recursive, array-aware secret-redaction policy and apply it at both tool tracing and trajectory persistence boundaries.
3. [HIGH][PAT] `packages/lane-scheduler/src/routes/jobs.ts:111-162` — Atomically claim due jobs before side effects, prevent overlapping interval executions, and make claims safe across replicas.
4. [HIGH][PAT] `packages/lane-harness/src/tick.ts:19-172` — Use the full scheduled timestamp for idempotency, claim runs atomically, advance or retry failed schedules explicitly, and add a top-level worker error boundary.
5. [HIGH][PAT] `packages/lane-agent/src/runtime.ts:144-251` — Separate provider calls from tool execution and tracing so tool failures cannot be reclassified as provider failures or replayed through failover.
6. [HIGH][PAT] `packages/lane-sessions/src/services/sessions.ts:166-234` — Serialize turns per session and enforce a unique `(session_id, sequence)` database constraint.
7. [HIGH][PAT] `packages/lane-waitlist/src/service.ts:100-151` — Replace the approval flow with an idempotent provisioning state machine and durable, retryable email delivery so API keys cannot be stranded.
8. [HIGH][PAT] `apps/orbita-api/src/inbound-email.ts:98-186` — Persist and atomically claim inbound message IDs before acknowledging; dispatch from a durable queue or outbox with retry semantics.
9. [HIGH][DEP] `packages/lane-sessions/src/routes/sessions.ts:68-177` — Move quota enforcement to application/service boundaries used by HTTP, scheduler, harness, and inbound email paths.
10. [HIGH][CFG] `packages/lane-tools/src/http.ts:19-33` — Disable automatic redirects or validate every redirect hop against HTTPS, domain, and private-network policy.
11. [HIGH][MOD] `packages/lane-admin/src/observability.ts:47-534` — Replace direct cross-lane SQL with declared read-model/query interfaces and route scheduler writes through its owning service.
12. [HIGH][SST] `apps/orbita-api/migrations/init.sql:1-205` — Select one canonical migration authority and make runtime, Compose, and CLI migration paths execute the same ordered manifest.
13. [HIGH][DEP] `packages/lane-credentials/src/service.ts:80-97` — Require and enforce credential scope, intended use, and destination policy before secret resolution.
14. [HIGH][CFG] `packages/lane-credentials/src/crypto.ts:3-29` — Introduce a versioned credential envelope, bind ciphertext to tenant and credential identity, and define key rotation and rewrap behavior.
15. [HIGH][PAT] `packages/lane-sessions/src/routes/sessions.ts:141-177` — Carry output preference through `AgentTurnRunner` and honor structured-only requests instead of hardcoding natural-language output.
16. [HIGH][SST] `packages/lane-scheduler/src/routes/jobs.ts:15-23` — Publish a discriminated task/routing schema and reject unsupported task kinds and `external_write` until an actual handler exists.
17. [HIGH][SST] `packages/lane-tools/src/registry.ts:485-537` — Validate tool arguments against the published schema before dispatch and derive provider definitions from that same executable contract.
18. [HIGH][MOD] `apps/orbita-api/src/inbound-email.ts:27-130` — Move inbox records and sender-thread mappings to dedicated operational tables excluded from semantic memory and embeddings.
19. [HIGH][CFG] `scripts/smoke-prod.sh:8-59` — Remove TLS verification bypasses from all production scripts and use a trusted CA configuration where custom trust is required.
20. [HIGH][CFG] `deploy/searxng/settings.yml:3-13` — Enable request limiting or place SearXNG behind private networking or authenticated ingress.
21. [HIGH][DOC] `docs/traceability-index.md:13-22` — Rebuild the lane inventory from actual packages, add missing boundary contracts, and mark absent assets explicitly instead of linking to nonexistent files.
22. [HIGH][DOC] `docs/SESSION_HANDOFF.md:3-16` — Update the handoff to current w34 state or close it according to the handoff policy so resuming agents do not follow w18 instructions.
23. [MED][MOD] `packages/lane-platform/src/types/io.ts:3-45` — Move session/agent I/O contracts out of Platform or formally redefine the lane boundary so its code and interface agree.
24. [MED][MOD] `apps/orbita-api/src/index.ts:143-215` — Extract memory-enriched turn and scheduled-run workflows into testable application services; leave the entry point as the composition root.
25. [MED][SOC] `apps/orbita-api/src/inbound-email.ts:92-157` — Separate ingress transport from inbound-mail policy, prompt construction, outbound-email provider selection, and credential references.
26. [MED][SOC] `packages/lane-scheduler/src/routes/jobs.ts:34-163` — Split HTTP routes, scheduler service/repository, worker lifecycle, and output delivery into explicit layers.
27. [MED][SOC] `packages/lane-tools/src/registry.ts:42,506-535` — Make trace persistence awaitable or send events to an explicit durable sink with observable failure handling.
28. [MED][DRY] `apps/orbita-api/src/index.ts:112-120` — Create and close database connectivity at the application boundary, then inject shared or centrally budgeted clients into lanes.
29. [MED][DRY] `packages/lane-agent/src/summarizer.ts:21-90` — Reuse the same provider adapters and error normalization as normal turns so summarization and runtime failover cannot diverge.
30. [MED][DRY] `packages/lane-tools/src/registry.ts:55-64` — Remove the duplicate redaction implementation after establishing a shared policy used by Tools and Trajectory.
31. [MED][DRY] `packages/lane-mcp/src/index.ts:61-203` — Extract transport-neutral memory/note command schemas and executors shared by MCP, LLM tools, and REST adapters.
32. [MED][SST] `packages/lane-trajectory/src/db/client.ts:18-35` — Define a central discriminated event schema shared by producers, persistence, replay, evaluation, and OpenAPI.
33. [MED][DEP] `packages/lane-waitlist/src/service.ts:100-132` — Inject a narrow API-key issuance port and keep concrete Auth database details outside the Waitlist lane.
34. [MED][DEP] `packages/lane-agent/src/runtime.ts:1-290` — Define provider-neutral chat, summary, embedding, and tool descriptor ports; construct concrete SDK adapters at the application boundary.
35. [MED][CFG] `packages/lane-tools/src/http-policy.ts:6-32` — Parse configuration once at startup and inject a versioned policy provider instead of using process-global mutable state.
36. [MED][DOC] `docs/harness-design.md:10-13` — Synchronize Harness and wave status documentation with the mounted routes, active tick, and current H1 limitations.
37. [MED][DOC] `docs/site/quick-start.md:17-23` — Correct admin authentication, response field names, and session ID extraction, then verify runnable documentation against the API contract.
38. [MED][DOC] `apps/orbita-web/public/index.html:227-249` — Generate or contract-test the public HTTP surface summary from OpenAPI so endpoint and authentication descriptions stay current.
39. [MED][DOC] `docs/AGENT_ENV.md:3-58` — Replace template placeholders with the actual cloud-safe verification levels, production or staging URLs, commands, and service capability matrix.
