# GASCheck Telegram 群組訊息格式指南（2026-10-03）

Owner (Paul) complaint: group summaries use padded tables that never align on phones, too many lines, hard to read. He wants: **一眼看懂、精實、直覺、有現代感（狀態燈／彩色進度條）**; every event type shows a **cumulative count**; cleaning must not repeat the same area; if everything is ticked, **no photos**; always uploaded to cloud before sending (core already does this).

## Why the old format breaks
Builders pad columns with spaces (`xxxTgTable`, `padEnd`) inside `<blockquote>`. Telegram renders blockquote in a proportional font → never aligns, wraps on phones. **Never use space-padded tables again.**

## Message skeleton (first page)
```
GC.TG.head(icon, title, periodLabel, optionalSubLine)   → icon + bold title, 📅 period, divider
GC.TG.verdict('ok'|'warn'|'bad', text)                  → 🟢 一切正常 / 🟠 2 項需注意 / 🔴 3 項異常
GC.TG.bar(value, total)                                  → 🟩🟩🟩🟩🟩🟩🟩🟩🟨⬜ 85%  (one key ratio per message, optional)
GC.TG.kpis([[icon,label,value],...], 2|3)               → 🧾 筆數 12  ·  📦 累計 48
(warning line(s) if anything needs attention)
GC.TG.sec(icon, title) + '\n' + lines                    → exceptions first, one record per line, start with "• "
```
- **Cumulative counts (累計)**: every event/record type gets a cumulative number for the period AND, for day/week reports, a `📆 本月累計` line (month-to-date). E.g. waste: `🚛 本月累計 7 趟 / 目標 8 🟩🟩🟩🟩🟩🟩🟩🟩🟨⬜ 88%`.
- **Exceptions before normal**: list only abnormal / missing / pending / overdue items by default. Normal items are counts only. Full lists only when mode/details require.
- **One record = one line** (max 2–3 short lines). Identity bold, then ` · ` facts. Times `GC.TG.time()`, dates `GC.TG.d()`, consecutive dates `GC.TG.ranges()`, duration `GC.TG.dur()`.
- **Group by date** (`📅 <b>09-18</b> · 4`) instead of repeating the date on every line.
- **No duplicates**: the same location/area/slot/key inspected several times in the period appears **once** (latest state, with a count `×3` if useful). Cleaning: one line per area, not per record.
- **Photos**: only when something is NOT OK (fault, unchecked, missing, damaged, rejected…). If every item is ✅, return `photos: []`. Max 5 photos, and they belong to the page listing that record.
- **Pages**: first page ≤ ~25 lines, ≤ 3000 chars. More content → `GC.TG.chunk()` then `GC.TG.number()` and return `{pages:[...], photos, buttons}`. Keep the review/approval **buttons** exactly as today (the backend validates callbacks; do not change callback data, approval digests or `onTelegramSent`).
- **Languages**: every label goes through `GC.TG.lbl(lang, zh, en, km)`; `bi` renders `中/英` labels, data once. en/km output must contain **no Chinese** (tests check). Do not add footer lines like "AC GASCheck · VRT Sihanoukville", "Message type", "Data type" — the group already knows; the sender/time stamp line `⏰` may stay at the end if the module relies on it.
- Approval mode: keep the one-line instruction for the approver (`⏳ Paul: approve/reject with the buttons below`) but compact.

## Do not change
Storage, sync, add/edit/delete/save, import/export, approval digests/callback data, `onTelegramSent`, function names referenced by `GC.attach` config (`telegramBuilder`, `telegramValidator`, …) and their return shapes `{text|pages, photos, buttons, notice}`.

## Preview
`node tools/tg-preview.cjs <page.html> <tool> tools/fixtures/<tool>.cjs [period] [mode] [ref] [scope] [slot] [langs]`
The fixture exports `{seed}` = localStorage keys → values the page reads (look at the page's storage key constants / `cfg.read`), optionally `configure(w)` / `after(w)`.

## Tests
`node tests/run.cjs` runs everything (≈6 min). A test that asserts the old padded text must be updated to assert the same meaning (records present, counts, photos with their rows, no Chinese in en/km, ≤3800 chars/page). Never weaken a data-integrity, approval, photo or translation assertion.

## 2026-11-12／13 補充（Paul：和保安同一套——列表、顏色、圖表一致，數字正確、欄位對齊）
- 欄位位置固定、沒填顯示 `—`；時間放最前面用 `<code>`；燈號放行首（🟢／🟠／🔴、上午 🟡／下午 🔵、工廠 🟦／宿舍 🟧）。
- 重點數字後加一行「✅ …＝…＋… · 已核對正確」，用另一條路徑重數再比；不符亮 ⚠️。不要放永遠成立的假核對（宿舍申請那種就不放）。
- 不可以用空白補齊。
- 已改：鑰匙、清潔、EHS、送水、資產（只加核對行）、溫濕度（只加核對行，區域行有很多測試在看，保持原樣）。
- 還沒改：宿舍摘要的列（巡查明細有測試鎖格式）、各頁的手機清單（GASCheck 還沒有像保安 sec-compact 的共用元件）。

## 2026-11-13（第二輪）
- 宿舍摘要：待核可、異常房間、違規三種列改成固定欄位（巡查明細報告 `• ✅ #201` 那種沒動）。
- 手機精簡清單：新增 `gc-compact.js`（保安 `shared/sec-compact.js` 的 GASCheck 版，檔頭寫了差在哪四樣）。用法同保安：
  `GC.Compact.attach({ card, table, cols:{ title:[…], sub:[…], right:[…], actions:n } })`，card／table 可以直接給元素。
  已掛：宿舍（最近申請、在住總表、違規清單、記錄查詢）、清潔（歷史記錄）、鑰匙（鑰匙清單；表格會整塊重畫，所以在 renderMasterList 裡檢查沒掛才掛）。
- **不要掛的**：資產（手機本來就有自己的卡片版）、送水（是每月輸入表格不是清單）、溫濕度歷史（同一張表有明細和統計兩種欄位）、
  EHS 廢料（列上的勾選框是批次刪除用的，要掛得另外處理選取模式）。
