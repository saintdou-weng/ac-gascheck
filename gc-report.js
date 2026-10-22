/* AC GASCheck 參考報告（Word）（2026-10-22）
 * 每一頁頁首「📝 報告」：選 週／月／年、期間、語言（中文＋English 或 English＋ខ្មែរ）、範圍，
 * 用該頁與 Telegram 完全相同的摘要建構器（GC.pages[tool].buildText）整理成管理摘要，
 * 加上期間比較、近期趨勢、明細表（與 💾 匯出相同欄位）、資料依據與簽名欄，產生仿 sewing 週報版面的 .docx。
 * 只供參考，不會發到任何地方。 */
(function (g) {
  'use strict';
  var GC = g.GC; if (!GC || GC.report) return;
  var I18 = GC.i18n, L = GC.L, esc = GC.util.escapeHtml;
  var TYPE_NAME = { week:['週報', 'Weekly Report', 'របាយការណ៍ប្រចាំសប្តាហ៍'], month:['月報', 'Monthly Report', 'របាយការណ៍ប្រចាំខែ'], year:['年報', 'Annual Report', 'របាយការណ៍ប្រចាំឆ្នាំ'], day:['日報', 'Daily Report', 'របាយការណ៍ប្រចាំថ្ងៃ'] };
  var TITLES = { asset:['資產管理', 'Asset Management', 'ការគ្រប់គ្រងទ្រព្យសម្បត្តិ'], dormitory:['宿舍管理', 'Dormitory', 'អន្តេវាសិកដ្ឋាន'], cleaning:['清潔管理', 'Cleaning', 'ការសម្អាត'], keymovement:['鑰匙管理', 'Key Movement', 'ការគ្រប់គ្រងសោ'], ehs:['EHS 環境／廢料', 'EHS Environment / Waste', 'EHS បរិស្ថាន'], waterdrum:['送水管理', 'Water Drum', 'ធុងទឹក'], temperature:['溫濕度記錄', 'Temperature & Humidity', 'សីតុណ្ហភាព និងសំណើម'] };
  function tx(v, lang) { if (v == null) return ''; if (typeof v === 'string') return v; if (Array.isArray(v)) return lang === 'en' ? (v[1] || v[0]) : lang === 'km' ? (v[2] || v[1] || v[0]) : v[0]; return lang === 'en' ? (v.en || v.zh || '') : lang === 'km' ? (v.km || v.en || v.zh || '') : (v.zh || v.en || ''); }
  function p2(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function prevRef(p, ref) { var d = new Date(ref + 'T00:00:00'); if (p === 'day') d.setDate(d.getDate() - 1); else if (p === 'week') d.setDate(d.getDate() - 7); else if (p === 'month') d.setMonth(d.getMonth() - 1); else d.setFullYear(d.getFullYear() - 1); return ymd(d); }
  function strip(h) { return String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<blockquote[^>]*>/gi, '\n').replace(/<\/blockquote>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'); }
  function lines(text) {
    var out = [];
    strip(text).split('\n').map(function (s) { return s.replace(/[🟩🟨🟥🟧⬜⬛]+\s*/gu, '').replace(/\s+$/, ''); }).filter(function (s) { return s.trim(); }).forEach(function (s, i) {
      var t = s.trim();
      if (/^📅/.test(t) || /^[─━═\-—·•\s]+$/.test(t) || /^(AC GASCheck|AC GASCHECK|Vantage River)/i.test(t)) return;
      if (i === 0 && !/^[•\-]/.test(t)) { out.push({ h:true, text:s }); return; }
      out.push(s);
    });
    return out;
  }
  function num(v) { if (typeof v === 'number') return v; var m = String(v == null ? '' : v).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/); return m ? +m[0] : null; }
  function pct(cur, prev) { var a = num(cur), b = num(prev); if (a == null || b == null) return '—'; if (!b) return a ? '+100%' : '—'; var q = Math.round((a - b) / Math.abs(b) * 100); return (q > 0 ? '+' : '') + q + '%'; }

  async function buildModel(tool, R) {
    var pg = GC.pages[tool]; if (!pg) throw new Error('page not ready');
    var A = R.lang === 'en-km' ? 'en' : 'zh', B = R.lang === 'en-km' ? 'km' : 'en', P = function (zh, en, km) { return [tx([zh, en, km], A), tx([zh, en, km], B)]; };
    var o = { period:R.ptype, ref:R.ref, scope:R.scope, slot:R.slot };
    var la = lines(await pg.buildText(Object.assign({ lang:A }, o))), lb = lines(await pg.buildText(Object.assign({ lang:B }, o)));
    var txt = function (x) { return x && x.h ? x.text : x; }, isH = function (x) { return !!(x && x.h); };
    var pairs = la.length === lb.length ? la.map(function (s, i) { var a = txt(s), b = txt(lb[i]); return isH(s) ? [a, b === a ? '' : b, 'h'] : [a, b === a ? '' : b]; })
      : la.map(function (s) { return isH(s) ? [txt(s), '', 'h'] : [txt(s), '']; }).concat(lb.map(function (s) { return isH(s) ? [txt(s), '', 'h'] : [txt(s), '']; }));
    var secs = [], notes = String(R.note || '').split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
    secs.push({ title:P('一、管理摘要', '1. Executive Summary', '១. សេចក្តីសង្ខេប'), bullets:notes.map(function (n) { return [n, '', '1F3864']; }), paragraphs:pairs });
    /* 期間比較：筆數＋（有照片／異常等簡單計數） */
    var recs = function (ref) { return pg.records(R.ptype, ref, { scope:R.scope, slot:R.slot }); }, prev = prevRef(R.ptype, R.ref), cur = recs(R.ref), pv = recs(prev);
    var lbl = pg.refLabel, cmp = [[P('筆數', 'Records', 'កំណត់ត្រា'), String(cur.length), String(pv.length), pct(cur.length, pv.length)]];
    var issue = function (list) { return list.filter(function (r) { var vals = [r.status, r.result, r.condition, r.approvalStatus]; return vals.some(function (v) { return /pending|待|abnormal|異常|fault|故障|bad|fail|repair|維修|lost|遺失|not ?ok|✗|✕/i.test(String(v || '')); }); }).length; };
    var ic = issue(cur), ip = issue(pv); if (ic || ip) cmp.push([P('需注意／待處理', 'Needs attention / pending', 'ត្រូវយកចិត្តទុកដាក់'), String(ic), String(ip), pct(ic, ip)]);
    var photos = function (list) { return list.filter(function (r) { var ph = r[pg.cfg.photoField || 'photos']; return Array.isArray(ph) ? ph.length : !!ph; }).length; };
    var pc = photos(cur), pp = photos(pv); if (pc || pp) cmp.push([P('附照片', 'With photos', 'មានរូបថត'), String(pc), String(pp), pct(pc, pp)]);
    secs.push({ title:P('二、期間比較', '2. Period Comparison', '២. ប្រៀបធៀបរយៈពេល'), table:{ widths:[3400, 2100, 2100, 2100], head:[P('指標', 'Metric', 'សូចនាករ'), P('本期 ' + lbl(R.ref, R.ptype), 'This period ' + lbl(R.ref, R.ptype), 'រយៈពេលនេះ ' + lbl(R.ref, R.ptype)), P('上期 ' + lbl(prev, R.ptype), 'Previous ' + lbl(prev, R.ptype), 'មុន ' + lbl(prev, R.ptype)), P('變化', 'Change', 'ប្រែប្រួល')], rows:cmp, rowOpts:cmp.map(function (_, i) { return i === 0 ? { fill:'blue', bold:true } : {}; }) } });
    /* 近期趨勢 6 期 */
    var trend = [], k = R.ref, max = 0;
    for (var i = 0; i < 6; i++) { var n = recs(k).length; trend.unshift({ ref:k, n:n }); if (n > max) max = n; k = prevRef(R.ptype, k); }
    secs.push({ title:P('三、近期趨勢', '3. Recent Trend', '៣. និន្នាការថ្មីៗ'), table:{ widths:[2600, 1800, 5300], head:[P('期間', 'Period', 'រយៈពេល'), P('筆數', 'Records', 'កំណត់ត្រា'), ''], rows:trend.map(function (t) { return [lbl(t.ref, R.ptype), String(t.n), max ? '▇'.repeat(Math.max(0, Math.round(t.n / max * 24))) : '']; }), rowOpts:trend.map(function (t) { return t.ref === R.ref ? { fill:'blue', bold:true } : {}; }) } });
    /* 明細（與匯出相同欄位） */
    var savedLang = I18.lang, ta, tb;
    try { I18.lang = A; ta = pg.exportTable(cur); I18.lang = B; tb = pg.exportTable(cur); } finally { I18.lang = savedLang; }
    var head = ta.head.map(function (h, i) { var a = tx(h, A), b = tb.head[i] != null ? tx(tb.head[i], B) : tx(h, B); return [a, b === a ? '' : b]; });
    var cap = 300, maxCols = 8, cols = head.length;
    if (cols > maxCols) { head = head.slice(0, maxCols); }
    var rows = ta.rows.slice(0, cap).map(function (r) { return r.slice(0, maxCols).map(function (v) { var s = String(v == null ? '' : v); return s.length > 60 ? s.slice(0, 58) + '…' : s; }); });
    secs.push({ title:P('四、明細', '4. Details', '៤. លម្អិត'), table:{ head:head, rows:rows, note:(ta.rows.length > cap || cols > maxCols) ? P('只列前 ' + Math.min(cap, ta.rows.length) + ' 筆' + (cols > maxCols ? '、前 ' + maxCols + ' 欄' : '') + '（共 ' + ta.rows.length + ' 筆），完整資料請用 💾 匯出。', 'First ' + Math.min(cap, ta.rows.length) + ' rows' + (cols > maxCols ? ', first ' + maxCols + ' columns' : '') + ' of ' + ta.rows.length + '; use 💾 Export for the full list.', Math.min(cap, ta.rows.length) + '/' + ta.rows.length) : null, empty:P('本期沒有資料。', 'No records in this period.', 'គ្មានទិន្នន័យ។') } });
    var basis = [P('資料來源：AC GASCheck 平台「' + tx(TITLES[tool] || tool, 'zh') + '」模組，由各頁面手動登錄、Excel 匯入與雲端同步而來；本報告與 Telegram 群組摘要使用同一套統計邏輯。', 'Source: the "' + tx(TITLES[tool] || tool, 'en') + '" module of the AC GASCheck platform (manual entries, Excel imports and cloud sync); the same logic as the Telegram group summary.', 'ប្រភព៖ ម៉ូឌុល "' + tx(TITLES[tool] || tool, 'km') + '" នៃវេទិកា AC GASCheck។'),
      P('「變化」以上期為基準。本報告由系統產生，僅供內部參考，不會自動發送。', '"Change" is against the previous period. System-generated for internal reference only; never sent automatically.', 'បង្កើតដោយប្រព័ន្ធ សម្រាប់យោងផ្ទៃក្នុងតែប៉ុណ្ណោះ។')];
    secs.push({ title:P('五、資料依據與限制', '5. Data Basis and Limitations', '៥. មូលដ្ឋានទិន្នន័យ'), bullets:basis });
    var tn = TYPE_NAME[R.ptype] || TYPE_NAME.month, title = TITLES[tool] || [tool, tool, tool], label = lbl(R.ref, R.ptype);
    return { lang:R.lang, title:[tx(title, A), tx(title, B)], typeName:[tx(tn, A), tx(tn, B)], periodPrefix:tx(['期間', 'Period', 'រយៈពេល'], A), periodLabel:label, scopeLabel:R.scopeLabel || null,
      generatedAt:tx(['產生 ', 'Generated ', 'បង្កើត '], A) + new Date().toLocaleString('sv-SE').slice(0, 16), sections:secs,
      signature:{ prepared:P('製表', 'Prepared by', 'រៀបចំដោយ'), reviewed:P('審核', 'Reviewed by', 'ពិនិត្យដោយ'), approved:P('核准', 'Approved by', 'អនុម័តដោយ') },
      headerText:'VRT　' + tx(title, A) + ' ' + tx(tn, A) + '　' + label, fileName:'VRT_' + tool + '_' + tn[1].split(' ')[0] + '_' + label.replace(/[^0-9A-Za-z-]+/g, '_').replace(/_+$/, '') + '_' + R.lang + '.docx', summaryPairs:pairs };
  }
  async function generate(tool, R) {
    var docx = await g.ACReportDoc.loadDocx(['docx.iife.js?v=8.5.0']);
    var model = await buildModel(tool, R), blob = await docx.Packer.toBlob(g.ACReportDoc.build(docx, model));
    g.ACReportDoc.download(blob, model.fileName);
    return { name:model.fileName, size:blob.size };
  }
  function open(opt) {
    opt = opt || {}; var tool = opt.tool || '', pg = GC.pages[tool];
    if (!pg) { GC.toast('⚠ ' + L('這一頁還沒有報告功能', 'This page has no report yet', 'ទំព័រនេះមិនទាន់មានរបាយការណ៍'), 'warning'); return null; }
    var C = pg.cfg, ptypes = ['week', 'month', 'year'];
    var R = { ptype:opt.ptype || 'month', ref:'', lang:I18.lang === 'zh' ? 'zh-en' : 'en-km', scope:C.telegramScopeMultiple ? ['all'] : 'all', slot:C.telegramSlotMultiple ? ['all'] : 'all', note:'' };
    var scopes = Array.isArray(C.telegramScopes) ? C.telegramScopes : (typeof C.telegramScopes === 'function' ? (C.telegramScopes({ period:R.ptype, mode:'summary' }) || []) : []);
    var mask = document.createElement('div'); mask.className = 'gc-common-modal gc-report-modal open';
    mask.innerHTML = '<div class="gc-modal-card" role="dialog" aria-modal="true" style="width:min(600px,96vw)"><div class="gc-modal-head"><strong>📝 ' + esc(I18.t('gc.reportTitle')) + ' · ' + esc(tx(TITLES[tool] || tool, I18.lang)) + '</strong><button type="button" data-close>×</button></div>' +
      '<div class="gc-hub-body" style="padding:14px;overflow:auto;display:flex;flex-direction:column;gap:10px">' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
        '<label class="gc-field"><span>' + esc(L('報告類型', 'Report type', 'ប្រភេទ')) + '</span><select data-ptype>' + ptypes.map(function (p) { return '<option value="' + p + '">' + esc(tx(TYPE_NAME[p], I18.lang)) + '</option>'; }).join('') + '</select></label>' +
        '<label class="gc-field"><span>' + esc(L('期間', 'Period', 'រយៈពេល')) + '</span><select data-period></select></label>' +
        '<label class="gc-field"><span>' + esc(L('語言', 'Language', 'ភាសា')) + '</span><select data-lang><option value="zh-en">' + esc(L('中文 + English', 'Chinese + English', 'ចិន + អង់គ្លេស')) + '</option><option value="en-km">' + esc(L('English + ខ្មែរ', 'English + Khmer', 'អង់គ្លេស + ខ្មែរ')) + '</option></select></label>' +
        (scopes.length ? '<label class="gc-field"><span>' + esc(L('資料範圍', 'Scope', 'វិសាលភាព')) + '</span><select data-scope><option value="all">' + esc(L('全部', 'All', 'ទាំងអស់')) + '</option>' + scopes.map(function (x) { return '<option value="' + esc(x.value) + '">' + esc(L(x.zh, x.en, x.km) || x.label || x.value) + '</option>'; }).join('') + '</select></label>' : '<span></span>') +
      '</div>' +
      '<label class="gc-field"><span>' + esc(L('補充說明（會寫進管理摘要最前面，可留空）', 'Notes (placed at the top of the summary; optional)', 'កំណត់ចំណាំ (ស្រេចចិត្ត)')) + '</span><textarea data-note rows="2" style="width:100%;border:1px solid #D8E0EB;border-radius:8px;padding:8px;font:inherit"></textarea></label>' +
      '<div><div style="font-size:12px;font-weight:700;margin-bottom:4px">' + esc(L('摘要預覽', 'Summary preview', 'មើលជាមុន')) + '</div><div data-preview style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;font-size:12px;line-height:1.55;max-height:220px;overflow:auto;white-space:pre-wrap"></div></div>' +
      '<div data-status style="font-size:12px;color:#5b7186"></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button type="button" class="ihub-btn gray" data-close>' + esc(L('取消', 'Cancel', 'បោះបង់')) + '</button><button type="button" class="ihub-btn" data-go>📝 ' + esc(L('產生 Word 報告', 'Generate Word report', 'បង្កើត Word')) + '</button></div>' +
      '</div></div>';
    if (GC.importHub) GC.importHub.css();
    document.body.appendChild(mask); document.body.classList.add('gc-modal-open');
    var q = function (s) { return mask.querySelector(s); }, close = function () { mask.remove(); document.body.classList.toggle('gc-modal-open', !!document.querySelector('.gc-common-modal.open')); };
    mask.querySelectorAll('[data-close]').forEach(function (b) { b.onclick = close; }); mask.onclick = function (e) { if (e.target === mask) close(); };
    function fillPeriods() {
      var list = pg.refs(R.ptype), cur = pg.periodReference(new Date(), R.ptype);
      if (list.indexOf(cur) < 0) list.unshift(cur);
      var want = opt.period ? pg.refFromKey(R.ptype, opt.period) : '';
      if (want && list.indexOf(want) < 0) list.unshift(want);
      R.ref = want || (list.filter(function (x) { return x <= cur; })[0] || list[0]);
      q('[data-period]').innerHTML = list.map(function (x) { return '<option value="' + esc(x) + '"' + (x === R.ref ? ' selected' : '') + '>' + esc(pg.refLabel(x, R.ptype)) + '</option>'; }).join('');
    }
    var pvToken = 0;
    async function preview() {
      var t = ++pvToken; q('[data-preview]').textContent = '…';
      try { var m = await buildModel(tool, R); if (t !== pvToken) return; q('[data-preview]').textContent = m.summaryPairs.map(function (p) { return (p[2] === 'h' ? '\n【' + p[0] + '】' : p[0]) + (p[1] ? (p[2] === 'h' ? ' ' : '\n   ') + p[1] : ''); }).join('\n').trim() || L('本期沒有資料', 'No data in this period', 'គ្មានទិន្នន័យ'); }
      catch (e) { if (t === pvToken) q('[data-preview]').textContent = '⚠ ' + String(e && e.message || e); }
    }
    q('[data-ptype]').value = R.ptype; q('[data-lang]').value = R.lang; fillPeriods(); preview();
    q('[data-ptype]').onchange = function () { R.ptype = this.value; opt.period = ''; fillPeriods(); preview(); };
    q('[data-period]').onchange = function () { R.ref = this.value; preview(); };
    q('[data-lang]').onchange = function () { R.lang = this.value; preview(); };
    if (q('[data-scope]')) q('[data-scope]').onchange = function () { var v = this.value; R.scope = C.telegramScopeMultiple ? [v] : v; var so = scopes.filter(function (x) { return x.value === v; })[0]; R.scopeLabel = so ? [L(so.zh, so.en, so.km), ''] : null; preview(); };
    q('[data-note]').oninput = function () { R.note = this.value; };
    q('[data-go]').onclick = async function () {
      var b = this, stt = q('[data-status]'); b.disabled = true; stt.textContent = L('產生中…', 'Generating…', 'កំពុងបង្កើត…');
      try { var r = await generate(tool, R); stt.textContent = '✅ ' + r.name + ' (' + Math.round(r.size / 1024) + ' KB)'; GC.toast('📝 ' + r.name, 'success'); }
      catch (e) { stt.textContent = '❌ ' + String(e && e.message || e); GC.toast('❌ ' + String(e && e.message || e), 'error'); }
      finally { b.disabled = false; }
    };
    return mask;
  }
  GC.report = { open:open, generate:generate, buildModel:buildModel, TITLES:TITLES, TYPE_NAME:TYPE_NAME, lines:lines };
})(window);
