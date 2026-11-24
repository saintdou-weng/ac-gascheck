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
      areaName: function (v) { if (typeof locName !== 'function') return ''; var n = locName(v); return n && n !== '—' ? n : ''; },
      anchor: '#pane-dash', where: 'prepend', title: function () { return t('🧹 清潔期間報表', '🧹 Cleaning period report', '🧹 របាយការណ៍អនាម័យ'); },
      cols: function () { return [t('檢查天數', 'Days', 'ថ្ងៃ'), t('檢查次數', 'Checks', 'ពិនិត្យ'), t('區域', 'Areas', 'តំបន់'), t('❌ 異常', '❌ Issues', '❌ បញ្ហា'), t('通過率', 'Pass rate', 'អត្រាល្អ')]; },
      row: function (rs, f) {
        var bad = rs.filter(function (r) { var c = parseObj(r.checks); return Object.keys(c).some(function (k) { return c[k] === false || c[k] === 'false' || c[k] === 'x' || c[k] === 'X'; }); }).length;
        var areas = {}; rs.forEach(function (r) { if (r.locId) areas[r.locId] = 1; });
        return [days(rs, f), { v: rs.length, bar: true }, Object.keys(areas).length || '—', { v: bad, bad: true }, rs.length ? Math.round((rs.length - bad) / rs.length * 100) + '%' : '—'];
      }
    },
    temperature: {
      /* 2026-11-25：za／zb… → A廠車間／B廠車間…；別名併成同一地點 */
      areaKey: function (v) { return (typeof tempCanonicalZoneId === 'function' && typeof getZ === 'function' && tempCanonicalZoneId(v, getZ())) || String(v || ''); },
      areaName: function (v) {
        var defs = typeof getZ === 'function' ? getZ() : [], id = (typeof tempCanonicalZoneId === 'function' && tempCanonicalZoneId(v, defs)) || String(v || '');
        var list = (typeof tempReportZones === 'function' ? tempReportZones() : []).concat(defs || []);
        var z = list.filter(function (q) { return q && (String(q.id) === id || String(q.id) === String(v)); })[0];
        return z ? lang3(z, '') : '';
      },
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
      '.gcpt-kpi{background:#f1f4f8;border:1px solid #dfe6ee;border-left:4px solid var(--gip-acc,#2d7a5a);border-radius:12px;padding:10px 12px;min-width:0}' +
      '.gcpt-kpi .l{font-size:11.5px;color:#64768a;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.gcpt-kpi .v{font-size:22px;font-weight:800;color:#1d2b3a;line-height:1.2;margin-top:2px;word-break:break-word}.gcpt-kpi .v.bad{color:#dc2626}' +
      '.gcpt-kpi .t{height:6px;border-radius:4px;background:#e6ecf2;margin:7px 0 5px;overflow:hidden}.gcpt-kpi .t i{display:block;height:100%;border-radius:4px;background:var(--gip-acc,#2d7a5a)}' +
      '.gcpt-kpi .n{font-size:11px;color:#64768a;line-height:1.45}.gcpt-kpi .up{color:#b45309;font-weight:700}.gcpt-kpi .dn{color:#15803d;font-weight:700}' +
      '.gcpt-bars{display:flex;flex-direction:column;gap:6px}' +
      '.gcpt-br{display:grid;grid-template-columns:minmax(84px,34%) 1fr auto;gap:8px;align-items:center;font-size:13px}' +
      '.gcpt-br .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;color:#1d2b3a}.gcpt-br .tk{height:10px;background:#e6ecf2;border-radius:6px;overflow:hidden}.gcpt-br .tk i{display:block;height:100%;border-radius:6px;background:var(--gip-acc,#2d7a5a);opacity:.75}.gcpt-br .vl{font-weight:800;color:#1d2b3a;min-width:28px;text-align:right}' +
      '.gcpt-mt{width:100%;border-collapse:collapse;font-size:12.5px}.gcpt-mt th{font-size:11px;color:#64768a;font-weight:700;padding:5px 6px;text-align:right;white-space:nowrap;border-bottom:1px solid #e1e8ef}.gcpt-mt td{padding:6px;text-align:right;border-bottom:1px solid #eef2f6;white-space:nowrap}.gcpt-mt th:first-child,.gcpt-mt td:first-child{text-align:left;font-weight:700;color:#1d2b3a}.gcpt-mt .bad{color:#dc2626;font-weight:800}' +
      '.gcpt-sc{overflow-x:auto;-webkit-overflow-scrolling:touch}' +
      /* 2026-11-25 卡片圖表／地點卡 */
      '.gcpt-svg{display:block;width:100%;height:auto;margin:2px 0 4px;overflow:visible}.gcpt-svg .gl{stroke:currentColor;opacity:.13}.gcpt-svg .ax{fill:currentColor;opacity:.6;font-size:15px;font-weight:600}.gcpt-svg .th{font-size:14px;font-weight:800}' +
      '.gcpt-lg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:11.5px;opacity:.8;margin:0 0 6px}.gcpt-lg span{display:inline-flex;align-items:center;gap:5px}.gcpt-lg i{display:inline-block;width:16px;height:8px;border-radius:3px}' +
      '.gcpt-zones{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}' +
      '.gcpt-zone{background:rgba(15,23,42,.035);border:1px solid rgba(100,118,138,.28);border-left:4px solid var(--gip-acc,#2d7a5a);border-radius:12px;padding:10px 12px;min-width:0}.gcpt-zone.bad{border-left-color:#dc2626}' +
      '.gcpt-zone .zn{font-weight:800;font-size:14px;display:flex;justify-content:space-between;gap:6px;align-items:center}.gcpt-zone .zb{font-size:11.5px;color:#dc2626;white-space:nowrap}' +
      '.gcpt-zone .zv{display:flex;gap:12px;margin:4px 0 2px}.gcpt-zone .zv b{font-size:21px;font-weight:800;color:#ea580c}.gcpt-zone .zv b.h{color:#0284c7}' +
      '.gcpt-zone .zm{font-size:11.5px;opacity:.75;line-height:1.5;margin-top:3px}' +
      '.gcpt-brn{font-size:11px;opacity:.7;margin:-3px 0 4px;padding-left:2px}.gcpt-bars .bad{color:#dc2626;font-weight:800}' +
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
    /* 2026-11-25：卡片開著時，只有資料筆數／語言／粒度真的變了才重畫卡片（以前每 4 秒重畫一次，手指往下滑會被打斷） */
    var dsig = rs0.length + '|' + g + '|' + L();
    try { if (pages[tool] && pages[tool].isOpen() && st.dsig !== dsig) pages[tool].refresh(); } catch (e) {}
    st.dsig = dsig;
  }
  /* ── 2026-11-23 Paul：點一列 → 跳出卡片（版面＝SEC 貨櫃頁的物品頁 .gip-ov：上面固定 n/N ◀ ▶ ✕，
        表頭＝圖示＋期間＋重點 chips，下面分頁；往下捲自動接上一期，左右滑／← → 換期）。只讀資料，不改任何功能。 ── */
  var pages = {}, ipLoading = null, SELF = (document.currentScript && document.currentScript.src) || '';
  function needIP(cb) {
    if (window.GC && GC.ItemPage) return cb();
    if (!ipLoading) ipLoading = new Promise(function (res) {
      var s = document.createElement('script'); s.src = SELF ? SELF.replace(/gc-period-table\.js.*$/, 'gc-item-page.js?v=20261125a') : './gc-item-page.js?v=20261125a';
      s.onload = function () { res(true); }; s.onerror = function () { res(false); }; document.head.appendChild(s);
    });
    ipLoading.then(function (ok) { if (ok && window.GC && GC.ItemPage) cb(); });
  }
  function cellText(v) { if (v && typeof v === 'object') return v.v ? v.v.toLocaleString() : '—'; return String(v == null ? '—' : v); }
  function cellNum(v) { if (v && typeof v === 'object') return num(v.v); var s = String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''); return s === '' || s === '-' ? null : num(s); }
  function fmtN(n) { var a = Math.abs(n); return (Math.round(n * 10) / 10).toLocaleString('en-US', { maximumFractionDigits: a >= 100 ? 0 : 1 }); }
  function subOf(g) { return g === 'year' ? 'month' : (g === 'day' ? '' : 'day'); }
  function unitName(g) { return g === 'year' ? t('年度', 'Year', 'ឆ្នាំ') : g === 'month' ? t('月份', 'Month', 'ខែ') : g === 'week' ? t('週', 'Week', 'សប្ដាហ៍') : t('日', 'Day', 'ថ្ងៃ'); }
  /* ── 2026-11-25 Paul：卡片改成「一期一整頁、往下一路滑」：重點 → 圖表 → 各地點 → 每天，不用切分頁；
        地點顯示中文名稱（A廠車間…），不再顯示 za／zb 這種代號。 ── */
  function lang3(o, fb) { if (!o) return fb; var l = L(); return (l === 'en' ? (o.en || o.zh) : l === 'km' ? (o.km || o.en || o.zh) : (o.zh || o.en)) || fb; }
  /* 分組鍵：同一地點的別名併成一個（溫濕度 za／Building A … → za） */
  function areaKey(tool, v) {
    var A = ADAPT[tool]; if (A && A.areaKey) { try { var k = A.areaKey(v); if (k) return k; } catch (e) {} }
    return String(v == null ? '' : v);
  }
  function areaName(tool, v) {
    var A = ADAPT[tool], raw = String(v == null ? '' : v); if (!raw) return t('未分類', 'Unspecified', 'មិនបានបញ្ជាក់');
    if (A && A.areaName) { try { var n = A.areaName(raw); if (n && n !== raw) return n; } catch (e) {} }
    try {
      var P = GC.pages[tool], sc = P && P.cfg && P.cfg.telegramScopes; sc = typeof sc === 'function' ? sc() : sc;
      var hit = (sc || []).filter(function (s) { return s && String(s.value) === raw; })[0]; if (hit) return lang3(hit, raw);
    } catch (e) {}
    return pretty(raw);
  }
  function svgEsc(v) { return esc(v).replace(/"/g, '&quot;'); }
  function niceRange(lo, hi) { if (!(hi > lo)) { lo -= 1; hi += 1; } var span = hi - lo, step = span > 40 ? 10 : span > 16 ? 5 : span > 6 ? 2 : 1; return { lo: Math.floor(lo / step) * step, hi: Math.ceil(hi / step) * step, step: step }; }
  /* 折線圖：pts=[{lab, v, lo, hi, bad}]（由舊到新）；lines=[{v, col, lab}] 門檻虛線 */
  function lineChart(o) {
    var pts = o.pts.filter(function (p) { return p.v != null && !isNaN(p.v); }); if (pts.length < 2) return '';
    var W = 640, H = 210, l = 44, r = 14, tp = 14, b = 30, iw = W - l - r, ih = H - tp - b;
    var vals = []; pts.forEach(function (p) { vals.push(p.v); if (p.lo != null) vals.push(p.lo); if (p.hi != null) vals.push(p.hi); });
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    (o.lines || []).forEach(function (ln) { if (ln.v >= mn - (mx - mn) * 0.6 - 2 && ln.v <= mx + (mx - mn) * 0.6 + 2) { mn = Math.min(mn, ln.v); mx = Math.max(mx, ln.v); } });
    var R = niceRange(mn, mx), n = pts.length;
    var X = function (i) { return l + (n === 1 ? iw / 2 : i * iw / (n - 1)); }, Y = function (v) { return tp + ih - (v - R.lo) / (R.hi - R.lo) * ih; };
    var s = '<svg class="gcpt-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + svgEsc(o.title || '') + '">';
    for (var g = R.lo; g <= R.hi + 1e-9; g += R.step) s += '<line x1="' + l + '" x2="' + (W - r) + '" y1="' + Y(g).toFixed(1) + '" y2="' + Y(g).toFixed(1) + '" class="gl"/><text x="' + (l - 6) + '" y="' + (Y(g) + 4).toFixed(1) + '" text-anchor="end" class="ax">' + g + '</text>';
    (o.lines || []).forEach(function (ln) { if (ln.v < R.lo || ln.v > R.hi) return; var y = Y(ln.v).toFixed(1); s += '<line x1="' + l + '" x2="' + (W - r) + '" y1="' + y + '" y2="' + y + '" stroke="' + ln.col + '" stroke-width="1.6" stroke-dasharray="6 5"/><text x="' + (W - r - 2) + '" y="' + (y - 4) + '" text-anchor="end" class="th" fill="' + ln.col + '">' + svgEsc(ln.lab) + '</text>'; });
    var band = pts.filter(function (p) { return p.lo != null && p.hi != null; });
    if (band.length === n) s += '<path d="M' + pts.map(function (p, i) { return X(i).toFixed(1) + ',' + Y(p.hi).toFixed(1); }).join('L') + 'L' + pts.slice().reverse().map(function (p, j) { return X(n - 1 - j).toFixed(1) + ',' + Y(p.lo).toFixed(1); }).join('L') + 'Z" fill="' + o.col + '" opacity=".14"/>';
    s += '<path d="M' + pts.map(function (p, i) { return X(i).toFixed(1) + ',' + Y(p.v).toFixed(1); }).join('L') + '" fill="none" stroke="' + o.col + '" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>';
    pts.forEach(function (p, i) { s += '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(p.v).toFixed(1) + '" r="' + (p.bad ? 4.5 : 3) + '" fill="' + (p.bad ? '#dc2626' : o.col) + '"><title>' + svgEsc(p.lab + ' · ' + p.v.toFixed(1) + (o.unit || '') + (p.lo != null ? ' (' + p.lo.toFixed(1) + '–' + p.hi.toFixed(1) + ')' : '')) + '</title></circle>'; });
    var every = Math.max(1, Math.ceil(n / 8));
    pts.forEach(function (p, i) { if (i % every && i !== n - 1) return; s += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 9) + '" text-anchor="middle" class="ax">' + svgEsc(p.lab) + '</text>'; });
    return s + '</svg>';
  }
  /* 直條圖（可疊兩段：好／不好）：bars=[{lab, a, b}] */
  function barChart(o) {
    var bars = o.bars; if (!bars.length) return '';
    var W = 640, H = 190, l = 36, r = 10, tp = 12, b = 30, iw = W - l - r, ih = H - tp - b, n = bars.length;
    var mx = Math.max.apply(null, bars.map(function (x) { return (x.a || 0) + (x.b || 0); }).concat([1])), R = niceRange(0, mx);
    var bw = Math.max(3, Math.min(34, iw / n * 0.7)), X = function (i) { return l + (i + 0.5) * iw / n; }, Y = function (v) { return tp + ih - v / R.hi * ih; };
    var s = '<svg class="gcpt-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + svgEsc(o.title || '') + '">';
    for (var g = 0; g <= R.hi + 1e-9; g += R.step) s += '<line x1="' + l + '" x2="' + (W - r) + '" y1="' + Y(g).toFixed(1) + '" y2="' + Y(g).toFixed(1) + '" class="gl"/><text x="' + (l - 5) + '" y="' + (Y(g) + 4).toFixed(1) + '" text-anchor="end" class="ax">' + g + '</text>';
    bars.forEach(function (x, i) {
      var a = x.a || 0, bb = x.b || 0, cx = X(i) - bw / 2;
      if (a) s += '<rect x="' + cx.toFixed(1) + '" y="' + Y(a).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (Y(0) - Y(a)).toFixed(1) + '" rx="2" fill="' + o.colA + '"><title>' + svgEsc(x.lab + ' · ' + o.labA + ' ' + a) + '</title></rect>';
      if (bb) s += '<rect x="' + cx.toFixed(1) + '" y="' + Y(a + bb).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (Y(a) - Y(a + bb)).toFixed(1) + '" rx="2" fill="' + o.colB + '"><title>' + svgEsc(x.lab + ' · ' + o.labB + ' ' + bb) + '</title></rect>';
    });
    var every = Math.max(1, Math.ceil(n / 8));
    bars.forEach(function (x, i) { if (i % every && i !== n - 1) return; s += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 9) + '" text-anchor="middle" class="ax">' + svgEsc(x.lab) + '</text>'; });
    return s + '</svg>';
  }
  function legend(items) { return '<div class="gcpt-lg">' + items.map(function (x) { return '<span><i style="background:' + x[0] + (x[2] ? ';height:0;border-top:2px dashed ' + x[0] : '') + '"></i>' + esc(x[1]) + '</span>'; }).join('') + '</div>'; }
  function shortLab(k, sg) { return sg === 'month' ? String(+k.slice(5, 7)) + t('月', '', '') : k.slice(5).replace('-', '/'); }
  function bucket(rs, f, sg) { var gp = {}; rs.forEach(function (r) { var d = ymd(r[f]); if (!d) return; var k = key(d, sg); (gp[k] = gp[k] || []).push(r); }); return gp; }
  function nums(rs, fld) { return rs.map(function (r) { return parseFloat(r[fld]); }).filter(function (v) { return !isNaN(v); }); }

  /* 每個工具額外的圖表與分項（只讀資料） */
  var EXTRA = {
    temperature: function (x, st) {
      var th = { t: { cold: 18, hot: 35 }, h: { dry: 40, humid: 80, vhum: 90 } }; try { if (typeof getTH === 'function') th = getTH(); } catch (e) {}
      var anom = function (r) { try { return typeof isAnom === 'function' ? isAnom(r) : false; } catch (e) { return false; } };
      var html = '', sg = subOf(st.g);
      if (sg) {
        var gp = bucket(x.rs, st.f, sg), ks = Object.keys(gp).sort();
        var mk = function (fld) { return ks.map(function (k) { var v = nums(gp[k], fld); return v.length ? { lab: shortLab(k, sg), v: avg(v), lo: Math.min.apply(null, v), hi: Math.max.apply(null, v), bad: gp[k].some(anom) } : { lab: shortLab(k, sg), v: null }; }); };
        var tc = lineChart({ title: t('溫度趨勢', 'Temperature trend', 'សីតុណ្ហភាព'), pts: mk('t'), col: '#ea580c', unit: '°C', lines: [{ v: th.t.hot, col: '#dc2626', lab: t('過熱 ', 'Hot ', 'ក្តៅ ') + th.t.hot + '°C' }, { v: th.t.cold, col: '#2563eb', lab: t('過冷 ', 'Cold ', 'ត្រជាក់ ') + th.t.cold + '°C' }] });
        var hc = lineChart({ title: t('濕度趨勢', 'Humidity trend', 'សំណើម'), pts: mk('h'), col: '#0284c7', unit: '%', lines: [{ v: th.h.vhum, col: '#dc2626', lab: t('過濕 ', 'Too humid ', 'សើមខ្លាំង ') + th.h.vhum + '%' }, { v: th.h.dry, col: '#b45309', lab: t('過乾 ', 'Too dry ', 'ស្ងួត ') + th.h.dry + '%' }] });
        var per = sg === 'month' ? t('每月', 'monthly', 'ប្រចាំខែ') : t('每天', 'daily', 'ប្រចាំថ្ងៃ');
        if (tc) html += '<div class="gip-sub">🌡️ ' + esc(t('溫度趨勢（' + per + '平均，色帶＝最低～最高）', 'Temperature (' + per + ' average, band = min–max)', 'សីតុណ្ហភាព')) + '</div>' + tc + legend([['#ea580c', t('平均溫度', 'Average', 'មធ្យម')], ['#dc2626', t('超標點／門檻', 'Out of range / limit', 'ហួសកំណត់')]]);
        if (hc) html += '<div class="gip-sub">💧 ' + esc(t('濕度趨勢（' + per + '平均）', 'Humidity (' + per + ' average)', 'សំណើម')) + '</div>' + hc + legend([['#0284c7', t('平均濕度', 'Average', 'មធ្យម')], ['#dc2626', t('超標點／門檻', 'Out of range / limit', 'ហួសកំណត់')]]);
      }
      /* 各地點 */
      var by = {}; x.rs.forEach(function (r) { var k = areaKey('temperature', r.z); (by[k] = by[k] || []).push(r); });
      var ks2 = Object.keys(by).sort(function (a, b) { return areaName('temperature', a).localeCompare(areaName('temperature', b)); });
      if (ks2.length) {
        html += '<div class="gip-sub">📍 ' + esc(t('各地點', 'By location', 'តាមទីតាំង')) + '</div><div class="gcpt-zones">';
        ks2.forEach(function (k) {
          var rs = by[k], T = nums(rs, 't'), H = nums(rs, 'h'), bad = rs.filter(anom).length, am = rs.filter(function (r) { return r.p === 'morning'; }), pm = rs.filter(function (r) { return r.p === 'afternoon'; });
          var tA = T.length ? avg(T) : null, hA = H.length ? avg(H) : null;
          var sl = function (list) { var a = nums(list, 't'), b = nums(list, 'h'); return a.length || b.length ? (a.length ? avg(a).toFixed(1) + '°C' : '—') + ' · ' + (b.length ? Math.round(avg(b)) + '%' : '—') : '—'; };
          html += '<div class="gcpt-zone' + (bad ? ' bad' : '') + '"><div class="zn">' + esc(areaName('temperature', k)) + (bad ? '<span class="zb">⚠️ ' + bad + '</span>' : '') + '</div>' +
            '<div class="zv"><b>' + (tA != null ? tA.toFixed(1) + '°C' : '—') + '</b><b class="h">' + (hA != null ? Math.round(hA) + '%' : '—') + '</b></div>' +
            '<div class="zm">' + esc(t('溫度', 'Temp', 'សីតុណ្ហភាព')) + ' ' + (T.length ? Math.min.apply(null, T).toFixed(1) + '～' + Math.max.apply(null, T).toFixed(1) + '°C' : '—') + '<br>' + esc(t('濕度', 'Humidity', 'សំណើម')) + ' ' + (H.length ? Math.round(Math.min.apply(null, H)) + '～' + Math.round(Math.max.apply(null, H)) + '%' : '—') + '</div>' +
            '<div class="zm">☀️ ' + esc(t('早上', 'AM', 'ព្រឹក')) + ' ' + sl(am) + '<br>🌇 ' + esc(t('下午', 'PM', 'រសៀល')) + ' ' + sl(pm) + '</div>' +
            '<div class="zm">' + rs.length + ' ' + esc(t('筆', 'records', 'កំណត់ត្រា')) + '</div></div>';
        });
        html += '</div>';
      }
      return html;
    },
    cleaning: function (x, st) {
      var isBad = function (r) { var c = parseObj(r.checks); return Object.keys(c).some(function (k) { return c[k] === false || c[k] === 'false' || c[k] === 'x' || c[k] === 'X'; }); };
      var html = '', sg = subOf(st.g);
      if (sg) {
        var gp = bucket(x.rs, st.f, sg), ks = Object.keys(gp).sort();
        var bc = barChart({ title: t('檢查次數', 'Checks', 'ពិនិត្យ'), bars: ks.map(function (k) { var b = gp[k].filter(isBad).length; return { lab: shortLab(k, sg), a: gp[k].length - b, b: b }; }), colA: '#16a34a', colB: '#dc2626', labA: t('通過', 'Pass', 'ល្អ'), labB: t('異常', 'Issue', 'បញ្ហា') });
        if (bc) html += '<div class="gip-sub">🧹 ' + esc(sg === 'month' ? t('每月檢查次數', 'Checks per month', 'ពិនិត្យប្រចាំខែ') : t('每天檢查次數', 'Checks per day', 'ពិនិត្យប្រចាំថ្ងៃ')) + '</div>' + bc + legend([['#16a34a', t('通過', 'Pass', 'ល្អ')], ['#dc2626', t('有異常', 'With issues', 'មានបញ្ហា')]]);
      }
      /* 各地點：次數、異常、通過率 */
      var by = {}; x.rs.forEach(function (r) { var k = areaKey('cleaning', r.locId); (by[k] = by[k] || []).push(r); });
      var ks2 = Object.keys(by).sort(function (a, b) { return by[b].length - by[a].length; });
      if (ks2.length) {
        html += '<div class="gip-sub">📍 ' + esc(t('各地點（通過率）', 'By location (pass rate)', 'តាមទីតាំង')) + '</div><div class="gcpt-bars">';
        ks2.forEach(function (k) {
          var n = by[k].length, b = by[k].filter(isBad).length, pr = n ? Math.round((n - b) / n * 100) : 0;
          html += '<div class="gcpt-br"><span class="nm">' + esc(areaName('cleaning', k)) + '</span><span class="tk"><i style="width:' + Math.max(3, pr) + '%;background:' + (pr >= 95 ? '#16a34a' : pr >= 80 ? '#d97706' : '#dc2626') + '"></i></span><span class="vl">' + pr + '%</span></div>' +
            '<div class="gcpt-brn">' + n + ' ' + esc(t('次', 'checks', 'ដង')) + (b ? ' · <span class="bad">❌ ' + b + '</span>' : '') + '</div>';
        });
        html += '</div>';
      }
      /* 各檢查項目的異常次數 */
      var IT = { smell: ['氣味', 'Smell', 'ក្លិន'], light: ['燈光', 'Light', 'អំពូល'], floor: ['地板', 'Floor', 'កម្រាល'], door: ['門', 'Door', 'ទ្វារ'], corner: ['角落', 'Corner', 'ជ្រុង'], ceiling: ['天花板', 'Ceiling', 'ពិដាន'] };
      var ICO = { smell: '👃', light: '💡', floor: '🧹', door: '🚪', corner: '📐', ceiling: '🏠' };
      var fails = {}, seen = {};
      x.rs.forEach(function (r) { var c = parseObj(r.checks); Object.keys(c).forEach(function (k) { if (c[k] == null || c[k] === '') return; seen[k] = (seen[k] || 0) + 1; if (c[k] === false || c[k] === 'false' || c[k] === 'x' || c[k] === 'X') fails[k] = (fails[k] || 0) + 1; }); });
      var items = Object.keys(seen).sort(function (a, b) { return (fails[b] || 0) - (fails[a] || 0); });
      if (items.length) {
        var mx = Math.max.apply(null, items.map(function (k) { return fails[k] || 0; }).concat([1]));
        html += '<div class="gip-sub">❌ ' + esc(t('各項目異常次數', 'Issues by item', 'បញ្ហាតាមចំណុច')) + '</div><div class="gcpt-bars">' + items.map(function (k) {
          var f = fails[k] || 0, nm = IT[k] ? (L() === 'en' ? IT[k][1] : L() === 'km' ? IT[k][2] : IT[k][0]) : pretty(k);
          return '<div class="gcpt-br"><span class="nm">' + (ICO[k] || '•') + ' ' + esc(nm) + '</span><span class="tk"><i style="width:' + (f ? Math.max(3, Math.round(f / mx * 100)) : 0) + '%;background:#dc2626"></i></span><span class="vl' + (f ? ' bad' : '') + '">' + (f || '0') + '</span></div>';
        }).join('') + '</div>';
      }
      return html;
    }
  };
  /* 沒有專屬圖表的工具：通用「分項」長條 */
  function genericArea(tool, x, st) {
    if (!st.sf) return '';
    var by = {}; x.rs.forEach(function (r) { var k = areaKey(tool, r[st.sf]); by[k] = (by[k] || 0) + 1; });
    var ks = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; }); if (!ks.length) return '';
    var mx = by[ks[0]] || 1;
    return '<div class="gip-sub">📍 ' + esc(t('分項', 'Breakdown', 'លម្អិត')) + '</div><div class="gcpt-bars">' + ks.map(function (k) { return '<div class="gcpt-br"><span class="nm">' + esc(areaName(tool, k)) + '</span><span class="tk"><i style="width:' + Math.max(3, Math.round(by[k] / mx * 100)) + '%"></i></span><span class="vl">' + by[k] + '</span></div>'; }).join('') + '</div>';
  }
  function keyHtml(tool, x) {
    var A = ADAPT[tool], cols = A.cols(), l = (state[tool].rows || []), i = l.indexOf(x), prev = l[i + 1];   /* 列表是新→舊，下一列＝上一期 */
    return '<div class="gcpt-kpis">' + x.c.map(function (v, ci) {
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
  }
  function timeHtml(tool, x, st) {
    var sg = subOf(st.g); if (!sg) return '';
    var gp = bucket(x.rs, st.f, sg), ks = Object.keys(gp).sort().reverse(); if (!ks.length) return '';
    var A = ADAPT[tool], cols = A.cols(), skip = sg === 'day' && /天數|Days|ថ្ងៃ/.test(cols[0] || '') ? 0 : -1;   /* 每天明細不用「記錄天數」欄（都是 1） */
    var keep = function (v, i) { return i !== skip; }; cols = cols.filter(keep);
    return '<div class="gip-sub">📅 ' + esc(sg === 'month' ? t('各月明細', 'By month', 'តាមខែ') : t('每天明細', 'By day', 'តាមថ្ងៃ')) + '</div>' +
      '<div class="gcpt-sc"><table class="gcpt-mt" data-keynote="off"><thead><tr><th>' + esc(sg === 'month' ? t('月份', 'Month', 'ខែ') : t('日期', 'Date', 'ថ្ងៃ')) + '</th>' + cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      ks.map(function (k) { var c = A.row(gp[k], st.f).filter(keep); return '<tr><td>' + esc(label(k, sg)) + '</td>' + c.map(function (v) { var bad = v && typeof v === 'object' && v.bad && v.v; return '<td' + (bad ? ' class="bad"' : '') + '>' + esc(cellText(v)) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  function page(tool) {
    if (pages[tool]) return pages[tool];
    var A = ADAPT[tool], st = state[tool];
    var rowsNow = function () { return (st.rows || []); };
    var icon = (function () { var m = String(typeof A.title === 'function' ? A.title() : A.title).match(/^\s*(\S+)/); return m ? m[1] : '📋'; })();
    pages[tool] = GC.ItemPage.create({
      key: 'gcpt_' + tool, accent: 'var(--gc-acc,#2d7a5a)', z: 2000, hideSingleTab: true,
      list: rowsNow, id: function (x) { return x.k; },
      get: function (id) { var l = rowsNow(); for (var i = 0; i < l.length; i++) if (l[i].k === String(id)) return l[i]; return null; },
      head: function (x) {
        var chips = [];
        if (x.k === st.cur) chips.push('<span class="gip-chip b">◀ ' + esc(t('本期', 'Current', 'បច្ចុប្បន្ន')) + '</span>');
        chips.push('<span class="gip-chip' + (x.rs.length ? ' g' : ' k') + '">' + x.rs.length + ' ' + esc(t('筆記錄', 'records', 'កំណត់ត្រា')) + '</span>');
        var d = days(x.rs, st.f); if (d && st.g !== 'day') chips.push('<span class="gip-chip">' + d + ' ' + esc(t('天有記錄', 'days with records', 'ថ្ងៃ')) + '</span>');
        return { icon: icon, code: unitName(st.g), title: label(x.k, st.g), chips: chips };
      },
      /* 一個分頁＝整期全部內容，一路往下滑；滑到底自動接上一期 */
      tabs: [{ id: 'all', icon: '📊', label: function () { return t('總覽', 'Overview', 'ទិដ្ឋភាពទូទៅ'); }, render: function (x) {
        var html = keyHtml(tool, x);
        if (!x.rs.length) return html + '<div class="gip-empty">' + esc(t('這一期沒有記錄', 'No records in this period', 'គ្មានកំណត់ត្រា')) + '</div>';
        var ex = ''; try { ex = EXTRA[tool] ? EXTRA[tool](x, st) : genericArea(tool, x, st); } catch (e) { if (window.console) console.warn('gcpt extra', e); ex = genericArea(tool, x, st); }
        return html + ex + timeHtml(tool, x, st);
      } }],
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
