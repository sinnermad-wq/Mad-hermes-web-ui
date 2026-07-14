# HERMES Web UI 改善 log

呢份文件用嚟記錄我用 Web UI 時覺得唔順手的地方，目標係累積樣本，之後整理 v0.3.0 roadmap。

---

## Priority 等級

| 等級 | 定義 |
|------|------|
| **P1** | 阻礙使用 / 可能導致錯決定 |
| **P2** | 經常不順手 / 明顯影響效率 |
| **P3** | 小型 polish / nice-to-have |

## 類型

| 類型 | 意思 |
|------|------|
| `bug` | 功能失效或行為同 spec 不符 |
| `ux` | 操作流程唔順手或唔直觀 |
| `copy` | 文字 / label / microcopy 容易誤會 |
| `data-state` | 顯示既數據狀態有問題（過時、missing、矛盾） |
| `missing-feature` | 有一個好合理既需求但未支援 |
| `performance` | loading 慢 / 渲染慢 / 佔用高 |

---

## Entry 模板（可直接複製）

```markdown
## YYYY-MM-DD HH:MM — Short title

- **Area:** Chat / Dashboard / Sessions / Settings / Trace / Queue
- **Type:** bug / ux / copy / data-state / missing-feature / performance
- **Priority:** P1 / P2 / P3
- **Context:** 當時我在做什麼
- **Problem:** 發生了什麼，哪裡不順手
- **Expected:** 我原本以為會怎樣
- **Impact:** 為什麼值得記下
- **Idea:** （可選）如果有直覺改善方法，寫一句
```

> **提醒：** 一條 entry 要可以 1 分鐘內填完。`Idea` 必須是可選，不要要求 screenshot / browser info 呢啲高摩擦欄位。

---

## Sample entries

### 2026-07-14 09:30 — Trace panel SSE reconnect 時狀態不明

- **Area:** Trace
- **Type:** ux
- **Priority:** P2
- **Context:** 打開某個 session 既 Trace panel，等紧實時更新
- **Problem:** SSE reconnect 時面板冇任何視覺提示，我不知道係 loading、定係斷了、定係仲係正常 live
- **Expected:** 見到一個明确狀態 badge（例如 "Reconnecting..." 或 "Live"）
- **Impact:** 容易以為係 Hermes 沒有回复，但其實只係連線中
- **Idea:** 參考 v0.2.1-a 既 EsState badge，在 Trace panel 右上角加一個小 pill

---

### 2026-07-14 09:45 — Queue panel 難以快速睇出邊啲 row 最重要

- **Area:** Queue
- **Type:** ux
- **Priority:** P3
- **Context:** 打開 Dashboard 看 cron jobs 狀態
- **Problem:** 所有 rows 行距相同，重要狀態（failed / running）冇視覺分层
- **Expected:** 一眼掃過可以分出邊啲需要 action
- **Impact:** 需要scan成個 table 先知道邊度有問題
- **Idea:** 考慮加一行 background color 或 status icon

---

## Monthly triage

### Keep
- 真正阻礙操作的問題（P1 為主）
- 高頻發生既 P2

### Investigate
- 需要累積多過 2 個相同問題先考慮做
- 影響範圍唔確定既 P2

### Ignore / Defer
- 低價值 / 偶發 / 超出 v0.3.0 scope
- nice-to-have 但唔影响效率既 P3