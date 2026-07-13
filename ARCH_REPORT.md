# Architecture Audit Report
Generated: 2026-07-13T01:09:42Z

---

## Summary Table

| Category | Total | HIGH | MED | LOW |
|---|---|---|---|---|
| Module Boundaries | 3 | 0 | 2 | 1 |
| Inconsistent Patterns | 2 | 0 | 2 | 0 |
| Separation of Concerns | 4 | 1 | 2 | 1 |
| Abstraction & DRY | 3 | 0 | 2 | 1 |
| Single Source of Truth | 5 | 2 | 2 | 1 |
| Dependency Direction | 1 | 1 | 0 | 0 |
| Configuration & Secrets | 2 | 1 | 0 | 1 |
| Documentation Drift | 8 | 3 | 4 | 1 |
| TOTAL | 28 | 8 | 14 | 6 |

---

## Findings

### [MOD] Module Boundaries
| Severity | File | Issue |
|---|---|---|
| MED | `packages/lane-admin/src/observability.ts:62-97,120-168,214-255,310-400,429-527` | Admin read model 直接依賴 `sessions`、`messages`、`trajectory_events`、`session_jobs`、`waitlist_entries`、`api_keys` 等多個 lane 的實體 schema，並直接更新 `session_jobs`；雖符合跨 client observability 職責，schema/command coupling 沒有版本化 contract 或 package dependency 保護。 |
| MED | `packages/lane-sessions/src/services/history.ts:10-48,117-128`; `packages/lane-agent/src/runtime.ts:5-10` | Sessions 合理地擁有 `AgentTurnRunner` consumer port，但該 port 直接暴露 Drizzle `SessionRow`/`MessageRow`，且同檔包含 LLM prompt 序列化；persistence schema 與 agent execution contract 因此緊耦合。 |
| LOW | `tests/e2e/tier-a-scheduler.test.ts:2`; `tests/e2e/tier-a-replay.test.ts:2-3` | Root E2E 測試直接匯入 package 的 `src/` 內部檔案，而非 package export 或 HTTP contract；內部重構會繞過 package encapsulation 並直接破壞測試。 |

### [PAT] Inconsistent Patterns
| Severity | File | Issue |
|---|---|---|
| MED | `packages/lane-memory/src/embed.ts:15-23`; `packages/lane-memory/src/service.ts:61-72,90-133`; `packages/lane-memory/src/notes-service.ts:100-153,354-382` | Embedding provider 的所有例外都被無 log/trace 地轉成 `null`；寫入仍成功但缺少向量，讀取則悄悄退回 recent-memory。相同資料 API 會因不可觀測的外部失敗採不同 retrieval path。 |
| MED | `packages/lane-platform/src/config.ts:3-34`; `packages/lane-tools/src/http-policy.ts:18-32`; `packages/lane-tools/src/web-search.ts:24-32`; `packages/lane-admin/src/routes.ts:147-148` | 設定載入模式不一致：部分值經 Zod 驗證，tools/admin 另行直接讀取 `process.env` 並使用不同 coercion/fallback，導致相同部署設定在不同模組可能被接受、拒絕或解讀成不同值。 |

### [SOC] Separation of Concerns
| Severity | File | Issue |
|---|---|---|
| HIGH | `packages/lane-waitlist/src/service.ts:119-150`; `packages/lane-waitlist/src/invite.ts:34-52` | Approval 先把 waitlist entry 標為 approved，再於另一 DB context 建 API key，最後呼叫 ZSend；三步沒有 transaction、outbox、idempotency 或 compensation。Key/email 失敗可留下 approved-but-undelivered entry，ZSend 失敗更會遺失只顯示一次的 plaintext key。 |
| MED | `apps/orbita-api/src/inbound-email.ts:83-186` | HTTP route handler 內完成 session 查找/建立、兩次 memory 寫入、trajectory、prompt 組裝與非同步 agent turn；依賴雖已注入，但 transport 與完整 application use case 綁在一起，降低獨立測試與重用能力。 |
| MED | `packages/lane-scheduler/src/routes/jobs.ts:63-106,111-162` | 同一 route 檔同時包含 HTTP validation/response mapping、Drizzle insert、背景 polling worker、webhook delivery與更新排程狀態；相較 sessions/waitlist 的 route→service→DB 結構，transport、application 與 worker 職責未分離。 |
| LOW | `packages/lane-memory/src/routes/memories.ts:104-109`; `packages/lane-memory/src/service.ts:90-133` | Upsert service 回傳 `void`，route 以 `new Date()` 虛構 `updated_at`；presentation 層自行推測 persistence state，回應時間可能不同於 DB 的 `now()`。 |

### [DRY] Abstraction & DRY
| Severity | File | Issue |
|---|---|---|
| MED | `packages/lane-auth/src/db/client.ts:7-14`; `packages/lane-sessions/src/db/client.ts:7-14`; `packages/lane-memory/src/db/client.ts:7-9`; `packages/lane-scheduler/src/db/client.ts:7-9`; `packages/lane-harness/src/db/client.ts:7-14`; `packages/lane-credentials/src/db/client.ts:7-9`; `packages/lane-trajectory/src/db/client.ts:12-15`; `packages/lane-waitlist/src/db/client.ts:11-17`; `packages/lane-admin/src/settings.ts:19-25` | 九份近乎相同的 Postgres/Drizzle factory 各自決定 pool 上限與 client 欄位命名；`apps/orbita-api/src/index.ts:112-120` 每進程建立九個 pool，連線治理與關閉生命週期重複且不一致。 |
| MED | `packages/lane-agent/src/runtime.ts:85-202`; `packages/lane-agent/src/summarizer.ts:21-57` | OpenAI/MiniMax 與 Anthropic client 建立、key 檢查及 provider 錯誤處理在 runtime 與 summarizer 各自實作；修正 chat provider 初始化、錯誤分類或 failover 規則需同步兩份。 |
| LOW | `packages/lane-admin/src/settings.ts:73-80`; `packages/lane-tools/src/http-policy.ts:21-27` | HTTP allowed-domain 的逗號分隔、trim、lowercase 與 filter 邏輯在 Admin 與 Tools 重複；同一 policy parser 有兩個維護點。 |

### [SST] Single Source of Truth
| Severity | File | Issue |
|---|---|---|
| HIGH | `apps/orbita-api/src/migrate.ts:7-20`; `apps/orbita-api/migrations/init.sql:1-206`; `scripts/db-migrate.sh:20-29`; `docker-compose.yml:10-19`; `packages/lane-waitlist/src/service.ts:154-168` | 正式 startup 使用 consolidated SQL，但 `pnpm db:migrate` 的 per-lane 清單漏掉 scheduler `0002`、memory `0003` 與 W11-W32 新表；waitlist 又在 runtime 重複 DDL。Docker partial mounts 雖會由 API startup 補齊，仍形成必須人工同步的多重 schema 路徑。 |
| HIGH | `packages/lane-memory/src/db/schema.ts:3-25`; `apps/orbita-api/migrations/init.sql:84-92,180-190`; `packages/lane-memory/src/service.ts:21-30,107-128`; `packages/lane-memory/src/notes-service.ts:120-138,364-374` | 實際 DB 的 `client_memories.embedding` 與 `notes.embedding` 為 `vector(1024)`，但 Drizzle schema 完全沒有欄位；服務被迫以 raw SQL 讀寫，ORM 型別、migration metadata 與 production schema 已分裂。 |
| MED | `packages/lane-platform/src/config.ts:13-22`; `packages/lane-agent/src/config.ts:3-9`; `packages/lane-memory/src/config.ts:3-9`; `packages/lane-waitlist/src/config.ts:3-9` | 同一 env key（如 `MINIMAX_API_KEY`, `MINIMAX_BASE_URL`, `ORBITA_PUBLIC_BASE_URL`, `ORBITA_INSTANCE_FROM_EMAIL`）在多個 Zod schema 重複定義，沒有可組合的 shared schema；驗證與預設值可獨立漂移。 |
| MED | `packages/lane-harness/src/types.ts:69-87`; `packages/lane-harness/src/templates.ts:20-23`; `apps/orbita-api/src/index.ts:290-295` | Harness template catalog 同時由硬編碼 `HARNESS_CAPABILITIES.templates` 與 templates 目錄動態掃描提供；新增或刪除 JSON template 不會自動更新 capabilities。 |
| LOW | `packages/lane-harness/src/types.ts:26-35`; `packages/lane-memory/src/memory-inject.ts:6-13` | `memory_inject` 在 Harness 以 Zod schema 定義、在 Memory 另以手寫 TS type 定義；欄位集合目前相同，但 validation constraints 與 runtime contract 沒有共同來源。 |

### [DEP] Dependency Direction
| Severity | File | Issue |
|---|---|---|
| HIGH | `packages/lane-tools/src/http-policy.ts:6-15`; `packages/lane-admin/src/settings.ts:30-51,86-106` | Admin 透過 tools package 的 module-level mutable singleton 改變全域 HTTP policy；依賴以隱性副作用而非注入 port 表達，多 replica 不共享此狀態，測試並行與熱更新也會互相污染。 |

### [CFG] Configuration & Secrets
| Severity | File | Issue |
|---|---|---|
| HIGH | `apps/orbita-api/src/index.ts:86,143-145`; `packages/lane-platform/src/config.ts:3-26`; `.env.example:1-73` | 已有 E2E 文件說明的 `ORBITA_E2E_MOCK=1` 未納入 validated config 或 env reference，也沒有 production guard；生產誤設會在正常 200 回應下停用真實 LLM。 |
| LOW | `scripts/waitlist-invite-e2e-prod.sh:20-28` | Production E2E 腳本硬編碼個人 Gmail 作為 fallback，既是環境特定配置也在公開 repo 暴露 PII；未設定 env 時會向真實個人信箱寄送。 |

未發現 git-tracked source 中有符合常見 live API key、token 或 private-key 格式的秘密；測試預設值與 `.env.example` placeholder 未視為 live secret。

### [DOC] Documentation Drift
| Severity | File | Issue |
|---|---|---|
| HIGH | `docs/product-architecture.md:25-44,57-81,144-176`; `apps/orbita-api/src/index.ts:281-332`; `packages/lane-tools/src/registry.ts:427-445` | 被 `docs/README.md:15` 列為 live architecture 的文件仍將 Harness/W27 標為設計中，只列舊 profiles、7 tools及 W26 前 HTTP surface；實作已到 W34，包含 notes graph、Harness、MCP 與 14 個常駐 tools。 |
| HIGH | `docs/SESSION_HANDOFF.md:3-16,31-35`; `docs/CURRENT_STATUS.md:3-21`; `apps/orbita-api/src/index.ts:88` | 強制 resume 先讀的 handoff 仍記錄 2026-06-25、API w18 與 instance-email 任務；live status/code 已是 w34 與 AT editorial loop，會把下一個 agent 導向錯誤優先事項。 |
| HIGH | `docs/traceability-index.md:11-23`; `.agents/instructions/lane-based-development.md:145-210` | Traceability index 列出 10 個 lane skill/INTERFACE 路徑、2 個 contracts 路徑與 1 個 auth simulator；實際只有 2 個 lane skill，表內僅 5 個 INTERFACE 路徑有效（repo 全部 7 個），且零 contracts/simulators；index 也未列 admin、waitlist、harness、mcp。 |
| MED | `packages/lane-agent/INTERFACE.md:1-6`; `packages/lane-sessions/INTERFACE.md:1-6`; `packages/lane-profiles/INTERFACE.md:1-6`; `packages/lane-harness/INTERFACE.md:1-23` | 四個已出貨 package 的 boundary contract 仍為 `status: planned`（前三個更寫「not yet implemented」）；memory、credentials、tools、scheduler、trajectory、waitlist、mcp 七個 package 則完全沒有 INTERFACE。 |
| MED | `docs/dogfood-plan.md:7,14`; `docs/product-architecture.md:126`; `AGENTS.md:34`; `at-agent/README.md:6,53`; `docs/development-plan.md:6,13` | 多份 active 文件引用不存在的 `docs/loose-ends-checklist.md`、`docs/at-track-plan.md`、`docs/at-platform-answers.md` 與 `usr/memory-design-from-book.md`，造成 prerequisite 與設計依據無法追溯。 |
| MED | `docs/harness-design.md:1-13,333-368`; `packages/lane-harness/src/routes/harnesses.ts:36-308`; `apps/orbita-api/src/index.ts:310-318,382-389` | Harness design 頂部仍寫「not implemented」，但同文件後段與程式已顯示 H1/H1.5 routes、templates、tick、feedback 與 memory injection 出貨，文件內部及文件對程式皆矛盾。 |
| MED | `AGENTS.md:62-63`; `packages/lane-platform/src/config.ts:23-25`; `packages/lane-admin/public/admin.js:143-159` | Agent entrypoint 宣稱 daily quota 預設 200/1000 且 Admin 無 session list/trajectory；程式預設是 0/unlimited，Admin UI 明確提供 Recent sessions 與 trajectory replay。 |
| LOW | `docs/DEVELOPMENT_LANES.md:19-24,48-55,87-93` | 同一份 2026-07-09 live 文件在 lane map/parallel matrix 仍稱 active work 是 W32-W33，但稍後表格已記 W32-W34 shipped；短期工作指引未同步。 |

掃描範圍為全部 319 個 git-tracked 檔案。未掃描項目：gitignored `.env`/`.env.local`、`marketing-agent/` 與 `at-agent/` 的非 README 內容、generated `apps/orbita-web/public/docs/`、`node_modules/`、`dist/`、`coverage/`，以及 repo 外 `~/Orbiter-AT-dogfood/`；這些項目不可由本次 repository audit 驗證。

---

## Recommended Action Queue

Ordered by severity. Each item is self-contained and actionable.

1. [HIGH][SST] `apps/orbita-api/src/migrate.ts:7-20` — 指定單一 migration 權威來源，讓 startup 與 `pnpm db:migrate` 使用同一完整 migration set，並移除 runtime waitlist DDL。
2. [HIGH][SST] `packages/lane-memory/src/db/schema.ts:3-25` — 將兩個 `embedding vector(1024)` 欄位納入正式 schema 定義，使 ORM、migration 與 raw SQL 對齊。
3. [HIGH][SOC] `packages/lane-waitlist/src/service.ts:119-150` — 將 approval、key issuance 與 email delivery 設計成可恢復且冪等的 workflow，避免 partial success 遺失 plaintext key。
4. [HIGH][DEP] `packages/lane-tools/src/http-policy.ts:6-15` — 移除 module-level policy override，改由 composition root 注入明確、可跨 replica 一致讀取的 policy provider。
5. [HIGH][CFG] `apps/orbita-api/src/index.ts:86,143-145` — 把 `ORBITA_E2E_MOCK` 納入 validated config/env reference，並在 production 拒絕啟用。
6. [HIGH][DOC] `docs/product-architecture.md:25-176` — 更新 lane、wave、profiles、tools 與 HTTP surface 至 W34，或明確 archive 並指向現行權威文件。
7. [HIGH][DOC] `docs/SESSION_HANDOFF.md:3-35` — 將 handoff 更新為目前 w34/AT loop 狀態，避免 resume 流程讀取 w18 任務。
8. [HIGH][DOC] `docs/traceability-index.md:11-23` — 只列實際存在的 skills/contracts/simulators，並補入 admin、waitlist、harness 與 mcp。
9. [MED][MOD] `packages/lane-admin/src/observability.ts:62-527` — 將跨 lane read model/commands 定義為版本化 contract，至少把 `session_jobs` update 交回 scheduler owner。
10. [MED][MOD] `packages/lane-sessions/src/services/history.ts:10-128` — 保留 Sessions 擁有的 runner port，但以 domain DTO 取代 Drizzle rows，並把 LLM serialization 移出 persistence-oriented module。
11. [MED][PAT] `packages/lane-memory/src/embed.ts:15-23` — 為 optional embedding fallback 加入結構化 log/trajectory/metric，使降級行為可觀測。
12. [MED][PAT] `packages/lane-platform/src/config.ts:3-34` — 讓 tools/admin/API 接收已解析設定，不再於功能模組直接重讀 `process.env`。
13. [MED][SOC] `apps/orbita-api/src/inbound-email.ts:83-186` — 抽出 inbound-email application service；route 僅保留驗證、呼叫 use case 與回應 mapping。
14. [MED][SOC] `packages/lane-scheduler/src/routes/jobs.ts:63-162` — 分離 HTTP route、scheduler service/repository 與 background worker。
15. [MED][DRY] `packages/lane-auth/src/db/client.ts:7-14` — 建立共用 DB client/pool factory與統一生命週期，並明確設定每進程的總連線預算。
16. [MED][DRY] `packages/lane-agent/src/runtime.ts:97-202` — 集中 provider client 建立、key validation、error classification 與 failover policy，供 runtime/summarizer 重用。
17. [MED][SST] `packages/lane-platform/src/config.ts:13-22` — 提供可組合的 shared env schema fragments，移除跨 lane 重複 key 定義。
18. [MED][SST] `packages/lane-harness/src/types.ts:69-87` — 由實際 template catalog 產生 capabilities templates，刪除手動同步清單。
19. [MED][DOC] `packages/lane-agent/INTERFACE.md:1-6` — 將已出貨 contract 改為 active，並依 lane 規則為缺少的七個 package 補齊或明確豁免 INTERFACE。
20. [MED][DOC] `docs/dogfood-plan.md:7-14` — 補回四份被引用的設計文件，或移除/改寫所有失效連結與 prerequisite。
21. [MED][DOC] `docs/harness-design.md:1-13` — 更新狀態為 H1/H1.5 shipped，清楚區分已實作與 H2/H3 deferred。
22. [MED][DOC] `AGENTS.md:62-63` — 將 quota defaults 與 Admin UI capabilities 修正為程式實況。
23. [LOW][MOD] `tests/e2e/tier-a-scheduler.test.ts:2` — 經 package public exports 或 HTTP contract 測試 scheduler/trajectory，不直接引用 lane `src/`。
24. [LOW][SOC] `packages/lane-memory/src/routes/memories.ts:104-109` — 讓 service 回傳實際 persisted timestamp，route 不自行生成狀態值。
25. [LOW][DRY] `packages/lane-tools/src/http-policy.ts:21-27` — 集中 HTTP allowed-domain parser 供 Admin 與 Tools 共用。
26. [LOW][SST] `packages/lane-harness/src/types.ts:26-35` — 從單一 exported schema 推導 `MemoryInjectConfig` type，避免跨 package 手寫雙定義。
27. [LOW][CFG] `scripts/waitlist-invite-e2e-prod.sh:20-28` — 移除個人信箱 fallback，要求顯式設定測試收件地址。
28. [LOW][DOC] `docs/DEVELOPMENT_LANES.md:19-24,87-93` — 將 active work 與 parallel matrix 更新至 W34/W35 現況。
