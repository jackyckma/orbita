---
status: decided-direction
maintained_by: jacky + ai-agents
created: 2026-06-22
last_updated: 2026-06-22
purpose: 產品方向 — Orbita hosted 如何對外開放（階段性邀請制 → 日後收費 SaaS）。Self-host 長期保留。
---

# Orbita API as a Product — 產品方向

**狀態：** **已決定方向**（階段性邀請制；正式 SaaS／收費待驗證後）  
**優先順序：** 先穩定自用（self-host + 個人 hosted），再開 waitlist／邀請，最後才做計費 SaaS。  
**相關：** `usr/ORBITA_DESIGN.md` §3、§15；`docs/product-architecture.md`；`docs/admin-ui-brainstorm.md`

---

## 0. 已決定：階段性對外開放

### 為什麼不一次開放自助註冊

- 產品剛標出來，需要一段**實戰測試**才能定價與限額。
- Production 伺服器 loading（LLM + Postgres + tools）**不可能長期完全免費**對公眾開放。
- **邀請制**可讓朋友先幫忙測（可接受短期免費或低限額），陌生人 meanwhile 只能 **waitlist**，不消耗 API 資源。

### 三階段路線

| 階段 | 名稱 | 陌生人 | 受邀／朋友 | 收費 | Orbita 對應 |
|------|------|--------|------------|------|-------------|
| **Phase 0**（現在） | 自用 + 穩定 + MA dogfood | 無 API 存取 | 你手動 `/admin` 發 key | 無 | **A + B** ✅；MA1 ✅ |
| **Phase 1** | 邀請制 hosted | **Waitlist**（`get-orbita.com/waitlist`） | Admin approve → 發 key | 測試期低 quota | **B+** 🔄 FormSubmit 確認 |
| **Phase 2** | 正式 SaaS | 註冊（或 waitlist → 開通） | 方案、用量 dashboard | **必須收費**（或硬 quota + 超額停） | **C** — W17+ metering + billing |

**長期保留：** **模式 A（Self-host）** 與開源 repo — 與 hosted 不衝突。

### Phase 0 → 1 最小增量（不必等 W17）

| 項目 | 說明 |
|------|------|
| Waitlist | `get-orbita.com` 一頁表單 → 存 DB／表單服務；**不**自動發 key |
| Invite | 沿用 `/admin` 手動建立 API key；可選 admin「從 waitlist approve」 |
| 控成本 | 現有 `rate_limit_per_minute`、少數 key、必要時調低 LLM 上限 |
| 用量可見 | W16 一部分：messages／tool calls 統計（invite 人數變多再做） |

### Phase 2 觸發條件（再排 W17）

- 邀請用戶反饋穩定、知道單 user 平均成本
- 願意維護 Terms／Privacy、支援渠道
- 需要 Stripe（或同類）與硬停服邏輯

### 決策檢查清單（2026-06-22 已答）

| 問題 | 決定 |
|------|------|
| 主要客群（短期） | **邀請制 + waitlist**，非陌生人自助 |
| Self-host 是否一級產品 | **是**，長期保留 |
| 計費（短期） | 朋友測試可免費；公眾 **waitlist 不收費**；正式開放前 **必須**有收費或硬 quota |
| LLM 成本 | 短期平台包（你的 key）；Phase 2 再定 BYOK 與否 |
| Dashboard | Phase 0–1：**Admin + API 足夠**；Phase 2 再考慮 user dashboard |
| W11–W14 | **無論 SaaS 與否都做** — 已完成 |

---

## 1. 先對齊：兩個 URL 各自是什麼？

很多人（包括「一般訪客」）**不會**直接打開 API 網址。先把兩個 hostname 分清楚：

| 網址 | 性質 | 訪客／開發者實際會看到什麼 |
|------|------|---------------------------|
| **https://get-orbita.com** | 行銷站（靜態 HTML） | 介紹 Orbita、Quick start、**Waitlist（Phase 1）**、Updates |
| **https://api.get-orbita.com** | HTTP API 後端 | JSON：`GET /v1/health`、`GET /v1/openapi.json`；未授權路徑 → 401 |

### 「Branding」在這裡指什麼？

**不是**「訪客打開 API 會看到漂亮網頁」。

指的是：

1. **網址一致** — 文件、行銷站、範例 curl 都寫 `api.get-orbita.com`，而不是 `orbita-api.zeabur.app`（Zeabur 內部 hostname）。
2. **信任感** — 同一品牌域名下：`get-orbita.com`（介紹）+ `api.get-orbita.com`（服務），像 `stripe.com` + `api.stripe.com`。
3. **基礎設施** — 可在 Cloudflare 上對 API 子域名做 proxy、WAF、TLS，與行銷站同一帳號管理。

把 API 掛到 `api.get-orbita.com` **本身不會**改變「對外開放程度」：  
仍是同一套 API、同一套 key；只是 URL 更好看、文件更一致。**是否允許陌生人註冊拿 key**，是另一個產品決定（見下文）。

### 誰會真的訪問 API URL？

| 角色 | 典型行為 |
|------|----------|
| 一般訪客 | get-orbita.com；Phase 1 可填 **waitlist**（仍無 API key） |
| 開發者／AI agent | `curl`、SDK、OpenAPI；帶 Bearer key 呼叫 sessions / messages |
| 你（營運） | smoke script、admin 發 key、看 trajectory |

---

## 2. 三種產品模式（可並存）

| 模式 | 誰用 | 認證 | 資料在哪 |
|------|------|------|----------|
| **A. Self-host** | 想完全自控的開發者 | 自己部署、自己 `ORBITA_ADMIN_TOKEN` 發 key | 使用者自己的 Postgres |
| **B. Hosted invite-only** | 早期合作方、朋友測試 | Admin 手動發 key；**無**陌生人自助註冊 | 你的 Zeabur + Postgres |
| **B+. Waitlist + invite** | 陌生人排隊；你 approve | Waitlist 不碰 API；approve 後同 B | 同上 + waitlist 儲存 |
| **C. Hosted SaaS** | 付費或自助外部用戶 | 帳號、自助 key、方案配額 | 多 tenant；metering + billing |

**目前實作狀態：**

| 模式 | 狀態 |
|------|------|
| A | ✅ Docker、文件、`self-host-smoke.sh` |
| B | ✅ Zeabur、`/admin`、rate limit、`api.get-orbita.com` |
| B+ | 📋 Waitlist 頁 + approve 流程（Phase 1） |
| C | 📋 W17+（Phase 2，**已決定要做收費**，時機待驗證後） |

**路線：** A 長期保留 → **Phase 0–1 走 B / B+** → 驗證後 **Phase 2 走 C**。

---

## 3. 若做「API as product」需考慮的事項

### 3.1 安全與濫用

| 議題 | 現況 | SaaS 通常需要 |
|------|------|----------------|
| 認證 | Bearer API key + `client_id` allow-list | 同上 + 帳號登入、key 歸屬 user/org |
| 隔離 | key 層級 `allowed_client_ids` | **account_id** 強制綁定 session / memory / vault |
| Rate limit | 每 key 每分鐘（Postgres） | 預設更嚴、依方案分級、異常偵測 |
| Edge | Zeabur 直連 | Cloudflare proxy、WAF、bot 防護 |
| 工具濫用 | `http_get/post` 域名白名單 | 每 tenant 配額、scheduler 濫用防護 |
| LLM 成本 | 你的 MiniMax/Anthropic key | 用量計費、硬上限、可選 BYOK |
| Admin 面 | 單一 `ORBITA_ADMIN_TOKEN` | 分權、審計、不可共用 god token |
| Scheduler | 多 replica 可能重複 tick | Leader election 或單 scheduler 節點 |
| 憑證 vault | 已加密 | 每 account 邊界、輪換 UX |
| 合規 | 未 formalize | 資料刪除、匯出、隱私政策、日誌保留期 |

### 3.2 產品與營運

- 自助註冊、email 驗證、忘記密碼／OAuth
- Dashboard（可選）：key 管理、用量、簡單 session 列表 — API-only 對 agent 夠用，**人**仍需要 onboarding UI
- 方案與計費（免費額度、超額停服）
- Status page、支援渠道、SLA 預期
- 文件與範例與「正式」base URL 一致

### 3.3 技術債與設計取捨

- `client_id` 目前是自由字串；SaaS 宜改為 account 下自動命名空間
- API 版本與 breaking change 政策（設計 §16 仍 open）
- Self-host 與 SaaS 功能分叉風險 — 用 **lane** 隔離 account 層，核心 agent runtime 共用

### 3.4 不做完整 SaaS（Phase 2）時仍可做的事

- ✅ `api.get-orbita.com`（W13）
- 強化 self-host 文件與一鍵 Docker
- Waitlist + 邀請制（Phase 1）
- 公開 GitHub — clone 自建即為有效「產品」

---

## 4. Wave 與階段對照

**Wave 列表：** `docs/product-architecture.md`

| 產品階段 | 建議 Wave | 說明 |
|----------|-----------|------|
| Phase 0 自用穩定 | W14 polish、E2E、文件 | **進行中** |
| Phase 1 邀請 + waitlist | 行銷站 waitlist；可選 W15 輕量 accounts | 不必 Stripe |
| Phase 2 收費 SaaS | W15–W16（accounts/admin）→ **W17** billing → W18 compliance | 驗證後再開 |

### W13 — Edge & 統一域名 ✅ Shipped

| Task | 狀態 |
|------|------|
| DNS `api.get-orbita.com` | ✅ |
| `ORBITA_PUBLIC_BASE_URL` | ✅ |
| 行銷站 / 文件 base URL | ✅（持續維護） |

### Phase 1 — Waitlist & invite（下一個產品增量）

| Task | 說明 |
|------|------|
| Waitlist 頁 | `get-orbita.com` 表單；後端可先用表單服務或 Orbita 旁小型 endpoint |
| Admin approve | 從 waitlist 手動發 key（或純 email + 現有 `/admin`） |
| 政策文案 | 「測試期邀請制、非公開 API」 |

### W17 — Quotas, billing & abuse（Phase 2 / SaaS）

| Task | 說明 |
|------|------|
| Metering | sessions、messages、tool calls、LLM tokens（估算） |
| Plans | 免費額度、硬停、429／403 |
| Abuse | 異常 auth、scheduler、http 工具告警 |
| Billing | Stripe（或類似）整合 |
| Scheduler | Leader election（若尚未在 W16 完成） |

### W18 — Compliance & ops hardening（SaaS 對外公開前）

| Task | 說明 |
|------|------|
| 資料刪除 | account 刪除 cascade |
| 審計 | 強化 admin / key 操作日誌 |
| 法律 | Terms、Privacy |
| 滲透／安全檢查 | 上線前 checklist |

**已由 W15–W16 涵蓋（非 SaaS 專屬）：** accounts、whitelist register、magic link、`/v1/me`、system admin monitoring — 見 `docs/admin-ui-brainstorm.md`。

### 依賴關係（簡圖）

```text
W0–W14   平台 + Admin + self-host + sandbox     ✅ Shipped
Phase 0  穩定自用                               ← 現在
Phase 1  Waitlist + invite (B+)                 ← 下一個產品里程碑
W15–W16  Multi-user + system admin              ← invite 人數多時；SaaS 前置
W17–W18  Billing + compliance (C)               ← Phase 2，已決定方向、待驗證後排期
```

---

## 5. 與「應用層 Agent」的邊界（例如 Marketing Agent）

Orbita repo = **平台**（HTTP API、lanes、通用 profiles/tools）。  
**具體業務 agent**（幫某專案做 X／LinkedIn 行銷）**不應**塞進 `orbita` 主 repo。

| 層級 | 放哪 | 例子 |
|------|------|------|
| 平台 | `orbita` repo | sessions、vault、scheduler、`research` profile |
| 應用設定 | **各專案 repo 的資料夾** 或日後獨立 repo | `skills/`、`profiles/marketing.json`、呼叫 API 的 script |
| Secrets | 永不進 git | Admin vault 或 deploy env |

是否需要**獨立 Marketing repo**，見 `docs/use-cases/marketing-agent.md` §「Repo 策略」— **早期不必**，等共用 skill 或多人協作再拆。

---

## 6. 相關文件

- `usr/ORBITA_DESIGN.md` — 身份模型、v1 刻意不做自助註冊
- `docs/product-architecture.md` — lane 與已交付 wave
- `docs/admin-ui-brainstorm.md` — Admin UI、multi-user、憑證分軌
- `docs/ops-multi-replica.md` — 多副本與 scheduler 注意事項
- `packages/lane-auth/INTERFACE.md` — 現有 auth 邊界

- `docs/use-cases/marketing-agent.md` — 應用層範例（非平台功能）

---

## Changelog

| 日期 | 變更 |
|------|------|
| 2026-06-22 | **決定方向：** Phase 0–1 邀請制 + waitlist；Phase 2 收費 SaaS；優先自用穩定 |
| 2026-06-22 | 初稿：三種模式、considerations、wave 草案 |
