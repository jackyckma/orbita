---
status: active
maintained_by: jacky
created: 2026-08-07
purpose: Founder-facing runbook — how to feed Orbita Autopilot, and what to do outside this repo.
related: docs/autopilot/, docs/personal-steward/portfolio-hub.md, docs/autopilot/automations.md
---

# 創辦人執行指南：Autopilot 餵任務 × 專案外配合

這份文件給你**照著做**，不必重讀技術細節。  
中線願景（多專案 hub）見 [`docs/personal-steward/portfolio-hub.md`](../personal-steward/portfolio-hub.md)。  
本頁分兩塊：**(1) 只在 Orbita 這個 repo**；**(2) 其他專案／Claude／Framework**。

---

## 你要記住的心智模型（30 秒）

```text
你批准方向 (roadmap epic = approved)
        ↓
你或 agent 寫好可驗收的任務 (backlog = ready)
        ↓
Cursor Maker（每天 2 次）自動實作 → 開 PR（標題含 T-xxxx）
        ↓
Cursor Checker（晚一小時）驗證 → merge main →（可選）prod smoke
```

- **你負責：** 方向、拍板、把任務寫清楚（或叫會話 agent 代寫後你瞄一眼）。  
- **Autopilot 負責：** 在已批准範圍內實作、開 PR、合併、簡單守護。  
- **Autopilot 不會：** 發明產品方向、合併沒有 `T-xxxx` 的雜 PR、在你沒批准的 epic 裡亂拆需求。

Orbita 時區／排程（已在 Cursor UI）：

| 角色 | Cron (UTC) | 約 UTC+2 |
|------|------------|----------|
| Maker | `0 7,19 * * *` | 09:00 / 21:00 |
| Checker | `0 8,20 * * *` | 10:00 / 22:00 |

---

# 第一部分：在 Orbita repo 裡怎麼餵任務

工作目錄：`~/orbita`（GitHub `jackyckma/orbita`，分支 `main`）。  
所有 Autopilot 狀態都在 **`docs/autopilot/`**。

## 1.1 三層檔案（只動該動的）

| 檔案 | 誰寫 | 作用 |
|------|------|------|
| `roadmap.json` | **你（或你授權的會話）** | 大方向。只有 `status: "approved"` 的 epic，Maker 的 REPLAN 才准拆成任務 |
| `backlog.json` | 你／會話／Maker REPLAN | 具體 `T-xxxx` 任務佇列。`ready` 才會被 IMPLEMENT |
| `decisions.json` | 需要你判斷時 | 選項 + 建議；沉默過 SLA 可走 `default_if_silent` |

其餘（`locks.json`、`pause-state.json`、`playbook.md`）一般**不要手改**，除非要緊急暫停。

## 1.2 標準流程：從「我想做 X」到 Autopilot 動手

### 步驟 A — 確認／新增 epic（方向）

打開 `docs/autopilot/roadmap.json`。

1. 若已有相關 epic 且是 `approved` → 跳到步驟 B。  
2. 若只有 `proposed` → 你把 `status` 改成 `"approved"`（表示准許拆任務）。  
3. 若完全沒有 → 新增一筆，例如：

```json
{
  "id": "E-08",
  "title": "Notes list/filter for hub briefs",
  "goal": "Agents can list notes by project, type, and date range.",
  "status": "approved",
  "phase": "hub-h2",
  "decomposes_into": [],
  "decisions": [],
  "notes": "Additive API; do not break semantic search."
}
```

**影響：** `proposed`／`paused` 的東西 Maker **不會**當燃料；只有 `approved` 會進自動推進。

### 步驟 B — 寫任務進 backlog（燃料）

打開 `docs/autopilot/backlog.json`，在 `tasks` 陣列加入物件。最少要有：

| 欄位 | 要求 |
|------|------|
| `id` | `T-` + 四位數字，勿重複（例如 `T-0040`） |
| `title` | 一行人話 |
| `description` | **夠具體**：改哪些路徑、做什麼、不要做什麼 |
| `acceptance` | **一組 shell 指令**，在 repo 根目錄跑、exit 0 才算過（這是 Autopilot 的及格線） |
| `deps` | 依賴的其他 `T-xxxx`；沒有就 `[]` |
| `status` | 要馬上被撿 → `"ready"` |
| `flag` | 新 UX 若需 feature flag 就填名稱；純 API／docs 常為 `null` |
| `retries` / `feedback` | 新任務用 `0` 與 `[]` |

**範例（示意）：**

```json
{
  "id": "T-0040",
  "lane": "platform",
  "phase": "hub-h2",
  "title": "Add GET /v1/notes list filters: project, type, since, until",
  "description": "In packages/lane-memory notes routes/service: support query params project, type, since, until on list (or dedicated filtered list). Auth remains client-scoped. Do not remove semantic /notes/search. Add/extend tests. Document one curl example in docs/personal-steward/memory-conventions.md.",
  "acceptance": [
    "pnpm --filter @orbita/memory test",
    "pnpm --filter @orbita/api typecheck",
    "rg -n \"since|until|project\" packages/lane-memory/src/routes/notes.ts"
  ],
  "deps": [],
  "flag": null,
  "status": "ready",
  "retries": 0,
  "feedback": []
}
```

把 epic 的 `decomposes_into` 補上 `"T-0040"`（可選但建議，方便對帳）。

### 步驟 C — 推上 main

```bash
cd ~/orbita
git checkout main && git pull
# 編輯 docs/autopilot/roadmap.json / backlog.json
git add docs/autopilot/roadmap.json docs/autopilot/backlog.json
git commit -m "Queue T-0040 for Autopilot (notes list/filter)."
git push
```

**必須在 `main` 上。** Maker 每次先 pull main；只留在 local 或別的 branch，Autopilot **看不見**。

### 步驟 D — 自測「下一個會不會撿到」

```bash
node scripts/autopilot/decide-next-action.mjs --lane maker
node scripts/autopilot/queue-status.mjs
```

期望：回傳 `IMPLEMENT` + 你的 `taskId`（或佇列裡更前面的 ready 任務）。  
若是 `IDLE`／別的任務：檢查 `status`、`deps`、是否被 `locks`／`pause` 卡住。

### 步驟 E — 等 Cursor Automation

下一輪 Maker／Checker 會跑。你可在 GitHub 看是否出現標題含 **`T-0040`** 的 PR，以及是否被 Checker merge。

---

## 1.3 寫任務時的實用規則（減少卡住）

1. **Acceptance 必須是指令，不是感覺。**  
   差：`search works better`  
   好：`pnpm --filter @orbita/memory test`
2. **一件任務一件事。** 太大 → 拆成 T-0040 / T-0041（實作 → 測試 → docs）。  
3. **寫清「不要做什麼」。** 避免 Maker 擴大範圍。  
4. **需要你判斷的** → 先開 `decisions.json`，任務先 `blocked`／不要標 `ready`，或等決定後再改 `ready`。  
5. **PR 標題必須含 `T-xxxx`。** Maker playbook 已要求；Checker **只**審這類 PR。  
6. **緊急停機：** 編輯 `docs/autopilot/pause-state.json`（依 playbook／現有 pause 欄位）並 push main——細節以該檔 schema 為準；或先把相關任務改成非 `ready`。

## 1.4 你平常「不用」做的事

- 不必每次手動開 feature branch／開 PR（Maker 做）。  
- 不必自己 merge Autopilot 的 `T-xxxx` PR（Checker 做）——除非 Checker 失敗要你處理 `needs_human`。  
- 不必在 Cursor Automation UI 改長 prompt（邏輯在 `playbook.md`）。

## 1.5 現況佇列（2026-08-07 快照）

已在 `approved`＋多半已有 `ready` 任務，**你不必重寫**也能讓近幾天跑：

| Epic | 內容 | 任務 |
|------|------|------|
| E-02 | Notes export → API `0.0.1-w36` | T-0010…12 |
| E-03 | AT harness 狀態腳本（唯讀） | T-0020 |
| E-04 | note_search 調查／修復 | T-0030 |

Hub 中線（E-07）仍是 `proposed`——**要 Autopilot 做 hub 平台／協定實作前，先把對應 epic 改 `approved` 並寫好 `ready` 任務。**

---

# 第二部分：Orbita 以外，你要怎樣配合

這塊對應「portfolio hub」與多專案生活；細節願景在 `portfolio-hub.md`。這裡只列**你要執行的動作**。

## 2.1 角色分工（你 vs Claude vs 各 repo）

| 層 | 誰 | 你要做什麼 |
|----|-----|------------|
| **宏觀討論／派工閘門** | 你 + Claude（Desktop／MCP） | 在 Claude 談跨專案；**拍板後**再變成各處的任務／instruction |
| **記憶與報告彙總** | Orbita `personal-jacky` | 用 Claude／Cursor 讀寫 notes；種筆記用手動（D-001=A），不要叫 Orbita Maker 瞎編個人內容 |
| **各專案實作** | 該 repo 的 Autopilot（目標：Framework 帶齊） | 每個重要專案各自有 `docs/autopilot/*` + 兩條 Cursor Automation |
| **Deploy** | 各 repo CI（GitHub → Zeabur 等） | 維持「merge main 即部署」；Orbita **不管**跨專案部署按鈕 |

## 2.2 其他專案（Powerhouse、AT、…）要怎樣才接得上

目標狀態（中線）：專案 **opt-in** → 提供統一 **report API** → Orbita **pull** → 你在 Claude 看 brief → 過關後 instruction 進該 repo Autopilot。

**你現在就能做的配合（不必等平台全好）：**

1. **確認該 repo 已採用 AI Dev Framework**（與 Orbita 同源的 methodologies／Autopilot 骨架）。  
   - 若尚未有 `docs/autopilot/`：在該專案做一次 framework sync／bootstrap（依該 repo 的 `.agents/instructions/framework-adoption.md`）。  
2. **在該專案 Cursor 建立 Maker + Checker 兩條 Automation**（cron 可先與 Orbita 錯開，避免你同時被吵）。  
3. **用與第一部分相同的方法** 餵該 repo 的 `roadmap.json` / `backlog.json`。  
4. **Report API（H1）**：等 Framework 寫好契約後，在專案開啟「對 Orbita hub 開放」的設定，實作 `GET …/orbita/report`（只讀）。在那之前，可用**手動／半自動**把短報告寫進 Orbita notes（`type: report` + `project` slug）當過渡。  
5. **第一批優先：** Powerhouse、ai-transformation、Orbita 自己——報告內容先用六區塊（見下）。

**v1 報告六區塊（三專案共用）：**  
`intent_vs_actual` · `shipped` · `needs_founder` · `autopilot` · `risks` · `ask`  
（定義見 `portfolio-hub.md`。）

## 2.3 Claude／ChatGPT 這邊你要怎樣用

1. **連線：** Claude Custom Connector → Orbita MCP（已通則維持；憑證在 `~/.orbita-personal.env`，勿貼進聊天）。  
2. **日常：** 「摘要某專案自某日起的 reports／需要我拍板的」——在 list/filter API 補上之前，可請 Claude 用 search + 你補充的日期／專案關鍵字，並接受偶爾漏網。  
3. **派工：** 在 Claude 討論到你滿意 → 再：  
   - 寫入 Orbita `type: instruction` 筆記；且／或  
   - 直接（或請會話 agent）把對應 `T-xxxx` 寫進**目標 repo** 的 `docs/autopilot/backlog.json` 並 push `main`。  
4. **閘門在 Claude：** 過關後允許進各 repo `main` 閉環；你**不必**逐 repo 審技術 diff（Checker／CI 負責）。對外正式 production 日後再用 staging 加硬。

## 2.4 AI Dev Framework（跨專案協定）

你要推動的「所有專案同一套」放在 **ai-dev-methodologies**（Orbita pin 在 `.agents/METHODOLOGY.lock`），而不是只寫在 Orbita 業務程式裡。

**建議由誰做：** 開一個專門會話／任務在 methodologies repo（或先在 Orbita 寫草案再 upstream），內容包含：

- Autopilot 骨架（已有）  
- **Orbita hub opt-in** + **report API 契約**（規劃中）  
- 文件：專案如何開啟、如何放 read credential 給 Orbita vault  

**你的配合：** 各專案定期 sync framework；開啟 hub 的專案才實作 report endpoint。

## 2.5 AT L2（editorial）怎麼放進這張圖

不必當另一條產品線：

- **Report 邊：** supply／poll／隊列狀態進 AT 的 report（或暫存進 Orbita notes）。  
- **Runtime instruction 邊（較後）：** 暫停／調整 harness 等，經 Claude 閘門後下達。  
- **暫緩恢復 `/editorial` 人手審** 不挡 hub；等你要恢復 dogfood 再打開。

## 2.6 建議你「本週可執行」的 checklist

**只在 Orbita**

- [ ] 確認 Cursor 仍有 Maker／Checker，cron 為上表。  
- [ ] 確認 `main` 上已有 E-02…E-04 的 ready 任務（應已有）。  
- [ ] 明天看是否出現 `T-0010` 相關 PR／merge。  
- [ ] 若要開工 hub 平台（list/filter）：把 epic 改 `approved` + 寫 `ready` 任務（可叫會話代寫你審）。  

**專案外**

- [ ] 選定下一個要裝齊 Autopilot 的 repo（建議 Powerhouse 或 AT）。  
- [ ] 該 repo：framework sync → 兩條 Automation → 丟一個小 `ready` 任務試跑。  
- [ ] Claude：固定用 Orbita 做跨專案記憶；個人筆記繼續手動種（D-001=A）。  
- [ ] Report pull 契約：等 framework 草案；過渡期可用手動 `type: report` notes。  

---

## 3. 出問題時看哪裡

| 現象 | 先查 |
|------|------|
| Maker 一直 IDLE | `queue-status.mjs`；有無 `ready`；`pause-state`；deps 是否卡住 |
| 有 PR 但 Checker 不理 | PR **標題**是否含 `T-xxxx` |
| 任務變 `needs_human` | 該 task 的 `feedback`；補決策或拆小再改回 `ready` |
| Prod 怪 | Checker WATCHDOG／`project-hooks.json` 的 smoke；`GET https://api.get-orbita.com/v1/health` |
| Claude 摘要不准 | 是否缺 list/filter；notes 有無 `project`／`type=report` |

更細的自動化邏輯：`docs/autopilot/playbook.md`。  
薄殼 prompt：`docs/autopilot/automations.md`。

---

## 4. 一句話版

1. **Orbita 內：** `approved` epic + `ready` 任務（含可跑的 `acceptance`）→ push **`main`** → 等 Maker/Checker。  
2. **Orbita 外：** 各重要 repo 同樣裝 Autopilot；方向在 Claude 拍板；報告走統一 API（Orbita pull）；deploy 留在各 repo CI；個人內容你種、機器不瞎編。
