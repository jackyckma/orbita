# Architecture Audit Report
Generated: 2026-07-12T01:04:56Z

---

## Summary Table

| Category | Total | HIGH | MED | LOW |
|---|---|---|---|---|
| Module Boundaries | 3 | 1 | 2 | 0 |
| Inconsistent Patterns | 4 | 1 | 3 | 0 |
| Separation of Concerns | 3 | 1 | 2 | 0 |
| Abstraction & DRY | 4 | 0 | 2 | 2 |
| Single Source of Truth | 4 | 2 | 2 | 0 |
| Dependency Direction | 3 | 0 | 3 | 0 |
| Configuration & Secrets | 4 | 1 | 3 | 0 |
| Documentation Drift | 7 | 2 | 5 | 0 |
| TOTAL | 32 | 8 | 22 | 2 |

---

## Findings

### [MOD] Module Boundaries
| Severity | File | Issue |
|---|---|---|
| HIGH | `packages/lane-admin/src/observability.ts:47-534` | The Admin lane directly queries and updates tables owned by Auth, Sessions, Scheduler, Trajectory, and Waitlist (`api_keys`, `sessions`, `messages`, `session_jobs`, `trajectory_events`, `waitlist_entries`). This bypasses those lanes' services and makes Admin a second owner of their schemas and query semantics. |
| MED | `packages/lane-admin/src/device.ts:7-109` | Device authentication schema and business operations live in `@orbita/admin`, although the routes are mounted as `/v1/auth/device*` at `apps/orbita-api/src/index.ts:231-236`. Authentication capability ownership is split between Admin and Auth. |
| MED | `packages/lane-memory/src/memory-inject.ts:19-32` | The Memory lane exposes `resolveHarnessMemoryInject` and interprets Harness-specific `application.memory_keys` configuration. The lower-level memory package therefore contains knowledge of the higher-level Harness template shape; `packages/lane-harness/src/memory-inject.ts:1-17` delegates its own configuration parsing back to Memory. |

### [PAT] Inconsistent Patterns
| Severity | File | Issue |
|---|---|---|
| HIGH | `apps/orbita-api/src/index.ts:112-120` | The composition root creates nine independent Postgres pools for one `DATABASE_URL`. Their factories use inconsistent limits and return shapes (`client` versus `sql`, maximums 4, 5, or 10), as shown across `packages/lane-auth/src/db/client.ts:7-10`, `packages/lane-harness/src/db/client.ts:7-10`, and `packages/lane-waitlist/src/db/client.ts:11-13`. Connection lifecycle and pool limits cannot be governed consistently as lanes grow. |
| MED | `packages/lane-memory/src/routes/memories.ts:9-112` | Memory and Notes routes rely only on outer Bearer authentication and apply no scope middleware, while Sessions, Scheduler, Harness, Trajectory, and MCP require `sessions:use` (`packages/lane-sessions/src/routes/sessions.ts:36`, `packages/lane-scheduler/src/routes/jobs.ts:39`, `apps/orbita-api/src/index.ts:321`). Scope semantics are inconsistent for similarly protected client resources. |
| MED | `packages/lane-harness/src/routes/harnesses.ts:190-230` | A failed manual Harness operation is returned as HTTP 200 with `{ ok: false, error }`, while the platform's standard failure path is an `OrbitaError` envelope with a non-2xx status (`packages/lane-platform/src/errors.ts:16-23`, `packages/lane-platform/src/error-handler.ts:12-33`). Callers cannot handle operation failures uniformly. |
| MED | `packages/lane-sessions/src/routes/sessions.ts:68-79` | Agent profile validity is checked in the route and reported as HTTP 400, but `createSession` calls `bindProfileSnapshot`, whose loader reports an unknown profile as HTTP 404 (`packages/lane-profiles/src/loader.ts:24-30`). The same invalid profile can produce different API contracts depending on the entry path. |

### [SOC] Separation of Concerns
| Severity | File | Issue |
|---|---|---|
| HIGH | `apps/orbita-api/src/inbound-email.ts:83-186` | The HTTP handler contains the complete inbound-email workflow: configuration/auth checks, profile validation, session lookup and creation, memory persistence, trajectory writes, prompt construction, vendor-specific reply instructions, and asynchronous agent execution. Transport, orchestration, persistence, and presentation concerns are inseparable. |
| MED | `packages/lane-scheduler/src/routes/jobs.ts:63-105` | The Scheduler POST handler performs schedule policy validation, computes next-run state, inserts directly with Drizzle, and maps the response. Unlike the established route-to-service pattern in Auth, Credentials, Sessions, and Waitlist, Scheduler has no service boundary for job creation. |
| MED | `apps/orbita-api/src/index.ts:140-215` | The application entry point implements turn policy rather than only wiring dependencies: it adapts memory and note operations, injects memory context, maps tool traces, and records turn-completion trajectory events. Changes to agent-turn semantics therefore require editing the host composition root. |

### [DRY] Abstraction & DRY
| Severity | File | Issue |
|---|---|---|
| MED | `packages/lane-scheduler/src/routes/jobs.ts:111-163` | Scheduler and Harness independently implement nearly identical five-second full-table polling loops with enabled checks and `isJobDue` evaluation (`packages/lane-harness/src/tick.ts:126-173`). Tick reliability, batching, and multi-replica fixes must be duplicated. |
| MED | `packages/lane-trajectory/src/routes/trajectory.ts:7-75` | Caller trajectory routes and Admin observability independently query, map, and replay the same `trajectory_events` data (`packages/lane-admin/src/observability.ts:511-533` and `packages/lane-admin/src/observability-routes.ts:161-169`). Schema or response changes can diverge between caller and Admin views. |
| LOW | `packages/lane-credentials/src/routes/credentials.ts:8-15` | `optionalAdminGuard` duplicates the exported implementation in `packages/lane-auth/src/routes/admin.ts:46-54`. Authentication compatibility behavior has two maintenance points. |
| LOW | `packages/lane-tools/src/http-policy.ts:21-27` | Comma-separated configuration normalization is repeated in Admin settings and Waitlist configuration (`packages/lane-admin/src/settings.ts:73-79`, `packages/lane-waitlist/src/config.ts:17-23`) with slightly different casing and fallback behavior. |

### [SST] Single Source of Truth
| Severity | File | Issue |
|---|---|---|
| HIGH | `apps/orbita-api/src/migrate.ts:7-20` | Database structure has multiple incomplete authorities: startup applies monolithic `apps/orbita-api/migrations/init.sql`, `pnpm db:migrate` applies only the old subset in `scripts/db-migrate.sh:20-28`, and Waitlist runs its own DDL at runtime in `packages/lane-waitlist/src/service.ts:154-168`. The script omits later Scheduler cron, Notes, Harness, Waitlist, Device Auth, and other schema changes. |
| HIGH | `packages/lane-memory/src/db/schema.ts:3-36` | The Drizzle schema omits the `embedding` columns and database indexes/constraints present in `apps/orbita-api/migrations/init.sql:87-92,180-205`. Memory and Notes consequently use raw SQL for vector writes (`packages/lane-memory/src/service.ts:97-128`, `packages/lane-memory/src/notes-service.ts:110-137`), so the typed schema is not an authoritative model of the database. |
| MED | `packages/lane-agent/src/config.ts:3-9` | `MINIMAX_MODEL` is exposed as runtime configuration and documented in `.env.example:17`, but normal turns select the primary model from the profile snapshot (`packages/lane-agent/src/runtime.ts:296-310`). Two apparent model authorities exist, and changing the env value does not change the primary runtime model. |
| MED | `packages/lane-harness/src/types.ts:79-86` | Harness capabilities advertise `cron-agent`, while the template catalog generates `cron-agent@v1` through `templatePublicId` (`packages/lane-harness/src/templates.ts:136-138`). Machine-readable capability and catalog identifiers disagree. |

### [DEP] Dependency Direction
| Severity | File | Issue |
|---|---|---|
| MED | `packages/lane-admin/src/settings.ts:30-51` | Admin configures Tools by mutating module-level global state through `setHttpToolPolicyOverride`; Tools later reads that hidden state in `packages/lane-tools/src/http-policy.ts:6-15`. Runtime policy depends on an Admin startup side effect rather than an explicit injected dependency. |
| MED | `packages/lane-agent/src/runtime.ts:189-252` | High-level turn and summarization logic directly constructs concrete OpenAI and Anthropic SDK clients, with another OpenAI construction in Memory embeddings (`packages/lane-agent/src/summarizer.ts:21-56`, `packages/lane-memory/src/embed.ts:4-23`). Provider transport, retries, and client configuration cannot be swapped behind one abstraction. |
| MED | `packages/lane-scheduler/src/webhook.ts:11-38` | Scheduler webhooks and Waitlist ZSend calls use direct `fetch` implementations (`packages/lane-waitlist/src/invite.ts:9-53`) rather than a shared outbound gateway. They bypass the timeout and host-policy abstraction used by Tools in `packages/lane-tools/src/http.ts:14-39`, tightly coupling each business module to transport behavior. |

### [CFG] Configuration & Secrets
| Severity | File | Issue |
|---|---|---|
| HIGH | `scripts/waitlist-invite-e2e-prod.sh:20-28` | The production invite test defaults to the personal address `jackymama@gmail.com` and then approves a real waitlist entry with email delivery. Running the script without an override creates an external side effect against a hardcoded recipient; require an explicit test recipient instead. |
| MED | `scripts/smoke-prod.sh:5` | Production scripts disagree on the default API host: smoke, replay, and eval use `https://orbita-api.zeabur.app`, while current operational scripts and documentation use `https://api.get-orbita.com` (`scripts/waitlist-e2e-prod.sh:6`, `scripts/setup-instance-email-prod.sh:6`). Validation can target a different deployment alias than other operations. |
| MED | `scripts/setup-web-search-prod.sh:13-17` | Production Zeabur project/service IDs are embedded as defaults, and the same API service override is named `ZEABUR_ORBITA_API_SERVICE_ID` here but `ORBITA_ZEABUR_API_SERVICE_ID` in `scripts/setup-instance-email-prod.sh:7`. Automation can silently target production and cannot share one documented variable name. |
| MED | `.env.example:1-73` | The example omits configuration consumed by runtime or deployment entry points, notably `ORBITA_E2E_MOCK` (`apps/orbita-api/src/index.ts:86`) and `ORBITA_API_URL` (`apps/orbita-email-worker/wrangler.toml:8-11` and multiple scripts). `ORBITA_E2E_MOCK` also bypasses the validated `PlatformEnvSchema`, unlike most API configuration. |

### [DOC] Documentation Drift
| Severity | File | Issue |
|---|---|---|
| HIGH | `docs/product-architecture.md:25-80` | The architecture map still marks Harness W27 as design, lists seven tools, and stops before W32-W34 Notes graph and MCP, while the API mounts Harness, Notes, and MCP in `apps/orbita-api/src/index.ts:300-332` and the registry has fourteen tools (`packages/lane-tools/src/registry.test.ts:9-25`). The documented lane and API architecture no longer describes the deployed system. |
| HIGH | `packages/lane-sessions/INTERFACE.md:1-22` | Sessions, Agent, Profiles, and Harness boundary contracts remain `status: planned` or say “not yet implemented” (`packages/lane-agent/INTERFACE.md:1-6`, `packages/lane-profiles/INTERFACE.md:1-17`, `packages/lane-harness/INTERFACE.md:1-23`), despite their active route and runtime implementations. Agents cannot rely on the declared package contracts to determine implemented boundaries. |
| MED | `docs/harness-design.md:1-41` | The Harness design says “not implemented” and describes AT1b as a manual stack, while `docs/CURRENT_STATUS.md:17-20` records active supply and poll harnesses and the code runs Harness routes and ticks. Its API sketch also includes unimplemented template-detail and delete routes at lines 67-84 without clearly distinguishing them from the shipped surface. |
| MED | `AGENTS.md:63` | Workspace guidance says the Admin UI has no session list or trajectory viewer, but the UI renders Recent Sessions and trajectory replay (`packages/lane-admin/public/admin.js:149-154`) and the server exposes both (`packages/lane-admin/src/observability-routes.ts:86-170`). This false architectural fact can misdirect future agents. |
| MED | `docs/traceability-index.md:11-23` | The index references non-existent lane skills and INTERFACE files for Profiles through Trajectory, and omits active Admin, Waitlist, Harness, and MCP packages. Only seven lane packages actually contain an `INTERFACE.md`, so the traceability map cannot be used as written. |
| MED | `docs/harness-design.md:7` | Documentation links to missing `docs/at-track-plan.md`; `docs/dogfood-plan.md:7,14` and `docs/product-architecture.md:126` link to missing `docs/loose-ends-checklist.md`. Architecture navigation contains dead references to purported source plans. |
| MED | `docs/site/technical.md:31-58` | Public technical documentation lists only three built-in profiles and flat Memory, and omits the shipped Notes graph, Harness, and MCP surfaces. Integrators receive a materially incomplete capability model compared with the registered routes and seven profile JSON files. |

---

## Recommended Action Queue

Ordered by severity. Each item is self-contained and actionable.

1. [HIGH][MOD] `packages/lane-admin/src/observability.ts:47-534` — Move cross-lane reads and scheduler updates behind lane-owned query/service interfaces or a deliberately owned read model so Admin no longer owns other lanes' table contracts.
2. [HIGH][PAT] `apps/orbita-api/src/index.ts:112-120` — Establish one shared database pool/lifecycle policy and inject lane-scoped Drizzle views from it; standardize limits, shutdown, and handle naming.
3. [HIGH][SOC] `apps/orbita-api/src/inbound-email.ts:83-186` — Extract the inbound-email workflow into an application service; keep the route limited to validation, authentication, service invocation, and HTTP response mapping.
4. [HIGH][SST] `apps/orbita-api/src/migrate.ts:7-20` — Choose one authoritative migration mechanism, make local/manual and startup paths consume the same ordered migrations, and remove runtime table creation.
5. [HIGH][SST] `packages/lane-memory/src/db/schema.ts:3-36` — Make the typed Memory schema match the deployed vector columns, indexes, uniqueness constraints, and link foreign keys so vector persistence does not rely on a parallel undocumented schema.
6. [HIGH][CFG] `scripts/waitlist-invite-e2e-prod.sh:20-28` — Remove the personal-email fallback and fail before any production write unless an explicit test recipient is supplied.
7. [HIGH][DOC] `docs/product-architecture.md:25-80` — Synchronize the lane table, wave status, tool inventory, and HTTP surface with W27-W34, Notes, Harness, and MCP implementations.
8. [HIGH][DOC] `packages/lane-sessions/INTERFACE.md:1-22` — Mark shipped package contracts active and update Sessions, Agent, Profiles, and Harness interfaces to describe their real public boundaries.
9. [MED][MOD] `packages/lane-admin/src/device.ts:7-109` — Assign device authentication schema, service, and route ownership to the Auth lane, leaving Admin only the approval presentation/authorization integration.
10. [MED][MOD] `packages/lane-memory/src/memory-inject.ts:19-32` — Move Harness template fallback parsing to Harness and expose only generic memory-injection primitives from Memory.
11. [MED][PAT] `packages/lane-memory/src/routes/memories.ts:9-112` — Define and apply one documented scope policy for all protected resource families, including Memory and Notes.
12. [MED][PAT] `packages/lane-harness/src/routes/harnesses.ts:190-230` — Route failed Harness executions through the standard API error envelope and status policy, reserving HTTP 200 for successful operation results.
13. [MED][PAT] `packages/lane-sessions/src/routes/sessions.ts:68-79` — Centralize profile validation and choose one stable error status/code for every session-creation entry path.
14. [MED][SOC] `packages/lane-scheduler/src/routes/jobs.ts:63-105` — Introduce a Scheduler job service that owns validation, next-run computation, persistence, and output mapping.
15. [MED][SOC] `apps/orbita-api/src/index.ts:140-215` — Move turn memory injection and trajectory policy into an application/runtime service so the entry point remains a composition root.
16. [MED][DRY] `packages/lane-scheduler/src/routes/jobs.ts:111-163` — Extract the common due-item polling runner used by Scheduler and Harness, with one place for interval, batching, concurrency, and replica coordination.
17. [MED][DRY] `packages/lane-trajectory/src/routes/trajectory.ts:7-75` — Provide one Trajectory query and response-mapping service for both caller and Admin APIs.
18. [MED][SST] `packages/lane-agent/src/config.ts:3-9` — Declare profiles or environment variables as the authoritative primary-model source and remove or wire the conflicting configuration path.
19. [MED][SST] `packages/lane-harness/src/types.ts:79-86` — Generate capability template identifiers from the same versioned catalog used by Harness template responses.
20. [MED][DEP] `packages/lane-admin/src/settings.ts:30-51` — Inject effective HTTP policy into Tools explicitly and remove the Admin-triggered module-global override.
21. [MED][DEP] `packages/lane-agent/src/runtime.ts:189-252` — Introduce provider client interfaces/factories shared by turn execution, summarization, and embeddings, with transport configuration in one adapter layer.
22. [MED][DEP] `packages/lane-scheduler/src/webhook.ts:11-38` — Route Scheduler and ZSend outbound calls through a shared HTTP gateway with consistent timeout, host policy, and error behavior.
23. [MED][CFG] `scripts/smoke-prod.sh:5` — Standardize all production operational scripts on one canonical API base variable and default hostname.
24. [MED][CFG] `scripts/setup-web-search-prod.sh:13-17` — Remove environment-specific Zeabur IDs as implicit defaults and standardize the API service ID variable name across scripts and documentation.
25. [MED][CFG] `.env.example:1-73` — Document runtime, Worker, and operational variables that are actually consumed, and add `ORBITA_E2E_MOCK` to validated configuration with an explicit non-production constraint.
26. [MED][DOC] `docs/harness-design.md:1-41` — Update Harness status and AT1b operating model, and clearly label API sketch operations that remain unimplemented.
27. [MED][DOC] `AGENTS.md:63` — Correct the Admin capability summary to include session listing and trajectory replay.
28. [MED][DOC] `docs/traceability-index.md:11-23` — Rebuild the index from existing packages, skills, contracts, and interfaces; remove non-existent paths and include Admin, Waitlist, Harness, and MCP.
29. [MED][DOC] `docs/harness-design.md:7` — Replace or remove missing `at-track-plan.md` and `loose-ends-checklist.md` references so every architecture link resolves.
30. [MED][DOC] `docs/site/technical.md:31-58` — Document the full profile catalog and the shipped Notes, Harness, and MCP integration surfaces for external users.
31. [LOW][DRY] `packages/lane-credentials/src/routes/credentials.ts:8-15` — Delete the local `optionalAdminGuard` copy and consume the canonical authentication helper or middleware.
32. [LOW][DRY] `packages/lane-tools/src/http-policy.ts:21-27` — Centralize comma-separated list parsing and normalization, while keeping domain-specific defaults at each caller.
