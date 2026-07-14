# Architecture Audit Report
Generated: 2026-07-14T01:06:06Z

---

## Summary Table

| Category | Total | HIGH | MED | LOW |
|---|---|---|---|---|
| Module Boundaries | 4 | 1 | 2 | 1 |
| Inconsistent Patterns | 5 | 1 | 4 | 0 |
| Separation of Concerns | 4 | 1 | 3 | 0 |
| Abstraction & DRY | 5 | 0 | 4 | 1 |
| Single Source of Truth | 6 | 2 | 3 | 1 |
| Dependency Direction | 5 | 0 | 5 | 0 |
| Configuration & Secrets | 5 | 1 | 3 | 1 |
| Documentation Drift | 9 | 3 | 6 | 0 |
| TOTAL | 43 | 9 | 30 | 4 |

---

## Findings

### [MOD] Module Boundaries
| Severity | File | Issue |
|---|---|---|
| HIGH | `packages/lane-admin/src/observability.ts:47-168,196-255,286-401,403-534` | Admin owns a cross-lane raw-SQL read/write model over `sessions`, `messages`, `trajectory_events`, `api_keys`, `rate_limit_counters`, `session_jobs`, and `waitlist_entries`. The direct `UPDATE session_jobs` at lines 384-397 bypasses the scheduler lane entirely, so schema and invariant changes in multiple lanes can silently break Admin. |
| MED | `apps/orbita-api/src/inbound-email.ts:31-186` | The API host contains the complete inbound-email workflow: authentication, mailbox/session mapping, memory writes, trajectory logging, prompt policy, and asynchronous agent dispatch. This is a business capability inside the composition app rather than a bounded service/lane, making the app more than a thin host. |
| MED | `packages/lane-admin/src/settings.ts:1-107` | One module defines a Drizzle schema, creates and closes a Postgres pool, reads/writes deployment settings, parses environment policy, and mutates another package's runtime state. These are persistence, configuration, and cross-module coordination responsibilities in one file. |
| LOW | `packages/lane-scheduler/src/routes/jobs.ts:34-163` | The scheduler's HTTP route factory, job persistence, background polling loop, webhook delivery, and next-run updates share one route module. The transport and worker lifecycle cannot be tested or replaced independently. |

### [PAT] Inconsistent Patterns
| Severity | File | Issue |
|---|---|---|
| HIGH | `packages/lane-admin/src/middleware.ts:6-24`; `packages/lane-admin/src/observability-routes.ts:86-170` | The Admin middleware exempts any path containing `"/session"` (line 9), not only the three `/session` login routes. `/sessions` and `/sessions/{id}/trajectory/replay` also match, so cross-client session metadata and trajectory routes can bypass Admin authentication. |
| MED | `packages/lane-admin/src/middleware.ts:6-24`; `packages/lane-admin/src/routes.ts:48-87`; `packages/lane-admin/src/device-routes.ts:115-128`; `packages/lane-auth/src/routes/admin.ts:38-54` | Admin authentication is independently implemented in middleware, session handlers, device approval, and an optional Auth guard, with different exemption and error behavior. Security changes such as token rotation or auditing must be replicated across four paths. |
| MED | `apps/orbita-api/src/index.ts:86`; `packages/lane-admin/src/routes.ts:57,147-148`; `packages/lane-admin/src/device-routes.ts:80`; `packages/lane-platform/src/config.ts:3-34` | Most runtime settings use typed Zod loaders, but the E2E switch, `NODE_ENV`, and provider-key status read `process.env` directly. Validation and test injection therefore differ by component. |
| MED | `packages/lane-agent/src/runtime.ts:28-37,358-389`; `packages/lane-sessions/src/services/sessions.ts:202-209`; `packages/lane-platform/src/error-handler.ts:12-33` | Provider failures use `ProviderCallError`, while the HTTP error layer only preserves status semantics for `OrbitaError`. If primary and fallback providers fail, rate-limit/quota errors propagate as generic HTTP 500 responses instead of the structured provider error semantics used elsewhere. |
| MED | `packages/lane-credentials/src/routes/credentials.ts:34-39,49-53,66-76`; `packages/lane-auth/src/routes/admin.ts:11-30` | Credential creation calls the request field `scope` but returns/stores `scopes`; API-key creation consistently uses `scopes`. The same concept has two public vocabularies, increasing caller and OpenAPI integration errors. |

### [SOC] Separation of Concerns
| Severity | File | Issue |
|---|---|---|
| HIGH | `packages/lane-waitlist/src/service.ts:100-151` | Waitlist approval commits status first, then creates an Auth key, then optionally sends email, without a transaction or recoverable workflow boundary. A key or email failure leaves the row approved; retries then fail at lines 115-117, producing an unrecoverable partial state. |
| MED | `packages/lane-harness/src/routes/harnesses.ts:212-230` | The manual-trigger route directly queries Drizzle tables to enforce ownership before invoking the runner, while adjacent endpoints delegate persistence to `service.ts`. Persistence and authorization logic leak into the HTTP adapter. |
| MED | `packages/lane-scheduler/src/routes/jobs.ts:63-105` | The create-job handler performs webhook rules, schedule validation, next-run calculation, direct DB insertion, and response mapping inline. Domain rules and persistence are coupled to Hono rather than a scheduler service. |
| MED | `apps/orbita-web/public/waitlist.html:92-128` | A presentation page embeds the production API URL, request construction, response parsing, state transitions, and error handling. Preview/staging pages therefore submit to production and cannot switch backends independently from the rendered page. |

### [DRY] Abstraction & DRY
| Severity | File | Issue |
|---|---|---|
| MED | `packages/lane-auth/src/db/client.ts:7-15`; `packages/lane-sessions/src/db/client.ts:7-15`; `packages/lane-memory/src/db/client.ts:7-10`; `packages/lane-credentials/src/db/client.ts:7-10`; `packages/lane-scheduler/src/db/client.ts:7-10`; `packages/lane-harness/src/db/client.ts:7-14`; `packages/lane-waitlist/src/db/client.ts:5-17`; `packages/lane-trajectory/src/db/client.ts:7-15`; `packages/lane-admin/src/settings.ts:14-25` | Nine near-identical Postgres/Drizzle factories duplicate pool creation and lifecycle behavior. Pool limits, return field names, and close support have already diverged, so infrastructure fixes require coordinated edits across all lanes. |
| MED | `packages/lane-auth/src/routes/admin.ts:46-54`; `packages/lane-credentials/src/routes/credentials.ts:8-15` | `optionalAdminGuard` is copied verbatim into Credentials even though Auth exports it, and both copies are effectively optional under the mounted Admin middleware. The duplicate deprecated path obscures which guard is authoritative. |
| MED | `packages/lane-trajectory/src/db/client.ts:56-64`; `packages/lane-tools/src/registry.ts:55-65` | Secret-field redaction uses the same key regex in two separate implementations. Adding a sensitive-key pattern or recursive redaction behavior in one path can leave tool traces and persisted trajectories with different exposure rules. |
| MED | `packages/lane-tools/src/http-policy.ts:18-32`; `packages/lane-admin/src/settings.ts:54-83` | `ORBITA_HTTP_ALLOWED_DOMAINS` parsing and normalization is implemented twice. Admin's displayed policy and Tools' enforced policy can drift when parsing or defaults change. |
| LOW | `apps/orbita-web/public/index.html:11-31`; `apps/orbita-web/public/waitlist.html:11-27,82-91`; `apps/orbita-web/public/updates.html:11-28`; `scripts/build-web-docs.mjs:71-126` | Font imports, navigation, footer, brand links, and API links are copied across three static pages and the docs generator template. Site-wide navigation changes require multiple synchronized edits. |

### [SST] Single Source of Truth
| Severity | File | Issue |
|---|---|---|
| HIGH | `apps/orbita-api/migrations/init.sql:1-205`; `packages/lane-waitlist/src/service.ts:154-168`; `packages/lane-waitlist/src/db/schema.ts:3-12`; `docker-compose.yml:12-19`; `scripts/db-migrate.sh:20-29` | Database structure has competing authorities: a monolithic startup SQL file, per-lane Drizzle schemas/migrations, runtime waitlist DDL, Docker init mounts, and a separate migration-script list. They already differ: the Drizzle waitlist schema lacks the lowercase-email unique index, and `db-migrate.sh` omits scheduler cron and notes migrations mounted or created elsewhere. |
| HIGH | `packages/lane-harness/src/types.ts:40-46`; `packages/lane-harness/src/tick.ts:126-172` | Harness configuration accepts `output.mode: "webhook"` and `webhook_url`, but the execution/tick path never reads or delivers that output. The public schema advertises behavior that runtime silently ignores. |
| MED | `packages/lane-platform/src/config.ts:17,22`; `packages/lane-waitlist/src/config.ts:3-9`; `packages/lane-agent/src/config.ts:3-9`; `packages/lane-memory/src/config.ts:3-9` | `ORBITA_PUBLIC_BASE_URL`, `ORBITA_INSTANCE_FROM_EMAIL`, `MINIMAX_API_KEY`, and `MINIMAX_BASE_URL` are independently defined in multiple environment schemas. Validation and defaults for shared deployment settings have no single owner. |
| MED | `packages/lane-harness/src/types.ts:26-35`; `packages/lane-memory/src/memory-inject.ts:6-24` | `memory_inject` is separately defined as a constrained Zod schema in Harness and an unconstrained TypeScript type in Memory. Alternate callers of Memory can bypass Harness's depth and `top_k` bounds. |
| MED | `packages/lane-auth/src/routes/admin.ts:11-18`; `packages/lane-waitlist/src/service.ts:124-132` | Default API-key scopes are hardcoded separately in Auth key creation and Waitlist approval. Changing onboarding permissions in one path does not update the other. |
| LOW | `packages/lane-admin/src/session.ts:3-16`; `packages/lane-admin/src/routes.ts:53-60`; `packages/lane-admin/src/device-routes.ts:76-83` | Admin session lifetime is represented once as `SESSION_TTL_MS` and twice as an inline cookie `maxAge`. Token expiry and browser-cookie expiry can diverge. |

### [DEP] Dependency Direction
| Severity | File | Issue |
|---|---|---|
| MED | `apps/orbita-api/src/index.ts:112-120`; `packages/lane-*/src/db/client.ts`; `packages/lane-admin/src/settings.ts:19-25` | The composition root creates nine independent pools for one `DATABASE_URL`, with configured maxima totaling 58 connections per process. Infrastructure lifecycle is owned by each domain lane, and the app has no coordinated shutdown, making replica scaling and connection-budget changes cross-cutting. |
| MED | `packages/lane-admin/src/settings.ts:30-50,86-106`; `packages/lane-tools/src/http-policy.ts:6-15` | Admin controls Tools through `setHttpToolPolicyOverride`, a mutable module-global variable. The dependency is implicit global state rather than an injected policy provider, so test order and initialization order affect behavior. |
| MED | `packages/lane-waitlist/src/service.ts:3-4,100-132`; `packages/lane-waitlist/package.json:12-19` | Waitlist directly depends on Auth's concrete `AuthDb` and `createApiKey` service. There is no documented contract/port between onboarding and key issuance, so Auth storage or issuance changes force Waitlist changes. |
| MED | `packages/lane-agent/src/runtime.ts:3-10`; `packages/lane-agent/src/summarizer.ts:3-6`; `packages/lane-sessions/src/services/history.ts:117-128` | Agent Runtime depends on Sessions for turn-runner types, history serialization, assistant-output construction, message rows, and summarizer types. High-level model execution is coupled to session persistence-layer representations instead of a neutral runtime contract. |
| MED | `packages/lane-waitlist/src/invite.ts:9-53` | The Waitlist business lane directly constructs ZSend payloads and calls Zeabur's concrete endpoint. Replacing the email provider or testing delivery policy requires editing the onboarding domain rather than swapping an outbound-email port. |

### [CFG] Configuration & Secrets
| Severity | File | Issue |
|---|---|---|
| HIGH | `apps/orbita-api/src/index.ts:86,143-145`; `packages/lane-platform/src/config.ts:3-26` | `ORBITA_E2E_MOCK` is an unvalidated startup switch outside the central environment schema and has no production guard. An accidental production value silently replaces the real agent runtime with the E2E runner. |
| MED | `scripts/smoke-prod.sh:5`; `scripts/replay-trajectory.sh:5`; `scripts/eval-session.sh:5`; `.github/workflows/e2e-nightly.yml:31-39` | Production verification defaults to the legacy `orbita-api.zeabur.app` host, while the documented canonical host and other scripts use `api.get-orbita.com`. The nightly smoke can validate a different endpoint from the public production URL. |
| MED | `.env.example:1-73`; `scripts/setup-web-search-prod.sh:13-15`; `scripts/setup-instance-email-prod.sh:6-10`; `apps/orbita-api/src/index.ts:86` | The environment example omits operational settings used by committed code, including `ORBITA_API_URL`, `ORBITA_API_BASE`, `ORBITA_E2E_MOCK`, `CLOUDFLARE_ACCOUNT_ID`, and the two differently named Zeabur API service-ID variables. Deployment configuration is not fully discoverable from its designated template. |
| MED | `apps/orbita-api/src/inbound-email.ts:92-102,145-157`; `packages/lane-waitlist/src/service.ts:124-142`; `packages/lane-waitlist/src/invite.ts:20,30,34`; `usr/ORBITA_DESIGN.md:252-255` | Environment-specific client IDs, profile, sender address, production API/docs URLs, and the ZSend endpoint are embedded as source fallbacks. This conflicts with the architecture requirement for environment-only configuration and makes staging capable of targeting production resources when variables are absent. |
| LOW | `scripts/waitlist-invite-e2e-prod.sh:20-28` | A personal Gmail address is the default recipient for a side-effecting production E2E script. It is not a secret, but clones that omit the override send real test mail to a person-specific destination. |

### [DOC] Documentation Drift
| Severity | File | Issue |
|---|---|---|
| HIGH | `docs/traceability-index.md:11-23`; `apps/orbita-api/src/index.ts:3-81,226-332`; `packages/lane-admin/package.json:1-24`; `packages/lane-waitlist/package.json:1-19`; `packages/lane-harness/package.json:1-20`; `packages/lane-mcp/package.json:1-18` | The traceability index stops at lanes 0-9 and the API host, omitting shipped Admin, Waitlist, Harness, and MCP packages. It also points to contract directories, simulators, and eight lane skills that do not exist; the repo contains zero lane contract files and only two lane skills. |
| HIGH | `docs/product-architecture.md:42,80,123`; `docs/harness-design.md:10-13`; `packages/lane-harness/INTERFACE.md:1-23`; `apps/orbita-api/src/index.ts:75-80,308-318,382-389` | Product architecture and Harness docs still mark W27 as design/not implemented/planned, while routes, cron execution, feedback, templates, and production wiring are shipped through w34. The documented architecture reverses the actual subsystem status. |
| HIGH | `docs/SESSION_HANDOFF.md:3-35`; `docs/CURRENT_STATUS.md:3-40`; `apps/orbita-api/src/index.ts:88` | The mandatory resume document is dated 2026-06-25, reports production w18, and directs agents to instance-email work. Current status and code report w34 and AT dogfood, so following the documented resume path sends work to a stale milestone. |
| MED | `docs/dogfood-plan.md:7,14`; `docs/product-architecture.md:126`; `docs/development-plan.md:6,13`; `docs/harness-design.md:7,368`; `docs/at-editorial-poll.md:6`; `AGENTS.md:34`; `at-agent/README.md:6,53` | Active documentation references absent files: `docs/loose-ends-checklist.md`, `usr/memory-design-from-book.md`, `docs/at-track-plan.md`, and `docs/at-platform-answers.md`. Architecture and onboarding navigation therefore dead-end. |
| MED | `docs/product-architecture.md:151-176`; `apps/orbita-api/src/index.ts:281-332`; `packages/lane-memory/src/routes/notes.ts:61-319`; `packages/lane-harness/src/routes/harnesses.ts:36-325` | The documented “HTTP surface (today)” omits shipped Notes graph/search, Harness, MCP, and `whoami` routes, and compresses newer Admin/Waitlist/device surfaces into an incomplete note. Integrators cannot derive the current API architecture from the architecture document. |
| MED | `AGENTS.md:63`; `packages/lane-admin/src/observability-routes.ts:86-170`; `packages/lane-admin/public/admin.js:150-152,372-399` | Agent guidance says Admin has no session list or trajectory viewer, but both APIs and UI are implemented. This stale instruction can suppress maintenance or testing of a live administrative surface. |
| MED | `docs/product-architecture.md:31,36,144-149`; `docs/implementation-notes.md:22-24`; `packages/lane-tools/src/registry.ts:67-421`; `packages/lane-profiles/profiles/` | Architecture docs still describe three profiles and seven tools, while the code has seven profile JSON files and fourteen registered tool definitions plus conditional Docker support. Capability documentation no longer matches discovery/runtime behavior. |
| MED | `usr/ORBITA_DESIGN.md:137-151`; `packages/lane-credentials/src/routes/credentials.ts:17-116`; `apps/orbita-api/src/index.ts:238-256` | The foundation spec documents admin credential creation at `POST /v1/credentials`, but implementation mounts it at `POST /v1/admin/credentials`; only metadata listing remains at the caller path. The authoritative design exposes the wrong administrative boundary. |
| MED | `packages/lane-sessions/INTERFACE.md:1-22`; `packages/lane-profiles/INTERFACE.md:1-17`; `packages/lane-agent/INTERFACE.md:1-20`; `packages/lane-harness/INTERFACE.md:1-23`; `docs/traceability-index.md:15-22` | Shipped Sessions, Profiles, Agent, and Harness interfaces remain `status: planned`; seven other shipped lane packages have no `INTERFACE.md` at all. The required per-lane boundary contracts are neither complete nor current. |

---

## Recommended Action Queue

Ordered by severity. Each item must be self-contained and actionable.

1. [HIGH][PAT] `packages/lane-admin/src/middleware.ts:6-24` — Replace the substring-based session exemption with an exact allow-list for the intended login/session endpoints, then verify `/v1/admin/sessions*` always requires Admin authentication.
2. [HIGH][SOC] `packages/lane-waitlist/src/service.ts:100-151` — Redesign approval, key issuance, and invite delivery as an atomic or explicitly resumable workflow so partial failures can be retried without leaving approved entries unusable.
3. [HIGH][SST] `apps/orbita-api/migrations/init.sql:1-205` — Designate one schema/migration authority and make startup, lane development, Docker initialization, runtime DDL, and `db:migrate` consume the same migration sequence.
4. [HIGH][SST] `packages/lane-harness/src/types.ts:40-46` — Either implement Harness webhook delivery through an outbound adapter or reject/remove webhook configuration until the runtime supports it.
5. [HIGH][CFG] `apps/orbita-api/src/index.ts:86,143-145` — Move `ORBITA_E2E_MOCK` into validated configuration and prevent mock runtime selection in production.
6. [HIGH][MOD] `packages/lane-admin/src/observability.ts:47-534` — Introduce explicit read contracts for cross-lane observability and route scheduler mutations through the scheduler-owned service rather than Admin raw SQL.
7. [HIGH][DOC] `docs/traceability-index.md:11-23` — Rebuild the index from the 14 current packages, remove nonexistent assets, and add the missing interface/contract/skill status explicitly.
8. [HIGH][DOC] `docs/product-architecture.md:42,80,123` — Mark Harness as shipped and document its current routes, cron runtime, templates, feedback, and w34 memory injection.
9. [HIGH][DOC] `docs/SESSION_HANDOFF.md:3-35` — Replace the w18 email handoff with the current w34/AT-dogfood resume state or clearly close it so it cannot act as a stale authority.
10. [MED][MOD] `apps/orbita-api/src/inbound-email.ts:31-186` — Move inbound-email orchestration behind a bounded service/lane, leaving the Hono module responsible only for transport validation and response handling.
11. [MED][MOD] `packages/lane-admin/src/settings.ts:1-107` — Separate Admin DB/schema ownership, settings persistence, environment parsing, and Tools-policy coordination into focused modules.
12. [MED][PAT] `packages/lane-admin/src/middleware.ts:6-24` — Consolidate Admin token/cookie verification into one reusable policy used by session, device, and Admin route handlers.
13. [MED][PAT] `apps/orbita-api/src/index.ts:86` — Route all runtime environment reads through typed loaders and inject resolved values into Admin routes instead of reading process globals.
14. [MED][PAT] `packages/lane-agent/src/runtime.ts:28-37,358-389` — Define an API-boundary mapping for provider rate-limit, quota, and provider failures so all transports receive consistent structured error semantics.
15. [MED][PAT] `packages/lane-credentials/src/routes/credentials.ts:34-76` — Choose one public field name for credential scopes and align request schema, response schema, implementation, and documentation.
16. [MED][SOC] `packages/lane-harness/src/routes/harnesses.ts:212-230` — Move ownership lookup and manual-run preparation into the Harness service layer.
17. [MED][SOC] `packages/lane-scheduler/src/routes/jobs.ts:63-105` — Move schedule validation, next-run computation, persistence, and response mapping into a scheduler service callable outside Hono.
18. [MED][SOC] `apps/orbita-web/public/waitlist.html:92-128` — Externalize the Waitlist API client/configuration so preview and staging deployments can select a non-production endpoint.
19. [MED][DRY] `packages/lane-auth/src/db/client.ts:7-15` — Centralize Postgres/Drizzle pool construction and lifecycle policy while preserving lane-owned schemas.
20. [MED][DRY] `packages/lane-auth/src/routes/admin.ts:46-54` — Remove the copied optional guard path and make the mounted Admin authentication policy the sole authority.
21. [MED][DRY] `packages/lane-trajectory/src/db/client.ts:56-64` — Centralize sensitive-field redaction and use it for both tool traces and persisted trajectory payloads.
22. [MED][DRY] `packages/lane-tools/src/http-policy.ts:18-32` — Centralize HTTP-domain parsing/normalization so Admin display and Tools enforcement share one function.
23. [MED][SST] `packages/lane-platform/src/config.ts:17,22` — Define shared environment fields once and compose lane-specific schemas from that definition.
24. [MED][SST] `packages/lane-harness/src/types.ts:26-35` — Export one validated `memory_inject` contract and consume it from both Harness and Memory.
25. [MED][SST] `packages/lane-auth/src/routes/admin.ts:11-18` — Centralize default API-key scopes and reuse them for Waitlist-issued keys.
26. [MED][DEP] `apps/orbita-api/src/index.ts:112-120` — Establish one connection-budget and coordinated shutdown policy instead of nine independently sized pools per process.
27. [MED][DEP] `packages/lane-admin/src/settings.ts:30-50,86-106` — Replace Tools' mutable module-global policy override with an explicitly injected policy provider.
28. [MED][DEP] `packages/lane-waitlist/src/service.ts:3-4,100-132` — Put key issuance behind a documented Auth port/contract so Waitlist does not depend on Auth database and service details.
29. [MED][DEP] `packages/lane-agent/src/runtime.ts:3-10` — Move turn/history/output contracts to a neutral package or invert them so Sessions invokes Agent without Agent importing session persistence representations.
30. [MED][DEP] `packages/lane-waitlist/src/invite.ts:9-53` — Introduce an outbound-email interface and keep the ZSend-specific implementation in an infrastructure adapter.
31. [MED][CFG] `scripts/smoke-prod.sh:5` — Use the canonical production base URL consistently across smoke, replay, evaluation, and nightly CI.
32. [MED][CFG] `.env.example:1-73` — Document all committed runtime/deploy variables and standardize the two API-base and Zeabur service-ID naming variants.
33. [MED][CFG] `apps/orbita-api/src/inbound-email.ts:92-157` — Externalize production-specific identities and endpoints, with explicit development/staging defaults that cannot target production accidentally.
34. [MED][DOC] `docs/dogfood-plan.md:7,14` — Remove or restore all references to the four absent planning/design files and ensure active docs have valid navigation.
35. [MED][DOC] `docs/product-architecture.md:151-176` — Regenerate the current HTTP surface from mounted routes, including Notes, Harness, MCP, `whoami`, and complete Admin/Waitlist/device entries.
36. [MED][DOC] `AGENTS.md:63` — Update Admin UI capabilities to include session listing and trajectory replay.
37. [MED][DOC] `docs/product-architecture.md:31,36,144-149` — Synchronize profile/tool documentation with the profile directory and runtime registry, or reference those sources instead of maintaining manual counts.
38. [MED][DOC] `usr/ORBITA_DESIGN.md:137-151` — Correct the administrative credential route and distinguish it from caller-visible metadata listing.
39. [MED][DOC] `packages/lane-sessions/INTERFACE.md:1-22` — Mark shipped interfaces active, update their provided/consumed contracts, and add interface files for the seven uncovered lane packages.
40. [LOW][MOD] `packages/lane-scheduler/src/routes/jobs.ts:34-163` — Split HTTP route construction from the scheduler worker/tick lifecycle.
41. [LOW][DRY] `apps/orbita-web/public/index.html:11-31` — Generate or share the common static-site shell so navigation and footer changes have one source.
42. [LOW][SST] `packages/lane-admin/src/session.ts:3-16` — Export and reuse one Admin session lifetime for token expiry and both cookie-setting paths.
43. [LOW][CFG] `scripts/waitlist-invite-e2e-prod.sh:20-28` — Require an explicit recipient for production invite E2E instead of defaulting to a personal address.
