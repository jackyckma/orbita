---
status: active
maintained_by: jacky + ai-agents
created: 2026-06-22
last_updated: 2026-06-22
purpose: 個人自用 / self-host 定位下的待辦 wave、Skills/Tools 現況、擴充方法、建議 E2E 與網站範例。
related: docs/api-as-product.md, docs/product-architecture.md, docs/skills-authoring.md
---

# 個人自用 & Self-host — 待辦、Skills/Tools、E2E 範例

**定位：** 在決定是否推進 Hosted SaaS（見 `docs/api-as-product.md`）之前，Orbita 作為**個人系統**或**下載後自行部署**的產品，還缺什麼、Skills/Tools 怎麼擴、怎麼測、怎麼展示。

---

## 1. 目前已交付（W0–W10 摘要）

| 領域 | 已可用 |
|------|--------|
| 部署 | Docker Compose（Postgres + API）、Zeabur Git deploy、`pnpm dev` 本地 |
| 認證 | Admin 發 API key、Bearer + `x-orbita-client-id`、revoke、scopes |
| 會話 | 建立 session、messages turn、compression、profile 綁定 |
| Agent | MiniMax 主 + Anthropic fallback、tool loop |
| Memory | PUT/GET、pgvector 語意檢索（需 embedding key） |
| Credentials | Admin 寫入 vault、`credential_ref` 供 HTTP 工具 |
| Tools | 7 個 in-process 工具（見 §3） |
| Skills | 3 profiles + 4 個靜態 skill 檔 |
| Scheduler | `every_seconds` + cron、webhook 輸出 |
| Trajectory | events + replay API、輕量 eval |
| 品質 | Tier A/B E2E、CI、`smoke-prod.sh` |
| 網站 | get-orbita.com 行銷站 |

**結論：** 核心 agent runtime **已可自用**；缺口主要在 **擴充機制文件化**、**Docker 入門體驗**、**進階執行隔離**、**更多 E2E 展示場景**，而非「還不能跑」。

---

## 2. SaaS 決策之前 — 建議的 Wave（個人 / self-host）

**權威 wave 列表：** `docs/product-architecture.md`（W11–W16）。  
**Admin / 身份設計：** `docs/admin-ui-brainstorm.md`。

以下任務已併入 **W11–W13**：

### W11a — 域名與文件 polish（小）→ **W13**

| Task | 說明 |
|------|------|
| `api.get-orbita.com` | CNAME → Zeabur；更新行銷站連結 |
| Self-host 指南 | 一頁：`docker compose up`、`.env` 必填項、發 key、第一個 session |
| `CURRENT_STATUS.md` | 與 W10 對齊 |

### W11b — Self-host 體驗（中）→ **W13**

| Task | 說明 |
|------|------|
| Docker 文件 | `ORBITA_HTTP_ALLOWED_DOMAINS`、credentials、LLM keys 範例 |
| Postgres init | `docker-compose` 掛載的 drizzle 與 `init.sql` 對齊說明（API 啟動會跑 migrate） |
| `GET /v1/profiles`（可選） | 列出 `default` / `research` / `coding` 與 `allowed_tools` |
| 一鍵驗證 | `scripts/self-host-smoke.sh`（本地 compose 版 smoke） |

### W11c — 執行隔離（大，設計 §8）→ **W14**

| Task | 說明 |
|------|------|
| Docker sandbox tier | 工具在容器內執行（非僅 in-process `fetch`） |
| 或 E2B 後端 | 託管 sandbox（可選、可後置） |

**現況：** 僅 **Local in-process**；設計中的 Docker/SSH/E2B **未實作**。

### W11d — Skills/Tools 擴充 UX（中）→ **W13**（部分）

| Task | 說明 |
|------|------|
| Profile 範例庫 | 更多 `profiles/*.json` + skills（見 §4） |
| 自訂 profile 路徑 | env `ORBITA_PROFILES_DIR` 指向使用者目錄（可選） |
| 文件 | 「加一個 crawl API」逐步教學（§3.2） |

### W11e — E2E & 網站範例（中）→ **W13**

### W11 — Admin 頁（優先於上列多項）

見 `docs/admin-ui-brainstorm.md` — 單人持久 Admin UI（無 register），解決 remote 設定 credentials / API keys 的痛點。

| Task | 說明 |
|------|------|
| Tier A/B 場景擴充 | 見 §5 |
| 行銷站 Examples 區 | curl / 情境說明（可鏈 trajectory） |
| Tier B：`research` + `http_get` | 需 mock 或固定公開 URL |

### 刻意不做（v1 / 個人系統仍排除）

來自 `usr/ORBITA_DESIGN.md` §11、§15：

- Session fork / lineage
- Subagent / agent-to-agent
- Browser / desktop 自動化
- 聊天平台 bridge、語音、原生 App
- 動態第三方 skill 市場（無審核熱載）
- 完整 LLM-as-judge 評測（輕量 eval 已有）
- Localhost 打包二進位 CLI（deferred）
- 自助多租戶註冊（SaaS 才需要）

### Open items（設計 §16，自用仍建議補）

| 項目 | 現況 |
|------|------|
| API 版本政策 | `/v1` 有，deprecation 政策未定 |
| 錯誤 envelope | 已有 `@orbita/platform`，文件可再強調 |
| Rate limit 預設值 | 已實作；「建議預設 RPM」可寫進 self-host 指南 |
| Credential 輪換 | 僅 write-once；輪換流程未做 |
| Scheduler 多副本 | 文檔已警告；leader election 未做 |

---

## 3. Tools 現況與採用方法

### 3.1 (a) 已就緒的資源

**內建工具（`packages/lane-tools/src/registry.ts`）：**

| 工具 | 用途 |
|------|------|
| `echo` | 測試 / 驗證 tool loop |
| `http_get` | HTTPS GET；可選 `credential_ref` → Bearer |
| `http_post` | HTTPS POST JSON/text；同上 |
| `json_parse` | 解析 JSON 字串 |
| `json_stringify` | 序列化 JSON |
| `hash_sha256` | 雜湊 |
| `uuid_v4` | 產生 UUID |

**執行環境：** API 進程內 **同步執行**（非獨立 sandbox 容器）。

**HTTP 政策（`ORBITA_HTTP_*`）：**

| 變數 | 預設 | 說明 |
|------|------|------|
| `ORBITA_HTTP_ALLOWED_DOMAINS` | 空 = **允許任意 HTTPS host** | 逗號分隔，如 `api.firecrawl.dev,example.com` |
| `ORBITA_HTTP_TIMEOUT_MS` | `30000` | 請求逾時 |

僅允許 `https://`；回應截斷為 `body_preview`（約 2000 字元）。

**Profile 與工具的綁定：**

| Profile | `allowed_tools` |
|---------|-----------------|
| `default` | 全部 7 個 |
| `research` | `echo`, `http_get`, `http_post`, `json_parse` |
| `coding` | `echo`, `json_parse`, `json_stringify`, `hash_sha256`, `uuid_v4` |

**憑證（給 HTTP 工具用）：**

```bash
curl -X POST .../v1/admin/credentials \
  -H "x-orbita-admin-token: $ORBITA_ADMIN_TOKEN" \
  -d '{"client_id":"my-client","name":"crawl_api","secret":"fc-xxx","scope":[]}'
```

Agent 在 tool 參數用 `credential_ref: "crawl_api"`，**不**在 prompt 裡貼 key。

**發現能力：** `GET /v1/capabilities` 回傳 `tools: listRegisteredTools()`（工具名列表）。

### 3.1 (b) 使用者想採用新技術 / 工具時的方法

| 需求類型 | 做法 | 改程式？ |
|----------|------|----------|
| 呼叫現成 **REST API**（爬蟲、Notion、等） | `research` profile + `http_get`/`http_post` + credentials + `ORBITA_HTTP_ALLOWED_DOMAINS` | **否**（配置即可） |
| 新 **行為指引**（怎麼用 API、格式） | 新增 `profiles/skills/*.md`，在 profile JSON 的 `skills` 陣列引用 | 否（檔案 + JSON） |
| 新 **工具種類**（執行 shell、讀檔、專用 SDK） | 在 `lane-tools` 註冊新 `ToolDefinition`，profile `allowed_tools` 加入名稱 | **是**（TypeScript） |
| 更強 **隔離**（跑不可信程式碼） | 等 W11c Docker/E2B sandbox | 是（大項） |

**無**「上傳 plugin zip」或 runtime 動態載入工具。

---

## 4. 範例：Web Crawling API（Firecrawl 等）

### 4.1 (a) Agent 能否使用？

**可以**，若服務提供 HTTPS API 且你完成配置：

1. Profile 允許 `http_get` / `http_post`（用 `research` 或 `default`）。
2. `ORBITA_HTTP_ALLOWED_DOMAINS` 包含該 API 的 hostname（或留空允許全部）。
3. API key 存入 credentials vault，agent 用 `credential_ref`。

**不能：** 瀏覽器渲染、無 API 的純爬蟲、需要自訂 TLS 客戶端以外的協議。

### 4.2 (b) 流程

```text
1. 部署者：ORBITA_HTTP_ALLOWED_DOMAINS=api.firecrawl.dev（或該服務域名）
2. 部署者：POST /v1/admin/credentials → name: firecrawl, secret: fc-...
3. 部署者：API key 的 allowed_client_ids 包含你的 client_id
4. 呼叫者：POST /v1/sessions { "agent_profile": "research" }
5. 呼叫者：POST /v1/sessions/{id}/messages
   input: "Fetch https://example.com via Firecrawl scrape API and summarize"
6. Agent（依 skills）：http_post 到 Firecrawl endpoint，
   credential_ref: firecrawl，json_parse body_preview，回覆摘要
7. 檢查：GET /v1/sessions/{id}/trajectory → tool_call_start/complete
```

Skill 可寫入 `profiles/skills/firecrawl.md`（endpoint 形狀、參數），並加入 `research.json` 的 `skills` 陣列。

---

## 5. Skills 現況與整合機制

### 5.1 (a) 已就緒資源

| 資源 | 路徑 |
|------|------|
| Profile 定義 | `packages/lane-profiles/profiles/*.json` |
| Skill 正文 | `packages/lane-profiles/profiles/skills/*.md` |
| 慣例文件 | `docs/skills-authoring.md` |

**現有 profiles：** `default`, `research`, `coding`

**現有 skills：** `core.md`, `research.md`, `coding.md`, `api_http.md`

**綁定規則：**

- Session 建立時 `bindProfileSnapshot()` 讀取 skill 檔，寫入 `profile_snapshot.skill_contents`。
- **Session 生命週期內不可變**（prompt cache 約束）。
- Skills 是 **Markdown 行為指引**，不是可執行 code。

### 5.2 (b) 從外部 Skills Repo「加入」的方法

**沒有** git submodule、沒有 `import skill from url`、沒有市場 API。

| 步驟 | 動作 |
|------|------|
| 1 | 從外部 repo **複製或改寫**內容為 `{skill_id}.md` |
| 2 | 放到 `packages/lane-profiles/profiles/skills/` |
| 3 | 在 profile JSON 的 `"skills": ["core", "your_skill"]` 加入 id |
| 4 | 對齊 `allowed_tools`（HTTP 類 skill 需 `http_get`/`http_post`） |
| 5 | 重啟 API（或 redeploy）；**新 session** 才會載入 |

**外部 repo 若含可執行 code：** 不能當 skill 直接跑；需改寫成指引 + 用現有 HTTP 工具，或 **實作新 lane-tools 工具**。

**建議：**

- 個人 fork：直接改 monorepo 內 profiles 目錄。
- 未來可選：`ORBITA_PROFILES_DIR` 指向使用者目錄（W11d，未實作）。
- 動態載入 / 社群 skill：**Roadmap**，需安全設計（設計 §7）。

---

## 6. 建議 E2E 場景（可測試階段 + 網站範例）

### 6.1 現有覆蓋

| 層級 | 已有 |
|------|------|
| Tier A | health、mock turn、memory、cron 驗證、rate limit 429、replay |
| Tier B | live MiniMax + `echo` tool |
| Smoke prod | echo tool、trajectory、memory |

### 6.2 建議新增場景

| ID | 場景 | Profile | 驗證點 | Tier | 網站展示 |
|----|------|---------|--------|------|----------|
| E1 | Echo tool loop | `default` | trajectory `tool_call_*` | A mock / B live | ✅ 已有類似 |
| E2 | HTTP GET 公開 JSON API | `research` | `http_get` + `json_parse` | A（固定 URL mock）/ B | ✅「讀公開 API」 |
| E3 | HTTP + credential | `research` | admin credential + `credential_ref` | A（mock fetch） | 「安全呼叫第三方 API」 |
| E4 | Memory 寫入再語意查詢 | `default` | PUT memory + GET search | B（需 embedding） | 「跨 session 記憶」 |
| E5 | Session compress | `default` | 長對話後 POST compress | B | 「長上下文管理」 |
| E6 | Cron webhook | `default` | 建立 job + 觸發（mock webhook sink） | A | 「定時任務」 |
| E7 | Coding profile JSON | `coding` | `json_stringify` + `hash_sha256` | A/B | 「結構化輸出」 |
| E8 | Failover 展示 | `default` | 強制 primary 失敗（test hook） | A mock | 「多模型容錯」 |
| E9 | Crawl API（Firecrawl 等） | `research` | http_post + skill 指引 | B + 真實 key | 「網頁擷取整合」 |
| E10 | Trajectory eval gate | 任意 | `eval-session.sh` required_tools | A | 「可稽核執行」 |

### 6.3 網站 Examples 區建議結構

每個範例一卡：

1. **一句話能力**（人讀）
2. **curl 三步**（create key → session → message）
3. **預期 trajectory 事件**（`tool_call_start` 等）
4. 可選：鏈到 `GET /trajectory/replay` 範例 JSON（靜態 snippet）

不需在網站跑 live demo（避免暴露 key）；靜態腳本 + 「用 self-host 重現」即可。

---

## 7. Docker 文件特別說明（Skills/Tools 相關）

`docker-compose.yml` 目前：

- 掛載各 lane 的 **部分** drizzle SQL 到 Postgres init。
- **完整 schema**（含 `credentials`、`rate_limit_counters`）由 **API 啟動時** `runMigrations(init.sql)` 補齊。

Self-host 者應知：

```bash
docker compose up -d    # postgres + api
# 或：只起 postgres，pnpm dev（也會 migrate）
```

**`.env` 與 Tools 相關必填/建議：**

```bash
ORBITA_ADMIN_TOKEN=...
ORBITA_SECRETS_KEY=...          # credentials vault
MINIMAX_API_KEY=...             # agent turns
ORBITA_HTTP_ALLOWED_DOMAINS=      # 建議生產環境設白名單
```

README / docker 文件 **尚未** 詳述 HTTP 白名單與 credentials 流程 → W11b 待辦。

---

## 8. 決策對照

| 若你選… | 優先 wave |
|---------|-----------|
| 個人自用、少折騰 | W11a + W11b 文件；現功能已夠 |
| 開源給人 clone | W11b + W11d + W11e（範例與 E2E） |
| 整合更多外部 API | 配置 + skills 文件（§3–4）；無需新 wave |
| 跑 shell / 不可信 code | W11c sandbox |
| Hosted SaaS | 見 `docs/api-as-product.md` W12+ |

---

## Changelog

| 日期 | 變更 |
|------|------|
| 2026-06-22 | 初稿：待辦 wave、tools/skills 現況、爬蟲範例流程、E2E 與網站範例建議 |
