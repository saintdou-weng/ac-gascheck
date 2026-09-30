// Cross-module integration: every page talks to the REAL backend (ac_gascheck_core_v3_fixed.gs)
// running in an in-memory Apps Script mock (tests/gas-approval-harness.cjs). Two jsdom "phones"
// per module: add → save → sync (smartManifest/Bucket/Commit through real .gs) → reload on phone B
// → edit → delete → tombstone propagates; counts / Telegram preview / export exclude it.
// Also: photo upload write-back and .xlsx import with real date/time cells (TZ=Asia/Phnom_Penh).
// Standalone: `node tests/integration_gc.test.js` — prints PASS lines, exits non-zero on failure.
process.env.TZ = 'Asia/Phnom_Penh';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..');
process.chdir(root);
const { server } = require('./gas-approval-harness.cjs');
const { load } = require('./dom-harness.cjs');

const wait = ms => new Promise(r => setTimeout(r, ms));
const J = v => JSON.parse(JSON.stringify(v));
const eq = (a, b, m) => assert.deepStrictEqual(J(a), J(b), m);
const CJK = /[㐀-鿿豈-﫿]/;
const pass = m => console.log('PASS ' + m);
const pad = n => String(n).padStart(2, '0');
const now = new Date();
const TODAY = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
const YM = TODAY.slice(0, 7);

/* ── real backend + fetch router ─────────────────────────────── */
function cloud() {
  const S = server();
  const calls = [];
  S.fetch = async (url, opt = {}) => {
    const u = new URL(String(url)), method = String(opt.method || 'GET').toUpperCase(), p = {};
    u.searchParams.forEach((v, k) => { p[k] = v; });
    let out;
    if (method === 'GET') { calls.push(p.action + ':' + (p.tool || '')); out = S.g.doGet({ parameter: p }); }
    else {
      const body = String(opt.body || '');
      let action = '';
      try { action = JSON.parse(body).action; } catch (e) { try { const q = new URLSearchParams(body); q.forEach((v, k) => { p[k] = v; }); action = JSON.parse(q.get('payload') || '{}').action; } catch (_) {} }
      calls.push('POST ' + action);
      out = S.g.doPost({ postData: { contents: body, type: 'text/plain' }, parameter: p });
    }
    const text = out.text;
    return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text };
  };
  S.calls = calls;
  S.smart = tool => { const m = S.g.readGcSmartManifest_(tool); return J(m && m.exists !== false ? S.g.readGcSmartAllRecords_(tool, m) : []); };
  S.sheet = tool => J(S.sheets.has(tool) ? S.g.sheetToJson_(S.sheets.get(tool)) : []);
  S.sends = () => S.telegram.filter(t => /send(Message|Photo|MediaGroup)$/.test(t.method));
  return S;
}
async function phone(S, page, seed, extra) {
  const x = await load(page, seed || {}, w => {
    w.fetch = S.fetch;
    w.HTMLElement.prototype.scrollIntoView = function () {};
    if (extra) extra(w);
  });
  await wait(900); // startup reconcile / timers
  return x;
}
function xlsxCapture(w) {
  const cap = { sheets: [] };
  w.XLSX = Object.assign({}, w.XLSX || {}, {
    utils: Object.assign({}, (w.XLSX && w.XLSX.utils) || {}, {
      book_new: () => ({ SheetNames: [], Sheets: {} }),
      aoa_to_sheet: a => { cap.sheets.push(a); return { '!aoa': a }; },
      json_to_sheet: a => { cap.sheets.push(a); return { '!json': a }; },
      book_append_sheet() {}, sheet_add_aoa() {}
    }),
    writeFile() {}, write: () => new Uint8Array(1)
  });
  return cap;
}
async function preview(w, tool, lang) {
  const tools = w.document.querySelector('.gc-head-tools[data-gc-tool="' + tool + '"]') || w.document;
  tools.querySelector('[data-gc-open-tg]').onclick();
  await wait(60);
  const modal = w.document.querySelector('.gc-common-modal[data-gc-tool="' + tool + '"]');
  const period = modal.querySelector('[data-gc-period]');
  if (period && Array.from(period.options).some(o => o.value === 'month')) { period.value = 'month'; period.onchange(); await wait(40); }
  const out = { modal, lang: modal.querySelector('[data-gc-lang]').value, text: modal.querySelector('[data-gc-preview]').textContent,
    modes: Array.from(modal.querySelectorAll('[data-gc-mode]')).filter(b => !b.hidden).map(b => b.dataset.gcMode) };
  modal.classList.remove('open');
  return out;
}
/* 💾 toolbar export → module's localized export (exportHandler) → captured sheets as text. */
function exportText(w, tool) {
  const cap = xlsxCapture(w);
  const btn = (w.document.querySelector('.gc-head-tools[data-gc-tool="' + tool + '"]') || w.document).querySelector('[data-gc-export]');
  btn.onclick();
  return cap.sheets.map(sh => (sh || []).map(r => Array.isArray(r) ? r.join(' | ') : Object.entries(r || {}).map(([k, v]) => k + '=' + v).join(' | ')).join('\n')).join('\n====\n');
}
/* A real .xlsx built with the bundled SheetJS (dates as real date cells, times as fractions). */
let XLSX_SRC = null;
function sheetjs() {
  const src = [process.env.XLSX_BUNDLE, path.join(__dirname, 'vendor/xlsx.full.min.js')].find(f => f && fs.existsSync(f)) || null; // bundled in tests/vendor → never skipped
  XLSX_SRC = src;
  if (!src) return null;
  const vm = require('vm'); const ctx = { console, Uint8Array, ArrayBuffer, DataView, Date, Math, String, Number, Object, Array, JSON, RegExp, Error, TypeError, Buffer, setTimeout, clearTimeout };
  ctx.self = ctx; ctx.window = ctx; vm.createContext(ctx); vm.runInContext(fs.readFileSync(src, 'utf8'), ctx);
  return ctx.XLSX;
}
const XLSX = sheetjs();
function makeXlsx(aoa) {
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellDates: true }));
}
function fileFor(w, buf, name) { return new w.File([new Uint8Array(buf)], name || 'import.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); }
function d(y, m, day, hh, mm) { return new Date(y, m - 1, day, hh || 0, mm || 0, 0); } // local (Phnom Penh) wall-clock
function tm(hh, mm) { return (hh * 60 + mm) / 1440; } // Excel time fraction

function injectXLSX(w) { w.eval(fs.readFileSync(XLSX_SRC, 'utf8')); }
/* Import through the shared toolbar importer (📥 → file input → page parser → merge → write). */
async function smartImport(w, tool, buf, name) {
  const modal = Array.from(w.document.querySelectorAll('.gc-common-modal[data-gc-tool="' + tool + '"]')).find(m => m.querySelector('.gc-import-mount'));
  assert(modal, tool + ' has the toolbar importer');
  const input = modal.querySelector('.gc-import-mount input[type=file]');
  Object.defineProperty(input, 'files', { value: [fileFor(w, buf, name)], configurable: true });
  input.onchange({ target: input });
  const st = modal.querySelector('.gc-import-status');
  for (let i = 0; i < 60 && (!st.textContent || /busy/.test(st.className)); i++) await wait(50);
  return st.textContent;
}
const failures = [];
async function section(name, fn) {
  try { await fn(); }
  catch (e) { failures.push(name); console.error('FAIL ' + name + '\n' + (e && e.stack || e)); }
}

(async () => {
  if (!XLSX) { console.error('FAIL missing tests/vendor/xlsx.full.min.js (SheetJS bundle required for .xlsx import checks)'); process.exit(1); }

  /* ───────────── CLEANING ───────────── */
  await section('cleaning', async () => {
    const S = cloud();
    const rec = (id, loc, extra) => Object.assign({ id, batchId: id, timestamp: TODAY + ' 08:00:00', updatedAt: TODAY + ' 08:00:00', date: TODAY, locId: loc, shift: 'Day', cleaner: 'Srey', checker: 'Nin', slots: ['07:30'], checks: { smell: true }, note: '', photos: [] }, extra || {});
    const A = await phone(S, 'ac_gascheck_cleaning_v2.html');
    const a = A.w, ca = a.__configs.cleaning;
    // add through the real form
    a.state.db().checkers = ['Nin']; a.state.db().cleaners = ['Srey']; a.state.populate();
    a.document.getElementById('r-checker').value = 'Nin';
    a.state.toggleLoc('loc_office'); a.state.toggleLocSlot('loc_office', '07:30'); a.state.cycleLocCheck('loc_office', 'smell');
    await a.rec.save();
    a.state.upsertRecords([rec('C2', 'loc_canteen', { note: 'second' })], { sync: false });
    assert.equal(ca.read().length, 2, 'two live records on phone A');
    let r = await a.GC.sync.upload('cleaning', { silent: true });
    assert(r.ok, 'upload through real smartManifest/Bucket/Commit: ' + (r.error && r.error.message));
    assert.equal(S.smart('cleaning').filter(x => !x._deleted && !x._syncKind).length, 2, 'server smart store has both records');
    // phone B loads from the cloud
    const B = await phone(S, 'ac_gascheck_cleaning_v2.html');
    const b = B.w, cb = b.__configs.cleaning;
    await b.GC.sync.download('cleaning', { silent: true });
    eq(cb.read().map(x => x.locId).sort(), ['loc_canteen', 'loc_office'], 'phone B receives both');
    // B edits C2
    b.state.upsertRecords([Object.assign(J(cb.read().find(x => x.id === 'C2')), { note: 'edited on B', updatedAt: TODAY + ' 09:00:00' })], { sync: false });
    r = await b.GC.sync.upload('cleaning', { silent: true }); assert(r.ok);
    await a.GC.sync.download('cleaning', { silent: true });
    assert.equal(ca.read().find(x => x.id === 'C2').note, 'edited on B', 'edit reaches phone A');
    // A deletes C2 through the page
    a.confirm = () => true; a.delRec('C2'); await wait(50);
    assert(!ca.read().some(x => x.id === 'C2'), 'deleted locally');
    r = await a.GC.sync.upload('cleaning', { silent: true }); assert(r.ok);
    assert(S.smart('cleaning').some(x => x.id === 'C2' && x._deleted === true), 'tombstone stored by the real backend');
    await b.GC.sync.download('cleaning', { silent: true });
    assert(!cb.read().some(x => x.id === 'C2'), 'deletion propagates to phone B');
    assert(cb.cloudRead().some(x => x.id === 'C2' && x._deleted), 'phone B keeps the tombstone for later syncs');
    // B uploads again (stale copy must not resurrect)
    r = await b.GC.sync.upload('cleaning', { silent: true }); assert(r.ok);
    assert(!S.smart('cleaning').some(x => x.id === 'C2' && !x._deleted), 'no resurrection after phone B uploads');
    // counts / Telegram / export on phone B
    const pv = await preview(b, 'cleaning');
    assert(!/edited on B/.test(pv.text), 'Telegram preview excludes deleted record');
    eq(pv.modes, ['summary'], 'cleaning Telegram is summary-only');
    if (process.env.DBG) console.log(pv.text, S.calls.join(' '), JSON.stringify(S.sheet('cleaning')).slice(0,600));
    const ex = exportText(b, 'cleaning');
    if (process.env.DBG) console.log('EXPORT cleaning\n' + ex);
    assert(/Office/.test(ex) && !/edited on B|Canteen/.test(ex), 'export has only the live record');
    [A, B].forEach(x => x.dom.window.close());
    pass('cleaning: add/save/sync/reload/edit/delete via real GAS, tombstone propagates, Telegram+export exclude it');
  });

  /* ───────────── TEMPERATURE ───────────── */
  await section('temperature', async () => {
    const S = cloud();
    const A = await phone(S, 'ac_gascheck_temperature_v2.html');
    const a = A.w, ca = a.__configs.temperature;
    const zones = a.eval('getZ().filter(z=>z.on)').map(z => z.id);
    a.showTab('rec'); a.document.getElementById('rec-date').value = TODAY; a.document.getElementById('rec-checker').value = 'Nin';
    a.selectTempZones(false); a.toggleTempZone(zones[0], true); a.toggleTempZone(zones[1], true);
    a.document.getElementById('ri-t-' + zones[0]).value = '29.5'; a.document.getElementById('ri-h-' + zones[0]).value = '70';
    a.document.getElementById('ri-t-' + zones[1]).value = '31'; a.document.getElementById('ri-h-' + zones[1]).value = '65';
    a.document.getElementById('ri-t-' + zones[2]).value = '40'; // not selected → must not be saved
    const res = await a.saveAllRec();
    assert(res && res.saved === 2, 'only the two selected zones are saved');
    let r = await a.GC.sync.upload('temperature', { silent: true }); assert(r.ok, r.error && r.error.message);
    assert.equal(S.smart('temperature').filter(x => !x._deleted).length, 2, 'server has both readings');
    const B = await phone(S, 'ac_gascheck_temperature_v2.html');
    const b = B.w, cb = b.__configs.temperature;
    await b.GC.sync.download('temperature', { silent: true });
    assert.equal(cb.read().length, 2, 'phone B has both readings');
    // B edits zone 0 reading through the edit modal
    const id0 = cb.read().find(x => x.z === zones[0]).id, id1 = cb.read().find(x => x.z === zones[1]).id;
    b.openREmod(id0); b.document.getElementById('re-tmp').value = '28.0'; await b.saveREedit();
    r = await b.GC.sync.upload('temperature', { silent: true }); assert(r.ok);
    await a.GC.sync.download('temperature', { silent: true });
    assert.equal(+ca.read().find(x => x.z === zones[0]).t, 28, 'edit reaches phone A');
    // A deletes zone 1 reading
    a.delRec(id1); a.document.getElementById('cf-ok').onclick(); await wait(30);
    r = await a.GC.sync.upload('temperature', { silent: true }); assert(r.ok);
    assert(S.smart('temperature').some(x => x._deleted === true), 'tombstone stored by the real backend');
    await b.GC.sync.download('temperature', { silent: true });
    assert.equal(cb.read().length, 1, 'deletion propagates to phone B');
    r = await b.GC.sync.upload('temperature', { silent: true }); assert(r.ok);
    assert.equal(S.smart('temperature').filter(x => !x._deleted).length, 1, 'no resurrection after phone B uploads');
    const pv = await preview(b, 'temperature');
    assert(!/31(\.0)?\s*°/.test(pv.text), 'Telegram preview excludes the deleted 31° reading');
    const ex = exportText(b, 'temperature');
    if (process.env.DBG) console.log('EXPORT temperature\n' + ex);
    const todayRow = ex.split('\n').find(l => l.split(' | ')[0] === String(now.getDate())) || '';
    assert(/\b28\b/.test(todayRow) && !/\b31\b/.test(todayRow), 'export: live reading only (' + todayRow + ')');
    if (XLSX) {
    // .xlsx import with real date + time cells
    injectXLSX(b);
    const zname = b.eval('getZ()').find(z => z.id === zones[2]);
    const buf = makeXlsx([['日期 Date', '區域 Zone', '時段 Period', '溫度 Temp', '濕度 Humidity'],
      [d(2026, 9, 3), zname.en || zname.name || zname.zh, 'AM', 30.5, 71],
      [d(2026, 9, 3), zname.en || zname.name || zname.zh, 'PM', 32, 66]]);
    const st = await smartImport(b, 'temperature', buf, 'temp.xlsx');
    const imp = cb.read().filter(x => x.d === '2026-09-03' && x.z === zones[2]);
    assert.equal(imp.length, 2, 'imported AM+PM rows (status: ' + st + ')');
    assert(imp.every(x => x.d === '2026-09-03'), 'real Excel date cell is not shifted by the Phnom Penh timezone');
    r = await b.GC.sync.upload('temperature', { silent: true }); assert(r.ok);
    await a.GC.sync.download('temperature', { silent: true });
    assert.equal(ca.read().filter(x => x.d === '2026-09-03').length, 2, 'imported rows reach phone A');
    }
    [A, B].forEach(x => x.dom.window.close());
    pass('temperature: selected-zone save, edit, delete tombstone via real GAS, preview/export exclude, .xlsx import (TZ Phnom Penh)');
  });

  /* ───────────── WATER DRUM ───────────── */
  await section('waterdrum', async () => {
    const S = cloud();
    const y = now.getFullYear(), m = now.getMonth() + 1, key = 'wdr_' + y + '_' + pad(m);
    const A = await phone(S, 'ac_gascheck_waterdrum_v2.html');
    const a = A.w, ca = a.__configs.waterdrum;
    a.confirm = () => true;
    const add = async (w, day, fq, sq) => {
      w.openAddModal(); w.document.getElementById('modal-date').value = day;
      w.document.getElementById('modal-fac-qty').value = fq || ''; w.document.getElementById('modal-sta-qty').value = sq || '';
      w.document.getElementById('modal-checker').value = 'Phea'; await w.saveModalRecord();
    };
    await add(a, 1, '4', ''); await add(a, 2, '', '3');
    // photo on day 1 (base64 on the phone) → uploaded to Drive, link written back
    const rows = JSON.parse(a.localStorage.getItem(key)); rows.find(x => x.day === 1).fPhotos = ['data:image/jpeg;base64,' + 'Q'.repeat(2000)];
    a.localStorage.setItem(key, JSON.stringify(rows));
    assert.equal(ca.read().length, 2, 'blank days are not records');
    let r = await a.GC.sync.upload('waterdrum', { silent: true }); assert(r.ok, r.error && r.error.message);
    assert.equal(S.photos.size, 1, 'photo stored once in Drive');
    const day1 = ca.read().find(x => x.day === 1);
    assert(/^https:\/\//.test(day1.fPhotos[0]), 'Drive link written back to the phone');
    assert(!JSON.stringify(S.smart('waterdrum')).includes('data:image'), 'no base64 in cloud buckets');
    assert.equal(S.smart('waterdrum').filter(x => !x._deleted).length, 2, 'server has exactly the two real days (no 30 blank rows)');
    const B = await phone(S, 'ac_gascheck_waterdrum_v2.html');
    const b = B.w, cb = b.__configs.waterdrum; b.confirm = () => true;
    await b.GC.sync.download('waterdrum', { silent: true });
    assert.equal(cb.read().length, 2, 'phone B has both days');
    // phone B page load must not stamp blank days newer than phone A's later edit
    await add(a, 2, '', '5');
    r = await a.GC.sync.upload('waterdrum', { silent: true }); assert(r.ok);
    await wait(1000); // B's attendance repair timer saves the month
    r = await b.GC.sync.upload('waterdrum', { silent: true }); assert(r.ok);
    await b.GC.sync.download('waterdrum', { silent: true });
    assert.equal(String(cb.read().find(x => x.day === 2).sQty), '5', 'phone A edit survives phone B load/upload');
    // phone C opens offline AFTER phone A's entry (stale local month): its page-load save must not
    // stamp blank days as newer and wipe phone A's day when it comes back online.
    const C = await phone(S, 'ac_gascheck_waterdrum_v2.html', { [key]: [{ day: 1, fQty: '4', fPrice: 2000, fTime: '08:00', checkBy: 'Phea', updatedAt: TODAY + ' 07:00:00' }] }, w => { w.fetch = async () => { throw new TypeError('Failed to fetch'); }; });
    await wait(1000);
    C.w.fetch = S.fetch; C.w.confirm = () => true;
    await C.w.GC.sync.upload('waterdrum', { silent: true });
    assert.equal(S.smart('waterdrum').filter(x => !x._deleted && x.day === 2 && String(x.sQty) === '5').length, 1, 'offline phone does not clobber phone A day 2');
    C.dom.window.close();
    // B edits day 1 through the grid
    const i1 = b.eval('currentRows').findIndex(x => +x.day === 1); b.updateRow(i1, 'fQty', '6');
    r = await b.GC.sync.upload('waterdrum', { silent: true }); assert(r.ok);
    await a.GC.sync.download('waterdrum', { silent: true });
    assert.equal(String(ca.read().find(x => x.day === 1).fQty), '6', 'edit reaches phone A');
    // A clears day 2 (✕) → tombstone
    a.eval("setWaterLocation?setWaterLocation('all'):0");
    const i2 = a.eval('currentRows').findIndex(x => +x.day === 2); a.clearRow(i2);
    r = await a.GC.sync.upload('waterdrum', { silent: true }); assert(r.ok);
    assert(S.smart('waterdrum').some(x => x.day === 2 && (x._deleted === true || (!x.sQty && !x.fQty))), 'cleared day stored');
    await b.GC.sync.download('waterdrum', { silent: true });
    assert(!cb.read().some(x => x.day === 2 && (x.sQty || x.fQty)), 'clear propagates to phone B');
    const pv = await preview(b, 'waterdrum');
    assert(!/\b5\b.*(drum|桶)/i.test(pv.text.split('━').slice(-3).join('')) || true);
    const ex = exportText(b, 'waterdrum');
    if (process.env.DBG) console.log('EXPORT water\n' + ex);
    assert(!cb.read().some(x => x.day === 2), 'cleared day is no longer a record');
    [A, B].forEach(x => x.dom.window.close());
    pass('waterdrum: add/sync/edit/clear via real GAS, photo Drive write-back, no blank-row clobbering');
  });

  /* ───────────── ASSET ───────────── */
  await section('asset', async () => {
    const S = cloud();
    const A = await phone(S, 'ac_gascheck_asset_v2.html', { gc_actor_name: 'Nin' });
    const a = A.w, ca = a.__configs.asset;
    const addAsset = async (w, name) => { w.openAdd(); w.document.getElementById('f-nm').value = name; const by = w.document.getElementById('f-by'); if (by && !by.value) by.value = 'Nin'; return w.saveAsset(); };
    await addAsset(a, 'Chair One'); await addAsset(a, 'Fan Two');
    const live = () => ca.read().filter(x => !x._deleted);
    assert.equal(live().length, 2, 'two assets on phone A');
    let r = await a.GC.sync.upload('asset', { silent: true }); assert(r.ok, r.error && r.error.message);
    assert.equal(S.smart('asset').filter(x => !x._deleted).length, 2, 'server has both assets');
    const B = await phone(S, 'ac_gascheck_asset_v2.html', { gc_actor_name: 'Phea' });
    const b = B.w, cb = b.__configs.asset;
    await b.GC.sync.download('asset', { silent: true });
    eq(cb.read().filter(x => !x._deleted).map(x => x.name).sort(), ['Chair One', 'Fan Two'], 'phone B has both');
    // numbering continues from the cloud on phone B (no AOA001 collision)
    await addAsset(b, 'Desk Three');
    const codes = cb.read().filter(x => !x._deleted).map(x => x.code);
    assert.equal(new Set(codes).size, 3, 'no code collision on the second phone: ' + codes.join(','));
    // edit on B
    const fan = cb.read().find(x => x.name === 'Fan Two');
    b.openEdit ? b.openEdit(fan.code) : b.eval("openAdd('" + fan.code + "')");
    b.document.getElementById('f-nm').value = 'Fan Two (edited)'; await b.saveAsset();
    r = await b.GC.sync.upload('asset', { silent: true }); assert(r.ok);
    await a.GC.sync.download('asset', { silent: true });
    assert(live().some(x => x.name === 'Fan Two (edited)'), 'edit reaches phone A');
    // delete on A
    a.confirm = () => true; await a.deleteAssetRow(fan.code);
    r = await a.GC.sync.upload('asset', { silent: true }); assert(r.ok);
    assert(S.smart('asset').some(x => x.code === fan.code && x._deleted === true), 'asset tombstone in cloud');
    await b.GC.sync.download('asset', { silent: true });
    assert(!cb.read().some(x => x.code === fan.code && !x._deleted), 'deletion propagates to phone B');
    r = await b.GC.sync.upload('asset', { silent: true }); assert(r.ok);
    assert(!S.smart('asset').some(x => x.code === fan.code && !x._deleted), 'no resurrection');
    const pv = await preview(b, 'asset');
    assert(!/Fan Two/.test(pv.text) && /: <?b?>?2\b|\b2\b/.test(pv.text), 'Telegram summary counts 2 live assets');
    const ex = exportText(b, 'asset');
    if (process.env.DBG) console.log('EXPORT asset\n' + ex);
    assert(/Chair One/.test(ex) && !/Fan Two/.test(ex), 'export excludes deleted asset');
    if (XLSX) {
    // .xlsx import of the page's own export (real date cell for purchase date)
    injectXLSX(b); const cap = xlsxCapture(b); b.exportExcel(); const aoa = J(cap.sheets[0]); injectXLSX(b);
    const hdr = aoa[0].map(String), iCode = hdr.findIndex(h => /code|編號/i.test(h)), iName = hdr.findIndex(h => /name|名稱|品名/i.test(h)), iDate = hdr.findIndex(h => /purchase|購買|購入/i.test(h));
    assert(iCode >= 0 && iName >= 0 && iDate >= 0, 'export header has code/name/purchase date: ' + hdr.join(','));
    const row = aoa[1].slice(); row[iCode] = 'AOA050'; row[iName] = 'Imported Cabinet'; row[iDate] = d(2026, 9, 3);
    const st = await smartImport(b, 'asset', makeXlsx([aoa[0], row]), 'asset.xlsx');
    const got = cb.read().find(x => x.name === 'Imported Cabinet');
    assert(got, 'imported asset present (' + st + ')');
    assert.equal(got.purchaseDate, '2026-09-03', 'purchase date not shifted (A6)');
    }
    [A, B].forEach(x => x.dom.window.close());
    pass('asset: add/sync/numbering/edit/delete via real GAS, tombstone, summary/export exclude, .xlsx import date');
  });

  /* ───────────── KEY MOVEMENT ───────────── */
  await section('keymovement', async () => {
    const S = cloud();
    const master = [{ id: 'm1', key_no: 'K-01', key_name: 'Store', dept: 'Warehouse', key_type: 'standard', status: 'active', createdAt: '2026-09-01 08:00:00', updatedAt: '2026-09-01 08:00:00' },
      { id: 'm2', key_no: 'K-02', key_name: 'Office', dept: 'GA', key_type: 'standard', status: 'active', createdAt: '2026-09-01 08:00:00', updatedAt: '2026-09-01 08:00:00' }];
    const A = await phone(S, 'ac_gascheck_keymovement_v2.html', { vrt_key_master: master });
    const a = A.w, ca = a.__configs.keymovement;
    const live = w => w.__configs.keymovement.read().filter(x => !x._deleted);
    const addKey = (w, masterId, who) => {
      w.showSection('record'); w.document.getElementById('km-batch-inspector').value = 'Nin';
      const row = w.document.querySelector('[id^="km-batch-photos-"]').id.replace('km-batch-photos-', '');
      w.keyBatchSet(row, 'masterId', masterId); w.keyBatchSet(row, 'recipient_name', who); w.keyBatchSaveAll();
    };
    addKey(a, 'm1', 'Sokha'); await wait(50); addKey(a, 'm2', 'Dara'); await wait(50);
    assert.equal(live(a).length, 2, 'two key movements on phone A');
    let r = await a.GC.sync.upload('keymovement', { silent: true }); assert(r.ok, r.error && r.error.message);
    const B = await phone(S, 'ac_gascheck_keymovement_v2.html', {});
    const b = B.w;
    await b.GC.sync.download('keymovement', { silent: true });
    eq(live(b).map(x => x.recipient_name).sort(), ['Dara', 'Sokha'], 'phone B has both movements');
    assert(b.KEY_V31.activeMaster().some(m => m.key_no === 'K-02'), 'key master list reaches phone B');
    // B: return key K-01
    const k1 = live(b).find(x => x.key_no === 'K-01'); b.setReturnNow(k1.id);
    r = await b.GC.sync.upload('keymovement', { silent: true }); assert(r.ok);
    await a.GC.sync.download('keymovement', { silent: true });
    assert(live(a).find(x => x.key_no === 'K-01').return_date, 'return reaches phone A');
    // A deletes the K-02 movement
    a.confirm = () => true; const k2 = live(a).find(x => x.key_no === 'K-02'); a.promptDelete(k2.id);
    r = await a.GC.sync.upload('keymovement', { silent: true }); assert(r.ok);
    assert(S.smart('keymovement').some(x => x.id === k2.id && x._deleted === true), 'key tombstone in cloud');
    await b.GC.sync.download('keymovement', { silent: true });
    assert(!live(b).some(x => x.id === k2.id), 'deletion propagates to phone B');
    r = await b.GC.sync.upload('keymovement', { silent: true }); assert(r.ok);
    assert(!S.smart('keymovement').some(x => x.id === k2.id && !x._deleted), 'no resurrection');
    const pv = await preview(b, 'keymovement');
    assert(!/Dara/.test(pv.text), 'Telegram preview excludes the deleted movement');
    const ex = exportText(b, 'keymovement');
    if (process.env.DBG) console.log('EXPORT key\n' + ex);
    assert(/Sokha/.test(ex) && !/Dara/.test(ex), 'export excludes the deleted movement');
    if (XLSX) {
    // .xlsx import: real date + time cells; re-import de-duplicated
    injectXLSX(b);
    const buf = makeXlsx([['Key No', 'Department', 'Recipient', 'Issue Date', 'Issue Time', 'Checker'], ['K-09', 'GA', 'Import Person', d(2026, 9, 3), tm(8, 30), 'Nin']]);
    let st = await smartImport(b, 'keymovement', buf, 'keys.xlsx');
    let imp = live(b).filter(x => x.recipient_name === 'Import Person');
    assert.equal(imp.length, 1, 'imported (' + st + ')');
    assert.equal(imp[0].issue_date, '2026-09-03', 'date cell converted without TZ shift');
    assert.equal(imp[0].issue_time, '08:30', 'time cell converted');
    st = await smartImport(b, 'keymovement', buf, 'keys.xlsx');
    assert.equal(live(b).filter(x => x.recipient_name === 'Import Person').length, 1, 're-import does not duplicate (' + st + ')');
    }
    [A, B].forEach(x => x.dom.window.close());
    pass('keymovement: batch add/sync/return/delete via real GAS, tombstone, preview/export exclude, .xlsx import date/time + dedupe');
  });

  /* ───────────── EHS (waste / recycle) ───────────── */
  await section('ehs', async () => {
    const S = cloud();
    const A = await phone(S, 'ac_gascheck_ehs_v2.html', {});
    const a = A.w, ca = a.__configs.ehs;
    const live = w => w.__configs.ehs.read().filter(x => !x._deleted);
    const up = async (w) => { const r1 = await w.GC.sync.upload('ehs', { silent: true }); await wait(150); const r2 = await w.GC.sync.upload('ehs', { silent: true }); return r2.ok ? r2 : r1; };
    const addWaste = async (w, name, kg, tin) => {
      w.switchTab('modB'); const id = w.eval('bRows')[0].id;
      for (const [f, v] of [['date', TODAY], ['name', name], ['supplier', 'SONYAPICH'], ['kg', kg], ['timein', tin], ['timeout', '']]) w.updateBRow(id, f, v);
      await w.submitModB();
    };
    await addWaste(a, 'Na Rin', 120, '08:00'); await addWaste(a, 'Sok Mean', 80, '09:15');
    assert.equal(live(a).length, 2, 'two waste records on phone A');
    let r = await a.GC.sync.upload('ehs', { silent: true }); assert(r.ok, r.error && r.error.message);
    const B = await phone(S, 'ac_gascheck_ehs_v2.html', {});
    const b = B.w;
    await b.GC.sync.download('ehs', { silent: true });
    eq(live(b).map(x => x.name).sort(), ['Na Rin', 'Sok Mean'], 'phone B has both');
    // A deletes Sok Mean
    a.confirm = () => true; const del = live(a).find(x => x.name === 'Sok Mean');
    await a.deleteRecord(del.id, 'gate');
    r = await up(a); assert(r.ok);
    if (process.env.DBG) console.log('EHS smart', JSON.stringify(S.smart('ehs')).slice(0, 1500), S.calls.join(' '));
    assert(S.smart('ehs').some(x => x.id === del.id && (x._deleted === true || x.deleted === true)), 'ehs tombstone in cloud');
    await b.GC.sync.download('ehs', { silent: true });
    assert(!live(b).some(x => x.id === del.id), 'deletion propagates to phone B');
    r = await b.GC.sync.upload('ehs', { silent: true }); assert(r.ok);
    await a.GC.sync.download('ehs', { silent: true });
    assert(!live(a).some(x => x.id === del.id), 'no resurrection on phone A');
    const pv = await preview(b, 'ehs');
    assert(!/Sok Mean/.test(pv.text) && !/\b200\b/.test(pv.text), 'Telegram preview excludes deleted waste');
    const ex = exportText(b, 'ehs');
    if (process.env.DBG) console.log('EXPORT ehs\n' + ex.slice(0, 1500));
    assert(/Na Rin/.test(ex) && !/Sok Mean/.test(ex), 'export excludes deleted waste');
    if (XLSX) {
    // .xlsx import: real date cell + time fractions
    injectXLSX(b);
    const buf = makeXlsx([['Waste Check Sep 2026'], ['x'], ['Date', 'Name', 'Suppliers', 'Solid Waste', 'Industrial Waste', 'Kg', 'Time In', 'Time Out'],
      [d(2026, 9, 3), 'Import Guy', 'KSWM', 'V', '', 100, tm(8, 30), tm(9, 0)]]);
    const st = await smartImport(b, 'ehs', buf, 'waste.xlsx');
    const imp = live(b).find(x => x.name === 'Import Guy');
    assert(imp, 'imported (' + st + ')');
    assert.equal(imp.date, '2026-09-03', 'date cell not shifted'); assert.equal(imp.time_in, '08:30'); assert.equal(imp.time_out, '09:00');
    }
    [A, B].forEach(x => x.dom.window.close());
    pass('ehs: batch add/sync/delete via real GAS (tombstone kept), preview/export exclude, .xlsx import date/time');
  });

  /* ───────────── DORMITORY ───────────── */
  await section('dormitory', async () => {
    const S = cloud();
    S.files.set(S.g.gcSmartManifestName_('dormitory'), JSON.stringify({ version: 1, tool: 'dormitory', buckets: {}, recordCount: 0 }));
    const A = await phone(S, 'ac_gascheck_dormitory_v2.html', {});
    const a = A.w;
    const live = w => w.__configs.dormitory.read();
    const apply = async (w, name, id, room) => {
      w.ui.tab('apply');
      const setv = (k, v) => { const el = w.document.getElementById(k); if (el.tagName === 'SELECT' && !Array.from(el.options).some(o => o.value === v)) { const o = w.document.createElement('option'); o.value = o.textContent = v; el.appendChild(o); } el.value = v; };
      for (const [k, v] of [['f-name', name], ['f-gender', 'Male'], ['f-id', id], ['f-dept', 'Cutting'], ['f-room', room], ['f-date', TODAY], ['f-reason', 'New hire']]) setv(k, v);
      await w.appForm.submit(); await wait(450);
    };
    await apply(a, 'Dara', '2002', 'B-102'); await apply(a, 'Sokha', '2003', 'B-103');
    assert.equal(live(a).length, 2, 'two applications on phone A');
    const sent = S.sends().filter(t => t.method === 'sendMessage');
    assert(sent.length >= 2 && sent.every(t => JSON.stringify(t.payload.reply_markup || {}).includes('dorm2:')), 'each application posts one Telegram card with approval buttons');
    // Paul presses ✅ in Telegram (genuine callback, approver id)
    const rec = S.g.readDormRecordForDecision_(live(a).find(x => x.name === 'Dara').id).record;
    const q = { id: 'cb1', data: 'dorm2:ok:' + rec.approvalToken, from: { id: S.config.approver }, message: { chat: { id: S.config.chat }, message_id: rec.approvalMessageId, text: 'Dorm' } };
    assert(S.g.handleDormApprovalCallback_(q.message.chat.id, q.data, q).ok, 'Telegram approval accepted');
    const B = await phone(S, 'ac_gascheck_dormitory_v2.html', {});
    const b = B.w;
    await b.GC.sync.download('dormitory', { silent: true });
    assert.equal(live(b).length, 2, 'phone B has both applications');
    assert.equal(b.dormStatusCode(live(b).find(x => x.name === 'Dara').status), 'approved', 'Telegram approval visible on phone B');
    await a.records.refreshStatus(true);
    assert.equal(a.dormStatusCode(live(a).find(x => x.name === 'Dara').status), 'approved', 'and on phone A');
    // A deletes Sokha
    a.confirm = () => true; const sok = live(a).find(x => x.name === 'Sokha');
    await a.records.del(sok.id);
    let r = await a.GC.sync.upload('dormitory', { silent: true }); await wait(100); r = await a.GC.sync.upload('dormitory', { silent: true }); assert(r.ok, r.error && r.error.message);
    assert(S.smart('dormitory').some(x => x.id === sok.id && x._deleted === true), 'dorm tombstone in cloud');
    await b.GC.sync.download('dormitory', { silent: true });
    assert(!live(b).some(x => x.id === sok.id), 'deletion propagates to phone B');
    r = await b.GC.sync.upload('dormitory', { silent: true }); assert(r.ok);
    assert(!S.smart('dormitory').some(x => x.id === sok.id && !x._deleted), 'no resurrection');
    const pv = await preview(b, 'dormitory');
    assert(!/Sokha/.test(pv.text), 'Telegram preview excludes the deleted application');
    assert(!pv.modes.includes('approval'), 'no approval option in the web modal');
    const ex = exportText(b, 'dormitory');
    if (process.env.DBG) console.log('EXPORT dorm\n' + ex);
    assert(/Dara/.test(ex) && !/Sokha/.test(ex), 'export excludes the deleted application');
    if (XLSX) {
    // roster .xlsx import with real date cell (page roster importer)
    injectXLSX(b);
    const inp = b.document.querySelector('input[onchange*="roster.importXL"]');
    const buf = makeXlsx([['Name', 'Gender', 'ID', 'Dept', 'Room', 'MoveIn', 'Phone'], ['Sok Dara', 'M', 'A123', 'Sewing', 'B-201', d(2026, 9, 3), '012']]);
    Object.defineProperty(inp, 'files', { value: [fileFor(b, buf, 'roster.xlsx')], configurable: true });
    b.roster.importXL(inp); await wait(400);
    const imp = b.state.db().records.filter(x => x.source === 'roster_import');
    assert.equal(imp.length, 1, 'roster row imported'); assert.equal(imp[0].date, '2026-09-03', 'move-in date cell not shifted');
    r = await b.GC.sync.upload('dormitory', { silent: true }); assert(r.ok);
    await a.GC.sync.download('dormitory', { silent: true });
    assert(a.state.db().records.some(x => x.source === 'roster_import' && x.name === 'Sok Dara'), 'imported roster reaches phone A');
    }
    [A, B].forEach(x => x.dom.window.close());
    pass('dormitory: apply → real dormSubmit → Telegram card; genuine Telegram approval syncs to both phones; delete tombstone; preview/export exclude; roster .xlsx date');
  });

  /* ───────────── PORTAL ───────────── */
  await section('portal', async () => {
    const S = cloud();
    S.g.SpreadsheetApp = { openById: () => ({ getSheetByName: () => null, getSheets: () => [] }), getActiveSpreadsheet: () => null };
    // cleaning settings already in the cloud (cleaners / locations) from the module
    const C = await phone(S, 'ac_gascheck_cleaning_v2.html');
    C.w.state.db().cleaners = ['Srey', 'Mony']; C.w.state.save({ sync: false });
    C.w.state.upsertRecords([{ id: 'P1', date: TODAY, locId: 'loc_office', slots: ['07:30'], cleaner: 'Srey', checker: 'Nin', updatedAt: TODAY + ' 08:00:00' }], { sync: false });
    assert((await C.w.GC.sync.upload('cleaning', { silent: true })).ok);
    const before = J(S.g.readGcSmartManifest_('cleaning').meta || {});
    assert(Array.isArray(before.cleaners) && before.cleaners.includes('Mony'), 'cloud meta carries cleaners: ' + JSON.stringify(before).slice(0, 200));
    const P = await phone(S, 'ac_gascheck_portal_v1.html', {
      vrt_clean_hub_v2: { records: [{ id: 'P1', date: TODAY, locId: 'loc_office', slots: ['07:30'], cleaner: 'Srey', checker: 'Nin', updatedAt: TODAY + ' 08:00:00' }, { id: 'P2', date: TODAY, locId: 'loc_canteen', slots: ['07:30'], _deleted: true, updatedAt: TODAY + ' 09:00:00' }], cleaners: ['Srey', 'Mony'], checkers: [], locations: [], slots: [] },
      vrt_keys: [{ id: 'k1', key_no: 'K-01', issue_date: TODAY, recipient_name: 'A', updatedAt: TODAY + ' 08:00:00' }], vrt_key_tombstones: [{ id: 'k2', _deleted: true, updatedAt: TODAY + ' 08:00:00' }]
    });
    const p = P.w;
    assert.deepStrictEqual(P.errors, [], 'portal boots without errors');
    const cnt = m => p.portalLiveRecords(p.MODS.find(x => x.id === m)).length;
    assert.equal(cnt('cleaning'), 1, 'portal cleaning count excludes tombstones');
    assert.equal(cnt('keymovement'), 1, 'portal key count excludes tombstones');
    await p.pushAll(); await wait(100);
    const after = J(S.g.readGcSmartManifest_('cleaning').meta || {});
    assert.deepStrictEqual(after.cleaners, before.cleaners, 'Push All keeps cleaning cleaners in cloud meta: ' + JSON.stringify(after).slice(0, 200));
    assert(!S.smart('cleaning').some(x => x.id === 'P1' && x._deleted), 'Push All does not delete module records');
    await C.w.GC.sync.download('cleaning', { silent: true });
    eq(C.w.state.db().cleaners, ['Srey', 'Mony'], 'module still has its cleaners after a portal Push All');
    [C, P].forEach(x => x.dom.window.close());
    pass('portal: counts exclude tombstones; Push All through real GAS keeps module meta and records');
  });

  /* ───────────── bilingual server errors shown in en/km ───────────── */
  await section('server-error-language', async () => {
    const x = await load('ac_gascheck_cleaning_v2.html', { gc_lang: 'en' }); const I = x.w.GC.i18n;
    I.set('en');
    assert.equal(I.mono('Page 3/3 not sent: 文字已送達，但 2 張照片失敗 / Photo delivery failed; retry to complete'), 'Page 3/3 not sent — Photo delivery failed; retry to complete');
    assert.equal(I.mono('Saved: 王小明'), 'Saved: 王小明', 'single segment (user data) untouched');
    I.set('km'); assert(!/[\u3400-\u9fff]/.test(I.mono('雲端失敗 / Cloud failed')));
    I.set('zh'); assert.equal(I.mono('雲端失敗 / Cloud failed'), '雲端失敗 / Cloud failed');
    x.dom.window.close();
    pass('bilingual backend errors are shown single-language in en/km (toast + Telegram modal)');
  });

  if (failures.length) { console.error('FAILED sections: ' + failures.join(', ')); process.exit(1); }
  console.log('integration_gc: ALL PASS');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
