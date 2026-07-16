# Architecture Audit Report
Generated: 2026-07-16T01:08:52Z

---

## Summary Table

| Category | Total | HIGH | MED | LOW |
|---|---|---|---|---|
| Module Boundaries | 5 | 1 | 4 | 0 |
| Inconsistent Patterns | 5 | 2 | 3 | 0 |
| Separation of Concerns | 7 | 3 | 4 | 0 |
| Abstraction & DRY | 5 | 1 | 4 | 0 |
| Single Source of Truth | 7 | 3 | 4 | 0 |
| Dependency Direction | 6 | 2 | 3 | 1 |
| Configuration & Secrets | 8 | 5 | 2 | 1 |
| Documentation Drift | 8 | 2 | 6 | 0 |
| TOTAL | 51 | 19 | 30 | 2 |

---

## Findings

### [MOD] Module Boundaries
| Severity | File | Issue |
|---|---|---|
| HIGH | `packages/lane-admin/src/observability.ts:47-177,196-271,286-400,403-534` | The Admin lane directly queries and mutates tables owned by Sessions, Trajectory, Scheduler, Waitlist, and Auth, including `UPDATE session_jobs`. Schema changes in any of those lanes therefore require coordinated Admin changes outside their public contracts. |
| MED | `apps/orbita-api/src/index.ts:94-227,229-352,363-426` | The composition root also implements the turn pipeline, trajectory payload construction, scheduler callback behavior, route registration, migrations, and process lifecycle. Changes to unrelated lane behavior converge on this single module. |
| MED | `packages/lane-waitlist/src/service.ts:38-169` | One service owns waitlist CRUD/status transitions, Auth API-key issuance, outbound invite orchestration, and runtime DDL, mixing four independent responsibilities. |
| MED | `packages/lane-memory/src/notes-service.ts:100-460` | One module combines persistence, raw vector SQL, graph-link management, BFS traversal, vector search, and prompt-context formatting, coupling data access to retrieval and presentation policies. |
| MED | `packages/lane-tools/src/registry.ts:67-542` | The registry centralizes tool definitions, validation, memory/note adapters, provider-specific schema conversion, authorization, execution, tracing, and error envelopes. It is both a catalog and the execution/integration layer. |

### [PAT] Inconsistent Patterns
| Severity | File | Issue |
|---|---|---|
| HIGH | `packages/lane-scheduler/src/routes/jobs.ts:111-162`; `packages/lane-harness/src/tick.ts:126-172` | Both workers use overlapping async five-second timers without a claim, lock, transaction, or leader election. Concurrent ticks or replicas can execute the same due work before `lastRunAt`/`nextRunAt` is updated. |
| HIGH | `packages/lane-waitlist/src/service.ts:119-150` | Approval is persisted before API-key creation and email delivery. A downstream failure leaves an approved entry that the retry guard at lines 115-117 refuses to process again. |
| MED | `packages/lane-sessions/src/services/sessions.ts:46-61,200`; `packages/lane-profiles/src/loader.ts:24-38`; `packages/lane-tools/src/registry.ts:485-537` | Peer modules use incompatible error models: platform HTTP errors, native exceptions, filesystem errors mapped to 404, and `{ success:false }` results. Equivalent failures consequently receive different transport and caller semantics. |
| MED | `packages/lane-sessions/src/routes/sessions.ts:10-19`; `packages/lane-profiles/src/routes.ts:37-83`; `packages/lane-trajectory/src/routes/trajectory.ts:43-75` | Route layering differs by lane: Sessions delegates to services, Profiles directly drives filesystem loaders, and Trajectory directly calls DB functions. There is no consistent route/service/persistence boundary. |
| MED | `apps/orbita-email-worker/src/index.ts:20-56`; `apps/orbita-api/src/inbound-email.ts:55-62` | The Worker sends unbounded parsed text while the API caps it at 50,000 characters, and the Worker permanently rejects every non-2xx response without distinguishing validation failures from retryable API outages. |

### [SOC] Separation of Concerns
| Severity | File | Issue |
|---|---|---|
| HIGH | `packages/lane-sessions/src/services/sessions.ts:127-156,166-234` | Message sequence allocation, user insert, external provider execution, assistant insert, and compression delete/update are separate operations without a transaction or a `(session_id, sequence)` uniqueness constraint. Concurrent turns and partial failures can leave duplicate sequences or half-written state. |
| HIGH | `packages/lane-agent/src/runtime.ts:44-46`; `packages/lane-tools/src/registry.ts:508-535`; `apps/orbita-api/src/index.ts:192-205` | The tool-trace contract returns `void`, but the host starts an async DB write without awaiting, returning, or catching it. Audit persistence is detached from tool execution and failures can become unhandled rejections. |
| HIGH | `apps/orbita-api/src/inbound-email.ts:69-76,160-186` | The endpoint reports `queued: true` but implements the queue as an in-process fire-and-forget Promise with no durable job, identifier, retry, or restart recovery. A successful HTTP response does not guarantee execution. |
| MED | `packages/lane-scheduler/src/routes/jobs.ts:63-106,111-163` | The route module performs inserts and also implements background polling, delivery, and schedule-state updates, mixing HTTP transport, persistence, and worker orchestration. |
| MED | `apps/orbita-api/src/index.ts:118`; `apps/orbita-api/src/migrate.ts:7-20` | Every web process is also a schema migrator. HTTP startup and database provisioning share a lifecycle, so every replica runs the complete bootstrap SQL during startup. |
| MED | `packages/lane-memory/src/embed.ts:11-23` | The persistence path instantiates the provider SDK inline and silently converts every provider failure to `null`; callers, health checks, and trajectory logs cannot distinguish disabled embeddings from an outage. |
| MED | `packages/lane-memory/src/routes/notes.ts:215-227,308-318` | Notes routes catch all exceptions, expose their messages, and convert database/infrastructure failures to 400 responses, overriding the centralized 500/error-redaction behavior in `lane-platform`. |

### [DRY] Abstraction & DRY
| Severity | File | Issue |
|---|---|---|
| HIGH | `packages/lane-agent/src/runtime.ts:85-253`; `packages/lane-agent/src/summarizer.ts:21-90` | Provider invocation and failover are reimplemented for normal turns and summaries. The summary copy does not classify SDK errors as `ProviderCallError`, so documented rate-limit/quota failover works for turns but not for summaries. |
| MED | `packages/lane-scheduler/src/db/client.ts:1-12`; `packages/lane-harness/src/db/client.ts:1-17`; `packages/lane-memory/src/db/client.ts:1-12`; `packages/lane-credentials/src/db/client.ts:1-12`; `packages/lane-waitlist/src/db/client.ts:1-20` | Lane-local DB factories repeat the same Postgres/Drizzle setup while independently choosing pool sizes and close behavior. The API creates all pools against one URL without a shared lifecycle policy. |
| MED | `packages/lane-platform/src/config.ts:3-26`; `packages/lane-tools/src/http-policy.ts:18-32`; `packages/lane-admin/src/settings.ts:30-105` | HTTP-tool configuration is parsed independently by Platform, Tools, and Admin, with duplicated domain normalization and a process-global override. Validation and fallback rules can drift. |
| MED | `packages/lane-harness/src/types.ts:26-35`; `packages/lane-memory/src/memory-inject.ts:6-13`; `packages/lane-memory/src/routes/notes.ts:76,269` | The same memory-injection contract is separately declared with incompatible limits: Harness permits depth 0-5/top-k 1-32, while Memory clamps depth to 1-4 and its REST API caps top-k at 20. |
| MED | `scripts/e2e-tier-a.sh:5-69`; `scripts/e2e-tier-b.sh:5-75` | Tier A and Tier B duplicate DB startup, port cleanup, API readiness, teardown, and timeout orchestration. Operational fixes must be synchronized across near-identical scripts. |

### [SST] Single Source of Truth
| Severity | File | Issue |
|---|---|---|
| HIGH | `apps/orbita-api/src/migrate.ts:7-20`; `scripts/db-migrate.sh:20-29`; `apps/orbita-api/migrations/init.sql:1-244` | Runtime startup and `pnpm db:migrate` use different migration sources. The script omits later Scheduler, Notes, Credentials, Waitlist, Harness, Admin, and OAuth structures while still reports completion. |
| HIGH | `packages/lane-auth/src/db/schema.ts:12-39`; `packages/lane-auth/drizzle/0000_init.sql:1-11` | Auth's Drizzle schema includes `rate_limit_per_minute` and `rate_limit_counters`, but its package migration includes neither even though the package exposes migration commands. Only the app-level SQL has the current shape. |
| HIGH | `packages/lane-memory/src/db/schema.ts:3-36`; `packages/lane-memory/drizzle/0002_vectors.sql:3-6`; `packages/lane-memory/drizzle/0003_notes.sql:2-26` | Memory's Drizzle schema omits embedding columns, note foreign keys, uniqueness, and indexes present in SQL. Services must bypass the typed schema with raw SQL for core vector behavior. |
| MED | `packages/lane-scheduler/src/routes/jobs.ts:20-23`; `packages/lane-scheduler/src/webhook.ts:15-17`; `packages/lane-harness/src/types.ts:40-46`; `packages/lane-harness/src/tick.ts:89-123` | Public schemas accept Scheduler `external_write` and Harness webhook/trajectory output settings, but runtime execution treats non-webhook Scheduler output as success and never reads Harness output settings. The declared contract is not the runtime truth. |
| MED | `packages/lane-harness/src/types.ts:16-22,37-49`; `packages/lane-harness/src/db/schema.ts:11-16`; `packages/lane-harness/src/service.ts:182-195` | Harness cron and timezone are stored both inside config JSON and dedicated columns; patch logic must manually keep the two representations synchronized. |
| MED | `packages/lane-auth/src/routes/admin.ts:20-30,111-130` | The create-key handler returns `rate_limit_per_minute`, but `CreateApiKeyResponseSchema` does not declare it, so implementation and generated OpenAPI are separate response truths. |
| MED | `packages/lane-profiles/src/types.ts:14-16`; `packages/lane-tools/src/registry.ts:427-475` | Profiles accept arbitrary strings in `allowed_tools`, while the private registry owns the actual names and silently filters unknown entries. A valid profile can therefore expose fewer tools than it declares. |

### [DEP] Dependency Direction
| Severity | File | Issue |
|---|---|---|
| HIGH | `packages/lane-agent/src/runtime.ts:5-10`; `packages/lane-agent/src/summarizer.ts:3-4`; `packages/lane-sessions/src/services/history.ts:117-128` | Agent runtime interfaces consume `SessionRow` and `MessageRow`, which are inferred from Drizzle schemas. High-level provider/runtime code is coupled to Sessions persistence row shapes. |
| HIGH | `packages/lane-oauth/src/middleware/mcp-auth.ts:2-16,51-87` | OAuth depends on Auth DB/services and fabricates a complete API-key persistence row for OAuth principals, including hashes, revocation, and rate-limit fields. Authentication identity is coupled to one lane's storage representation. |
| MED | `packages/lane-mcp/src/index.ts:3-24,58-219` | MCP dependencies expose `MemoryDb` and `MemoryEnv`, and handlers call concrete Memory services directly rather than depending on a protocol-level port or package contract. |
| MED | `packages/lane-admin/src/settings.ts:5-6,30-51,86-106` | Admin imports Tools configuration internals and mutates process-global Tools state with `setHttpToolPolicyOverride`, reversing the expected dependency from operational UI to domain configuration. |
| MED | `packages/lane-tools/src/registry.ts:2,448-483`; `packages/lane-tools/package.json:12-14` | The generic tool catalog depends on the OpenAI SDK and emits OpenAI-specific types; provider adapters live inside Tools instead of the provider/runtime boundary. |
| LOW | `tests/e2e/tier-a-replay.test.ts:2-3`; `tests/e2e/tier-a-scheduler.test.ts:2` | E2E tests import package `src/` internals even though the symbols are exported from package roots, bypassing the package boundary that production consumers use. |

### [CFG] Configuration & Secrets
| Severity | File | Issue |
|---|---|---|
| HIGH | `packages/lane-tools/src/registry.ts:55-64,506-533`; `packages/lane-trajectory/src/db/client.ts:56-63` | Both redaction passes inspect only top-level keys. Secrets nested in request bodies, headers, or `payload.args` can be persisted in trajectory events despite the vault's redaction requirement. |
| HIGH | `packages/lane-tools/src/http-policy.ts:35-45`; `.env.example:28-30` | An empty HTTP allow-list explicitly permits every HTTPS hostname, while default profiles expose HTTP tools. Missing deployment configuration therefore fails open for outbound agent requests. |
| HIGH | `packages/lane-admin/src/session.ts:11-19`; `packages/lane-oauth/src/config.ts:28,44`; `apps/orbita-api/src/index.ts:146-159,262-271` | `ORBITA_SECRETS_KEY` is reused for credential-vault encryption, Admin-cookie HMAC, device auth, and OAuth token signing. Compromise or rotation of one security domain affects all others. |
| HIGH | `scripts/smoke-prod.sh:5-8,18-32,47-59`; `scripts/eval-session.sh:23-29`; `scripts/replay-trajectory.sh:19-25` | Production scripts use `curl -k` while sending Admin tokens or generated API keys, disabling server-certificate verification for privileged requests. |
| HIGH | `scripts/setup-instance-email-prod.sh:40-56,70-81` | The ZSend API key is placed in CLI argument values for both Zeabur environment updates and JSON construction, exposing the secret through process arguments during execution. |
| MED | `packages/lane-memory/src/config.ts:3-9`; `packages/lane-memory/drizzle/0002_vectors.sql:3`; `packages/lane-memory/drizzle/0003_notes.sql:8` | `EMBEDDING_DIMENSIONS` is documented and parsed but never used; database vectors are fixed at 1024 dimensions, so changing the advertised setting cannot change behavior. |
| MED | `apps/orbita-web/public/waitlist.html:92-115`; `apps/orbita-web/package.json:6-9` | The static waitlist form hardcodes the production API endpoint, so local Pages development and preview deployments write into production with no environment isolation. |
| LOW | `packages/lane-oauth/src/config.ts:3-7,43-45` | The reusable OAuth package defaults its tenant identity to the personal value `personal-jacky`, coupling unset deployments to one operator. |

### [DOC] Documentation Drift
| Severity | File | Issue |
|---|---|---|
| HIGH | `docs/site/quick-start.md:11-23`; `packages/lane-admin/src/middleware.ts:14-23`; `packages/lane-auth/src/routes/admin.ts:118-127` | Public quick-start instructions send the Admin token as Bearer auth and tell users to read `api_key`; the server requires `x-orbita-admin-token` or a cookie and returns the one-time secret as `key`. The documented flow fails. |
| HIGH | `docs/development-plan.md:17-24,49-53`; `apps/orbita-api/src/index.ts:96`; `apps/orbita-web/public/updates.html:36-47` | W35 means Notes export/AT graph dogfood in the roadmap but MCP OAuth in runtime/changelog. The planned export route is absent, so the release identifier no longer maps to one deliverable. |
| MED | `packages/lane-sessions/INTERFACE.md:1-22`; `packages/lane-agent/INTERFACE.md:1-20`; `packages/lane-harness/INTERFACE.md:1-23` | Shipped lanes still declare `status: planned` or “not yet implemented”; Harness additionally claims its pre-check fingerprint is idempotent despite the multi-replica race. |
| MED | `packages/lane-tools/package.json:1-16`; `packages/lane-trajectory/package.json:1-21`; `packages/lane-memory/package.json:1-16` | Multiple shipped lanes have no `INTERFACE.md` at all, including Tools, Trajectory, Memory, Scheduler, Credentials, Waitlist, MCP, and OAuth, despite the adopted lane methodology requiring boundary contracts. |
| MED | `usr/ORBITA_DESIGN.md:13-18`; `.agents/instructions/project-guidelines.md:18-21`; `apps/orbita-api/src/index.ts:238` | The authoritative architecture still excludes a GUI dashboard while the application ships `/admin`; the deviation is not reconciled in the foundation constraints. |
| MED | `docs/CURRENT_STATUS.md:3-9,25-28`; `docs/product-architecture.md:27-44,80`; `apps/orbita-api/src/index.ts:96,240-256,400-407` | Live status documents still report w34/API-key-only MCP and Harness as planned, while runtime is w35 with OAuth MCP and an active Harness tick. |
| MED | `README.md:14-19`; `apps/orbita-api/src/index.ts:103-116` | Root quick start lists `DATABASE_URL` and `ORBITA_ADMIN_TOKEN` but omits required `ORBITA_SECRETS_KEY`; following it causes immediate process exit. |
| MED | `docs/traceability-index.md:15-22` | The traceability index links to multiple nonexistent lane `INTERFACE.md` and lane skill files, so its claimed architecture map cannot be followed or used to enforce boundaries. |

---

## Recommended Action Queue

Ordered by severity. Each item is self-contained and actionable.

1. [HIGH][MOD] `packages/lane-admin/src/observability.ts:47-534` — Replace cross-lane table access with explicit reporting/query contracts owned by the relevant lanes.
2. [HIGH][PAT] `packages/lane-scheduler/src/routes/jobs.ts:111-162` and `packages/lane-harness/src/tick.ts:126-172` — Add atomic work claiming and a multi-replica coordination strategy before executing due work.
3. [HIGH][PAT] `packages/lane-waitlist/src/service.ts:119-150` — Make approval, key issuance, and retry state recoverable as one workflow instead of persisting approval first.
4. [HIGH][SOC] `packages/lane-sessions/src/services/sessions.ts:127-234` — Define transactional boundaries and enforce unique per-session message sequences for turn and compression writes.
5. [HIGH][SOC] `apps/orbita-api/src/index.ts:192-205` — Make trajectory persistence awaitable and surface or contain write failures through the tool-trace contract.
6. [HIGH][SOC] `apps/orbita-api/src/inbound-email.ts:160-186` — Back the accepted/queued response with durable execution state, retry semantics, and restart recovery.
7. [HIGH][DRY] `packages/lane-agent/src/runtime.ts:85-253` and `packages/lane-agent/src/summarizer.ts:21-90` — Consolidate provider invocation and error classification so turn and summarization failover follow one policy.
8. [HIGH][SST] `apps/orbita-api/src/migrate.ts:7-20` and `scripts/db-migrate.sh:20-29` — Establish one ordered migration source used by runtime and operator commands.
9. [HIGH][SST] `packages/lane-auth/src/db/schema.ts:12-39` — Bring the Auth migration artifact into exact alignment with the current Drizzle schema.
10. [HIGH][SST] `packages/lane-memory/src/db/schema.ts:3-36` — Represent vector columns, foreign keys, uniqueness, and indexes in the authoritative Memory schema.
11. [HIGH][DEP] `packages/lane-agent/src/runtime.ts:5-10` — Replace persistence-derived Session row dependencies with runtime/domain input contracts.
12. [HIGH][DEP] `packages/lane-oauth/src/middleware/mcp-auth.ts:51-87` — Define an authentication principal independent of the Auth API-key database row.
13. [HIGH][CFG] `packages/lane-tools/src/registry.ts:55-64` and `packages/lane-trajectory/src/db/client.ts:56-63` — Apply recursive structured redaction before any trajectory persistence.
14. [HIGH][CFG] `packages/lane-tools/src/http-policy.ts:35-45` — Make missing outbound-domain policy fail closed or require an explicit opt-in to unrestricted HTTPS.
15. [HIGH][CFG] `apps/orbita-api/src/index.ts:146-159,262-271` — Separate cryptographic keys for vault encryption, Admin sessions/device auth, and OAuth signing.
16. [HIGH][CFG] `scripts/smoke-prod.sh:5-59` and related production scripts — Restore TLS certificate verification for every privileged production request.
17. [HIGH][CFG] `scripts/setup-instance-email-prod.sh:40-81` — Pass ZSend secrets through a secret-safe input mechanism instead of command arguments.
18. [HIGH][DOC] `docs/site/quick-start.md:11-23` — Align the Admin header and one-time key field with the implemented API contract.
19. [HIGH][DOC] `docs/development-plan.md:17-24,49-53` — Reconcile W35 into one release definition and accurately mark the Notes export deliverable.
20. [MED][MOD] `apps/orbita-api/src/index.ts:94-426` — Keep the composition root focused on wiring by moving turn, scheduler, and lifecycle policies behind lane-owned services.
21. [MED][MOD] `packages/lane-waitlist/src/service.ts:38-169` — Separate waitlist state, Auth provisioning, delivery orchestration, and schema management responsibilities.
22. [MED][MOD] `packages/lane-memory/src/notes-service.ts:100-460` — Separate note persistence, graph traversal, vector retrieval, and prompt formatting boundaries.
23. [MED][MOD] `packages/lane-tools/src/registry.ts:67-542` — Split catalog, provider adapters, execution, and tracing into focused modules with explicit interfaces.
24. [MED][PAT] `packages/lane-sessions/src/services/sessions.ts:46-61` and peer modules — Adopt one error taxonomy and transport mapping across lanes.
25. [MED][PAT] `packages/lane-sessions/src/routes/sessions.ts:10-19` and peer routes — Standardize route-to-service-to-persistence layering for comparable lanes.
26. [MED][PAT] `apps/orbita-email-worker/src/index.ts:20-56` — Align payload limits and distinguish retryable upstream failures from permanent email rejection.
27. [MED][SOC] `packages/lane-scheduler/src/routes/jobs.ts:63-163` — Move background worker and persistence orchestration out of the HTTP route module.
28. [MED][SOC] `apps/orbita-api/src/migrate.ts:7-20` — Decouple schema migration ownership from every web-process startup.
29. [MED][SOC] `packages/lane-memory/src/embed.ts:11-23` — Route embedding calls through an observable integration boundary that preserves failure reasons.
30. [MED][SOC] `packages/lane-memory/src/routes/notes.ts:215-227,308-318` — Preserve internal failures for the centralized error handler instead of converting all exceptions to caller errors.
31. [MED][DRY] `packages/lane-scheduler/src/db/client.ts:1-12` and peer clients — Centralize shared pool construction/lifecycle policy while preserving lane-owned schemas.
32. [MED][DRY] `packages/lane-platform/src/config.ts:3-26` and duplicated tool/admin parsers — Use one validated HTTP-tool policy source and normalization rule.
33. [MED][DRY] `packages/lane-harness/src/types.ts:26-35` and Memory contracts — Define memory-injection limits once and consume that contract in REST, MCP, and Harness.
34. [MED][DRY] `scripts/e2e-tier-a.sh:5-69` and `scripts/e2e-tier-b.sh:5-75` — Extract the shared environment startup, readiness, and cleanup workflow.
35. [MED][SST] `packages/lane-scheduler/src/routes/jobs.ts:20-23` and `packages/lane-harness/src/types.ts:40-46` — Implement declared output modes or reject unsupported values at validation time.
36. [MED][SST] `packages/lane-harness/src/service.ts:182-195` — Choose one canonical cron/timezone representation and derive any storage projection from it.
37. [MED][SST] `packages/lane-auth/src/routes/admin.ts:20-30,111-130` — Generate the create-key response and OpenAPI schema from the same contract.
38. [MED][SST] `packages/lane-profiles/src/types.ts:14-16` — Validate profile tool names against the authoritative tool catalog and report unknown names.
39. [MED][DEP] `packages/lane-mcp/src/index.ts:3-219` — Depend on a Memory capability interface rather than concrete DB/environment implementation types.
40. [MED][DEP] `packages/lane-admin/src/settings.ts:30-106` — Replace Admin's mutation of Tools global state with an injected configuration service.
41. [MED][DEP] `packages/lane-tools/src/registry.ts:448-483` — Move provider-specific schema adapters to the Agent/provider boundary.
42. [MED][CFG] `packages/lane-memory/src/config.ts:3-9` — Remove the inert dimensions setting or make schema/model validation enforce it end to end.
43. [MED][CFG] `apps/orbita-web/public/waitlist.html:92-115` — Inject an environment-specific waitlist endpoint so preview/local runs cannot silently target production.
44. [MED][DOC] `packages/lane-sessions/INTERFACE.md:1-22` and peer contracts — Update implemented lane contracts from planned status and document actual ownership and dependencies.
45. [MED][DOC] `packages/lane-tools/package.json:1-16` and other undocumented lanes — Add boundary contracts for every shipped lane required by the adopted methodology.
46. [MED][DOC] `usr/ORBITA_DESIGN.md:13-18` — Record and reconcile the shipped Admin GUI as an explicit architecture decision.
47. [MED][DOC] `docs/CURRENT_STATUS.md:3-28` and `docs/product-architecture.md:27-80` — Synchronize live version, MCP auth, Harness status, and lane inventory with runtime.
48. [MED][DOC] `README.md:14-19` — Include every required startup variable, especially `ORBITA_SECRETS_KEY`.
49. [MED][DOC] `docs/traceability-index.md:15-22` — Remove nonexistent links or create the contracts/skills the index claims are authoritative.
50. [LOW][DEP] `tests/e2e/tier-a-replay.test.ts:2-3` and `tests/e2e/tier-a-scheduler.test.ts:2` — Import public package exports so E2E tests exercise real package boundaries.
51. [LOW][CFG] `packages/lane-oauth/src/config.ts:3-7` — Remove the personal tenant default from reusable OAuth configuration.
