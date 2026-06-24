---
status: active
maintained_by: jacky + ai-agents
created: 2026-06-22
last_updated: 2026-06-22
purpose: Marketing Agent 應用層工作計劃（平行於 Orbita W waves，不是 platform lane）。
related: marketing-agent/ (gitignored), docs/use-cases/marketing-agent.md, docs/product-architecture.md
---

# Marketing Agent — 應用層計劃（MA track）

**這不是 Orbita platform lane。** 這條線是 **用 Orbita API 跑行銷 agent** 的實戰與 dogfooding；工作檔在 **`marketing-agent/`**（gitignored，不上 GitHub）。

| 符號 | 含義 |
|------|------|
| **W0–Wn** | Orbita **平台** wave（`packages/*`、`apps/orbita-api`） |
| **MA0–Mn** | **Marketing Agent 應用** milestone（skills、runbooks、實際 campaign） |

兩條線 **並行**：MA 做唔到 → 記入 `marketing-agent/feedback-to-orbita.md` → 可能變成下一個 **W wave**。

---

## 為什麼唔加做 Lane 11？

| | Platform lane | MA track |
|---|---------------|----------|
| 程式位置 | `packages/lane-*` | 無（或將來外部 profile 檔） |
| GitHub | ✅ | ❌（內容在 `marketing-agent/`） |
| 部署 | Zeabur API | 只係呼叫 API |
| 版本 | `0.0.1-w14` | 無獨立 API version |

**結論：** 唔放入 lane 表；用 **本文件 + `marketing-agent/`** 追蹤。`docs/product-architecture.md` 有 **Application tracks** 一節指向這裡。

---

## MA milestones

| MA | 目標 | 狀態 | Orbita 依賴 |
|----|------|------|-------------|
| **MA0** | 工作區 scaffold、`orbita-connection.md`、第一個 `client_id` + caller key | ✅ | W11 admin、W13 profiles |
| **MA1** | Dogfood：為 **get-orbita.com / Orbita** 起草內容（draft-only） | ✅ | memory、sessions |
| **MA2** | 第二個產品資料夾 + weekly runbook + scheduler job | 📋 | W8 scheduler |
| **MA3** | 一個 channel 憑證進 vault + HTTP allow-list + draft→approve 流程 | 📋 | credentials、http tools |
| **MA4** | 可選：`marketing` profile（若放 Orbita repo 則變 W wave） | 📋 | profiles lane |

---

## Dogfooding 回饋

| 檔案 | 用途 |
|------|------|
| `marketing-agent/feedback-to-orbita.md` | MA 做時發現平台缺口（gitignored） |
| Orbita GitHub issue | 大改動用 issue + label `dogfooding` |

回饋例子：「memory 搜尋唔夠準」「admin 缺用量圖」→ 排進 **W15/W16**。

---

## 與產品路線

- Hosted invite-only：`docs/api-as-product.md` Phase 0–1 先穩定自用 + MA dogfood，再 waitlist。
- Marketing 業務 logic **永不** 默認進 `packages/*`；MA4 若要做 generic `marketing` profile 才開 W wave 討論。

---

## Changelog

| 日期 | 變更 |
|------|------|
| 2026-06-24 | MA1 ✅ dogfood X drafts；Phase 1 waitlist 頁上線 |
| 2026-06-22 | MA0 ✅；初稿 MA track |
| 2026-06-22 | 初稿：MA track 與 W waves 並行、唔做 lane |
