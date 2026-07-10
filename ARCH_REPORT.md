# Architecture Audit Report
Generated: 2026-07-10T01:09:07Z

---

## Summary Table

| Category | Total | HIGH | MED | LOW |
|---|---|---|---|---|
| Module Boundaries | 3 | 1 | 2 | 0 |
| Inconsistent Patterns | 4 | 1 | 3 | 0 |
| Separation of Concerns | 3 | 0 | 3 | 0 |
| Abstraction & DRY | 5 | 0 | 4 | 1 |
| Single Source of Truth | 5 | 1 | 4 | 0 |
| Dependency Direction | 4 | 0 | 4 | 0 |
| Configuration & Secrets | 5 | 0 | 3 | 2 |
| Documentation Drift | 7 | 0 | 6 | 1 |
| TOTAL | 36 | 3 | 29 | 4 |

---

## Findings

### [MOD] Module Boundaries
| Severity | File | Issue |
|---|---|---|
| HIGH | `packages/lane-admin/src/observability.ts:62-97,120-168,214-254,310-397,429-526` | The admin lane directly queries and updates tables owned by sessions, trajectory, scheduler, waitlist, auth, and rate limiting. This bypasses those lanes' query/service boundaries, leaves several dependencies undeclared in `packages/lane-admin/package.json:14-24`, and makes schema changes in any lane capable of breaking the admin module. |
| MED | `packages/lane-scheduler/src/routes/jobs.ts:34-163` | One module owns Hono route definitions, request validation, persistence, the five-second background polling loop, webhook dispatch, and job state updates. HTTP transport and worker-runtime responsibilities therefore change and deploy together. |
| MED | `packages/lane-tools/src/registry.ts:67-543` | A single 500+ line registry implements and validates unrelated HTTP, JSON, hashing, memory, note, web-search, and Docker tools as well as registry lookup and execution tracing. The file has multiple capability responsibilities and a broad change surface. |

### [PAT] Inconsistent Patterns
| Severity | File | Issue |
|---|---|---|
| HIGH | `packages/lane-memory/src/routes/memories.ts:9-113`<br>`packages/lane-memory/src/routes/notes.ts:34-322`<br>`packages/lane-credentials/src/routes/credentials.ts:118-150` | Memory, notes, and caller credential-list routes rely only on outer API-key authentication, while sessions, scheduler, harness, and trajectory explicitly enforce `requireScope("sessions:use")` (`lane-sessions/src/routes/sessions.ts:36`, `lane-scheduler/src/routes/jobs.ts:39`, `lane-harness/src/routes/harnesses.ts:32-34`, `lane-trajectory/src/routes/trajectory.ts:23-24`). A valid key with a restricted/custom scope can still access client memory and credential metadata, so scope semantics are not consistently enforced. |
| MED | `packages/lane-memory/src/notes-service.ts:151-182,210-211,291-293`<br>`packages/lane-memory/src/routes/notes.ts:304-318`<br>`packages/lane-harness/src/routes/harnesses.ts:190-230` | Similar failures use incompatible mechanisms: note services throw plain `Error`, the HTTP adapter maps errors by message-string equality, and a failed manual harness run is returned as HTTP 200 with `{ ok: false, error }`. This diverges from the shared `OrbitaError`/HTTP error envelope. |
| MED | `packages/lane-auth/src/routes/admin.ts:36-53,99-100,157-158,197-198`<br>`packages/lane-credentials/src/routes/credentials.ts:8-15,63-64,109-110`<br>`apps/orbita-api/src/index.ts:238-254` | Admin authentication has two patterns at once: an outer middleware is authoritative, while deprecated optional route guards remain and credentials carries a private copy. In current composition the guards are not passed, yet route schemas still advertise the legacy header, creating duplicate and misleading authentication paths. |
| MED | `apps/orbita-api/src/index.ts:86`<br>`packages/lane-admin/src/routes.ts:57,147-148`<br>`packages/lane-admin/src/device-routes.ts:80` | Most runtime configuration is parsed through Zod loaders, but E2E mode, `NODE_ENV`, and provider-presence checks read `process.env` directly. These bypass validation/defaults and make dependency injection in tests inconsistent. |

### [SOC] Separation of Concerns
| Severity | File | Issue |
|---|---|---|
| MED | `apps/orbita-api/src/inbound-email.ts:83-186` | The app-host route performs token/profile policy, session lookup/creation, memory persistence, trajectory logging, prompt construction, and asynchronous agent dispatch. This is a complete application workflow inside the HTTP adapter rather than a thin host plus an injectable service. |
| MED | `packages/lane-scheduler/src/routes/jobs.ts:63-105` | The create-job HTTP handler validates business rules, computes schedule state, and executes a Drizzle insert directly. Other lanes generally delegate route handling to services, so transport and persistence are coupled here. |
| MED | `packages/lane-harness/src/routes/harnesses.ts:212-230` | The manual-trigger route directly queries the harness table and invokes the background execution worker. It bypasses the package's service boundary and couples HTTP response behavior to worker internals. |

### [DRY] Abstraction & DRY
| Severity | File | Issue |
|---|---|---|
| MED | `apps/orbita-api/src/index.ts:112-120`<br>`packages/lane-auth/src/db/client.ts:7-8`<br>`packages/lane-sessions/src/db/client.ts:7-8`<br>`packages/lane-harness/src/db/client.ts:7-8` | The host creates nine independent Postgres pools for one `DATABASE_URL`; near-identical lane factories configure differing maxima and return-field names. Their configured maxima total 58 connections per replica, and connection lifecycle support is inconsistent. |
| MED | `packages/lane-agent/src/runtime.ts:97-123,125-253`<br>`packages/lane-agent/src/summarizer.ts:21-57` | MiniMax/Anthropic client creation, provider dispatch, response extraction, and provider-error handling are implemented separately for normal turns and summarization. Provider behavior can drift between the two call paths. |
| MED | `packages/lane-trajectory/src/db/client.ts:56-63`<br>`packages/lane-tools/src/registry.ts:55-65` | Sensitive-field redaction is duplicated with the same key regex in trajectory persistence and tool tracing. Changes to secret-field policy must be synchronized manually. |
| MED | `packages/lane-tools/src/http-policy.ts:18-32`<br>`packages/lane-admin/src/settings.ts:54-83` | HTTP-domain environment parsing and normalization are duplicated in tools and admin settings. The same configuration can be interpreted differently if either implementation changes. |
| LOW | `packages/lane-scheduler/src/routes/jobs.ts:15-32,73-76`<br>`packages/lane-scheduler/src/schedule.ts:32-60` | The exactly-one-of `every_seconds`/`cron` rule is encoded in both Zod and `validateScheduleInput`, then both execute for one request. Keep one authoritative business validator and let the transport schema reuse it. |

### [SST] Single Source of Truth
| Severity | File | Issue |
|---|---|---|
| HIGH | `package.json:13`<br>`scripts/db-migrate.sh:20-28`<br>`apps/orbita-api/src/migrate.ts:7-20`<br>`apps/orbita-api/migrations/init.sql:1-205` | `pnpm db:migrate` applies only seven older lane SQL files, while API startup applies a separate full bootstrap. The script omits scheduler cron, credentials, admin, waitlist, harness, notes, and other current schema, so the documented migration command can create a database incompatible with the application. |
| MED | `packages/lane-memory/src/db/schema.ts:3-25`<br>`apps/orbita-api/migrations/init.sql:87-92,180-190`<br>`packages/lane-memory/src/service.ts:21-30,107-128` | Drizzle definitions omit the `embedding vector(1024)` columns present on `client_memories` and `notes`. Memory code must bypass the typed schema with raw SQL, so the ORM model is not a complete source of truth for its own tables. |
| MED | `apps/orbita-api/migrations/init.sql:126-139`<br>`packages/lane-waitlist/src/db/schema.ts:3-12`<br>`packages/lane-waitlist/src/service.ts:154-168` | Waitlist DDL exists in bootstrap SQL, a Drizzle schema, and runtime `CREATE TABLE` SQL. The startup call at `apps/orbita-api/src/index.ts:122` applies the runtime definition even after the main migration, obscuring schema ownership. |
| MED | `apps/orbita-api/migrations/init.sql:108-124`<br>`packages/lane-admin/src/settings.ts:8-12`<br>`packages/lane-admin/src/device.ts:7-15` | Admin table definitions are duplicated between bootstrap SQL and inline Drizzle declarations in unrelated service files, unlike the other lanes' `db/schema.ts` pattern. A column change requires coordinated edits across multiple authorities. |
| MED | `packages/lane-platform/src/config.ts:15-22`<br>`packages/lane-agent/src/config.ts:3-9`<br>`packages/lane-memory/src/config.ts:3-9`<br>`packages/lane-waitlist/src/config.ts:3-9` | Environment definitions overlap across independently parsed schemas: MiniMax settings are duplicated in agent/memory, and public URL/from-email settings are duplicated in platform/waitlist. Defaults and validation can drift while startup loads all schemas separately. |

### [DEP] Dependency Direction
| Severity | File | Issue |
|---|---|---|
| MED | `packages/lane-scheduler/src/agent-message.ts:1-42`<br>`packages/lane-harness/src/service.ts:1-8,55-76,132-160`<br>`packages/lane-waitlist/src/service.ts:1-8,100-143` | Scheduler, harness, and waitlist application logic directly imports concrete session, memory, scheduler, and auth implementations. These orchestration paths cannot be isolated or swapped without changing downstream lanes; explicit ports/callbacks at the composition root are used elsewhere but not here. |
| MED | `packages/lane-agent/src/runtime.ts:3-10,292-303`<br>`packages/lane-sessions/src/services/history.ts:5-48,101-128` | The agent runtime depends on the sessions package for LLM prompt serialization, output shaping, and runner interfaces. LLM-facing policy lives in the persistence/session lane, reversing the expected dependency from session orchestration toward an agent abstraction. |
| MED | `packages/lane-tools/src/http-policy.ts:6-15`<br>`packages/lane-admin/src/settings.ts:30-51,86-106` | Admin settings mutate module-global state inside the tools package. Tool behavior depends on startup order and an implicit process-wide side effect rather than an injected policy, which is unsafe for parallel tests and obscures multi-replica behavior. |
| MED | `packages/lane-waitlist/src/invite.ts:9-52` | Waitlist invitation logic calls the concrete Zeabur ZSend endpoint directly. There is no mail-sender port or injected transport, so changing providers requires editing domain/application code and provider-specific failures leak upward as plain errors. |

### [CFG] Configuration & Secrets
| Severity | File | Issue |
|---|---|---|
| MED | `scripts/smoke-prod.sh:8,18,26,32,47,59`<br>`scripts/replay-trajectory.sh:19,25`<br>`scripts/eval-session.sh:23,29` | Production verification calls use `curl -k`, disabling TLS certificate validation. The smoke suite can therefore pass while certificate trust is broken and can expose admin/API credentials to an intercepted endpoint. |
| MED | `scripts/smoke-prod.sh:5`<br>`scripts/replay-trajectory.sh:5`<br>`scripts/eval-session.sh:5`<br>`scripts/waitlist-e2e-prod.sh:6` | Operational scripts have two different default production hosts (`orbita-api.zeabur.app` and canonical `api.get-orbita.com`). Nightly production smoke uses the former (`.github/workflows/e2e-nightly.yml:31-39`), so checks may target a noncanonical deployment. |
| MED | `scripts/waitlist-invite-e2e-prod.sh:20-28` | A production E2E script defaults to a real personal Gmail address and sends an invitation unless overridden. An unattended or mistaken run can deliver live credentials/PII to a hardcoded individual address. |
| LOW | `.env.example:1-73`<br>`apps/orbita-api/src/index.ts:86`<br>`scripts/setup-web-search-prod.sh:13` | Operational/test variables such as `ORBITA_API_URL`, `ORBITA_API_BASE`, and `ORBITA_E2E_MOCK` are consumed but absent from the environment example, leaving valid configuration surfaces undocumented. |
| LOW | `docker-compose.yml:4-7,32-35` | Local Compose hardcodes the `orbita` database username/password and connection URL. These are development defaults rather than discovered real secrets, but the file provides no guard against reuse when exposing or adapting the stack outside localhost. |

### [DOC] Documentation Drift
| Severity | File | Issue |
|---|---|---|
| MED | `docs/SESSION_HANDOFF.md:3-16,31-35` | The canonical resume document is dated 2026-06-25, reports production `0.0.1-w18`, and names instance-email E2E as the active priority. Current code and status target `0.0.1-w34` (`apps/orbita-api/src/index.ts:88`, `docs/CURRENT_STATUS.md:3-11`). |
| MED | `docs/product-architecture.md:25-44,57-81,151-176` | The architecture still marks Harness/W27 as design and its current HTTP surface omits shipped notes, harness, MCP, capabilities, whoami, and several admin endpoints. It also describes collection-level session verbs that do not match the registered routes. |
| MED | `docs/traceability-index.md:11-23` | The traceability map stops at lane 9, omitting admin, waitlist, harness, MCP, and the email worker. It also links contracts, skills, interfaces, and simulator paths that do not exist; only seven `INTERFACE.md` files, two lane skills, no contracts directories, and no `data/` directory are present. |
| MED | `packages/lane-harness/INTERFACE.md:1-23` | The harness boundary contract still declares `status: planned` even though its routes, cron worker, database schema, and production dogfood flow are shipped. Agents relying on the contract receive the wrong lifecycle state. |
| MED | `AGENTS.md:53-63` | Learned workspace facts correctly identify W34 but state that the admin UI has no session list or trajectory. The UI and interface expose recent sessions and trajectory replay (`packages/lane-admin/public/admin.js`, `packages/lane-admin/INTERFACE.md:13-15`). |
| MED | `docs/site/technical.md:1-89` | The public technical reference documents sessions, flat memory, tools, scheduler, and inbound email but omits the shipped notes graph, harness API, and `/v1/mcp` entry point. Integrators cannot discover major W32-W34 capabilities from the public reference. |
| LOW | `docs/AGENT_ENV.md:1-58` | The active environment document retains template dates, a placeholder staging URL, placeholder verification commands, and an empty service matrix. It does not describe the actual cloud-safe commands or production smoke path used by this repository. |

---

## Recommended Action Queue

Ordered by severity. Each item is self-contained and actionable.

1. [HIGH][MOD] `packages/lane-admin/src/observability.ts:62-526` — Replace cross-lane table access with explicit owner-lane query/read-model boundaries and declare the resulting dependencies.
2. [HIGH][PAT] `packages/lane-memory/src/routes/memories.ts:9-113` — Define the scope policy for memory, notes, and credential metadata, then enforce it consistently with the other protected routes.
3. [HIGH][SST] `scripts/db-migrate.sh:20-28` — Make `pnpm db:migrate`, API startup, and Compose initialization consume one complete canonical schema/migration chain.
4. [MED][MOD] `packages/lane-scheduler/src/routes/jobs.ts:34-163` — Separate route construction from the scheduler worker and its persistence lifecycle.
5. [MED][MOD] `packages/lane-tools/src/registry.ts:67-543` — Split tool implementations by capability while retaining a small registry/composition module.
6. [MED][PAT] `packages/lane-memory/src/notes-service.ts:151-293` — Standardize service errors and HTTP mapping on typed platform errors; remove message-string matching and HTTP-200 failure envelopes.
7. [MED][PAT] `packages/lane-auth/src/routes/admin.ts:36-53` — Remove the deprecated per-route admin guard path and its credentials copy, leaving middleware as the documented authority.
8. [MED][PAT] `apps/orbita-api/src/index.ts:86` — Add E2E/provider/runtime flags to injected configuration schemas and stop direct `process.env` reads in runtime modules.
9. [MED][SOC] `apps/orbita-api/src/inbound-email.ts:83-186` — Move email-to-session orchestration into an injectable application service and keep the route limited to transport concerns.
10. [MED][SOC] `packages/lane-scheduler/src/routes/jobs.ts:63-105` — Move schedule policy and persistence into a scheduler service called by the route.
11. [MED][SOC] `packages/lane-harness/src/routes/harnesses.ts:212-230` — Route manual triggers through the harness service instead of directly querying tables and invoking worker internals.
12. [MED][DRY] `apps/orbita-api/src/index.ts:112-120` — Introduce one controlled database connection/pool strategy with consistent handle naming and shutdown ownership.
13. [MED][DRY] `packages/lane-agent/src/runtime.ts:97-253` — Centralize provider client creation, response extraction, and error classification for turns and summaries.
14. [MED][DRY] `packages/lane-trajectory/src/db/client.ts:56-63` — Centralize recursive sensitive-field redaction and reuse it in trajectory and tool tracing.
15. [MED][DRY] `packages/lane-tools/src/http-policy.ts:18-32` — Expose one domain-list parser/normalizer and consume it from admin settings.
16. [MED][SST] `packages/lane-memory/src/db/schema.ts:3-25` — Make the typed memory schema represent vector columns, or designate and document a single alternative schema owner.
17. [MED][SST] `packages/lane-waitlist/src/service.ts:154-168` — Remove runtime waitlist DDL after consolidating it into the canonical migration/schema path.
18. [MED][SST] `packages/lane-admin/src/settings.ts:8-12` — Move admin table definitions to a single admin schema module synchronized through the canonical migrations.
19. [MED][SST] `packages/lane-agent/src/config.ts:3-9` — Consolidate shared MiniMax, public URL, and sender-email definitions so each variable has one validator/default.
20. [MED][DEP] `packages/lane-scheduler/src/agent-message.ts:1-42` — Inject session execution behind an application port; apply the same boundary to harness and waitlist orchestration.
21. [MED][DEP] `packages/lane-sessions/src/services/history.ts:5-128` — Move LLM serialization/output policy and runner contracts behind an agent-facing abstraction independent of session persistence.
22. [MED][DEP] `packages/lane-tools/src/http-policy.ts:6-15` — Replace the process-global override with explicitly injected policy state.
23. [MED][DEP] `packages/lane-waitlist/src/invite.ts:9-52` — Define an injectable email-sender abstraction and keep ZSend as an infrastructure adapter.
24. [MED][CFG] `scripts/smoke-prod.sh:8-59` — Restore TLS certificate verification in every production smoke/evaluation request.
25. [MED][CFG] `scripts/smoke-prod.sh:5` — Use one canonical production base URL/default across all operational scripts and nightly CI.
26. [MED][CFG] `scripts/waitlist-invite-e2e-prod.sh:20-28` — Require an explicit safe recipient for credential-sending production E2E runs; remove the personal-address default.
27. [MED][DOC] `docs/SESSION_HANDOFF.md:3-35` — Refresh the canonical handoff to W34 and the current AT dogfood priority.
28. [MED][DOC] `docs/product-architecture.md:25-176` — Synchronize lane status, shipped waves, and the HTTP surface with notes, harness, MCP, and admin implementations.
29. [MED][DOC] `docs/traceability-index.md:11-23` — Add all current lanes/apps and remove or create every referenced contract, interface, skill, and fixture path.
30. [MED][DOC] `packages/lane-harness/INTERFACE.md:1-23` — Mark the harness contract as shipped/active and document its current verification boundary.
31. [MED][DOC] `AGENTS.md:53-63` — Correct the admin UI capability fact to include sessions and trajectory replay.
32. [MED][DOC] `docs/site/technical.md:1-89` — Document notes, harness, and MCP for public integrators and explain their authentication/discovery surfaces.
33. [LOW][DRY] `packages/lane-scheduler/src/routes/jobs.ts:15-32` — Keep schedule exclusivity and cron validation in one reusable validator.
34. [LOW][CFG] `.env.example:1-73` — Document the operational and test variables that are supported outside the main runtime schema.
35. [LOW][CFG] `docker-compose.yml:4-7` — Make the local-only credential assumption explicit and externalize credentials before supporting nonlocal Compose exposure.
36. [LOW][DOC] `docs/AGENT_ENV.md:1-58` — Replace template placeholders with this repository's actual verification commands, URLs, and environment capabilities.
