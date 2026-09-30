// Front ↔ back contract (FIX sprint, lead wiring). Every page talks to the REAL backend
// (ac_gascheck_core_v3_fixed.gs) inside the in-memory Apps Script mock; Paul's approvals are
// genuine Telegram callback updates posted to doPost.
// Covers: capabilities detection, EHS monthly approval, asset transfer/disposal approval,
// smartCommit compare-and-swap (two phones), lang on every request, report-language defaults,
// single-language backend errors, water blank rows + cleanup, water import merge,
// Portal Push All keyFn, dorm dedupe tombstones.
// Standalone: node tests/fix_contract.test.js — prints PASS lines, exits non-zero on failure.
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
const CJK = /[㐀-鿿豈-﫿]/;
const pad = n => String(n).padStart(2, '0');
const now = new Date();
const TODAY = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
const YM = TODAY.slice(0, 7);
const earlier = (h) => { const d = new Date(Date.now() - h * 3600000); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };

/* ── real backend with real clock + fetch router for jsdom phones ── */
function formatDate(v, _tz, p) { const x = new Date(v); return p.replace(/yyyy|MM|dd|HH|mm|ss|M|d/g, k => ({ yyyy: x.getFullYear(), MM: pad(x.getMonth() + 1), M: x.getMonth() + 1, dd: pad(x.getDate()), d: x.getDate(), HH: pad(x.getHours()), mm: pad(x.getMinutes()), ss: pad(x.getSeconds()) })[k]); }
function cloud() {
  const S = server(), g = S.g;
  let fid = 0;
  class File { constructor(name, content) { this.id = 'f' + (++fid); this.name = name; this.content = String(content || ''); this.trashed = false; }
    getId() { return this.id; } getName() { return this.name; } getBlob() { const c = this.content; return { getDataAsString: () => c }; } setTrashed(v) { this.trashed = !!v; } isTrashed() { return this.trashed; } }
  const it = a => { let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; };
  class Folder { constructor(n) { this.name = n; this.files = []; } createFile(a, b) { const f = new File(a, b); this.files.push(f); return f; } getFiles() { return it(this.files.filter(f => !f.trashed)); } }
  const folders = {};
  Object.assign(g.DriveApp, { getFoldersByName: n => it(folders[n] ? [folders[n]] : []), createFolder: n => (folders[n] = new Folder(n)) });
  g.MimeType = { PLAIN_TEXT: 'text/plain' };
  g.HtmlService = { createHtmlOutput: t => ({ text: t }) };
  g.Utilities.formatDate = formatDate;
  g.SpreadsheetApp = { openById: () => ({ getSheetByName: n => S.sheets.get(n) || null, getSheets: () => [] }), getActiveSpreadsheet: () => null };
  const calls = [], bodies = [];
  S.hooks = {};
  S.fetchFor = (name) => async (url, opt = {}) => {
    const u = new URL(String(url)), method = String(opt.method || 'GET').toUpperCase(), p = {};
    u.searchParams.forEach((v, k) => { p[k] = v; });
    let out;
    if (method === 'GET') { calls.push({ phone: name, method, action: p.action || '', tool: p.tool || '', lang: p.lang }); out = g.doGet({ parameter: p }); }
    else {
      const body = String(opt.body || '');
      let parsed = {};
      try { parsed = JSON.parse(body); } catch (e) { try { const q = new URLSearchParams(body); parsed = JSON.parse(q.get('payload') || '{}'); } catch (_) {} }
      calls.push({ phone: name, method, action: parsed.action || parsed.type || '', tool: parsed.tool || '', lang: parsed.lang });
      bodies.push({ phone: name, body: parsed });
      const hook = S.hooks[name + ':' + (parsed.action || parsed.type)];
      if (hook) { delete S.hooks[name + ':' + (parsed.action || parsed.type)]; await hook(parsed); }
      out = g.doPost({ postData: { contents: body, type: 'text/plain' }, parameter: p });
    }
    const text = out.text;
    return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text };
  };
  S.calls = calls; S.bodies = bodies;
  S.smart = tool => { const m = g.readGcSmartManifest_(tool); return J(m && m.exists !== false ? g.readGcSmartAllRecords_(tool, m) : []); };
  S.sends = () => S.telegram.filter(t => /send(Message|Photo|MediaGroup)$/.test(t.method));
  S.edits = () => S.telegram.filter(t => t.method === 'editMessageText');
  let uid = 5000;
  S.press = (data, messageId, fromId) => JSON.parse(g.doPost({ postData: { contents: JSON.stringify({ update_id: ++uid, callback_query: { id: 'cq' + uid, data, from: { id: Number(fromId || S.config.approver) }, message: { message_id: messageId, chat: { id: Number(S.config.chat) }, text: 'Card ' + messageId } } }) }, parameter: {} }).text);
  S.raw = (body) => JSON.parse(g.doPost({ postData: { contents: JSON.stringify(body) } }).text);
  return S;
}
async function phone(S, page, seed, name, extra) {
  const x = await load(page, seed || {}, w => {
    w.fetch = S.fetchFor(name || page);
    w.HTMLElement.prototype.scrollIntoView = function () {};
    if (extra) extra(w);
  });
  await wait(700);
  return x;
}
const callbacksOf = msg => ((msg && msg.payload && msg.payload.reply_markup && msg.payload.reply_markup.inline_keyboard) || []).flat().map(b => b.callback_data).filter(Boolean);

const failures = [];
async function section(name, fn) {
  if (process.env.ONLY && !name.startsWith(process.env.ONLY)) return;
  try { await fn(); console.log('PASS ' + name); }
  catch (e) { failures.push(name); console.error('FAIL ' + name + '\n' + (e && e.stack || e)); }
}

(async () => {
  /* 1. capabilities */
  await section('capabilities: ping once per session → GC.approvalTools; offline stays disabled', async () => {
    const S = cloud();
    const P = await phone(S, 'ac_gascheck_ehs_v2.html', {}, 'A');
    const w = P.w;
    await w.GC.capabilities.ready();
    assert.deepStrictEqual(J(w.GC.approvalTools), { ehs: true, asset: true });
    assert.equal(w.ehsApprovalReady(), true, 'EHS page sees real approval support');
    const pings = () => S.calls.filter(c => c.action === 'ping').length;
    assert.equal(pings(), 1, 'one ping');
    await w.GC.capabilities.load(); await w.GC.capabilities.ready();
    assert.equal(pings(), 1, 'cached in memory');
    assert(JSON.parse(w.sessionStorage.getItem('gc_caps_v1')).caps.includes('asset-approval'), 'cached for the session');
    P.dom.window.close();
    const off = await load('ac_gascheck_ehs_v2.html', {});
    await wait(300);
    assert.deepStrictEqual(J(off.w.GC.approvalTools), { ehs: false, asset: false }, 'offline/old backend: disabled');
    assert.equal(off.w.ehsApprovalReady(), false);
    off.dom.window.close();
  });

  /* 1b. EHS monthly approval end-to-end */
  await section('EHS: submit → card ehs_ok_/ehs_rej_ → Paul ✅ → month record ehsApprovals → page shows approved; stale digest rejected; only Paul', async () => {
    const S = cloud();
    const gate = [
      { id: 'W1', date: TODAY, name: 'Na Rin', supplier: 'SONYAPICH', weight_kg: 120, time_in: '08:00', time_out: '08:40', module: 'gate', sourceType: 'waste', photos: [], updatedAt: earlier(3) },
      { id: 'W2', date: TODAY, name: 'Sok', supplier: 'K.S.W.M', weight_kg: 80, time_in: '09:15', time_out: '', module: 'gate', sourceType: 'waste', photos: [], updatedAt: earlier(3) }];
    const A = await phone(S, 'ac_gascheck_ehs_v2.html', { vrt_waste_v3: { gate, internal: [], monthly: [], tombstones: [] }, gc_lang: 'en' }, 'A');
    const a = A.w;
    await a.GC.capabilities.ready();
    a.confirm = () => true;
    assert.equal(await a.submitMonthlyApproval(), true, 'monthly request sent');
    const card = S.sends().at(-1);
    const cbs = callbacksOf(card);
    const ok = cbs.find(c => /^ehs_ok_/.test(c)), rej = cbs.find(c => /^ehs_rej_/.test(c));
    assert(ok && rej, 'card has ehs_ok_/ehs_rej_: ' + cbs.join(','));
    const digest = a.ehsApprovalDigest(YM);
    assert.equal(ok, 'ehs_ok_' + YM + '_all_' + digest, 'callback carries month + digest');
    const mid = S.bodies.length && S.g.gcApprovalRequestFor_('ehs|' + YM + '|all').messageId;
    assert(mid, 'backend registered the approval request message');
    a.renderBAnalysis();
    assert(/Waiting for Paul/i.test(a.document.getElementById('b-pending-text').textContent), 'pending shown: ' + a.document.getElementById('b-pending-text').textContent);
    // someone else presses ✅ → denied, nothing written
    const denied = S.press(ok, Number(mid), '999');
    assert(!S.smart('ehs').some(r => r.ehsApprovals), 'non-Paul press writes nothing: ' + JSON.stringify(denied));
    // Paul presses ✅
    S.press(ok, Number(mid));
    const month = S.smart('ehs').filter(r => !r._deleted && String(r.date).slice(0, 7) === YM);
    assert(month.length === 2 && month.every(r => { const v = typeof r.ehsApprovals === 'string' ? JSON.parse(r.ehsApprovals) : r.ehsApprovals; return v && v[YM + '|all'] && v[YM + '|all'].status === 'approved' && v[YM + '|all'].digest === digest; }), 'every month record carries the approval');
    assert(!callbacksOf(S.edits().at(-1)).length, 'card buttons removed after decision');
    // page syncs and shows approved
    const r = await a.GC.sync.download('ehs', { silent: true }); assert(r.ok !== false);
    a.renderBAnalysis();
    assert(/Approved/.test(a.document.getElementById('b-pending-text').textContent), 'page shows approved: ' + a.document.getElementById('b-pending-text').textContent);
    assert(!CJK.test(a.document.getElementById('b-pending-text').textContent), 'en status has no Chinese');
    // stale: data changes after the card → old button rejected
    a.confirm = () => true;
    const d = a.loadLocal(); d.gate[0] = Object.assign({}, d.gate[0], { weight_kg: 130, updatedAt: earlier(0) }); a.saveLocal(d);
    await a.GC.sync.upload('ehs', { silent: true });
    await wait(450); // double-submit guard window
    const toasts = []; const ot = a.GC.toast; a.GC.toast = (m, t) => { toasts.push(m); return ot && ot(m, t); };
    assert.equal(await a.submitMonthlyApproval(), true, 'resend after change ' + toasts.join(' | '));
    const mid2 = S.g.gcApprovalRequestFor_('ehs|' + YM + '|all').messageId;
    const newOk = callbacksOf(S.sends().at(-1)).find(c => /^ehs_ok_/.test(c));
    assert.notEqual(newOk, ok, 'new digest after data change');
    const d2 = a.loadLocal(); d2.gate[1] = Object.assign({}, d2.gate[1], { weight_kg: 85, updatedAt: earlier(0) }); a.saveLocal(d2);
    await a.GC.sync.upload('ehs', { silent: true });
    const res = S.press(newOk, Number(mid2));
    assert(/changed/i.test(JSON.stringify(res)) || /changed|變更/.test(S.edits().at(-1).payload.text), 'stale digest rejected: ' + JSON.stringify(res));
    const still = S.smart('ehs').find(x => x.id === 'W2');
    const st = typeof still.ehsApprovals === 'string' ? JSON.parse(still.ehsApprovals) : still.ehsApprovals;
    assert.notEqual((st || {})[YM + '|all'] && st[YM + '|all'].digest, newOk.split('_').pop(), 'stale press did not record a decision');
    A.dom.window.close();
  });

  /* 2. asset transfer / disposal approval end-to-end */
  await section('asset: transfer/disposal request → ast_ok_/ast_rej_ card → only Paul decides → synced asset updated + history approved/rejected; pending derived from history', async () => {
    const S = cloud();
    const mk = (code, name) => ({ id: code, code, name, category: 'office_furniture', zone: 'factory', status: 'active', qty: 1, unit: 'pcs', location: 'Office A', user: 'Phea', purchaseDate: '2025-01-02', recordedBy: 'Nin', history: [], updatedAt: earlier(5) });
    const A = await phone(S, 'ac_gascheck_asset_v2.html', { vrt_a7: [mk('AOA001', 'Desk'), mk('AOA002', 'Chair')], gc_lang: 'en', gc_actor_name: 'Jenny' }, 'A');
    const a = A.w;
    await a.GC.capabilities.ready();
    assert.equal(a.assetApprovalReady(), true);
    // transfer request
    a.openReq('transfer', 'AOA001');
    assert(/Paul decides/.test(a.document.getElementById('req-warn').textContent), 'modal explains Telegram decision');
    a.document.getElementById('req-by').value = 'Jenny'; a.document.getElementById('req-loc').value = 'Store B'; a.document.getElementById('req-usr').value = 'Nin'; a.document.getElementById('req-reason').value = 'Move';
    assert.equal(await a.submitReq(), true);
    const tgBody = S.bodies.filter(b => b.body.action === 'telegram').at(-1).body;
    assert(tgBody.assetRequest && /^areq_/.test(tgBody.assetRequest.id) && tgBody.assetRequest.type === 'transfer' && tgBody.assetRequest.data.newLocation === 'Store B', 'payload carries assetRequest');
    assert.equal(tgBody.reportLanguage, 'en'); assert.equal(tgBody.lang, 'en');
    assert(!/This is a notice/.test(tgBody.text) && /Waiting for Paul/.test(tgBody.text), 'no "notice only" line when approval is active');
    assert(!CJK.test(tgBody.text), 'en request has no Chinese');
    const card = S.sends().at(-1), cbs = callbacksOf(card);
    const reqId = tgBody.assetRequest.id;
    assert.deepStrictEqual(cbs.slice(0, 2), ['ast_ok_' + reqId, 'ast_rej_' + reqId], 'backend adds ✅/❌: ' + cbs.join(','));
    const store = S.g.gcStoreRead_('GC_ASSET_REQUESTS_V1');
    const mid = Number((store[reqId] || {}).messageId);
    assert(mid, 'request registered');
    // pending derived from history
    const loc = () => a.__configs.asset.read().find(x => x.code === 'AOA001');
    assert.equal(a.assetOpenRequests(loc()).length, 1, 'pending until Paul decides');
    assert.equal(loc().location, 'Office A', 'not changed before approval');
    a.openDetail('AOA001');
    assert(/Waiting for Paul/.test(a.document.getElementById('m-db').textContent), 'detail shows pending');
    // someone else presses → ignored
    S.press('ast_ok_' + reqId, mid, '4242');
    assert.equal(S.smart('asset').find(x => x.code === 'AOA001').location, 'Office A', 'non-Paul press ignored');
    // Paul approves
    S.press('ast_ok_' + reqId, mid);
    assert.equal(S.smart('asset').find(x => x.code === 'AOA001').location, 'Store B', 'cloud asset moved');
    await a.GC.sync.download('asset', { silent: true });
    const after = loc();
    assert.equal(after.location, 'Store B'); assert.equal(after.user, 'Nin');
    const last = after.history.at(-1);
    assert.equal(last.type, 'approved'); assert.equal(last.request.id, reqId);
    assert(after.history.some(h => h.type === 'pending' && h.request && h.request.id === reqId), 'pending entry kept');
    assert.equal(a.assetOpenRequests(after).length, 0, 'no longer pending');
    assert.equal(a.histTypeLabel('approved'), '✅ Approved'); assert.equal(a.histTypeLabel('rejected'), '❌ Rejected');
    a.setLang('km'); assert(!CJK.test(a.histTypeLabel('approved') + a.histTypeLabel('rejected') + a.describeHistory(last)), 'km labels');
    a.setLang('zh'); assert.equal(a.histTypeLabel('approved'), '✅ 已核可'); assert.equal(a.histTypeLabel('rejected'), '❌ 已退件');
    a.setLang('en');
    assert(/Approved by Paul/.test(a.describeHistory(last)));
    // disposal → Paul rejects → status unchanged, history rejected
    a.openReq('disposal', 'AOA002');
    a.document.getElementById('req-by').value = 'Jenny'; a.document.getElementById('req-distype').value = a.document.getElementById('req-distype').options[1].value; a.document.getElementById('req-reason').value = 'Broken';
    assert.equal(await a.submitReq(), true);
    const dReq = S.bodies.filter(b => b.body.action === 'telegram').at(-1).body.assetRequest;
    assert.equal(dReq.type, 'disposal');
    const dMid = Number(S.g.gcStoreRead_('GC_ASSET_REQUESTS_V1')[dReq.id].messageId);
    S.press('ast_rej_' + dReq.id, dMid);
    await a.GC.sync.download('asset', { silent: true });
    const chair = a.__configs.asset.read().find(x => x.code === 'AOA002');
    assert.equal(chair.status, 'active', 'rejected disposal keeps status');
    assert.equal(chair.history.at(-1).type, 'rejected');
    // second disposal → approve → disposed
    a.openReq('disposal', 'AOA002');
    a.document.getElementById('req-by').value = 'Jenny'; a.document.getElementById('req-distype').value = a.document.getElementById('req-distype').options[1].value; a.document.getElementById('req-reason').value = 'Broken again';
    assert.equal(await a.submitReq(), true);
    const d2 = S.bodies.filter(b => b.body.action === 'telegram').at(-1).body.assetRequest;
    S.press('ast_ok_' + d2.id, Number(S.g.gcStoreRead_('GC_ASSET_REQUESTS_V1')[d2.id].messageId));
    await a.GC.sync.download('asset', { silent: true });
    assert.equal(a.__configs.asset.read().find(x => x.code === 'AOA002').status, 'disposed', 'approved disposal → disposed');
    A.dom.window.close();
  });

  /* 3. smartCommit CAS with two phones committing concurrently */
  await section('sync CAS: two phones commit the same bucket concurrently → no rollback, no loss; altered bucket re-downloaded', async () => {
    const S = cloud();
    const master = [{ id: 'm1', key_no: 'K-01', key_name: 'Store', dept: 'GA', key_type: 'standard', status: 'active', createdAt: earlier(9), updatedAt: earlier(9) }];
    const row = (id, who, h) => ({ id, key_no: 'K-01', masterId: 'm1', dept: 'GA', recipient_name: who, issue_date: TODAY, issue_time: '08:00', status: 'out', updatedAt: earlier(h) });
    const A = await phone(S, 'ac_gascheck_keymovement_v2.html', { vrt_key_master: master, vrt_keys: [row('k1', 'Sokha', 6)] }, 'A');
    let r = await A.w.GC.sync.upload('keymovement', { silent: true }); assert(r.ok, 'seed upload');
    const B = await phone(S, 'ac_gascheck_keymovement_v2.html', { vrt_key_master: master }, 'B');
    await B.w.GC.sync.download('keymovement', { silent: true });
    const live = w => w.__configs.keymovement.read().filter(x => !x._deleted);
    assert.equal(live(B.w).length, 1);
    // both phones add a different movement in the same month bucket
    const addTo = (w, rec) => { const cfg = w.__configs.keymovement; cfg.write(cfg.read().concat([rec])); };
    addTo(A.w, row('kA', 'From A', 1));
    addTo(B.w, row('kB', 'From B', 1));
    // B commits while A is between planning (manifest) and its smartCommit
    S.hooks['A:smartCommit'] = async (body) => {
      assert(body.baseHashes && typeof body.baseHashes === 'object', 'smartCommit sends baseHashes');
      const rb = await B.w.GC.sync.upload('keymovement', { silent: true });
      assert(rb.ok, 'B commit ok');
    };
    r = await A.w.GC.sync.upload('keymovement', { silent: true });
    assert(r.ok, 'A commit ok');
    const commitRes = S.bodies.filter(b => b.phone === 'A' && b.body.action === 'smartCommit');
    assert(commitRes.length >= 1);
    const cloudIds = S.smart('keymovement').filter(x => !x._deleted && !/^master:/.test(x.id)).map(x => x.id).sort();
    assert.deepStrictEqual(cloudIds, ['k1', 'kA', 'kB'], 'cloud keeps both phones\' rows (no rollback): ' + cloudIds);
    assert(Array.isArray(r.refetched) && r.refetched.length, 'A re-downloaded the merged bucket immediately: ' + JSON.stringify(r.refetched));
    assert.deepStrictEqual(J(live(A.w).map(x => x.id).filter(x => !/^master:/.test(x)).sort()), ['k1', 'kA', 'kB'], 'phone A already has B\'s row: ' + JSON.stringify((r.list || []).map(x => x.id)) + ' live=' + JSON.stringify(live(A.w).map(x => x.id)));
    // next A sync does not re-upload (state == cloud)
    const before = S.bodies.filter(b => b.body.action === 'smartBucket').length;
    r = await A.w.GC.sync.upload('keymovement', { silent: true }); assert(r.ok);
    assert.equal(S.bodies.filter(b => b.body.action === 'smartBucket').length, before, 'no churn after merge');
    await B.w.GC.sync.download('keymovement', { silent: true });
    assert.deepStrictEqual(J(live(B.w).map(x => x.id).filter(x => !/^master:/.test(x)).sort()), ['k1', 'kA', 'kB'], 'phone B converges');
    // altered:true → the server changed our bucket (duplicate business row removed) → re-downloaded after commit
    const W = await phone(S, 'ac_gascheck_waterdrum_v2.html', {}, 'W');
    const cfgW = W.w.__configs.waterdrum;
    cfgW.write([{ date: TODAY, day: +TODAY.slice(8), fQty: 2, fPrice: 2000, fTime: '08:00', sQty: '', updatedAt: earlier(1) }]);
    const origBucket = S.g.handleGcSmartBucketPost_;
    S.g.handleGcSmartBucketPost_ = function (p) { const out = origBucket(p); out.altered = true; return out; };
    r = await W.w.GC.sync.upload('waterdrum', { silent: true });
    S.g.handleGcSmartBucketPost_ = origBucket;
    assert(r.ok && Array.isArray(r.refetched) && r.refetched.includes('m:' + YM), 'altered bucket re-downloaded: ' + JSON.stringify(r.refetched));
    [A, B, W].forEach(x => x.dom.window.close());
  });

  /* 4 + 5. lang on every request; report language defaults */
  await section('lang: every POST/GET carries UI lang (dormSubmit inside data); report language defaults to UI language', async () => {
    const S = cloud();
    const D = await phone(S, 'ac_gascheck_dormitory_v2.html', { gc_lang: 'km' }, 'D');
    const d = D.w;
    await d.gasPost({ action: 'dormSubmit', data: JSON.stringify({ id: 'x1', name: 'A' }) }).catch(() => {});
    const sub = S.bodies.filter(b => b.body.action === 'dormSubmit').at(-1).body;
    assert.equal(sub.lang, 'km'); assert.equal(JSON.parse(sub.data).lang, 'km', 'dormSubmit data carries lang');
    const dec = await d.GC.cloud.post({ action: 'dormDecision', id: 'x1' }).catch(e => e);
    assert.equal(S.bodies.filter(b => b.body.action === 'dormDecision').at(-1).body.lang, 'km');
    assert(dec && typeof dec.message === 'string' && !CJK.test(dec.message) && /Telegram/.test(dec.message), 'km error single language: ' + dec.message);
    D.dom.window.close();
    for (const [ui, expect] of [['zh', 'zh'], ['en', 'en'], ['km', 'km']]) {
      const C = await phone(S, 'ac_gascheck_cleaning_v2.html', { gc_lang: ui }, 'C' + ui);
      const w = C.w;
      w.document.querySelector('.gc-head-tools[data-gc-tool="cleaning"] [data-gc-open-tg]').onclick(); await wait(50);
      const modal = w.document.querySelector('.gc-common-modal[data-gc-tool="cleaning"]');
      assert.equal(modal.querySelector('[data-gc-lang]').value, expect, ui + ' UI → report language ' + expect);
      assert(Array.from(modal.querySelector('[data-gc-lang]').options).some(o => o.value === 'bi'), 'bilingual still selectable');
      modal.querySelector('[data-gc-lang]').value = 'bi'; modal.querySelector('[data-gc-lang]').onchange();
      modal.classList.remove('open');
      w.document.querySelector('.gc-head-tools[data-gc-tool="cleaning"] [data-gc-open-tg]').onclick(); await wait(50);
      assert.equal(modal.querySelector('[data-gc-lang]').value, 'bi', 'user choice kept when reopening');
      modal.classList.remove('open');
      await w.GC.sync.upload('cleaning', { silent: true });
      const mine = S.calls.filter(c => c.phone === 'C' + ui);
      assert(mine.length && mine.every(c => c.lang === ui), ui + ': every request carries lang ' + JSON.stringify(mine.filter(c => c.lang !== ui)));
      C.dom.window.close();
    }
    // telegram content language follows reportLanguage; errors follow UI lang
    const out = S.raw({ action: 'telegram', tool: 'asset', lang: 'zh', reportLanguage: 'en', text: 'x', assetRequest: { id: 'bad', type: 'transfer' } });
    assert(CJK.test(out.error) && !/ \/ /.test(out.error), 'zh error single language: ' + out.error);
    const e2 = S.raw({ action: 'nope', lang: 'km' });
    assert(!CJK.test(e2.error) && /[ក-៿]/.test(e2.error), 'km unknown action: ' + e2.error);
    const e3 = S.raw({ action: 'uploadPhoto', lang: 'zh', dataUrl: 'data:text/plain;base64,xx', tool: 'asset' });
    assert(CJK.test(e3.error) && !/[A-Za-z]{4,}/.test(e3.error.replace(/Drive|MB/g, '')), 'zh photo error: ' + e3.error);
    const e4 = S.raw({ action: 'dormDecision', lang: 'en' });
    assert(!CJK.test(e4.error), 'en error: ' + e4.error);
    // group reminder without request language keeps the backend group default (multi)
    S.g.GC_REQ_LANG_ = '';
    assert.equal(S.g.gcCurrentLang_(), 'multi', 'no GROUP_LANG needed');
  });

  /* 6. water blank rows */
  await section('water blank rows: not counted in stats/reminders/digest; 清理舊資料 tombstones them once', async () => {
    const S = cloud(), g = S.g;
    const rows = [
      { id: 'wdr_2026_08_1', date: '2026-08-01', fQty: 2, fPrice: 2000, fTime: '08:00', sQty: '', updatedAt: '2026-08-01 09:00:00' },
      { id: 'wdr_2026_08_2', date: '2026-08-02', fQty: '', sQty: '', fPrice: 2000, sPrice: 2000, photos: [], updatedAt: '2026-08-02 09:00:00' },
      { id: 'wdr_2026_08_3', date: '2026-08-03', fQty: '', sQty: '', fPhotos: ['https://drive.google.com/x'], updatedAt: '2026-08-03 09:00:00' }];
    assert.equal(g.gcIsWaterBlank_(rows[0]), false); assert.equal(g.gcIsWaterBlank_(rows[1]), true); assert.equal(g.gcIsWaterBlank_(rows[2]), false, 'photo row is a record');
    assert.equal(g.gcLiveRows_('waterdrum', rows).length, 2);
    // seed cloud (bucket + sheet)
    const files = S.files;
    files.set(g.gcSmartBucketName_('waterdrum', 'seed', 'm:2026-08'), JSON.stringify(rows));
    files.set(g.gcSmartManifestName_('waterdrum'), JSON.stringify({ version: 1, tool: 'waterdrum', buckets: { 'm:2026-08': { hash: 'x', count: 3, source: 'seed' } }, recordCount: 3, meta: {} }));
    g.replaceRecords_(g.getOrCreateSheet_('waterdrum'), rows);
    assert.equal(g.gcSheetLiveCount_(S.sheets.get('waterdrum'), 'waterdrum'), 2, 'status count skips blank row');
    const entries = g.waterReportEntries(rows, 'all', 'all');
    assert.deepStrictEqual(J(entries.map(e => e.date)), ['2026-08-01'], 'digest entries skip blank rows');
    const out = g['清理舊資料']();
    assert.equal(out.waterBlank.tombstoned, 1, JSON.stringify(out.waterBlank));
    const cloudRows = S.smart('waterdrum');
    assert(cloudRows.find(r => r.id === 'wdr_2026_08_2')._deleted === true, 'blank row tombstoned');
    assert(!cloudRows.find(r => r.id === 'wdr_2026_08_1')._deleted, 'real row kept');
    assert.equal(g.sheetToJson_(S.sheets.get('waterdrum')).length, 2, 'sheet row removed');
    assert.equal(g['清理舊資料']().waterBlank.skipped, true, 'one-time');
  });

  /* 7. waterdrum import merge */
  await section('waterdrum import: toolbar import merges by date (non-blank fields); old wdrImportAll merges instead of overwriting the month', async () => {
    const S = cloud();
    const W = await phone(S, 'ac_gascheck_waterdrum_v2.html', {}, 'W');
    const w = W.w, cfg = w.__configs.waterdrum;
    const schemaKeys = Object.keys(cfg.importSchema);
    assert(schemaKeys.includes('fQty') && schemaKeys.includes('sQty') && !schemaKeys.includes('reading_start'), 'water schema, not the reading table: ' + schemaKeys);
    w.saveMonthData(2026, 8, [
      { day: 1, fTime: '08:00', fQty: 3, fPrice: 2500, fTtl: 7500, sTime: '', sQty: '', sPrice: 2000, sTtl: 0, checkBy: 'Nin', note: 'keep', updatedAt: '2026-08-01 09:00:00' },
      { day: 5, fTime: '08:00', fQty: 1, fPrice: 2500, fTtl: 2500, sTime: '', sQty: '', sPrice: 2000, sTtl: 0, updatedAt: '2026-08-05 09:00:00' }]);
    const cur = cfg.read();
    const merged = w.mergeWaterSmartImport(cur, [
      { id: 'wdr_2026_08_1', date: '2026-08-01', fTime: '', fQty: '', fPrice: '', sTime: '15:30', sQty: 4, sPrice: 2000, note: '' },
      { id: 'wdr_2026_08_2', date: '2026-08-02', fTime: '08:10', fQty: 2, fPrice: 2500, sQty: '', note: '' }]);
    cfg.write(merged);
    const m = w.loadMonthDataRaw(2026, 8);
    const d1 = m.find(r => +r.day === 1), d2 = m.find(r => +r.day === 2), d5 = m.find(r => +r.day === 5);
    assert.equal(d1.fQty, 3, 'blank Excel cell keeps existing factory qty'); assert.equal(d1.sQty, 4, 'filled staff qty merged'); assert.equal(d1.note, 'keep');
    assert(d2 && d2.fQty === 2, 'new date added'); assert(d5 && d5.fQty === 1, 'other dates untouched');
    // parser: blank cells stay blank (not 0)
    // legacy "Import all" merges (was: overwrite)
    w._wdrImportResults = [{ year: 2026, month: 8, sheetName: 'Aug', rows: [{ day: 1, fTime: '', fQty: '', fPrice: '', sTime: '', sQty: '', note: '' }, { day: 7, fTime: '08:00', fQty: 5, fPrice: 2500, sQty: '', note: '' }] }];
    w.wdrImportAll();
    const m2 = w.loadMonthDataRaw(2026, 8);
    assert.equal(m2.find(r => +r.day === 1).fQty, 3, 'wdrImportAll does not wipe day 1');
    assert.equal(m2.find(r => +r.day === 1).sQty, 4);
    assert.equal(m2.find(r => +r.day === 7).fQty, 5, 'new day imported');
    assert(m2.find(r => +r.day === 5), 'day 5 kept');
    // real .xlsx through the toolbar importer
    const XLSX_SRC = path.join(__dirname, 'vendor/xlsx.full.min.js');
    w.eval(fs.readFileSync(XLSX_SRC, 'utf8'));
    const aoa = [['Water Drum Record Aug 2026'], ['Date', 'Time', 'Qty', 'Price', 'Total', 'Check', 'Supplier', 'Invoice', 'Phone', 'Time', 'Qty', 'Price', 'Total', 'Check', 'Supplier', 'Invoice', 'Phone', 'Remark'],
      [1, null, null, null, null, null, null, null, null, (15 * 60 + 30) / 1440, 6, 2000, null, 'Dara', null, null, null, null]];
    const ws = w.XLSX.utils.aoa_to_sheet(aoa), wb = w.XLSX.utils.book_new(); w.XLSX.utils.book_append_sheet(wb, ws, 'Aug');
    const buf = w.XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const modal = Array.from(w.document.querySelectorAll('.gc-common-modal[data-gc-tool="waterdrum"]')).find(x => x.querySelector('.gc-import-mount'));
    const input = modal.querySelector('.gc-import-mount input[type=file]');
    Object.defineProperty(input, 'files', { value: [new w.File([new Uint8Array(buf)], 'water.xlsx')], configurable: true });
    input.onchange({ target: input });
    const st = modal.querySelector('.gc-import-status');
    for (let i = 0; i < 80 && (!st.textContent || /busy/.test(st.className)); i++) await wait(50);
    const m3 = w.loadMonthDataRaw(2026, 8), day1 = m3.find(r => +r.day === 1);
    assert.equal(day1.fQty, 3, 'xlsx blank factory cells do not clobber: ' + st.textContent);
    assert.equal(+day1.sQty, 6, 'xlsx staff qty updated'); assert.equal(day1.sTime, '15:30');
    W.dom.window.close();
  });

  /* 8. Portal Push All keyFn */
  await section('portal Push All: uses module keyFn → no duplicate cleaning/temperature/dorm rows', async () => {
    const S = cloud();
    const C = await phone(S, 'ac_gascheck_cleaning_v2.html', {}, 'C');
    C.w.state.upsertRecords([{ id: 'c-module', date: TODAY, locId: 'loc_office', slots: ['07:30'], cleaner: 'Srey', checker: 'Nin', updatedAt: earlier(3) }], { sync: false });
    assert((await C.w.GC.sync.upload('cleaning', { silent: true })).ok);
    const P = await phone(S, 'ac_gascheck_portal_v1.html', {
      vrt_clean_hub_v2: { records: [{ id: 'c-portal-legacy', date: TODAY, locId: 'loc_office', slots: ['07:30'], cleaner: 'Srey', checker: 'Nin', updatedAt: earlier(2) }], cleaners: [], checkers: [], locations: [], slots: [] }
    }, 'P');
    const opt = P.w.portalSyncOpt(P.w.MODS.find(m => m.id === 'cleaning'));
    assert.equal(typeof opt.keyFn, 'function', 'portal passes keyFn');
    assert.equal(opt.keyFn({ date: TODAY, locId: 'loc_office', slots: ['07:30'] }), C.w.cleaningRecordKey({ date: TODAY, locId: 'loc_office', slots: ['07:30'] }), 'same key as the module');
    assert.equal(P.w.portalSyncOpt(P.w.MODS.find(m => m.id === 'temperature')).keyFn({ d: TODAY, p: 'morning', z: 'za' }), 'slot:' + TODAY + '|morning|za');
    assert.equal(typeof P.w.portalSyncOpt(P.w.MODS.find(m => m.id === 'dormitory')).keyFn, 'function');
    await P.w.pushAll(); await wait(100);
    const live = S.smart('cleaning').filter(r => !r._deleted && r.date === TODAY && r.locId === 'loc_office');
    assert.equal(live.length, 1, 'one cleaning row for the same date/location/slot: ' + JSON.stringify(live.map(r => r.id)));
    [C, P].forEach(x => x.dom.window.close());
  });

  /* 9. dorm dedupe tombstones */
  await section('dorm dedupe: removed duplicate applications leave tombstones (and do not delete the kept one)', async () => {
    const S = cloud();
    const base = { type: 'checkin', name: 'Dara', idNo: 'ID9', roomNo: 'R1', date: TODAY, reason: 'new', department: 'Sewing', status: '待審核' };
    const D = await phone(S, 'ac_gascheck_dormitory_v2.html', { vrt_dorm_hub_v2: { records: [Object.assign({ id: 'd1', updatedAt: earlier(5) }, base), Object.assign({ id: 'd2', updatedAt: earlier(4) }, base)] } }, 'D');
    const w = D.w;
    w.dedupeDormRecords(false); // also runs on boot
    assert.equal(w.state.db().records.filter(r => !r._deleted).length, 1, 'one application left');
    const recs = w.state.db().records;
    const tomb = recs.find(r => r._deleted);
    assert(tomb && ['d1', 'd2'].includes(tomb.id) && tomb.deleteReason === 'duplicate', 'tombstone left: ' + JSON.stringify(recs));
    const kept = recs.find(r => !r._deleted);
    assert.notEqual(tomb.id, kept.id);
    assert.equal(tomb._syncBucket, 'm:' + YM, 'tombstone stays in the same month bucket');
    // syncing does not let the tombstone swallow the kept application
    assert((await w.GC.sync.upload('dormitory', { silent: true })).ok);
    const cloudRows = S.smart('dormitory');
    assert(cloudRows.some(r => r.id === kept.id && !r._deleted), 'kept application in cloud');
    assert(cloudRows.some(r => r.id === tomb.id && r._deleted), 'tombstone in cloud');
    D.dom.window.close();
  });

  /* 10. en/km Excel exports: every header and cell, no CJK (user data here is ASCII) */
  await section('exports en/km: cleaning, keymovement, waterdrum — no Chinese in any header or cell', async () => {
    const ts = TODAY + ' 08:30:00', ym = TODAY.slice(0, 4) + '_' + TODAY.slice(5, 7), day = +TODAY.slice(8);
    const seeds = {
      'ac_gascheck_cleaning_v2.html': { vrt_clean_hub_v2: { records: [
        { id: 'c1', timestamp: ts, updatedAt: ts, date: TODAY, locId: 'loc_factory', shift: 'Morning', cleaner: 'Cleaner A', checker: 'Checker B', slots: ['07:30', '08:30'], checks: { smell: true, light: false, floor: true, door: true, corner: true, ceiling: true }, note: 'Light broken', photos: [], photoCount: 0 },
        { id: 'c2', timestamp: ts, updatedAt: ts, date: TODAY, locId: 'loc_toilet_a', shift: 'Afternoon', cleaner: 'Cleaner A', checker: 'Checker B', slots: ['13:30'], checks: { smell: true, light: true, floor: true, door: true, corner: true, ceiling: true }, note: '', photos: [], photoCount: 0 }],
        sixsRecords: [{ id: 's1', timestamp: ts, date: TODAY, locId: 'loc_factory', observer: 'Checker B', score: 80, data: {} }],
        bins: [{ id: 'b1', area: 'Factory', type: 'general', freq: 'daily', loc: 'Gate', resp: 'Cleaner A', last: TODAY }], cleaners: ['Cleaner A'], checkers: ['Checker B'], cfg: {} } },
      'ac_gascheck_keymovement_v2.html': {
        vrt_key_master: [{ id: 'm1', key_no: 'K-01', key_name: 'Office', key_type: 'standard', dept: 'Admin', photos: [], status: 'active', updatedAt: ts }, { id: 'm2', key_no: 'K-02', key_name: 'Store', key_type: 'padlock', dept: 'Warehouse', status: 'active' }],
        vrt_keys: [{ id: 'loan1', masterId: 'm1', key_no: 'K-01', dept: 'Admin', issue_date: TODAY, issue_time: '08:30', recipient_name: 'Phea', recipient_id: '1001', checker: 'Jenny', photos: [], return_date: TODAY, return_time: '10:00', updatedAt: ts },
          { id: 'loan2', masterId: 'm2', key_no: 'K-02', dept: 'Warehouse', issue_date: TODAY, issue_time: '07:30', recipient_name: 'Nin', recipient_id: '1002', checker: 'Jenny', photos: [], status: 'lost', updatedAt: ts }] },
      'ac_gascheck_waterdrum_v2.html': { ['wdr_' + ym]: [{ day, fQty: 3, fPrice: 3000, fTtl: 9000, fTime: '08:00', sQty: 2, sPrice: 4000, sTime: '15:30', checkBy: 'Nin', supplier: 'Aqua', invoice: 'INV1', note: 'ok', photos: [], updatedAt: ts }],
        ['wdr_cfg_' + ym]: { facPrice: 3000, staPrice: 4000, exchangeRate: 4100 } }
    };
    for (const page of Object.keys(seeds)) for (const lang of ['en', 'km']) {
      const x = await load(page, Object.assign({ gc_lang: lang }, seeds[page]));
      await wait(300);
      const w = x.w, cap = [];
      w.XLSX = { utils: { book_new: () => ({ SheetNames: [], Sheets: {} }), aoa_to_sheet: a => { cap.push(a); return {}; }, json_to_sheet: a => { cap.push(a); return {}; }, book_append_sheet() {}, sheet_add_aoa() {}, decode_range: () => ({ s: { r: 0, c: 0 }, e: { r: 0, c: 0 } }), encode_cell: () => 'A1' }, writeFile() {}, write: () => new Uint8Array(1) };
      (w.document.querySelector('.gc-head-tools [data-gc-export]') || w.document.querySelector('[data-gc-export]')).onclick();
      await wait(50);
      const cells = [];
      cap.forEach(sh => (sh || []).forEach(r => (Array.isArray(r) ? r : Object.entries(r).flat()).forEach(c => cells.push(String(c == null ? '' : c)))));
      assert(cap.length && cells.length > 10, page + ' ' + lang + ' exported something (' + cap.length + ' sheets)');
      const bad = [...new Set(cells.filter(c => CJK.test(c)))];
      assert.deepStrictEqual(bad, [], page + ' ' + lang + ' has Chinese cells: ' + JSON.stringify(bad.slice(0, 8)));
      if (lang === 'km') assert(cells.some(c => /[\u1780-\u17ff]/.test(c)), page + ' km export has Khmer headers');
      assert.deepStrictEqual(x.errors, [], page + ' ' + lang + ' no JS errors');
      x.dom.window.close();
    }
  });

  if (failures.length) { console.error('FAILED: ' + failures.join(' | ')); process.exit(1); }
  console.log('fix_contract: ALL PASS');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
