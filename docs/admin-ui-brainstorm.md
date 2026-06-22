---
status: decided-direction
maintained_by: jacky + ai-agents
created: 2026-06-22
last_updated: 2026-06-22
purpose: Admin 介面、身份與憑證模型 — 單人至多人的設計決定（討論紀錄 + implementation 指引）。
related: docs/product-architecture.md, docs/self-host-and-extensions.md, docs/api-as-product.md
---

# Admin UI、身份與憑證 — 設計決定

**狀態：** W11 已實作（`/admin` 控制台）· multi-user 尚未實作  
**前提：** Local 與 Remote 部署同等重要；互動式 CLI（需 SSH）不是首選 UX。

---

## 1. 問題陳述

- Skills/Tools 相關設定（HTTP 白名單、credentials、API keys）目前依賴 `.env` 與 `ORBITA_ADMIN_TOKEN` + curl，自用可行，self-host 給他人時偏麻煩。
- 一次性 Setup wizard **不足** — 之後仍要加 credentials、發新 API key、改政策。
- 首選方案：**小型持久 Admin 頁**（非完整 SaaS dashboard）。

---

## 2. 已決定

| 主題 | 決定 |
|------|------|
| 主要 UX | 小型 Admin 頁，Setup 後可反覆進入 |
| 登入（有 SMTP） | **Magic link only**（暫不做 passkey / OAuth） |
| 登入（離線 / 無 email） | `ORBITA_ADMIN_TOKEN` → Admin 頁本地登入 |
| 遠端發起認證 | **Device flow**（API 回傳臨時 URL，瀏覽器完成）— Phase 2 |
| Register | **僅 multi-user 階段**；單人 localhost / 單人 remote **皆無 register** |
| Multi-user 第一步 | **Email whitelist** 限制可註冊者；之後再放寬 / approve / payment |
| Agent 發現 auth | `GET /v1/capabilities`（及 OpenAPI）**須描述** auth 模式與相關路徑 |
| 檔案 / batch import | **可選補充**，與 Admin 頁共用 vault 後端；Agent-first 自動化用 |
| SaaS | 見 `docs/api-as-product.md` — **尚未決定** |

---

## 3. 憑證與路由分類（單人起就分軌）

即使只有一個人，**API 層**區分 System Admin 與 User/Caller，方便 multi-user 擴充與 Agent 最小權限。

### 3.1 三種憑證

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. System Admin                                              │
│    今天：ORBITA_ADMIN_TOKEN → /v1/admin/*                      │
│    明天：browser session（magic link 或 admin token 換取）    │
│    用途：發 caller keys、寫 credentials、deployment 設定、      │
│          全系統 observability（將來）                          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 2. Caller API key（給 Agent）                                 │
│    orb_xxx + x-orbita-client-id                              │
│    用途：sessions、messages、memory、trajectory（自己的）       │
│    規則：Agent 永遠只用此類 key，不用 admin 憑證               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 3. Account owner session（multi-user 後）                       │
│    browser session → /v1/me/*                                │
│    用途：管理自己的 keys、credentials、revoke-all               │
└─────────────────────────────────────────────────────────────┘
```

**單人實務：** 不必強制兩把 `orb_` key；**你**用 admin 登入頁面，**Agent** 用一把 caller key 即可。

### 3.2 路由命名空間

| 前缀 | 對象 | 例子 |
|------|------|------|
| `/v1/*` | Caller / Agent | sessions, messages, memories, trajectory |
| `/v1/admin/*` | System admin | api-keys, credentials, deployment 設定, 全系統 metrics |
| `/v1/me/*` | Account owner（multi-user 後） | 自己的 keys、credentials、security |

**Trajectory：** 單一 session 的 `GET /v1/sessions/{id}/trajectory` 留在 caller API（Agent 合理需要）。跨 account / 全系統審計走 `/v1/admin/*`。

---

## 4. Admin 頁功能（Phase 1 — 單人）

無 register UI。

| 功能 | 說明 |
|------|------|
| 登入 | `ORBITA_ADMIN_TOKEN`（必備 fallback）；可選 magic link（需 SMTP） |
| API keys | 建立 / 列表 / 撤銷 caller keys；plaintext **僅顯示一次** |
| Credentials | 寫入 vault（Firecrawl 等）；`credential_ref` 供 `http_get`/`http_post` |
| 伺服器設定 | `ORBITA_HTTP_ALLOWED_DOMAINS` 等 **deployment 級**政策（見 §5） |
| LLM keys | 提示在 `.env` / 部署平台設定（deployment 級）；單人不在網頁填（除非日後 BYOK SaaS） |

掛在 API 同源（如 `api.get-orbita.com/admin`）或輕量 `apps/orbita-console`；**不**放在行銷站 `get-orbita.com`。

---

## 5. Deployment 級 vs Per-account 設定

| 設定 | 單人（現在） | 多人 / SaaS（將來） |
|------|-------------|---------------------|
| `ORBITA_HTTP_ALLOWED_DOMAINS` | **整機一份**（Admin「伺服器設定」或 `.env`） | 可先仍 deployment；必要時再 per-plan |
| `MINIMAX_API_KEY` 等 LLM | **整機一份** | 預設 deployment；BYOK 時 per-account vault |
| Firecrawl / Notion 等工具 key | **credentials vault**（per `client_id`） | 綁 **account_id** |
| Orbita caller API keys | admin 發放 | user 自助 + scopes |

Admin 頁分區：**伺服器設定** vs **我的憑證 / API keys**。

---

## 6. Phase 2 — Device flow

適合 Remote、無法 SSH 開本地 wizard：

```text
POST /v1/auth/device
→ { verification_url, device_code, expires_in }

（瀏覽器打開 URL，admin 登入 / 確認）

GET /v1/auth/device/poll?device_code=...
→ { admin_session 或短期 token }
```

要求：`device_code` 夠長、限時、限 poll 次數；verification 頁顯示授權內容。

---

## 7. 檔案 / API batch import（可選，Agent-first）

與 Admin 頁 **同一 vault / policy 後端**，不同 transport：

```text
POST /v1/admin/import   # 需 admin 憑證，與網頁同等門檻
{ "credentials": [...], "http_allowed_domains": [...] }
```

或啟動時讀 `ORBITA_CONFIG_DIR`（僅 bootstrap，建議仍需 bootstrap token）。

**安全要點：** 固定目錄、禁止路徑穿越、secrets 不進 log/trajectory、必須 admin auth。  
**不是**無 auth 讀任意檔案。

---

## 8. Multi-user（Roadmap — 非現階段）

### 8.1 Register 時機

```text
單人：localhost → 無 register
單人：remote 自用 → 無 register

Multi-user 開啟後：
  register + email verify + whitelist（第一步）
  → 逐步：放寬 / admin approve / payment（SaaS）
```

Bootstrap 搶註冊、公開掃描 register — **僅 multi-user 開關後**才需防護。

### 8.2 角色

| 角色 | 權限 |
|------|------|
| **Account owner** | 自己的 keys、credentials、`client_id`、revoke 自己的存取 |
| **System admin** | ban/remove user、全系統 monitoring、deployment 設定、審計 |

單人時同一人兼兩角；API **仍分軌**。

### 8.3 Revoke all access（帳號被盜）

一鍵操作（`/v1/me/security/revoke-all-access` 或 system admin 代操作）：

1. `UPDATE api_keys SET revoked_at = now() WHERE account_id = ?`
2. 作廢該 user 所有 browser session（或 session 版本號 +1）
3. 可選：email 通知、audit event

**不需** revoke 業務上的 `session_id`（對話 session）— 那些不是登入憑證。

---

## 9. 與現有 Orbita 模型的銜接

```text
api_key → allowed_client_ids[] → client_id → session → memory
```

Multi-user 後：`api_keys.account_id`、禁止跨 account 的 `client_id`。  
設計依據：`usr/ORBITA_DESIGN.md` §2–3。

---

## 10. Implementation waves（見 `docs/product-architecture.md`）

| Wave | 內容 |
|------|------|
| **W11** | Admin 頁 Phase 1（單人、無 register） |
| **W12** | Device flow + capabilities/OpenAPI auth 描述 |
| **W13** | Self-host 文件、E2E 範例、api 子域 |
| **W14** | Docker sandbox（lane 7） |
| **W15** | Multi-user：accounts、whitelist register、`/v1/me` |
| **W16** | System admin + 全系統 observability |
| **W17+** | Hosted SaaS（若決定）— `docs/api-as-product.md` |

---

## Changelog

| 日期 | 變更 |
|------|------|
| 2026-06-22 | 初稿：討論整理 — Admin 頁、憑證分軌、無 register 單人、multi-user whitelist、revoke-all、deployment vs per-account |
