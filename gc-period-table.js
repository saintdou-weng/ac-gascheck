/* gc-period-table.js — GASCheck 各頁「期間報表」（2026-11-21 Paul：日週月年列表要像 HRA 考勤的期間考勤報表）
 * 一期一列、最新在上；本期淺藍底＋◀；點一列看該期依區域／部門的分項；主要數字有比例底條。
 * 資料直接讀 GC.pages[tool].records()，不改原本任何功能；記錄變動時自動重畫。
 */
(function () {
  'use strict';
  if (window.GCPeriodTable) return;
  function L() { try { var l = (window.GC && GC.lang && GC.lang()) || localStorage.getItem('gc_lang') || document.documentElement.lang || 'zh'; return /km/.test(l) ? 'km' : (/en/.test(l) ? 'en' : 'zh'); } catch (e) { return 'zh'; } }
  function t(zh, en, km) { var l = L(); return l === 'en' ? en : (l === 'km' ? (km || en) : zh); }
  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isNaN(n) ? 0 : n; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymdLocal(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function ymd(v) { var s = String(v || '').trim(), m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/); if (m) return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]); var d = new Date(v); return isNaN(d) ? '' : ymdLocal(d); }
  function dt(s) { return new Date(s + 'T00:00:00'); }
  function add(s, n) { var d = dt(s); d.setDate(d.getDate() + n); return ymdLocal(d); }
  function key(s, g) { if (g === 'year') return s.slice(0, 4); if (g === 'month') return s.slice(0, 7); if (g === 'week') { var d = dt(s), w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return ymdLocal(d); } return s; }
  function wd(s) { var i = dt(s).getDay(); return t(['日', '一', '二', '三', '四', '五', '六'][i], ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i], ['អា', 'ច', 'អ', 'ព', 'ព្រ', 'សុ', 'ស'][i]); }
  function label(k, g) { if (g === 'week') return k.slice(5).replace('-', '/') + ' – ' + add(k, 6).slice(5).replace('-', '/'); if (g === 'day') return k.slice(5).replace('-', '/') + ' (' + wd(k) + ')'; return k; }
  function avg(a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : 0; }
  function days(rs, f) { var o = {}; rs.forEach(function (r) { var d = ymd(r[f]); if (d) o[d] = 1; }); return Object.keys(o).length; }
  function pretty(v) { return String(v || '—').replace(/^(loc|z|zone|dept)_/i, '').replace(/_/g, ' '); }
  function parseObj(v) { if (v && typeof v === 'object') return v; try { return JSON.parse(v || '{}') || {}; } catch (e) { return {}; } }

  /* 每頁的欄位。bar:true 的欄位畫比例底條；bad:true 的欄位有數字時紅字。 */
  var ADAPT = {
    cleaning: {
      anchor: '#pane-dash', where: 'prepend', title: function () { return t('🧹 清潔期間報表', '🧹 Cleaning period report', '🧹 របាយការណ៍អនាម័យ'); },
      cols: function () { return [t('檢查天數', 'Days', 'ថ្ងៃ'), t('檢查次數', 'Checks', 'ពិនិត្យ'), t('區域', 'Areas', 'តំបន់'), t('❌ 異常', '❌ Issues', '❌ បញ្ហា'), t('通過率', 'Pass rate', 'អត្រាល្អ')]; },
      row: function (rs, f) {
        var bad = rs.filter(function (r) { var c = parseObj(r.checks); return Object.keys(c).some(function (k) { return c[k] === false || c[k] === 'false' || c[k] === 'x' || c[k] === 'X'; }); }).length;
        var areas = {}; rs.forEach(function (r) { if (r.locId) areas[r.locId] = 1; });
        return [days(rs, f), { v: rs.length, bar: true }, Object.keys(areas).length || '—', { v: bad, bad: true }, rs.length ? Math.round((rs.length - bad) / rs.length * 100) + '%' : '—'];
      }
    },
    temperature: {
      anchor: '#dash-stats', where: 'after', title: function () { return t('🌡️ 溫濕度期間報表', '🌡️ Temperature period report', '🌡️ របាយការណ៍សីតុណ្ហភាព'); },
      cols: function () { return [t('記錄天數', 'Days', 'ថ្ងៃ'), t('筆數', 'Records', 'កំណត់ត្រា'), t('平均溫度', 'Avg temp', 'សីតុណ្ហភាពមធ្យម'), t('平均濕度', 'Avg humidity', 'សំណើមមធ្យម'), t('⚠️ 超標', '⚠️ Out of range', '⚠️ ហួសកំណត់')]; },
      row: function (rs, f) {
        var T = rs.map(function (r) { return parseFloat(r.t); }).filter(function (v) { return !isNaN(v); }), H = rs.map(function (r) { return parseFloat(r.h); }).filter(function (v) { return !isNaN(v); });
        var bad = 0; try { if (typeof isAnom === 'function') bad = rs.filter(isAnom).length; } catch (e) {}
        return [days(rs, f), { v: rs.length, bar: true }, T.length ? avg(T).toFixed(1) + '°C' : '—', H.length ? Math.round(avg(H)) + '%' : '—', { v: bad, bad: true }];
      }
    },
    dormitory: {
      anchor: '#pane-dash', where: 'prepend', title: function () { return t('🏠 宿舍申請期間報表', '🏠 Dormitory period report', '🏠 របាយការណ៍អន្តេវាសិកដ្ឋាន'); },
      cols: function () { return [t('申請', 'Requests', 'សំណើ'), t('🟢 搬入', '🟢 Move-in', '🟢 ចូល'), t('🔴 搬出', '🔴 Move-out', '🔴 ចេញ'), t('⏳ 待核可', '⏳ Pending', '⏳ រង់ចាំ')]; },
      row: function (rs) {
        var tc = function (r) { try { return typeof dormTypeCode === 'function' ? dormTypeCode(r.type) : (/out|出/i.test(r.type) ? 'out' : 'in'); } catch (e) { return ''; } };
        var sc = function (r) { try { return typeof dormStatusCode === 'function' ? dormStatusCode(r.status) : String(r.status || ''); } catch (e) { return ''; } };
        return [{ v: rs.length, bar: true }, rs.filter(function (r) { return tc(r) === 'in'; }).length || '—', rs.filter(function (r) { return tc(r) === 'out'; }).length || '—', { v: rs.filter(function (r) { return /pending|wait|待/.test(sc(r)); }).length, bad: true }];
      }
    },
    asset: {
      anchor: '#stats-bar', where: 'after', title: function () { return t('📦 資產期間報表（依購入日期）', '📦 Asset period report (by purchase date)', '📦 របាយការណ៍ទ្រព្យសម្បត្តិ'); },
      cols: function () { return [t('新增資產', 'New assets', 'ទ្រព្យថ្មី'), t('數量', 'Qty', 'ចំនួន'), t('金額', 'Value', 'តម្លៃ')]; },
      row: function (rs) { var q = rs.reduce(function (s, r) { return s + (num(r.qty) || 1); }, 0), v = rs.reduce(function (s, r) { return s + num(r.value || r.price || r.cost) * (num(r.qty) || 1); }, 0); return [{ v: rs.length, bar: true }, q || '—', v ? '$' + Math.round(v).toLocaleString() : '—']; }
    },
    keymovement: {
      anchor: '#stat-grid', where: 'after', title: function () { return t('🔑 鑰匙借還期間報表', '🔑 Key period report', '🔑 របាយការណ៍សោ'); },
      cols: function () { return [t('借出次數', 'Issued', 'ខ្ចី'), t('✅ 已歸還', '✅ Returned', '✅ បានសង'), t('⏳ 未還', '⏳ Outstanding', '⏳ មិនទាន់សង'), t('❌ 遺失', '❌ Lost', '❌ បាត់')]; },
      row: function (rs) {
        var lost = function (r) { try { return typeof isLost === 'function' ? isLost(r) : /lost|遺失/i.test(r.return_condition || ''); } catch (e) { return false; } };
        var L0 = rs.filter(lost).length, R = rs.filter(function (r) { return !lost(r) && r.return_date; }).length;
        return [{ v: rs.length, bar: true }, R || '—', { v: rs.length - R - L0, bad: true }, { v: L0, bad: true }];
      }
    },
    waterdrum: {
      anchor: '#summary-cards', where: 'after', title: function () { return t('💧 飲用水期間報表', '💧 Water drum period report', '💧 របាយការណ៍ទឹក'); },
      cols: function () { return [t('記錄', 'Records', 'កំណត់ត្រា'), t('🏭 工廠桶數', '🏭 Factory drums', '🏭 រោងចក្រ'), t('🏠 宿舍桶數', '🏠 Staff drums', '🏠 បុគ្គលិក'), t('金額', 'Amount', 'ទឹកប្រាក់')]; },
      row: function (rs) {
        var f = rs.reduce(function (s, r) { return s + num(r.fQty); }, 0), st = rs.reduce(function (s, r) { return s + num(r.sQty); }, 0), m = rs.reduce(function (s, r) { return s + num(r.fTtl) + num(r.sTtl); }, 0);
        return [rs.length || '—', { v: f + st ? f : 0, bar: true }, st || '—', m ? m.toLocaleString() : '—'];
      }
    }
  };

  var state = {};
  function css() {
    if (document.getElementById('gcpt-css')) return;
    var s = document.createElement('style'); s.id = 'gcpt-css';
    s.textContent = '.gcpt{margin:12px 0;border:1px solid rgba(15,23,42,.12);border-radius:14px;overflow:hidden;background:#fff;color:#0f172a;font-size:13px}' +
      '.gcpt .h{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #e2e8f0;flex-wrap:wrap}' +
      '.gcpt .tt{font-weight:800;font-size:14px;border-left:4px solid var(--gc-acc,#2d7a5a);padding-left:8px}' +
      '.gcpt .tg{display:inline-flex;border:1px solid #cbd5e1;border-radius:10px;overflow:hidden;margin-left:auto}' +
      '.gcpt .tg button{border:none;background:#fff;padding:6px 12px;font-weight:700;cursor:pointer;color:#475569;font-size:12px}' +
      '.gcpt .tg button.on{background:var(--gc-hdr,#1f4d3a);color:#fff}' +
      '.gcpt .ct{font-size:12px;color:#64748b;order:2;flex:1 1 160px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.gcpt .tt{order:1}.gcpt .tg{order:3}' +
      '.gcpt .h{padding:7px 12px}.gcpt .tg button{padding:5px 11px}' +
      '.gcpt tr.r:active td{background:#eef4fa}' +
      /* 卡片（物品頁 .gip-ov 的版面）裡的小積木 */
      '.gcpt-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}' +
      '.gcpt-kpi{background:#fff;border:1px solid #dfe6ee;border-left:4px solid var(--gip-acc,#2d7a5a);border-radius:12px;padding:10px 12px;min-width:0}' +
      '.gcpt-kpi .l{font-size:11.5px;color:#64768a;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.gcpt-kpi .v{font-size:22px;font-weight:800;color:#1d2b3a;line-height:1.2;margin-top:2px;word-break:break-word}.gcpt-kpi .v.bad{color:#dc2626}' +
      '.gcpt-kpi .t{height:6px;border-radius:4px;background:#e6ecf2;margin:7px 0 5px;overflow:hidden}.gcpt-kpi .t i{display:block;height:100%;border-radius:4px;background:var(--gip-acc,#2d7a5a)}' +
      '.gcpt-kpi .n{font-size:11px;color:#64768a;line-height:1.45}.gcpt-kpi .up{color:#b45309;font-weight:700}.gcpt-kpi .dn{color:#15803d;font-weight:700}' +
      '.gcpt-bars{display:flex;flex-direction:column;gap:6px}' +
      '.gcpt-br{display:grid;grid-template-columns:minmax(84px,34%) 1fr auto;gap:8px;align-items:center;font-size:13px}' +
      '.gcpt-br .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;color:#1d2b3a}.gcpt-br .tk{height:10px;background:#e6ecf2;border-radius:6px;overflow:hidden}.gcpt-br .tk i{display:block;height:100%;border-radius:6px;background:var(--gip-acc,#2d7a5a);opacity:.75}.gcpt-br .vl{font-weight:800;color:#1d2b3a;min-width:28px;text-align:right}' +
      '.gcpt-mt{width:100%;border-collapse:collapse;font-size:12.5px}.gcpt-mt th{font-size:11px;color:#64768a;font-weight:700;padding:5px 6px;text-align:right;white-space:nowrap;border-bottom:1px solid #e1e8ef}.gcpt-mt td{padding:6px;text-align:right;border-bottom:1px solid #eef2f6;white-space:nowrap}.gcpt-mt th:first-child,.gcpt-mt td:first-child{text-align:left;font-weight:700;color:#1d2b3a}.gcpt-mt .bad{color:#dc2626;font-weight:800}' +
      '.gcpt-sc{overflow-x:auto;-webkit-overflow-scrolling:touch}' +
      '.gcpt .sc{max-height:420px;overflow:auto}' +
      '.gcpt table{width:100%;border-collapse:collapse}' +
      '.gcpt th{position:sticky;top:0;z-index:1;background:var(--gc-alt,#e8f3ee);color:var(--gc-hdr,#1f4d3a);font-weight:800;padding:9px 8px;white-space:nowrap;text-align:center}' +
      '.gcpt td{padding:9px 8px;border-top:1px solid #eef2f7;text-align:center;white-space:nowrap}' +
      '.gcpt th:first-child,.gcpt td:first-child{text-align:left;padding-left:12px;font-weight:800}' +
      '.gcpt tr.r{cursor:pointer}.gcpt tr.r:hover td{background:#f8fafc}' +
      '.gcpt tr.cur td{background:#e0efff;color:#1e3a8a;font-weight:800}' +
      '.gcpt tr.sel td{outline:2px solid #93c5fd;outline-offset:-2px}' +
      '.gcpt tr.em td{color:#94a3b8}' +
      '.gcpt td.b{position:relative;min-width:64px}.gcpt td.b i{position:absolute;left:4px;top:50%;height:18px;transform:translateY(-50%);border-radius:4px;opacity:.2;background:var(--gc-acc,#2d7a5a)}.gcpt td.b span{position:relative}' +
      '.gcpt .bad{color:#dc2626;font-weight:800}' +
      '.gcpt tr.dt td{background:#f8fafc;text-align:left;white-space:normal;font-weight:400;color:#334155;padding:8px 12px}' +
      '.gcpt .chip{display:inline-block;margin:2px 4px 2px 0;padding:2px 8px;border-radius:999px;background:#fff;border:1px solid #e2e8f0;font-size:12px}';
    (document.head || document.documentElement).appendChild(s);
  }
  function render(tool) {
    var A = ADAPT[tool], P = window.GC && GC.pages && GC.pages[tool]; if (!A || !P) return;
    var st = state[tool] || (state[tool] = { g: 'month', sel: '' });
    var box = document.getElementById('gcpt-' + tool);
    if (!box) {
      var anc = document.querySelector(A.anchor); if (!anc) return;
      box = document.createElement('div'); box.className = 'gcpt'; box.id = 'gcpt-' + tool;
      if (A.where === 'prepend') anc.insertBefore(box, anc.firstChild); else anc.parentNode.insertBefore(box, anc.nextSibling);
      box.addEventListener('click', function (e) {
        var b = e.target.closest('[data-g]'); if (b) { st.g = b.getAttribute('data-g'); st.sel = ''; render(tool); return; }
        /* 2026-11-23 Paul：點一列不要在列表格子裡展開，要跳出卡片 */
        var r = e.target.closest('tr.r'); if (r) { var k = r.getAttribute('data-k'); st.sel = k; render(tool); openCard(tool, k); }
      });
    }
    var f = P.cfg && P.cfg.dateField || 'date', sf = P.cfg && (P.cfg.scopeField || P.cfg.groupField), rs0 = [];
    /* 2026-11-22 修正：P.records() 預設只回傳「本月」→ 期間報表只看得到 11 月；改讀全部記錄 P.read() */
    try { rs0 = ((P.read ? P.read() : P.records()) || []).filter(function (r) { return r && !r._deleted && ymd(r[f]); }); } catch (e) { rs0 = []; }
    var today = ymdLocal(new Date()), g = st.g, cur = key(today, g), groups = {};
    var scope = function (d) { if (g === 'day') return d.slice(0, 7) === today.slice(0, 7); if (g === 'week') return d.slice(0, 4) === today.slice(0, 4); return true; };
    rs0.forEach(function (r) { var d = ymd(r[f]); if (!scope(d) || d > today) return; var k = key(d, g); (groups[k] = groups[k] || []).push(r); });
    if (!groups[cur]) groups[cur] = [];
    var keys = Object.keys(groups).sort().reverse(), rows = keys.map(function (k) { return { k: k, rs: groups[k], c: A.row(groups[k], f) }; });
    var max = 1; rows.forEach(function (x) { x.c.forEach(function (v) { if (v && typeof v === 'object' && v.bar && v.v > max) max = v.v; }); });
    st.rows = rows; st.f = f; st.sf = sf; st.cur = cur;
    var unit = g === 'year' ? t('個年度', 'years', 'ឆ្នាំ') : g === 'month' ? t('個月份', 'months', 'ខែ') : g === 'week' ? t('週', 'weeks', 'សប្ដាហ៍') : t('天', 'days', 'ថ្ងៃ');
    var scopeTxt = g === 'day' ? t('本月每天', 'each day this month', 'ប្រចាំថ្ងៃខែនេះ') : g === 'week' ? t('今年每週', 'each week this year', 'ប្រចាំសប្ដាហ៍ឆ្នាំនេះ') : g === 'month' ? t('全部月份', 'all months', 'គ្រប់ខែ') : t('全部年度', 'all years', 'គ្រប់ឆ្នាំ');
    var cols = [t('期間', 'Period', 'រយៈពេល')].concat(A.cols());
    var html = '<div class="h"><span class="tt">' + esc(typeof A.title === 'function' ? A.title() : A.title) + '</span><span class="tg">' + [['day', t('日', 'Day', 'ថ្ងៃ')], ['week', t('週', 'Week', 'សប្ដាហ៍')], ['month', t('月報', 'Month', 'ខែ')], ['year', t('年報', 'Year', 'ឆ្នាំ')]].map(function (b) { return '<button type="button" data-g="' + b[0] + '" class="' + (g === b[0] ? 'on' : '') + '">' + b[1] + '</button>'; }).join('') + '</span>' +
      '<span class="ct">' + scopeTxt + ' · ' + rows.filter(function (x) { return x.rs.length; }).length + ' ' + unit + ' · ' + t('點一列跳出卡片', 'tap a row to open its card', 'ចុចជួរដើម្បីបើកកាត') + '</span></div>' +
      '<div class="sc"><table data-keynote="off"><thead><tr>' + cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>';
    rows.forEach(function (x) {
      var isCur = x.k === cur, isSel = x.k === st.sel;
      html += '<tr class="r' + (isCur ? ' cur' : '') + (isSel ? ' sel' : '') + (x.rs.length ? '' : ' em') + '" data-k="' + x.k + '"><td>' + (isCur ? '◀ ' : '') + esc(label(x.k, g)) + '</td>' + x.c.map(function (v) {
        if (v && typeof v === 'object') {
          if (v.bar) return '<td class="b"><i style="width:calc(' + (v.v / max * 100).toFixed(1) + '% - 8px)"></i><span>' + (v.v ? v.v.toLocaleString() : '—') + '</span></td>';
          if (v.bad) return '<td>' + (v.v ? '<span class="bad">' + v.v + '</span>' : '—') + '</td>';
        }
        return '<td>' + esc(v) + '</td>';
      }).join('') + '</tr>';
    });
    /* 2026-11-22 Paul：點一列畫面亂跳 → 重畫時保留表格與整頁的捲動位置 */
    var osc = box.querySelector('.sc'), st0 = osc ? osc.scrollTop : 0, wy = window.scrollY, top0 = box.getBoundingClientRect().top;
    box.innerHTML = html + '</tbody></table></div>';
    var nsc = box.querySelector('.sc'); if (nsc) nsc.scrollTop = st0;
    var dy = box.getBoundingClientRect().top - top0; if (Math.abs(dy) > 1) window.scrollTo(0, wy + dy);
    st.sig = rs0.length + '|' + g + '|' + st.sel + '|' + L();
    try { if (pages[tool] && pages[tool].isOpen()) pages[tool].refresh(); } catch (e) {}
  }
  /* ── 2026-11-23 Paul：點一列 → 跳出卡片（版面＝SEC 貨櫃頁的物品頁 .gip-ov：上面固定 n/N ◀ ▶ ✕，
        表頭＝圖示＋期間＋重點 chips，下面分頁；往下捲自動接上一期，左右滑／← → 換期）。只讀資料，不改任何功能。 ── */
  var pages = {}, ipLoading = null, SELF = (document.currentScript && document.currentScript.src) || '';
  function needIP(cb) {
    if (window.GC && GC.ItemPage) return cb();
    if (!ipLoading) ipLoading = new Promise(function (res) {
      var s = document.createElement('script'); s.src = SELF ? SELF.replace(/gc-period-table\.js.*$/, 'gc-item-page.js?v=20261123a') : './gc-item-page.js?v=20261123a';
      s.onload = function () { res(true); }; s.onerror = function () { res(false); }; document.head.appendChild(s);
    });
    ipLoading.then(function (ok) { if (ok && window.GC && GC.ItemPage) cb(); });
  }
  function cellText(v) { if (v && typeof v === 'object') return v.v ? v.v.toLocaleString() : '—'; return String(v == null ? '—' : v); }
  function cellNum(v) { if (v && typeof v === 'object') return num(v.v); var s = String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''); return s === '' || s === '-' ? null : num(s); }
  function fmtN(n) { var a = Math.abs(n); return (Math.round(n * 10) / 10).toLocaleString('en-US', { maximumFractionDigits: a >= 100 ? 0 : 1 }); }
  function subOf(g) { return g === 'year' ? 'month' : (g === 'day' ? '' : 'day'); }
  function unitName(g) { return g === 'year' ? t('年度', 'Year', 'ឆ្នាំ') : g === 'month' ? t('月份', 'Month', 'ខែ') : g === 'week' ? t('週', 'Week', 'សប្ដាហ៍') : t('日', 'Day', 'ថ្ងៃ'); }
  function page(tool) {
    if (pages[tool]) return pages[tool];
    var A = ADAPT[tool], st = state[tool];
    var rowsNow = function () { return (st.rows || []); };
    var icon = (function () { var m = String(typeof A.title === 'function' ? A.title() : A.title).match(/^\s*(\S+)/); return m ? m[1] : '📋'; })();
    pages[tool] = GC.ItemPage.create({
      key: 'gcpt_' + tool, accent: 'var(--gc-acc,#2d7a5a)', z: 2000,
      list: rowsNow, id: function (x) { return x.k; },
      get: function (id) { var l = rowsNow(); for (var i = 0; i < l.length; i++) if (l[i].k === String(id)) return l[i]; return null; },
      head: function (x) {
        var chips = [];
        if (x.k === st.cur) chips.push('<span class="gip-chip b">◀ ' + esc(t('本期', 'Current', 'បច្ចុប្បន្ន')) + '</span>');
        chips.push('<span class="gip-chip' + (x.rs.length ? ' g' : ' k') + '">' + x.rs.length + ' ' + esc(t('筆記錄', 'records', 'កំណត់ត្រា')) + '</span>');
        var d = days(x.rs, st.f); if (d && st.g !== 'day') chips.push('<span class="gip-chip">' + d + ' ' + esc(t('天有記錄', 'days with records', 'ថ្ងៃ')) + '</span>');
        return { icon: icon, code: unitName(st.g), title: label(x.k, st.g), chips: chips };
      },
      tabs: [
        { id: 'key', icon: '📊', label: function () { return t('重點', 'Key', 'សំខាន់'); }, render: function (x) {
          var cols = A.cols(), l = rowsNow(), i = l.indexOf(x), prev = l[i + 1];   /* 列表是新→舊，下一列＝上一期 */
          var html = '<div class="gcpt-kpis">' + x.c.map(function (v, ci) {
            var n = cellNum(v), all = l.filter(function (y) { return y.rs.length; }).map(function (y) { return cellNum(y.c[ci]); }).filter(function (q) { return q != null; });
            var mx = Math.max.apply(null, all.map(Math.abs).concat([1])), bad = v && typeof v === 'object' && v.bad && v.v;
            var note = '';
            if (n != null && x.rs.length) {
              if (prev && prev.rs.length) { var pn = cellNum(prev.c[ci]); if (pn != null) { var d = n - pn; note += esc(t('上一期', 'Previous', 'មុន')) + ' ' + esc(cellText(prev.c[ci])) + ' · ' + (Math.abs(d) < 0.05 ? '＝ ' + esc(t('一樣', 'same', 'ដូចគ្នា')) : '<span class="' + (d > 0 ? 'up' : 'dn') + '">' + (d > 0 ? '▲ ' + esc(t('多', 'up', 'កើន')) : '▼ ' + esc(t('少', 'down', 'ថយ'))) + ' ' + fmtN(Math.abs(d)) + '</span>'); } }
              if (all.length >= 3) note += (note ? '<br>' : '') + esc(t('各期平均', 'Average', 'មធ្យម')) + ' ' + fmtN(avg(all));
            }
            return '<div class="gcpt-kpi"><div class="l">' + esc(cols[ci] || '') + '</div><div class="v' + (bad ? ' bad' : '') + '">' + esc(cellText(v)) + '</div>' +
              (n != null && all.length >= 2 ? '<div class="t"><i style="width:' + Math.max(3, Math.round(Math.abs(n) / mx * 100)) + '%"></i></div>' : '') + (note ? '<div class="n">' + note + '</div>' : '') + '</div>';
          }).join('') + '</div>';
          if (!x.rs.length) html += '<div class="gip-empty">' + esc(t('這一期沒有記錄', 'No records in this period', 'គ្មានកំណត់ត្រា')) + '</div>';
          return html;
        } },
        { id: 'area', icon: '📍', label: function () { return t('分項', 'Breakdown', 'លម្អិត'); },
          when: function () { return !!st.sf; }, count: function (x) { var o = {}; x.rs.forEach(function (r) { o[pretty(r[st.sf])] = 1; }); var n = Object.keys(o).filter(function (k) { return k !== '—'; }).length; return n || null; },
          render: function (x) {
            var by = {}; x.rs.forEach(function (r) { var s = pretty(st.sf ? r[st.sf] : ''); by[s] = (by[s] || 0) + 1; });
            var ks = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; }); if (!ks.length) return '';
            var mx = by[ks[0]] || 1;
            return '<div class="gcpt-bars">' + ks.map(function (k) { return '<div class="gcpt-br"><span class="nm">' + esc(k === '—' ? t('未分類', 'Unspecified', 'មិនបានបញ្ជាក់') : k) + '</span><span class="tk"><i style="width:' + Math.max(3, Math.round(by[k] / mx * 100)) + '%"></i></span><span class="vl">' + by[k] + '</span></div>'; }).join('') + '</div>';
          } },
        { id: 'time', icon: '📅', label: function () { return st.g === 'year' ? t('各月', 'By month', 'តាមខែ') : t('每天', 'By day', 'តាមថ្ងៃ'); },
          when: function () { return !!subOf(st.g); },
          render: function (x) {
            var sg = subOf(st.g), gp = {}; x.rs.forEach(function (r) { var d = ymd(r[st.f]); if (!d) return; var k = key(d, sg); (gp[k] = gp[k] || []).push(r); });
            var ks = Object.keys(gp).sort().reverse(); if (!ks.length) return '';
            var cols = A.cols();
            return '<div class="gcpt-sc"><table class="gcpt-mt" data-keynote="off"><thead><tr><th>' + esc(sg === 'month' ? t('月份', 'Month', 'ខែ') : t('日期', 'Date', 'ថ្ងៃ')) + '</th>' + cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
              ks.map(function (k) { var c = A.row(gp[k], st.f); return '<tr><td>' + esc(label(k, sg)) + '</td>' + c.map(function (v) { var bad = v && typeof v === 'object' && v.bad && v.v; return '<td' + (bad ? ' class="bad"' : '') + '>' + esc(cellText(v)) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
          } }
      ],
      labels: { end: function () { return t('已經到最早一期', 'No earlier period', 'គ្មានរយៈពេលមុនទៀតទេ'); } },
      onClose: function () { st.sel = ''; render(tool); }
    });
    return pages[tool];
  }
  function openCard(tool, k) { needIP(function () { try { page(tool).open(k); } catch (e) { if (window.console) console.warn('gcpt card', e); } }); }
  function tick() {
    Object.keys(ADAPT).forEach(function (tool) {
      if (!(window.GC && GC.pages && GC.pages[tool])) return;
      var st = state[tool], n = 0; try { var PP = GC.pages[tool]; n = ((PP.read ? PP.read() : PP.records()) || []).length; } catch (e) {}
      if (!st || !document.getElementById('gcpt-' + tool) || st.sig !== n + '|' + st.g + '|' + st.sel + '|' + L()) { css(); render(tool); }
    });
  }
  function boot() { tick(); setInterval(function () { if (!document.hidden) tick(); }, 4000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 1500); }); else setTimeout(boot, 1500);
  /* 外部可指定顯示粒度（例如溫濕度上方選「月」→ 報表也列每月） */
  function setGranularity(tool, g) { if (['day', 'week', 'month', 'year'].indexOf(g) < 0) return; var st = state[tool] || (state[tool] = { g: g, sel: '' }); if (st.g === g) return; st.g = g; st.sel = ''; if (document.getElementById('gcpt-' + tool)) render(tool); }
  window.GCPeriodTable = { render: render, tick: tick, adapters: ADAPT, setGranularity: setGranularity, openCard: openCard };
})();
