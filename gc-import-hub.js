/* AC GASCheck 智慧匯入中心（2026-10-22）
 * 首頁和每一頁最上面同一顆「⇧ 智慧匯入」：msg／eml／Excel／CSV／zip 丟同一個地方，
 * 系統依檔名、分頁名、表頭判斷是哪個模組（判不出來才問一次），再用「該模組頁自己的智慧匯入」（GC.import，同一套解析與去重）匯入：
 * 其他模組在背景開該頁跑；本頁的模組直接在本頁跑。同一個檔（內容 SHA-256 相同）再丟＝0 新增。
 * 匯完等該模組上雲完成，再問要不要「✈️ 發摘要」／「✅ 核可」（開模組頁的 Telegram 視窗，先預覽再按發送）。
 * 照片／PDF：GASCheck 目前沒有單據辨識，先提示之後補。 */
(function (g) {
  'use strict';
  var GC = g.GC; if (!GC || GC.importHub) return;
  var I18 = GC.i18n, L = GC.L, esc = GC.util.escapeHtml;
  var LOG_KEY = 'ac_gc_import_log_v1', LIB_SRC = 'gc-files.min.js?v=20261022a', XLSX_SRC = 'tests/vendor/xlsx.full.min.js', XLSX_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  var TOOLS = {
    asset:       { ic:'📦', page:'ac_gascheck_asset_v2.html',       zh:'資產管理', en:'Assets',      km:'ទ្រព្យសម្បត្តិ' },
    dormitory:   { ic:'🏠', page:'ac_gascheck_dormitory_v2.html',   zh:'宿舍管理', en:'Dormitory',   km:'អន្តេវាសិកដ្ឋាន' },
    cleaning:    { ic:'🧹', page:'ac_gascheck_cleaning_v2.html',    zh:'清潔管理', en:'Cleaning',    km:'ការសម្អាត' },
    keymovement: { ic:'🔑', page:'ac_gascheck_keymovement_v2.html', zh:'鑰匙管理', en:'Keys',        km:'សោ' },
    ehs:         { ic:'♻️', page:'ac_gascheck_ehs_v2.html',         zh:'EHS 環境', en:'EHS',         km:'EHS បរិស្ថាន' },
    waterdrum:   { ic:'💧', page:'ac_gascheck_waterdrum_v2.html',   zh:'水桶管理', en:'Water drums', km:'ធុងទឹក' },
    temperature: { ic:'🌡️', page:'ac_gascheck_temperature_v2.html', zh:'溫度記錄', en:'Temperature', km:'សីតុណ្ហភាព' },
  };
  var ORDER = ['asset', 'dormitory', 'cleaning', 'keymovement', 'ehs', 'waterdrum', 'temperature'];
  /* ══ 判斷規則（每個模組一個區塊；改規則只動自己模組的區塊）══
     { tool, name:/檔名/i, sheet:/分頁名/i, head:/前 15 列文字/ }；name +3、sheet +2、head +2（head 同時以「保留空白」與「去空白去符號」兩種形式比對）。
     自動採用：最高分 ≥3 且比第二名高 ≥1，否則列出讓人選。 */
  var RULES_BY_TOOL = {};
  /* ── asset 資產（資產編號＋資產名稱／物品名稱；Admin／Factory／Dorm 分頁）── */
  RULES_BY_TOOL.asset = [
    { tool:'asset', name:/asset|資產|inventory ?list|fixed ?asset|物品清單/i, sheet:/asset|資產|admin|factory|dorm/i, head:/(asset ?code|資產編號).{0,80}(asset ?name|資產名稱|物品名稱|item)|(asset ?name|資產名稱|物品名稱).{0,80}(asset ?code|資產編號)/ },
  ];
  /* ── dormitory 宿舍（姓名、工號、房號、入住）── */
  RULES_BY_TOOL.dormitory = [
    { tool:'dormitory', name:/dorm|宿舍|hostel|room ?(list|allocation)|住宿/i, sheet:/dorm|宿舍|room|住宿/i, head:/(room ?no|房號|room).{0,60}(name|姓名)|(name|姓名).{0,60}(room ?no|房號|bed|床位|move.?in|入住)/ },
  ];
  /* ── cleaning 清潔（日期、地點、班別、清潔人員、檢查人、時段）── */
  RULES_BY_TOOL.cleaning = [
    { tool:'cleaning', name:/clean|清潔|6s|housekeeping|toilet|廁所/i, sheet:/clean|清潔|6s|toilet/i, head:/(cleaner|清潔人員|清潔員).{0,60}(checker|檢查人|slots?|時段|check ?time)|(location|地點).{0,60}(cleaner|清潔人員|shift|班別)/ },
  ];
  /* ── keymovement 鑰匙（鑰匙編號、領用人、發出日期／時間）── */
  RULES_BY_TOOL.keymovement = [
    { tool:'keymovement', name:/key ?(movement|log|register|issue)|鑰匙|钥匙/i, sheet:/key|鑰匙|钥匙/i, head:/(key ?(no|code|number)|鑰匙編號|鑰匙號碼).{0,80}(recipient|holder|領用人|收受人|issue|發出|return|歸還)/ },
  ];
  /* ── ehs 廢料／回收（Supplier＋Solid/Industrial waste；或 Plastic／Waste fabric／Fabric core）── */
  RULES_BY_TOOL.ehs = [
    { tool:'ehs', name:/waste|廢料|廢棄|recycle|回收|ehs|environment|環境|garbage|rubbish/i, sheet:/waste|廢料|recycle|回收|chart|^\d{4}-\d{2}$|^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i, head:/supplier.{0,80}(solid ?waste|industrial ?waste)|plastic.{0,60}(fabric|cutting)|(fabric ?core|waste ?fabric)|k\.?s\.?w\.?m|sonyapich/ },
  ];
  /* ── waterdrum 送水（Water drum record；工廠／宿舍 桶數單價）── */
  RULES_BY_TOOL.waterdrum = [
    { tool:'waterdrum', name:/water ?drum|drum|送水|水桶|飲用水|drinking ?water/i, sheet:/water|drum|送水|水桶|^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i, head:/water ?drum ?record|(factory|工廠).{0,30}(qty|drums?|桶數).{0,120}(staff|dorm|宿舍)|(送水|drums?).{0,40}(price|單價|invoice)/ },
  ];
  /* ── temperature 溫濕度（區域、時段、溫度、濕度）── */
  RULES_BY_TOOL.temperature = [
    { tool:'temperature', name:/temp|溫度|温度|humid|濕度|湿度|thermo/i, sheet:/temp|溫|温|humid|zone|區|°c/i, head:/(temp(erature)?|溫度|温度).{0,60}(humid(ity)?|濕度|湿度)|°c.{0,40}%|(morning|afternoon|上午|下午).{0,40}(temp|溫度|温度)/ },
  ];
  var RULES = [].concat.apply([], ORDER.map(function (t) { return RULES_BY_TOOL[t] || []; }));

  function toolName(t) { var d = TOOLS[t]; return d ? d.ic + ' ' + L(d.zh, d.en, d.km) : t; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms, step) { var t0 = Date.now(); while (Date.now() - t0 < (ms || 60000)) { try { if (await fn()) return true; } catch (_) {} await sleep(step || 300); } return false; }
  function kb(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function p2(n) { return String(n).padStart(2, '0'); }
  function when(t) { var d = new Date(t); return p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function extOf(name) { var m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/); return m ? m[1] : ''; }
  function isExcel(ext) { return /^(xlsx|xlsm|xls|xlsb|csv)$/.test(ext); }
  function isPhoto(ext) { return /^(jpe?g|png|webp|heic|heif|gif|bmp)$/.test(ext); }
  function loadScript(src, test) {
    if (test()) return Promise.resolve();
    return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = function () { test() ? res() : rej(new Error(src)); }; s.onerror = function () { rej(new Error(L('元件載入失敗：', 'Could not load: ', 'មិនអាចផ្ទុក: ') + src)); }; document.head.appendChild(s); });
  }
  function libs() { return loadScript(LIB_SRC, function () { return g.JSZip && g.MsgReader; }); }
  function xlsx() { return loadScript(XLSX_SRC, function () { return typeof g.XLSX !== 'undefined'; }).catch(function () { return loadScript(XLSX_CDN, function () { return typeof g.XLSX !== 'undefined'; }); }); }
  async function hashOf(buf) { try { var d = await crypto.subtle.digest('SHA-256', buf); return Array.prototype.map.call(new Uint8Array(d), function (b) { return b.toString(16).padStart(2, '0'); }).join(''); } catch (_) { return ''; } }
  function logRead() { try { var v = JSON.parse(localStorage.getItem(LOG_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } }
  function logWrite(v) { var keys = Object.keys(v); if (keys.length > 600) keys.sort(function (a, b) { return (v[a].at || 0) - (v[b].at || 0); }).slice(0, keys.length - 600).forEach(function (k) { delete v[k]; }); try { localStorage.setItem(LOG_KEY, JSON.stringify(v)); } catch (_) {} }
  function stripTags(h) { return String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim(); }

  /* ── 展開：zip → 裡面的檔；msg／eml → 附件；其他照原樣 ── */
  async function expand(file, via, out, depth) {
    depth = depth || 0; var ext = extOf(file.name);
    if (depth > 3) { out.push({ file:file, via:via, unsupported:L('層數太深', 'Too deeply nested', 'ជ្រៅពេក') }); return; }
    if (ext === 'zip') {
      await libs();
      var z = await g.JSZip.loadAsync(await file.arrayBuffer()), names = Object.keys(z.files).filter(function (n) { return !z.files[n].dir && !/(^|\/)(__MACOSX|\.DS_Store|thumbs\.db)/i.test(n); });
      if (!names.length) { out.push({ file:file, via:via, unsupported:L('空的 zip', 'Empty zip', 'zip ទទេ') }); return; }
      for (var i = 0; i < names.length; i++) { var blob = await z.files[names[i]].async('blob'); await expand(new File([blob], names[i].split('/').pop(), { type:blob.type || '' }), (via ? via + ' › ' : '') + file.name, out, depth + 1); }
      return;
    }
    if (ext === 'msg') {
      await libs();
      var r = new g.MsgReader(await file.arrayBuffer()), data = r.getFileData() || {}, atts = Array.isArray(data.attachments) ? data.attachments : [], subject = String(data.subject || '').trim(), usable = 0;
      for (var a = 0; a < atts.length; a++) {
        var att = r.getAttachment(a); if (!att || !att.content) continue;
        var an = att.fileName || atts[a].fileName || ('attachment' + (a + 1)); if (atts[a].attachMimeTag === 'message/rfc822' && !extOf(an)) an += '.eml';
        var aext = extOf(an); if (!(isExcel(aext) || isPhoto(aext) || /^(zip|msg|eml|pdf)$/.test(aext))) continue;
        usable++; await expand(new File([att.content], an, { type:'' }), (via ? via + ' › ' : '') + file.name + (subject ? '「' + subject + '」' : ''), out, depth + 1);
      }
      if (!usable) out.push({ file:file, via:via, unsupported:L('這封信沒有可匯入的附件', 'No importable attachment in this message', 'គ្មានឯកសារភ្ជាប់') + (subject ? '（' + subject + '）' : '') });
      return;
    }
    if (ext === 'eml') {
      var text = await file.text(), subj = (text.match(/^Subject:\s*(.*)$/mi) || [])[1] || '', got = 0;
      var re = /Content-Type:\s*([^;\r\n]+)[^]*?name="?([^"\r\n;]+)"?[^]*?Content-Transfer-Encoding:\s*base64[^]*?\r?\n\r?\n([A-Za-z0-9+\/=\r\n]+)/gi, m;
      while ((m = re.exec(text))) {
        var fname = m[2].replace(/=\?utf-8\?b\?([^?]+)\?=/i, function (_, b64) { try { return decodeURIComponent(escape(atob(b64))); } catch (e) { return _; } }), fext = extOf(fname);
        if (!(isExcel(fext) || isPhoto(fext) || /^(zip|msg|pdf)$/.test(fext))) continue;
        try { var bin = atob(m[3].replace(/\s+/g, '')), u8 = new Uint8Array(bin.length); for (var j = 0; j < bin.length; j++) u8[j] = bin.charCodeAt(j); got++; await expand(new File([u8], fname, { type:'' }), (via ? via + ' › ' : '') + file.name + (subj ? '「' + subj.trim() + '」' : ''), out, depth + 1); } catch (e) {}
      }
      if (!got) out.push({ file:file, via:via, unsupported:L('這封信沒有可匯入的附件', 'No importable attachment in this message', 'គ្មានឯកសារភ្ជាប់') });
      return;
    }
    if (isExcel(ext)) { out.push({ file:file, via:via }); return; }
    if (isPhoto(ext) || ext === 'pdf') { out.push({ file:file, via:via, unsupported:L('照片／PDF 的單據辨識下一階段提供（請先丟 Excel）', 'Photo / PDF recognition comes in the next stage (use Excel for now)', 'រូបថត/PDF នឹងមានពេលក្រោយ') }); return; }
    out.push({ file:file, via:via, unsupported:L('不支援的檔案類型', 'Unsupported file type', 'ប្រភេទឯកសារមិនគាំទ្រ') + ' .' + ext });
  }
  function readCtx(name, wb) {
    var ctx = { name:String(name || '').toLowerCase(), sheets:[], head:'', headc:'', months:{} };
    if (!wb) return ctx;
    (wb.SheetNames || []).slice(0, 14).forEach(function (sn) {
      var rows = []; try { rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header:1, defval:'', raw:true, blankrows:false }); } catch (_) {}
      ctx.sheets.push(String(sn).toLowerCase());
      var head = rows.slice(0, 15).map(function (r) { return (r || []).slice(0, 40).map(function (v) { return String(v == null ? '' : v); }).join(' '); }).join('\n').toLowerCase();
      ctx.head += '\n' + head.replace(/[\s　]+/g, ' '); ctx.headc += '\n' + head.replace(/[\s　_\-\/()（）:：.．]/g, '');
      rows.slice(0, 400).forEach(function (r) { (r || []).slice(0, 40).forEach(function (v) {
        if (v === '' || v == null) return; var d = null;
        if (typeof v === 'number') { if (v > 36500 && v < 73050) d = new Date(Math.round((v - 25569) * 86400000)); }
        else if (typeof v === 'string' && /\d{4}[-\/.]\d{1,2}|\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4}/.test(v)) { var iso = typeof g.excelDateToISO === 'function' ? g.excelDateToISO(v) : ''; d = iso ? new Date(iso + 'T00:00:00') : new Date(v); }
        if (!d || isNaN(d) || d.getFullYear() < 2015 || d.getFullYear() > 2100) return;
        var k = d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1); if (typeof v === 'string') k = d.getFullYear() + '-' + p2(d.getMonth() + 1); ctx.months[k] = (ctx.months[k] || 0) + 1;
      }); });
    });
    return ctx;
  }
  function detect(ctx, bias) {
    var scores = {};
    RULES.forEach(function (r) {
      var s = 0, compact = function (x) { return x.replace(/[\s　_\-\/()（）:：.．]/g, ''); };
      if (r.name && r.name.test(ctx.name)) s += 3;
      if (r.sheet && ctx.sheets.some(function (x) { return r.sheet.test(x) || r.sheet.test(compact(x)); })) s += 2;
      if (r.head && (r.head.test(ctx.head) || r.head.test(ctx.headc))) s += 2;
      if (!s) return;
      scores[r.tool] = Math.max(scores[r.tool] || 0, s) + (scores[r.tool] ? 0.5 : 0);
    });
    if (bias && scores[bias]) scores[bias] += 0.5;
    return Object.keys(scores).map(function (t) { return { tool:t, score:scores[t] }; }).sort(function (a, b) { return b.score - a.score; });
  }
  function bestMonth(ctx) { var best = '', n = 0; Object.keys(ctx.months || {}).forEach(function (k) { if (ctx.months[k] > n) { n = ctx.months[k]; best = k; } }); return best; }

  async function runIn(w, tool, file) {
    var pg = w.GC.pages[tool]; if (!pg || !pg.hasImport) throw new Error(L('這個模組沒有智慧匯入', 'This module has no smart import', 'ម៉ូឌុលនេះមិនមាន'));
    var ab = await file.arrayBuffer(), u8 = new w.Uint8Array(ab.byteLength); u8.set(new Uint8Array(ab));
    var wf = new w.File([u8], file.name, { type:file.type || '', lastModified:file.lastModified || Date.now() });
    var r = await pg.importFiles([wf]);
    if (!r) return { ok:false, text:L('沒有匯入', 'Nothing imported', 'មិនបាននាំចូល') };
    var text = stripTags(r.status || '') || (r.ok ? '✅ ' + r.imported : '❌');
    return { ok:!!r.ok && !(r.errors && r.errors.length && !r.imported), text:text, imported:r.imported || 0, warnings:r.warnings || [], errors:r.errors || [] };
  }
  function openFrame(tool) {
    return new Promise(function (resolve, reject) {
      var f = document.createElement('iframe'); f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1; f.title = 'import ' + tool;
      f.style.cssText = 'position:fixed;left:-12000px;top:0;width:420px;height:860px;border:0;opacity:0;pointer-events:none';
      var to = setTimeout(function () { reject(new Error(L('模組頁開啟逾時', 'Module page timed out', 'អស់ពេល'))); }, 45000);
      f.onload = async function () {
        clearTimeout(to);
        try {
          var w = f.contentWindow;
          if (!(await waitFor(function () { return w.GC && w.GC.pages && w.GC.pages[tool]; }, 30000))) throw new Error(L('模組頁沒有準備好', 'Module page did not get ready', 'ទំព័រមិនរួចរាល់'));
          /* 等開頁時的自動同步（先下載合併）跑完，再匯入 */
          await sleep(600);
          await waitFor(function () { var st = w.GC.syncState[tool]; return !st || st.kind !== 'busy'; }, 30000, 200);
          w.confirm = function (m) { return g.confirm('［' + toolName(tool) + '］\n' + m); };
          w.alert = function () {};
          resolve({ frame:f, win:w });
        } catch (e) { reject(e); }
      };
      f.src = TOOLS[tool].page + '?hubImport=1&_t=' + Date.now();
      document.body.appendChild(f);
    });
  }
  async function waitSynced(w, tool, since) {
    var out = { ok:false, text:'' };
    await waitFor(function () {
      var st = w.GC.syncState[tool], pending = w.GC.sync.hasPending(tool);
      if (!st || st.at < since) return false;
      if (st.kind === 'busy') return false;
      if (st.kind === 'ok' && !pending) { out.ok = true; return true; }
      if (st.kind === 'error' || st.kind === 'offline' || (st.kind === 'local' && !pending)) { out.text = st.text || ''; return true; }
      return false;
    }, 150000, 500);
    return out;
  }

  function Hub(opt) { this.opt = opt || {}; this.tool = this.opt.tool || ''; this.items = []; this.busy = false; this.seq = 0; this.touched = {}; this.root = null; }
  Hub.prototype.mount = function (el) { this.root = el; el.classList.add('ihub'); this.render(); return this; };
  Hub.prototype.addFiles = async function (fileList) {
    var self = this, raw = Array.prototype.slice.call(fileList || []); if (!raw.length) return;
    var expanded = [];
    for (var i = 0; i < raw.length; i++) {
      var it0 = { id:++self.seq, name:raw[i].name, size:raw[i].size, state:'detect', msg:L('讀取中…', 'Reading…', 'កំពុងអាន…'), on:false, file:raw[i] };
      self.items.push(it0); self.render();
      try { var out = []; await expand(raw[i], '', out, 0); self.items.splice(self.items.indexOf(it0), 1); out.forEach(function (x) { expanded.push(x); }); }
      catch (e) { it0.state = 'err'; it0.msg = String(e && e.message || e); }
      self.render();
    }
    var log = logRead();
    for (var j = 0; j < expanded.length; j++) {
      var x = expanded[j], it = { id:++self.seq, name:x.file.name, via:x.via || '', size:x.file.size, file:x.file, state:'detect', msg:'', on:false, tool:'', cands:[], month:'' };
      self.items.push(it); self.render();
      if (x.unsupported) { it.state = 'skip'; it.msg = x.unsupported; self.render(); continue; }
      try {
        var buf = await x.file.arrayBuffer(); it.hash = await hashOf(buf);
        await xlsx(); var wb = XLSX.read(new Uint8Array(buf), { type:'array', cellDates:false, raw:true, sheetRows:400 }); var ctx = readCtx(it.name, wb); it.month = bestMonth(ctx);
        it.cands = detect(ctx, self.tool); var best = it.cands[0], second = it.cands[1];
        if (best && best.score >= 3 && (!second || best.score - second.score >= 1)) { it.tool = best.tool; it.state = 'ready'; it.on = true; }
        else if (best) { it.tool = best.tool; it.state = 'ask'; it.msg = L('不太確定是哪個模組，請確認', 'Not sure which module — please confirm', 'សូមបញ្ជាក់ម៉ូឌុល'); }
        else if (self.tool && TOOLS[self.tool]) { it.tool = self.tool; it.state = 'ask'; it.msg = L('認不出表格，預設匯入本頁模組，請確認', 'Could not recognise the sheet; defaulting to this module — please confirm', 'សូមបញ្ជាក់'); }
        else { it.state = 'ask'; it.msg = L('認不出是哪個模組，請選擇', 'Could not tell the module — please choose', 'សូមជ្រើសម៉ូឌុល'); }
        var prev = it.hash && log[it.hash];
        if (prev) { it.on = false; it.state = 'done-before'; it.msg = L('此檔 ' + when(prev.at) + ' 已匯入過（' + toolName(prev.tool) + '）→ 0 新增；要重匯請打勾', 'Already imported ' + when(prev.at) + ' (' + toolName(prev.tool) + ') → 0 new; tick to import again', 'បាននាំចូល ' + when(prev.at) + ' → 0 ថ្មី'); }
      } catch (e) { it.state = 'err'; it.msg = L('讀不到檔案：', 'Cannot read: ', 'អានមិនបាន: ') + String(e && e.message || e); }
      self.render();
    }
  };
  Hub.prototype.run = async function () {
    var self = this; if (self.busy) return;
    var todo = self.items.filter(function (it) { return it.on && it.tool && TOOLS[it.tool] && it.state !== 'run'; });
    if (!todo.length) { GC.toast(L('沒有勾選要匯入的檔案', 'Nothing ticked to import', 'គ្មានឯកសារ'), 'warning'); return; }
    if (navigator.onLine === false) { GC.toast(L('目前離線，匯入後無法上雲', 'Offline — cannot upload after import', 'គ្មានអ៊ីនធឺណិត'), 'error'); return; }
    self.busy = true; self.touched = {}; self.render();
    var log = logRead();
    try {
      for (var oi = 0; oi < ORDER.length; oi++) {
        var tool = ORDER[oi], list = todo.filter(function (it) { return it.tool === tool; }); if (!list.length) continue;
        var w = null, fr = null, since = Date.now();
        try {
          if (tool === self.tool && GC.pages[tool]) w = g; else { fr = await openFrame(tool); w = fr.win; }
          for (var i = 0; i < list.length; i++) {
            var it = list[i]; it.state = 'run'; it.msg = L('匯入中…', 'Importing…', 'កំពុងនាំចូល…'); self.render();
            try {
              var r = await runIn(w, tool, it.file);
              it.state = r.ok ? 'ok' : 'err'; it.msg = r.text; it.on = false;
              if (r.ok) { log[it.hash] = { name:it.name, tool:tool, at:Date.now(), result:r.text }; var tk = self.touched[tool] || (self.touched[tool] = { months:{} }); if (it.month) tk.months[it.month] = 1; }
            } catch (e) { it.state = 'err'; it.msg = '❌ ' + String(e && e.message || e); }
            self.render();
          }
          var sync = await waitSynced(w, tool, since);
          list.forEach(function (it) { if (it.state === 'ok') it.msg += sync.ok ? ' · ☁ ' + L('已上雲', 'uploaded', 'បានដាក់ពពក') : ' · ⚠ ' + L('雲端尚未確認，模組會自動重試', 'cloud not confirmed yet; the module will retry', 'ពពកមិនទាន់បញ្ជាក់') + (sync.text ? '（' + sync.text + '）' : ''); });
        } catch (e) { list.forEach(function (it) { if (it.state !== 'ok') { it.state = 'err'; it.msg = '❌ ' + String(e && e.message || e); } }); }
        finally { if (fr) setTimeout(function (f) { try { f.frame.src = 'about:blank'; f.frame.remove(); } catch (_) {} }.bind(null, fr), 300); }
        self.render();
      }
      logWrite(log);
    } finally { self.busy = false; self.render(); }
    var bad = self.items.filter(function (it) { return it.state === 'err'; }).length;
    GC.toast(bad ? '⚠ ' + L('匯入完成，' + bad + ' 個檔案失敗', 'Done; ' + bad + ' file(s) failed', 'រួច; ' + bad + ' បរាជ័យ') : '✅ ' + L('匯入並上傳完成', 'Imported and uploaded', 'បាននាំចូល និងដាក់ពពក'), bad ? 'warning' : 'success');
    if (typeof self.opt.onDone === 'function') try { self.opt.onDone(self.touched); } catch (_) {}
  };
  Hub.prototype.clear = function () { if (this.busy) return; this.items = []; this.touched = {}; this.render(); };
  Hub.prototype.actions = function () {
    var self = this, out = [];
    Object.keys(self.touched).forEach(function (tool) {
      var months = Object.keys(self.touched[tool].months).sort(), m = months.length ? months[months.length - 1] : '', d = TOOLS[tool];
      out.push({ label:'✈️ ' + L('發摘要', 'Send summary', 'ផ្ញើសង្ខេប') + '：' + toolName(tool) + (m ? ' ' + m : ''), href:d.page + '?tg=summary&ptype=month' + (m ? '&period=' + m : '') });
      var pg = GC.pages[tool], modes = pg ? pg.modes : null, approval = modes ? modes.indexOf('approval') >= 0 : (GC.approvalTools && GC.approvalTools[tool]);
      if (approval) out.push({ label:'✅ ' + L('核可', 'Approval', 'អនុម័ត') + '：' + toolName(tool) + (m ? ' ' + m : ''), href:d.page + '?tg=approval&ptype=month' + (m ? '&period=' + m : '') });
    });
    return out;
  };
  Hub.prototype.render = function () {
    var self = this, r = self.root; if (!r) return;
    var any = self.items.length, canRun = !self.busy && self.items.some(function (it) { return it.on && it.tool; });
    var html = '<div class="ihub-drop" data-drop tabindex="0" role="button"><b>⇧ ' + esc(L('把檔案拖進來，或點這裡選檔（可多檔）', 'Drop files here or tap to choose (multiple OK)', 'ទម្លាក់ឯកសារ ឬចុចជ្រើស')) + '</b>' +
      '<small>' + esc(L('Excel／CSV、Outlook .msg／.eml（自動取附件）、zip（自動解開）。系統自己判斷模組，判不出來才問。同一個檔再丟＝0 新增。', 'Excel/CSV, Outlook .msg/.eml (attachments taken), zip (unpacked). The module is detected automatically; you are asked only when unsure. Dropping the same file again = 0 new.', 'Excel/CSV, .msg/.eml, zip។ ប្រព័ន្ធកំណត់ម៉ូឌុលដោយស្វ័យប្រវត្តិ។')) + '</small>' +
      '<input type="file" multiple hidden data-file accept=".xlsx,.xls,.xlsm,.xlsb,.csv,.msg,.eml,.zip,.pdf,image/*"></div>';
    if (any) {
      html += '<div class="ihub-list">' + self.items.map(function (it) {
        var dest = '';
        if (it.state !== 'skip' && it.state !== 'err' && it.state !== 'detect') dest = '<select data-dest="' + it.id + '"' + (self.busy ? ' disabled' : '') + '><option value=""' + (!it.tool ? ' selected' : '') + '>' + esc(L('— 選擇模組 —', '— choose module —', '— ជ្រើស —')) + '</option>' + ORDER.map(function (t) { return '<option value="' + t + '"' + (it.tool === t ? ' selected' : '') + '>' + esc(toolName(t)) + '</option>'; }).join('') + '</select>';
        var cls = it.state === 'ok' ? 'ok' : it.state === 'err' ? 'err' : it.state === 'run' ? 'run' : it.state === 'done-before' ? 'dup' : it.state === 'ask' ? 'ask' : '';
        return '<div class="ihub-row ' + cls + '"><input type="checkbox" data-on="' + it.id + '"' + (it.on ? ' checked' : '') + ((self.busy || it.state === 'skip' || it.state === 'err' || it.state === 'run' || it.state === 'ok') ? ' disabled' : '') + '>' +
          '<div class="ihub-name">' + esc(it.name) + '<small>' + (it.via ? esc(it.via) + ' · ' : '') + kb(it.size || 0) + (it.month ? ' · 📅 ' + it.month : '') + '</small></div>' + dest + (it.msg ? '<div class="ihub-msg ' + cls + '">' + esc(it.msg) + '</div>' : '') + '</div>';
      }).join('') + '</div>';
      html += '<div class="ihub-bar"><button type="button" class="ihub-btn gray" data-clear' + (self.busy ? ' disabled' : '') + '>🧹 ' + esc(L('清除清單', 'Clear', 'សម្អាត')) + '</button><button type="button" class="ihub-btn" data-run' + (canRun ? '' : ' disabled') + '>' + (self.busy ? '⏳ ' + esc(L('匯入中…', 'Importing…', 'កំពុងនាំចូល…')) : '⇧ ' + esc(L('匯入勾選的', 'Import ticked', 'នាំចូលដែលបានធីក'))) + '</button></div>';
    }
    var acts = self.actions();
    if (!self.busy && acts.length) html += '<div class="ihub-acts"><div class="ihub-acts-t">' + esc(L('匯好了，接下來？（會先看到預覽，再按發送）', 'Done. Next? (you will see a preview before sending)', 'រួច។ បន្ទាប់?')) + '</div>' + acts.map(function (a) { return '<a class="ihub-btn sm" href="' + esc(a.href) + '">' + esc(a.label) + '</a>'; }).join('') + '</div>';
    r.innerHTML = html;
    var drop = r.querySelector('[data-drop]'), inp = r.querySelector('[data-file]');
    drop.onclick = function (e) { if (e.target !== inp) inp.click(); };
    drop.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } };
    inp.onchange = function () { self.addFiles(inp.files); inp.value = ''; };
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { var fs = e.dataTransfer && e.dataTransfer.files; if (fs && fs.length) self.addFiles(fs); });
    r.querySelectorAll('[data-on]').forEach(function (cb) { cb.onchange = function () { var it = self.items.filter(function (x) { return String(x.id) === cb.getAttribute('data-on'); })[0]; if (it) { it.on = cb.checked; if (it.state === 'done-before' && it.on) it.msg = L('將重新匯入（已有的紀錄不會重複）', 'Will import again (existing records are not duplicated)', 'នឹងនាំចូលម្តងទៀត'); } self.render(); }; });
    r.querySelectorAll('[data-dest]').forEach(function (sel) { sel.onchange = function () { var it = self.items.filter(function (x) { return String(x.id) === sel.getAttribute('data-dest'); })[0]; if (!it) return; it.tool = sel.value || ''; if (it.tool && it.state === 'ask') { it.state = 'ready'; it.on = true; it.msg = ''; } if (!it.tool) it.on = false; self.render(); }; });
    var run = r.querySelector('[data-run]'); if (run) run.onclick = function () { self.run(); };
    var clr = r.querySelector('[data-clear]'); if (clr) clr.onclick = function () { self.clear(); };
  };
  var CSS = '.ihub{display:flex;flex-direction:column;gap:10px;font-family:inherit;color:#1E2A3B}' +
    '.ihub-drop{border:2px dashed #B9D9EA;background:#EDF8FC;border-radius:12px;padding:16px 12px;text-align:center;cursor:pointer;color:#3d5a73;font-size:13px}' +
    '.ihub-drop.over,.ihub-drop:hover{border-color:#126B91;background:#DFF1F9}.ihub-drop b{display:block;color:#126B91;font-size:14px}.ihub-drop small{display:block;margin-top:5px;font-size:11px;color:#6b8398;line-height:1.5}' +
    '.ihub-list{display:flex;flex-direction:column;gap:7px}.ihub-row{display:flex;align-items:center;gap:8px;border:1px solid #D8E0EB;border-radius:10px;padding:8px 10px;flex-wrap:wrap;background:#fff}' +
    '.ihub-row.ok{border-color:#86efac;background:#f0fdf4}.ihub-row.err{border-color:#fca5a5;background:#fef2f2}.ihub-row.run{border-color:#fcd34d;background:#fffbeb}.ihub-row.dup{border-color:#cbd5e1;background:#f8fafc}.ihub-row.ask{border-color:#fbbf24}' +
    '.ihub-row input[type=checkbox]{width:18px;height:18px;flex:none;accent-color:#126B91}.ihub-name{flex:1;min-width:150px;font-size:13px;font-weight:700;word-break:break-all}.ihub-name small{display:block;font-weight:500;color:#6b8398;font-size:11px}' +
    '.ihub-row select{border:1px solid #cfdbe6;border-radius:8px;padding:7px 8px;font-size:12.5px;min-height:38px;max-width:100%;background:#fff;font-family:inherit}' +
    '.ihub-msg{flex-basis:100%;font-size:11.5px;color:#5b7186;padding-left:26px;line-height:1.45}.ihub-msg.ok{color:#047857}.ihub-msg.err{color:#b91c1c}.ihub-msg.run,.ihub-msg.ask{color:#b45309}' +
    '.ihub-bar{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}' +
    '.ihub-btn{min-height:40px;padding:6px 14px;border:none;border-radius:9px;background:#126B91;color:#fff;font:700 12.5px/1.2 inherit;font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:5px;text-decoration:none}.ihub-btn.gray{background:#64748b}.ihub-btn.sm{min-height:36px;padding:5px 10px;font-size:11.5px}.ihub-btn:disabled{opacity:.5;cursor:wait}' +
    '.ihub-acts{border:1px solid #bfdbfe;background:#eff6ff;border-radius:10px;padding:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}.ihub-acts-t{flex-basis:100%;font-size:12px;font-weight:700;color:#1e3a5f}' +
    '.gc-hub-modal .gc-modal-card{width:min(640px,96vw)}.gc-hub-body{padding:14px;overflow:auto}.gc-head-hub{background:linear-gradient(135deg,#F97316,#ea580c)!important;color:#fff!important;border-color:#f97316!important}';
  function css() { if (document.getElementById('gc-hub-css')) return; var s = document.createElement('style'); s.id = 'gc-hub-css'; s.textContent = CSS; document.head.appendChild(s); }
  function open(opt) {
    css(); opt = opt || {};
    var mask = document.createElement('div'); mask.className = 'gc-common-modal gc-hub-modal open';
    mask.innerHTML = '<div class="gc-modal-card" role="dialog" aria-modal="true"><div class="gc-modal-head"><strong>⇧ ' + esc(L('智慧匯入', 'Smart import', 'នាំចូលឆ្លាតវៃ')) + (opt.tool && TOOLS[opt.tool] ? ' · ' + esc(toolName(opt.tool)) : '') + '</strong><button type="button" data-close>×</button></div><div class="gc-hub-body"><div data-hub></div></div></div>';
    document.body.appendChild(mask); document.body.classList.add('gc-modal-open');
    var hub = new Hub({ tool:opt.tool || '', onDone:opt.onDone }); hub.mount(mask.querySelector('[data-hub]')); mask.__hub = hub;
    var close = function () { if (hub.busy && !g.confirm(L('匯入還在進行，確定關閉？', 'Import is still running. Close anyway?', 'កំពុងនាំចូល បិទមែនទេ?'))) return; mask.remove(); document.body.classList.toggle('gc-modal-open', !!document.querySelector('.gc-common-modal.open')); if (typeof opt.onClose === 'function') opt.onClose(hub.touched); };
    mask.querySelector('[data-close]').onclick = close; mask.onclick = function (e) { if (e.target === mask) close(); };
    return hub;
  }
  function mount(el, opt) { css(); var hub = new Hub(opt || {}); hub.mount(typeof el === 'string' ? document.querySelector(el) : el); return hub; }
  GC.importHub = { open:open, mount:mount, runIn:runIn, detect:detect, readCtx:readCtx, expand:expand, RULES:RULES, RULES_BY_TOOL:RULES_BY_TOOL, TOOLS:TOOLS, LOG_KEY:LOG_KEY, css:css };
  css();
})(window);
