/* photo-chart-import.js — 照片表 Excel（編號＋內嵌照片）匯入（2026-11-19，與 GA-EXP ga-photo-chart.js 同一套讀檔）
   消防設備頁：照片放到該編號設備的第一張（⭐標準照），原本的照片往後排（最多 4 張）。
   鑰匙頁：對鑰匙編號；清單沒有的編號會新增鑰匙（名稱、部門、位置、類型、數量照 Excel），照片放第一張（最多 2 張）。
   匯入前先列出「照片 → 哪個編號」確認；同一張照片不重複。 */
(function (root) {
  'use strict';
  if (root.PhotoChartImport) return;
  function L(z, e, k) { var l = (root.SEC && SEC.lang) || (root.GC && GC.lang) || (typeof lang !== 'undefined' && lang) || document.documentElement.lang || 'zh'; l = String(l).slice(0, 2); return l === 'zh' ? z : l === 'km' ? (k || e) : e; }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function tok(s) { return String(s == null ? '' : s).normalize('NFKC').toUpperCase().replace(/[\s\-_.]/g, ''); }
  /* ── xlsx 解壓（瀏覽器內建 DecompressionStream）── */
  async function unzip(buf) {
    var dv = new DataView(buf), eo = -1, i; for (i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) { if (dv.getUint32(i, true) === 0x06054b50) { eo = i; break; } }
    if (eo < 0) throw new Error(L('不是 .xlsx 檔', 'Not an .xlsx file', 'មិនមែន .xlsx'));
    var n = dv.getUint16(eo + 10, true), p = dv.getUint32(eo + 16, true), F = {}, td = new TextDecoder();
    for (var k = 0; k < n; k++) { if (dv.getUint32(p, true) !== 0x02014b50) break; var m = dv.getUint16(p + 10, true), cs = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true); F[td.decode(new Uint8Array(buf, p + 46, nl))] = { m: m, cs: cs, lo: lo }; p += 46 + nl + el + cl; }
    async function get(name) { var f = F[name]; if (!f) return null; var a = dv.getUint16(f.lo + 26, true), b = dv.getUint16(f.lo + 28, true), d = new Uint8Array(buf, f.lo + 30 + a + b, f.cs); if (f.m === 0) return d.slice(); var out = await new Response(new Blob([d]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer(); return new Uint8Array(out); }
    return { get: get, text: async function (nm) { var u = await get(nm); return u ? td.decode(u) : ''; } };
  }
  function xml(s) { return new DOMParser().parseFromString(s || '<x/>', 'application/xml'); }
  function tags(node, name) { return Array.prototype.slice.call(node.getElementsByTagNameNS('*', name)); }
  function resolve(base, t) { if (t.charAt(0) === '/') return t.slice(1); var p = base.split('/'); p.pop(); t.split('/').forEach(function (s) { if (s === '..') p.pop(); else if (s !== '.') p.push(s); }); return p.join('/'); }
  async function rels(z, path) { var p = path.split('/'), f = p.pop(), doc = xml(await z.text(p.concat(['_rels', f + '.rels']).join('/'))), o = {}; tags(doc, 'Relationship').forEach(function (r) { o[r.getAttribute('Id')] = { t: resolve(path, r.getAttribute('Target')), type: r.getAttribute('Type') || '' }; }); return o; }
  function rid(el) { for (var i = 0; i < el.attributes.length; i++) { var a = el.attributes[i]; if (/(^|:)(embed|id)$/.test(a.name) && /^rId/.test(a.value)) return a.value; } return ''; }
  function cr(ref) { var m = String(ref).match(/^([A-Z]+)(\d+)/); if (!m) return [0, 0]; var c = 0; for (var i = 0; i < m[1].length; i++) c = c * 26 + m[1].charCodeAt(i) - 64; return [c - 1, +m[2] - 1]; }
  function mime(n) { return /\.png$/i.test(n) ? 'image/png' : /\.gif$/i.test(n) ? 'image/gif' : /\.jpe?g$/i.test(n) ? 'image/jpeg' : /\.webp$/i.test(n) ? 'image/webp' : /\.bmp$/i.test(n) ? 'image/bmp' : ''; }

  /* 回傳 [{sheet,row,cells:{欄:字},head:{欄:表頭},blob}] */
  async function read(file) {
    var z = await unzip(await file.arrayBuffer()), out = [], ss = [];
    tags(xml(await z.text('xl/sharedStrings.xml')), 'si').forEach(function (si) { ss.push(tags(si, 't').map(function (t) { return t.textContent; }).join('')); });
    var wb = xml(await z.text('xl/workbook.xml')), wrel = await rels(z, 'xl/workbook.xml'), rvRel = [], rv = [];
    try { var rr = await rels(z, 'xl/richData/richValueRel.xml'); rvRel = tags(xml(await z.text('xl/richData/richValueRel.xml')), 'rel').map(function (r) { return (rr[rid(r)] || {}).t; }); rv = tags(xml(await z.text('xl/richData/rdrichvalue.xml')), 'rv').map(function (x) { var v = tags(x, 'v')[0]; return v ? +v.textContent : -1; }); } catch (e) {}
    var sheets = tags(wb, 'sheet');
    for (var si2 = 0; si2 < sheets.length; si2++) {
      var sh = sheets[si2], rel = wrel[rid(sh)]; if (!rel) continue;
      var path = rel.t, doc = xml(await z.text(path)), rows = {}, inCell = [];
      tags(doc, 'c').forEach(function (c) { var rc = cr(c.getAttribute('r')), t = c.getAttribute('t'), v = '', x; if (t === 's') { x = tags(c, 'v')[0]; v = x ? ss[+x.textContent] || '' : ''; } else if (t === 'inlineStr') v = tags(c, 't').map(function (q) { return q.textContent; }).join(''); else { x = tags(c, 'v')[0]; v = x ? x.textContent : ''; }
        var vm = c.getAttribute('vm'); if (vm && rv.length) { var media = rvRel[rv[+vm - 1]]; if (media) inCell.push({ media: media, row: rc[1] }); v = ''; }
        v = String(v).trim(); if (v && v !== '📷') { (rows[rc[1]] = rows[rc[1]] || {})[rc[0]] = v; } });
      var fmt = tags(doc, 'sheetFormatPr')[0], defH = (fmt && +fmt.getAttribute('defaultRowHeight')) || 15, RH = {}, HID = {};
      tags(doc, 'row').forEach(function (r) { var i = +r.getAttribute('r') - 1, h = r.getAttribute('ht'); if (h) RH[i] = +h; if (r.getAttribute('hidden') === '1') HID[i] = 1; });
      var rowH = function (r) { return HID[r] ? 0 : (RH[r] != null ? RH[r] : defH) * 12700; }, yOf = function (r, off) { var y = 0; for (var k = 0; k < r; k++) y += rowH(k); return y + (+off || 0); };
      var rowAt = function (y) { var acc = 0; for (var k = 0; k < 20000; k++) { var h = rowH(k); if (h && y < acc + h) return k; acc += h; } return 0; };
      var imgs = [], srel = await rels(z, path);
      for (var id in srel) { if (!/drawing$/.test(srel[id].type)) continue; var dpath = srel[id].t, ddoc = xml(await z.text(dpath)), drel = await rels(z, dpath);
        tags(ddoc, 'twoCellAnchor').concat(tags(ddoc, 'oneCellAnchor')).forEach(function (a) { var fr = tags(a, 'from')[0], to = tags(a, 'to')[0], blip = tags(a, 'blip')[0]; if (!fr || !blip) return; var m = drel[rid(blip)]; if (!m) return;
          var num = function (el, nm) { var q = el && tags(el, nm)[0]; return q ? +q.textContent : 0; }, y0 = yOf(num(fr, 'row'), num(fr, 'rowOff')), y1 = y0;
          if (to) y1 = yOf(num(to, 'row'), num(to, 'rowOff')); else { var ext = tags(a, 'ext')[0]; y1 = y0 + (ext ? +ext.getAttribute('cy') || 0 : 0); }
          imgs.push({ media: m.t, row: y1 > y0 ? rowAt((y0 + y1) / 2) : num(fr, 'row') }); }); }
      inCell.forEach(function (x) { imgs.push(x); });
      if (!imgs.length) continue;
      /* 表頭：第一張照片上面、最近一列有 2 格以上字的 */
      var first = Math.min.apply(null, imgs.map(function (x) { return x.row; })), head = {};
      for (var r = first - 1; r >= 0 && r >= first - 15; r--) { var cc = rows[r] || {}; if (Object.keys(cc).length >= 2) { head = cc; break; } }
      for (var j = 0; j < imgs.length; j++) { var im = imgs[j], bytes = await z.get(im.media), mt = mime(im.media); if (!bytes || !mt) continue; out.push({ sheet: sh.getAttribute('name'), row: im.row, cells: rows[im.row] || {}, head: head, blob: new Blob([bytes], { type: mt }), media: im.media }); }
    }
    return out;
  }

  function col(head, re) { for (var k in head) if (re.test(head[k])) return +k; return -1; }
  function fields(r) { var h = r.head, c = r.cells, get = function (re) { var k = col(h, re); return k >= 0 ? c[k] || '' : ''; };
    return { id: get(/\bID\b/), code: get(/編號|code|key\s*no|^no\.?$|編碼|កូដ|លេខ/i), name: get(/品名|item|名稱|name|ឈ្មោះ/i), cn: get(/中文|chinese/i) }; }
  async function sha(blob) { var b = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()); return Array.prototype.map.call(new Uint8Array(b).slice(0, 12), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  function compress(blob, max, q) { max = max || 1280; q = q || 0.75; return new Promise(function (res) { var u = URL.createObjectURL(blob), im = new Image(); im.onload = function () { var s = Math.min(1, max / Math.max(im.width, im.height)), cv = document.createElement('canvas'); cv.width = Math.round(im.width * s); cv.height = Math.round(im.height * s); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); URL.revokeObjectURL(u); res(cv.toDataURL('image/jpeg', q)); }; im.onerror = function () { URL.revokeObjectURL(u); res(null); }; im.src = u; }); }


  function blobUrl(b) { return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.readAsDataURL(b); }); }
  function shrink(blob, max) { return new Promise(function (res) { var u = URL.createObjectURL(blob), im = new Image(); im.onload = function () { var s = Math.min(1, max / Math.max(im.width, im.height)), cv = document.createElement('canvas'); cv.width = Math.round(im.width * s); cv.height = Math.round(im.height * s); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); URL.revokeObjectURL(u); res(cv.toDataURL('image/jpeg', 0.72)); }; im.onerror = function () { URL.revokeObjectURL(u); res(null); }; im.src = u; }); }
  var KIND = typeof root.keyMasterRender === 'function' ? 'key' : (typeof root.DB !== 'undefined' && /fire/i.test(location.pathname)) ? 'fire' : '';
  function getAll() { if (KIND === 'fire') return (root.DB || []).filter(function (e) { return e && e.code && !e.deleted; }); try { return (JSON.parse(localStorage.getItem('vrt_key_master') || '[]') || []).filter(function (x) { return x && !x._deleted; }); } catch (e) { return []; } }
  function codeOf(x) { return KIND === 'fire' ? x.code : x.key_no; }
  function nameOf(x) { return KIND === 'fire' ? (x.loc || '') : (x.key_name || ''); }
  function val(r, re) { var k = col(r.head, re); return k >= 0 ? (r.cells[k] || '') : ''; }
  function css() { if (document.getElementById('pcx-css')) return; var s = document.createElement('style'); s.id = 'pcx-css';
    s.textContent = '#pcx-ov{position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9600;display:flex;align-items:center;justify-content:center}.pcx{background:#fff;width:min(900px,96vw);max-height:92vh;border-radius:14px;display:flex;flex-direction:column}.pcx-h{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid #e2e8f0}.pcx-b{overflow:auto;padding:12px 14px}.pcx-f{padding:10px 14px;border-top:1px solid #e2e8f0;display:flex;gap:8px;align-items:center;flex-wrap:wrap}.pcx table{width:100%;border-collapse:collapse;font-size:13px}.pcx td,.pcx th{border-bottom:1px solid #f1f5f9;padding:4px 6px;text-align:left;vertical-align:middle}.pcx img{width:56px;height:56px;object-fit:cover;border-radius:8px}.pcx tr.ok td{background:#f0fdf4}.pcx tr.no td{background:#fef2f2}.pcx tr.dup td{background:#f8fafc;color:#94a3b8}.pcx .btn{border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:7px 12px;cursor:pointer;font-size:13px}.pcx .btn.pri{background:#1d4ed8;color:#fff;border-color:#1d4ed8}.pcx-note{font-size:12.5px;color:#475569;line-height:1.5}';
    document.head.appendChild(s); }

  var ROWS = [];
  function open() {
    css(); var ov = document.createElement('div'); ov.id = 'pcx-ov';
    ov.innerHTML = '<div class="pcx"><div class="pcx-h"><b>📥 ' + esc(L('匯入照片表（Excel 編號＋照片）', 'Import photo chart (Excel code + photo)', 'នាំចូលតារាងរូបភាព')) + '</b><button class="btn" data-x>✕</button></div><div class="pcx-b" id="pcx-b"><p class="pcx-note">' + esc(KIND === 'fire' ? L('選「消防設備照片表」。照片依編號放到該設備的第一張（標準照）。', 'Choose the Fire Equipment Photo Chart. Each photo becomes the first (standard) photo of that code.', 'ជ្រើសតារាងរូបឧបករណ៍ពន្លត់អគ្គីភ័យ') : L('選「鑰匙照片表」。對鑰匙編號放照片；清單沒有的編號會新增鑰匙。', 'Choose the Key Photo Chart. Photos go to the matching key number; new numbers are added to the key list.', 'ជ្រើសតារាងរូបសោ')) + '</p><label class="btn pri">📂 ' + esc(L('選 Excel 檔', 'Choose Excel file', 'ជ្រើសឯកសារ')) + '<input type="file" accept=".xlsx,.xlsm" id="pcx-file" style="display:none"></label></div><div class="pcx-f" id="pcx-f"></div></div>';
    ov.addEventListener('click', function (e) { if (e.target === ov || e.target.closest('[data-x]')) ov.remove(); });
    document.body.appendChild(ov); ov.querySelector('#pcx-file').onchange = function () { var f = this.files && this.files[0]; if (f) load(f); };
  }
  async function load(file) {
    var b = document.getElementById('pcx-b'); b.innerHTML = '⏳ ' + esc(L('讀取中…', 'Reading…', 'កំពុងអាន…'));
    try {
      var rs = await read(file), all = getAll(); ROWS = [];
      for (var i = 0; i < rs.length; i++) { var r = rs[i], code = val(r, /編號|code|key\s*no|^no\.?$|កូដ|លេខ/i), m = code ? all.filter(function (x) { return tok(codeOf(x)) === tok(code); })[0] : null, data = await shrink(r.blob, KIND === 'fire' ? 760 : 900);
        ROWS.push({ code: code, name: val(r, /名稱|name|位置|location|ឈ្មោះ/i), r: r, m: m, data: data, isNew: !m && KIND === 'key' && !!code, dup: !!(m && (m.photos || []).indexOf(data) >= 0), row: r.row + 1 }); }
      var seen = {}; ROWS.slice().reverse().forEach(function (x) { var k = tok(x.code); x.on = !!x.code && !!x.data && (x.m || x.isNew) && !x.dup && !seen[k]; if (k) seen[k] = 1; });
      paint();
    } catch (e) { b.innerHTML = '❌ ' + esc(e.message || e); }
  }
  function paint() {
    var b = document.getElementById('pcx-b'), ok = ROWS.filter(function (x) { return x.on; }).length, no = ROWS.filter(function (x) { return !x.m && !x.isNew; }).length, nw = ROWS.filter(function (x) { return x.isNew; }).length;
    b.innerHTML = '<p class="pcx-note">🖼️ ' + ROWS.length + L(' 張照片 · 🟢 會匯入 ', ' photos · 🟢 to import ', ' រូប · 🟢 ') + ok + (KIND === 'key' ? ' · 🟡 ' + L('新鑰匙 ', 'new keys ', 'សោថ្មី ') + nw : '') + ' · 🔴 ' + L('對不到編號 ', 'code not found ', 'រកមិនឃើញ ') + no + '</p><table><tr><th></th><th>' + esc(L('照片', 'Photo', 'រូប')) + '</th><th>' + esc(L('列', 'Row', 'ជួរ')) + '</th><th>' + esc(L('編號', 'Code', 'កូដ')) + '</th><th>' + esc(L('對到', 'Matched to', 'ផ្គូផ្គង')) + '</th></tr>' +
      ROWS.map(function (x, i) { return '<tr class="' + (x.dup ? 'dup' : x.m ? 'ok' : x.isNew ? 'ok' : 'no') + '"><td><input type="checkbox" data-i="' + i + '"' + (x.on ? ' checked' : '') + (x.m || x.isNew ? '' : ' disabled') + '></td><td><img src="' + (x.data || '') + '"></td><td>' + x.row + '</td><td>' + esc(x.code) + '</td><td>' + (x.m ? '✅ ' + esc(codeOf(x.m) + ' · ' + nameOf(x.m)) + ' <small>(' + (x.m.photos || []).length + ' ' + esc(L('張原有照片', 'existing photos', 'រូបមានស្រាប់')) + ')</small>' : x.isNew ? '🟡 ' + esc(L('新增鑰匙：', 'New key: ', 'សោថ្មី៖ ') + (x.name || '')) : '🔴 ' + esc(L('清單裡沒有這個編號', 'This code is not in the list', 'គ្មានកូដនេះ'))) + (x.dup ? ' <small>（' + esc(L('同一張已經有了', 'same photo already there', 'មានរួច')) + '）</small>' : '') + '</td></tr>'; }).join('') + '</table>';
    b.querySelectorAll('input[data-i]').forEach(function (c) { c.onchange = function () { ROWS[+c.getAttribute('data-i')].on = c.checked; foot(); }; });
    foot();
  }
  function foot() { var n = ROWS.filter(function (x) { return x.on; }).length, f = document.getElementById('pcx-f'); f.innerHTML = '<button class="btn pri" id="pcx-go"' + (n ? '' : ' disabled') + '>✅ ' + esc(L('匯入 ', 'Import ', 'នាំចូល ')) + n + '</button><span class="pcx-note" id="pcx-st"></span>'; var g = document.getElementById('pcx-go'); if (g) g.onclick = go; }
  function go() {
    var list = ROWS.filter(function (x) { return x.on; }), ts = new Date().toISOString(), n = 0;
    if (KIND === 'fire') {
      var before = root.SEC && SEC.AssetChanges ? SEC.AssetChanges.clone(DB) : null;
      list.forEach(function (x) { var e = DB.filter(function (y) { return y === x.m; })[0] || x.m; e.photos = [x.data].concat((e.photos || []).filter(function (p) { return p !== x.data; })).slice(0, 4); e.updatedAt = ts; n++; x.on = false; x.dup = true; });
      try { if (typeof ensureFireSyncKeys === 'function') ensureFireSyncKeys(); } catch (e) {}
      try { save(); } catch (e) {} try { renderAll(); } catch (e) {} try { SEC.scheduleAutoCloudSync('fire', 'fire-photo-chart', String(n)); } catch (e) {}
    } else {
      var lst = []; try { lst = JSON.parse(localStorage.getItem('vrt_key_master') || '[]') || []; } catch (e) {}
      list.forEach(function (x) {
        var it = lst.filter(function (y) { return !y._deleted && tok(y.key_no) === tok(x.code); })[0];
        if (!it) { it = { id: 'km_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), createdAt: ts, key_no: x.code, key_name: x.name || x.code, dept: val(x.r, /部門|dept|ផ្នែក/i), location: val(x.r, /位置|location|door|ទីតាំង/i), key_type: val(x.r, /類型|type|ប្រភេទ/i), quantity: val(x.r, /數量|qty|ចំនួន/i), status: 'available', remarks: val(x.r, /備註|remark|ចំណាំ/i), photos: [] }; lst.push(it); }
        it.photos = [x.data].concat((it.photos || []).filter(function (p) { return p !== x.data; })).slice(0, 2); it.updatedAt = ts; n++; x.on = false; x.dup = true;
      });
      localStorage.setItem('vrt_key_master', JSON.stringify(lst));
      try { keyMasterRender(); } catch (e) {} try { if (root.GC && GC.sync) GC.sync.schedule('keymovement', 'key_master_photo_chart'); } catch (e) {}
    }
    paint(); document.getElementById('pcx-st').textContent = '✅ ' + L('已匯入 ', 'Imported ', 'បាននាំចូល ') + n + L('，會自動上雲', '; syncing to cloud', '');
  }
  function btn() {
    if (!KIND || document.getElementById('pcx-btn')) return; css();
    var b = document.createElement('button'); b.id = 'pcx-btn'; b.type = 'button'; b.title = L('匯入照片表', 'Import photo chart', 'នាំចូលតារាងរូបភាព'); b.innerHTML = '📥🖼️';
    b.style.cssText = 'position:fixed;right:14px;bottom:18px;z-index:9000;border:0;border-radius:999px;background:#0f766e;color:#fff;font-size:15px;padding:9px 12px;box-shadow:0 6px 18px rgba(15,118,110,.35);cursor:pointer';
    b.onclick = open; document.body.appendChild(b);
  }
  root.PhotoChartImport = { read: read, open: open };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(function () { KIND = typeof root.keyMasterRender === 'function' ? 'key' : (typeof root.DB !== 'undefined' && /fire/i.test(location.pathname)) ? 'fire' : ''; btn(); }, 1200); }); else setTimeout(btn, 1200);
})(window);
