# Architecture Audit Report
Generated: 2026-07-11T01:07:02Z

---

## Summary Table

| Category | Total | HIGH | MED | LOW |
|---|---|---|---|---|
| Module Boundaries | 5 | 1 | 3 | 1 |
| Inconsistent Patterns | 6 | 0 | 4 | 2 |
| Separation of Concerns | 4 | 0 | 3 | 1 |
| Abstraction & DRY | 6 | 0 | 4 | 2 |
| Single Source of Truth | 6 | 1 | 3 | 2 |
| Dependency Direction | 4 | 1 | 3 | 0 |
| Configuration & Secrets | 5 | 1 | 4 | 0 |
| Documentation Drift | 10 | 1 | 5 | 4 |
| TOTAL | 46 | 5 | 29 | 12 |

---

## Findings

### [MOD] Module Boundaries
| Severity | File | Issue |
|---|---|---|
| HIGH | `packages/lane-admin/src/observability.ts:47-168,196-255,286-400,403-534` | Admin lane 直接以 raw SQL 讀寫 `sessions`、`messages`、`trajectory_events`、`session_jobs`、`waitlist_entries`、`api_keys` 與 `rate_limit_counters`，但 `packages/lane-admin/package.json:14-24` 並未宣告 sessions、scheduler 或 waitlist 依賴。這使 Admin 複製並繞過各 lane 的 schema 與服務契約；應建立明確的 read-model/reporting 邊界或由各 lane 提供唯讀介面。 |
| MED | `apps/orbita-api/src/inbound-email.ts:31-190` | App host 內同時負責 inbound 驗證、session 對應、memory 寫入、trajectory、prompt 組裝及非同步 agent turn；其他 HTTP 功能則由 lane route factory 提供。應將完整 inbound workflow 移到具名模組，app host 只保留組裝與掛載。 |
| MED | `packages/lane-scheduler/src/routes/jobs.ts:111-163`<br>`packages/lane-harness/src/tick.ts:126-173` | Scheduler 與 Harness 各自擁有 5 秒全表掃描、due 判斷與執行生命週期，形成兩個重疊的排程模組。應收斂單一 scheduler/worker 邊界，或清楚拆分觸發器與 harness 執行責任。 |
| MED | `packages/lane-waitlist/src/service.ts:38-168`<br>`packages/lane-waitlist/src/invite.ts:9-53` | Waitlist service 同時處理資料存取、狀態轉移、Auth API key 建立、ZSend 郵件與 runtime DDL，單一模組涵蓋過多責任。應分離 waitlist domain、provisioning port、email adapter 與 migration。 |
| LOW | `packages/lane-trajectory/src/db/client.ts:12-64` | `db/client.ts` 除了建立連線，亦包含 trajectory 寫入、查詢及 payload redaction；其他 lane 的 DB client 多只處理連線。應把領域操作移到 service/repository，client 保持基礎設施責任。 |

### [PAT] Inconsistent Patterns
| Severity | File | Issue |
|---|---|---|
| MED | `packages/lane-auth/src/db/client.ts:5-14`<br>`packages/lane-harness/src/db/client.ts:5-14`<br>`packages/lane-waitlist/src/db/client.ts:5-18` | 相同 Postgres/Drizzle handle 在各 lane 分別命名為 `client` 或 `sql`；Waitlist 同時暴露兩者，而 close 函式只存在於部分 lane。應統一 DB handle 形狀、命名與 shutdown contract。 |
| MED | `apps/orbita-api/src/index.ts:86-92`<br>`packages/lane-tools/src/http-policy.ts:12-32`<br>`packages/lane-tools/src/web-search.ts:24-32`<br>`packages/lane-admin/src/routes.ts:140-150`<br>`packages/lane-admin/src/device-routes.ts:73-83` | 啟動程式已使用 Zod loader，但 E2E、tools 與 admin 又直接讀 `process.env`，造成驗證、預設值與依賴注入模式不一致。應在 composition root 一次解析並將 typed config 注入 consumers。 |
| MED | `packages/lane-auth/src/routes/admin.ts:36-59,99-100,157-158,197-198`<br>`packages/lane-credentials/src/routes/credentials.ts:8-20,63-65,109-111`<br>`apps/orbita-api/src/index.ts:238-256` | Admin 已由 parent middleware 保護，route 內仍保留 deprecated optional guard；Credentials 又複製同一 guard。Production 組裝未傳 guard，使這些檢查成為 no-op。應選定 middleware 為唯一 admin auth pattern 並移除平行路徑。 |
| MED | `apps/orbita-web/package.json:5-10`<br>`scripts/deploy-web.sh:5-7,22-26` | `pnpm --filter @orbita/web deploy` 直接部署 `public`，根部署腳本則先建置 docs；兩個看似等價的 deploy 入口產出不同內容。應保留一個 canonical deploy flow，確保 docs build 不會被跳過。 |
| LOW | `packages/lane-sessions/src/routes/sessions.ts:68-72` | Session create 在 handler 內手寫 scope 檢查；同檔其他路由與其他 lanes 使用 `requireScope` middleware。應統一 scope enforcement pattern。 |
| LOW | `apps/orbita-api/src/index.ts:281-332` | `whoami`、`capabilities` 與 MCP 以 inline handlers 掛載，而其他功能使用 lane route factories；這也讓 MCP 未自然納入 OpenAPI route 定義。應讓各擁有者提供一致的 route factory。 |

### [SOC] Separation of Concerns
| Severity | File | Issue |
|---|---|---|
| MED | `apps/orbita-api/src/index.ts:140-215,345-389` | Composition root 內嵌 memory/note adapters、memory-context 政策、trajectory 裝飾、scheduler agent execution 與失敗處理，而不只是建立依賴及掛載路由。應將 runtime orchestration 封裝為可注入的 service/factory。 |
| MED | `packages/lane-memory/src/service.ts:14-31,90-132`<br>`packages/lane-memory/src/notes-service.ts:100-147,354-381` | Memory domain services 直接維護 raw pgvector SQL，並依 embedding 是否存在在 raw SQL 與 ORM 間切換；資料存取細節與 domain workflow 混在一起。應建立 vector repository/adapter，讓 service 使用單一資料存取契約。 |
| MED | `packages/lane-scheduler/src/routes/jobs.ts:63-106,111-163` | Route 模組同時執行 job persistence、排程規則及長生命週期 background tick。應把 job service 與 worker 移出 HTTP presentation module。 |
| LOW | `packages/lane-harness/src/routes/harnesses.ts:212-230` | Manual trigger handler 直接查詢 harness table，再呼叫 tick executor，繞過同 package 已存在的 service API。應由 service 負責 ownership lookup 與 trigger orchestration。 |

### [DRY] Abstraction & DRY
| Severity | File | Issue |
|---|---|---|
| MED | `packages/lane-auth/src/db/client.ts:7-14`<br>`packages/lane-sessions/src/db/client.ts:7-14`<br>`packages/lane-memory/src/db/client.ts:7-10`<br>`packages/lane-trajectory/src/db/client.ts:12-15`<br>`packages/lane-scheduler/src/db/client.ts:7-10`<br>`packages/lane-harness/src/db/client.ts:7-14`<br>`packages/lane-credentials/src/db/client.ts:7-10`<br>`packages/lane-waitlist/src/db/client.ts:11-18` | 八個 lane 重複實作近乎相同的 postgres + drizzle factory 與部分 close 邏輯。應抽出共享 DB factory，再由 lane 提供 schema。 |
| MED | `scripts/setup-web-search-prod.sh:5-36,76-91`<br>`scripts/setup-instance-email-prod.sh:5-38,58-81`<br>`scripts/smoke-prod.sh:17-29`<br>`scripts/replay-trajectory.sh:19-27`<br>`scripts/eval-session.sh:23-31` | 多個 ops 腳本重複 `.env` 載入、Zeabur admin token 解析、allow-list merge、ephemeral API key 建立與 auth headers，且細節已分歧。應建立共用 shell helper，讓 scripts 只描述各自流程。 |
| MED | `packages/lane-memory/src/service.ts:14-31,106-128`<br>`packages/lane-memory/src/notes-service.ts:119-147,354-374` | `client_memories` 與 `notes` 各自複製 vector literal、embedding upsert 與 similarity query 模板。應提供共用 pgvector repository operations。 |
| MED | `packages/lane-harness/src/types.ts:26-35`<br>`packages/lane-memory/src/memory-inject.ts:6-13` | `memoryInjectSchema` 與 `MemoryInjectConfig` 重複定義相同欄位，未由 schema 推導型別或共用契約。應由 memory lane 匯出 canonical schema/type 供 Harness 使用。 |
| LOW | `apps/orbita-web/public/index.html:1-31`<br>`apps/orbita-web/public/waitlist.html:1-28`<br>`apps/orbita-web/public/updates.html:1-31`<br>`scripts/build-web-docs.mjs:71-126` | Marketing pages 與 docs generator 手動複製 head、navigation 及 footer shell，內容更新需同步多處。應使用同一靜態模板/partial build。 |
| LOW | `packages/lane-scheduler/src/routes/jobs.ts:15-32,73-76`<br>`packages/lane-scheduler/src/schedule.ts:32-60` | 「every_seconds 與 cron 恰好擇一」同時存在 Zod refine 與 service validator。應指定單一規則來源，避免錯誤訊息與條件漂移。 |

### [SST] Single Source of Truth
| Severity | File | Issue |
|---|---|---|
| HIGH | `apps/orbita-api/src/migrate.ts:7-20`<br>`apps/orbita-api/migrations/init.sql`<br>`scripts/db-migrate.sh:20-29`<br>`packages/lane-waitlist/src/service.ts:154-168` | Schema 有三條權威路徑：啟動時執行 monolithic `init.sql`、手動腳本執行 per-lane SQL、Waitlist runtime DDL。`db-migrate.sh` 亦漏掉現有 `lane-memory/drizzle/0003_notes.sql` 與 `lane-scheduler/drizzle/0002_cron.sql`。應選定單一 migration source/runner，移除 runtime DDL 與不完整路徑。 |
| MED | `packages/lane-memory/src/db/schema.ts:3-25`<br>`packages/lane-memory/drizzle/0002_vectors.sql:1-6`<br>`packages/lane-memory/drizzle/0003_notes.sql:1-10` | Drizzle schema 未宣告 `client_memories.embedding` 與 `notes.embedding`，但 migrations 與 runtime SQL 依賴兩欄。應讓 typed schema 完整反映 deployed schema。 |
| MED | `packages/lane-agent/src/config.ts:3-9`<br>`packages/lane-memory/src/config.ts:3-9`<br>`packages/lane-platform/src/config.ts:17-22`<br>`packages/lane-waitlist/src/config.ts:3-9` | `MINIMAX_API_KEY`、`MINIMAX_BASE_URL`、`ORBITA_PUBLIC_BASE_URL` 與 `ORBITA_INSTANCE_FROM_EMAIL` 在多個 env schemas 重複定義。應建立共享 config schema/section，由 consumers 引用同一定義。 |
| MED | `scripts/smoke-prod.sh:5`<br>`scripts/replay-trajectory.sh:5`<br>`scripts/eval-session.sh:5`<br>`scripts/setup-web-search-prod.sh:13`<br>`scripts/setup-instance-email-prod.sh:6` | 同一 API base 使用 `ORBITA_API_URL`、`ORBITA_API_BASE`，預設又分成 canonical `api.get-orbita.com` 與 Zeabur hostname；nightly workflow 未覆寫舊預設。應定義單一 env 名稱與 canonical production default。 |
| LOW | `packages/lane-waitlist/src/config.ts:17-23`<br>`.env.example:47-49` | Waitlist CORS 預設 origins 同時寫在程式 fallback 與 env example，兩者皆可被視為預設來源。應只保留 canonical default，example 說明覆寫方式。 |
| LOW | `packages/lane-platform/src/config.ts:12`<br>`packages/lane-admin/src/observability-routes.ts:15-25` | Rate-limit 預設 `120` 同時存在 platform schema 與 observability route fallback。應由 composition root 傳入已解析值，移除第二個預設。 |

### [DEP] Dependency Direction
| Severity | File | Issue |
|---|---|---|
| HIGH | `apps/orbita-api/src/index.ts:110-122`<br>`packages/lane-auth/src/db/client.ts:7-10`<br>`packages/lane-sessions/src/db/client.ts:7-10`<br>`packages/lane-harness/src/db/client.ts:7-10`<br>`packages/lane-admin/src/settings.ts:19-21` | App 對同一 `DATABASE_URL` 建立九個獨立 pools；各 lane 上限合計約 58 connections，另有 migration connection。這把 domain modularity 綁成資源倍增，擴充 lane 會持續增加 DB 壓力。應由 composition root 建立共享 client/pool 並注入各 lane。 |
| MED | `packages/lane-agent/src/runtime.ts:1-2,85-230` | 高階 agent runtime 直接建立 OpenAI 與 Anthropic SDK clients，provider error mapping、tool loop 與 orchestration 位於同檔；替換 provider 需修改核心 runtime。應定義 LLM provider port，將 SDK 放入 adapters。 |
| MED | `packages/lane-harness/src/tick.ts:1-17,23-96`<br>`packages/lane-harness/src/service.ts:1-8,55-87` | Harness 直接依賴 Scheduler 的 cron/agent execution、Sessions DB/service 與 Memory DB/service，使一個高階 loop abstraction 綁定三個具體 lanes。應注入 scheduling、session execution 與 memory ports，由 app host 組合。 |
| MED | `packages/lane-admin/src/settings.ts:5-6,28-51,86-106`<br>`packages/lane-tools/src/http-policy.ts:6-15` | Admin 透過 `@orbita/tools` setter 改寫 module-level mutable global policy，形成反向的隱性 runtime coupling；測試或同 process consumers 共享狀態。應使用顯式 policy provider/依賴注入。 |

### [CFG] Configuration & Secrets
| Severity | File | Issue |
|---|---|---|
| HIGH | `packages/lane-scheduler/src/webhook.ts:11-37`<br>`packages/lane-scheduler/src/routes/jobs.ts:15-23,69-71` | Caller 提供的 webhook URL 被直接 `fetch`，未套用現有 HTTPS/hostname allow-list、timeout 或 shared HTTP policy。這是 SSRF 與無界等待風險。應將 webhook delivery 經受控 HTTP adapter，套用同一 URL policy 與 timeout。 |
| MED | `scripts/smoke-prod.sh:5-8,18-59`<br>`scripts/replay-trajectory.sh:5,19-25`<br>`scripts/eval-session.sh:5,23-29` | Production smoke/eval 使用 `curl -k` 跳過 TLS 驗證，因此 CI 無法偵測失效或錯誤憑證。應讓 production scripts 驗證 TLS，僅在明確的 local/self-host path 允許 insecure mode。 |
| MED | `.env.example:1-73`<br>`apps/orbita-api/src/index.ts:86`<br>`apps/orbita-email-worker/src/index.ts:3-6`<br>`scripts/cloudflare-dns-api.sh:7` | 已使用的 operator/runtime 設定如 `ORBITA_E2E_MOCK`、`ORBITA_API_URL`、`ORBITA_API_CNAME_TARGET` 未在 `.env.example` 分區記錄；相反地 `CURSOR_API_KEY` 被列在 runtime example 但 API 不讀取。應按 runtime、worker、E2E、deploy ops 完整整理設定文件。 |
| MED | `apps/orbita-web/public/waitlist.html:88-111` | 功能性 waitlist POST endpoint 寫死 production API，Pages preview、staging 或 self-host 不能以設定切換 backend。應由建置期或部署 config 注入 functional endpoint。 |
| MED | `scripts/waitlist-invite-e2e-prod.sh:20-24` | Production E2E 腳本把個人 Gmail 設為預設收件人，將 operator PII 與執行副作用綁入 repository。應要求顯式 env 或使用無投遞的 example placeholder。 |

### [DOC] Documentation Drift
| Severity | File | Issue |
|---|---|---|
| HIGH | `docs/site/quick-start.md:11-23`<br>`packages/lane-admin/src/middleware.ts:6-24`<br>`packages/lane-auth/src/routes/admin.ts:11-30,118-129` | Public quick start 以 `Authorization: Bearer` 傳 admin token，但實作只接受 `x-orbita-admin-token` 或 admin cookie；範例 body 還包含未定義的 `label`，並告知讀取 `api_key`，實際 response 欄位是 `key`。照文件操作會失敗或誤讀結果。應依實際 contract 更新完整範例。 |
| MED | `docs/harness-design.md:1-13`<br>`docs/product-architecture.md:40-44,77-81`<br>`packages/lane-harness/INTERFACE.md:1-23` | 三份文件仍把 Harness/W27 標成 planned 或 not implemented，但 API 已掛載 routes、migration 與 cron tick。應標明 H1/H1.5 已出貨，僅 H2/H3 為 deferred。 |
| MED | `docs/SESSION_HANDOFF.md:3-16,23-35`<br>`docs/CURRENT_STATUS.md:3-19`<br>`apps/orbita-api/src/index.ts:88` | Canonical resume 文件仍寫 w18 與 instance-email 任務；目前 status/code 已是 w34 Harness memory inject + MCP。應刷新 handoff 或明確歸檔並指向 current status。 |
| MED | `docs/product-architecture.md:120-126`<br>`docs/development-plan.md:4-13`<br>`docs/harness-design.md:6-7`<br>`at-agent/README.md:5-6,50-54` | 文件引用不存在的 `docs/loose-ends-checklist.md`、`docs/at-track-plan.md`、`docs/at-platform-answers.md` 與 `usr/memory-design-from-book.md`。應恢復權威文件或把所有引用改到現有 canonical docs。 |
| MED | `docs/traceability-index.md:11-23` | Traceability index 指向多個不存在的 lane skills、INTERFACE 與 contracts，且未列 admin、waitlist、harness、MCP lanes；實際只有 7 個 `packages/lane-*/INTERFACE.md`。應以現有檔案重建 index，缺失項明確標記而非提供幽靈路徑。 |
| MED | `docs/product-architecture.md:25-44,144-176`<br>`packages/lane-tools/src/registry.ts:427-446`<br>`apps/orbita-api/src/index.ts:281-332` | Architecture 文件仍列 7 tools 加 docker_echo，HTTP surface 未列 notes、Harness、MCP、whoami 與 capabilities，且 Harness 狀態過期。應以 OpenAPI 與 package entry points 更新 lane/tool/route 清單。 |
| LOW | `docs/AGENT_ENV.md:1-58` | Capability matrix 仍含日期、staging URL、verification commands 與 local-only tasks placeholders，無法履行 agent 選擇驗證層級的用途。應填入專案實際命令與環境限制。 |
| LOW | `docs/development-plan.md:17-24,49-53` | Wave table 顯示 W33/W34 已完成，但小節仍標 `W33–W35 (planned)`；同節又註記 W34 shipped。應把已出貨與仍 planned 的 W35 清楚分開。 |
| LOW | `docs/api-as-product.md:25-42`<br>`apps/orbita-web/public/waitlist.html:92-119` | Phase 1 表格仍寫 FormSubmit 確認與 waitlist 不自動發 key的舊方向；目前 native API + admin approve + optional ZSend 已存在。應更新產品階段與實際流程。 |
| LOW | `AGENTS.md:56-64`<br>`packages/lane-admin/src/observability-routes.ts:86-203` | Workspace facts 聲稱 Admin UI 沒有 session list 或 trajectory，但 admin observability routes/UI 已提供兩者。應修正 agent-facing architecture facts，保留「無 inbound mail viewer」的正確限制。 |

---

## Recommended Action Queue

Ordered by severity. Each item is self-contained and actionable.

1. [HIGH][MOD] `packages/lane-admin/src/observability.ts:47-534` — 建立明確 reporting/read-model 邊界，停止 Admin 直接依賴其他 lanes 的私有 table schema。
2. [HIGH][SST] `apps/orbita-api/src/migrate.ts:7-20`、`scripts/db-migrate.sh:20-29`、`packages/lane-waitlist/src/service.ts:154-168` — 選定單一 migration source/runner，補齊現行 schema 並移除 runtime DDL。
3. [HIGH][DEP] `apps/orbita-api/src/index.ts:110-122` — 建立單一共享 Postgres pool/client 並注入所有 DB-backed lanes，避免約 58 個潛在 connections。
4. [HIGH][CFG] `packages/lane-scheduler/src/webhook.ts:11-37` — 將 webhook 經受控 HTTP adapter，強制 HTTPS、allow-list、timeout 與一致錯誤紀錄。
5. [HIGH][DOC] `docs/site/quick-start.md:11-23` — 依實際 admin header、request schema 與 response 欄位修正 public quick start。
6. [MED][MOD] `apps/orbita-api/src/inbound-email.ts:31-190` — 把 inbound workflow 抽至具名模組，讓 app host 僅組裝依賴。
7. [MED][MOD] `packages/lane-scheduler/src/routes/jobs.ts:111-163`、`packages/lane-harness/src/tick.ts:126-173` — 收斂重疊的 polling scheduler 與執行生命週期。
8. [MED][MOD] `packages/lane-waitlist/src/service.ts:38-168` — 分離 waitlist domain、Auth provisioning、email adapter 與 schema migration。
9. [MED][PAT] `packages/lane-*/src/db/client.ts` — 統一 DB handle 命名、close contract 與型別形狀。
10. [MED][PAT] `apps/orbita-api/src/index.ts:86-92`、`packages/lane-tools/src/http-policy.ts:12-32`、`packages/lane-admin/src/routes.ts:140-150` — 一次解析 typed env 並以 DI 取代 consumers 的 raw `process.env`。
11. [MED][PAT] `packages/lane-auth/src/routes/admin.ts:36-59`、`packages/lane-credentials/src/routes/credentials.ts:8-20` — 移除 deprecated/duplicated optional admin guards，統一使用 parent middleware。
12. [MED][PAT] `apps/orbita-web/package.json:5-10` — 讓 package deploy 走包含 docs build 的 canonical deployment flow。
13. [MED][SOC] `apps/orbita-api/src/index.ts:140-215,345-389` — 封裝 runtime adapters、memory policy、trajectory 與 scheduled execution，縮小 composition root。
14. [MED][SOC] `packages/lane-memory/src/service.ts:14-132`、`packages/lane-memory/src/notes-service.ts:100-381` — 建立 pgvector repository，將 raw SQL 與 domain workflow 分離。
15. [MED][SOC] `packages/lane-scheduler/src/routes/jobs.ts:63-163` — 將 persistence service 與 background worker 移出 route module。
16. [MED][DRY] `packages/lane-*/src/db/client.ts` — 抽出共享 Postgres/Drizzle factory，lane 僅提供 schema。
17. [MED][DRY] `scripts/setup-web-search-prod.sh`、`scripts/setup-instance-email-prod.sh`、`scripts/smoke-prod.sh` — 建立共用 ops shell library，集中 env、token、allow-list 與 API auth helpers。
18. [MED][DRY] `packages/lane-memory/src/service.ts:14-128`、`packages/lane-memory/src/notes-service.ts:119-374` — 共用 vector upsert 與 similarity query operations。
19. [MED][DRY] `packages/lane-harness/src/types.ts:26-35`、`packages/lane-memory/src/memory-inject.ts:6-13` — 由單一 exported schema 推導 memory injection type。
20. [MED][SST] `packages/lane-memory/src/db/schema.ts:3-25` — 把 deployed embedding columns 加入 canonical typed schema。
21. [MED][SST] `packages/lane-agent/src/config.ts`、`packages/lane-memory/src/config.ts`、`packages/lane-platform/src/config.ts`、`packages/lane-waitlist/src/config.ts` — 集中重複 env schema fields。
22. [MED][SST] `scripts/smoke-prod.sh:5`、`scripts/setup-web-search-prod.sh:13` — 統一 API base env 名稱與 `api.get-orbita.com` production default。
23. [MED][DEP] `packages/lane-agent/src/runtime.ts:1-230` — 定義 LLM provider port，將 Anthropic/OpenAI SDK 封裝到 adapters。
24. [MED][DEP] `packages/lane-harness/src/tick.ts:1-96`、`packages/lane-harness/src/service.ts:1-87` — 以 scheduling/session/memory ports 取代 Harness 對具體 lane DB/services 的依賴。
25. [MED][DEP] `packages/lane-admin/src/settings.ts:5-106` — 以顯式 policy provider 取代對 tools module global state 的 setter。
26. [MED][CFG] `scripts/smoke-prod.sh`、`scripts/replay-trajectory.sh`、`scripts/eval-session.sh` — 移除 production `curl -k`，恢復 TLS 驗證。
27. [MED][CFG] `.env.example:1-73` — 分 runtime、worker、E2E 與 deploy ops 補齊實際 env names，移出非-runtime Cursor key。
28. [MED][CFG] `apps/orbita-web/public/waitlist.html:88-111` — 讓 functional API endpoint 可由 build/deploy config 注入。
29. [MED][CFG] `scripts/waitlist-invite-e2e-prod.sh:20-24` — 移除個人 Gmail 預設，要求顯式測試收件人。
30. [MED][DOC] `docs/harness-design.md`、`docs/product-architecture.md`、`packages/lane-harness/INTERFACE.md` — 同步 Harness H1/H1.5 shipped 與 H2/H3 deferred 狀態。
31. [MED][DOC] `docs/SESSION_HANDOFF.md` — 更新至 w34 現況或歸檔並指向 `CURRENT_STATUS.md`。
32. [MED][DOC] `docs/product-architecture.md`、`docs/development-plan.md`、`docs/harness-design.md`、`at-agent/README.md` — 修復所有不存在的文件引用。
33. [MED][DOC] `docs/traceability-index.md:11-23` — 依現有 lanes、skills、INTERFACE 與 contracts 重建 traceability index。
34. [MED][DOC] `docs/product-architecture.md:25-176` — 依實際 packages、OpenAPI routes 與 tool registry 更新 architecture inventory。
35. [LOW][MOD] `packages/lane-trajectory/src/db/client.ts:12-64` — 將 trajectory operations/redaction 移至 service/repository。
36. [LOW][PAT] `packages/lane-sessions/src/routes/sessions.ts:68-72` — 使用共用 scope middleware 取代 inline scope check。
37. [LOW][PAT] `apps/orbita-api/src/index.ts:281-332` — 讓 whoami、capabilities 與 MCP 的擁有模組提供一致 route factories。
38. [LOW][SOC] `packages/lane-harness/src/routes/harnesses.ts:212-230` — 透過 harness service 執行 ownership lookup 與 manual trigger。
39. [LOW][DRY] `apps/orbita-web/public/*.html`、`scripts/build-web-docs.mjs:71-126` — 共用 marketing/docs page shell template。
40. [LOW][DRY] `packages/lane-scheduler/src/routes/jobs.ts:15-32`、`packages/lane-scheduler/src/schedule.ts:32-60` — 將 schedule validation 收斂到單一來源。
41. [LOW][SST] `packages/lane-waitlist/src/config.ts:17-23`、`.env.example:47-49` — 保留單一 Waitlist CORS 預設。
42. [LOW][SST] `packages/lane-platform/src/config.ts:12`、`packages/lane-admin/src/observability-routes.ts:15-25` — 移除第二個 rate-limit default。
43. [LOW][DOC] `docs/AGENT_ENV.md` — 填入 Orbita 實際 verification commands、staging URL 與 cloud/local 限制。
44. [LOW][DOC] `docs/development-plan.md:17-53` — 分開已出貨 W33/W34 與 planned W35。
45. [LOW][DOC] `docs/api-as-product.md:25-42` — 更新 Phase 1 為 native waitlist API、admin approve 與 optional ZSend 流程。
46. [LOW][DOC] `AGENTS.md:56-64` — 修正 Admin 已有 session list 與 trajectory replay 的 workspace fact。
