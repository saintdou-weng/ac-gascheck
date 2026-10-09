/* fix_busy_0930: 2026-09-30 incident — EHS "Cloud upload failed; report not sent: pending cloud deletes: 3".
   Cause: 40–60 s client timeouts + immediate retries while the Apps Script server was still working →
   requests queued on the script lock (doPost 30–110 s every ~40 s) → legacy delete got "busy" → Telegram blocked.
   Guards: writes wait for the server (330 s), no re-send after a timeout, busy → long back-off,
   EHS legacy delete never blocks upload/Telegram, backend delete is instant when already deleted,
   orphan triggers (pollTelegramUpdates) are removed. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const root = path.join(__dirname, '..');
const core = fs.readFileSync(path.join(root, 'gascheck-core.js'), 'utf8');
const gs = fs.readFileSync(path.join(root, 'ac_gascheck_core_v3_fixed.gs'), 'utf8');
const ehs = fs.readFileSync(path.join(root, 'ac_gascheck_ehs_v2.html'), 'utf8');
let passed = 0; const pass = n => { passed++; console.log('PASS ' + n); };

function tab() {
  const store = {};
  const doc = {head:{appendChild(){}},body:null,getElementById(){return null;},querySelector(){return null;},querySelectorAll(){return[];},addEventListener(){},
    createElement(){return {classList:{add(){},remove(){},toggle(){}},setAttribute(){},appendChild(){},remove(){}};}};
  const ls = {getItem:k=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
  const win = Object.assign(new EventTarget(), {document:doc,localStorage:ls,crypto:crypto.webcrypto,TextEncoder,setTimeout,clearTimeout,console});
  win.window = win;
  const ctx = {window:win,document:doc,localStorage:ls,console,setTimeout,clearTimeout,URLSearchParams,Blob:function(){},URL:{createObjectURL(){return'';},revokeObjectURL(){}},TextEncoder,CustomEvent,AbortController};
  vm.createContext(ctx); vm.runInContext(core, ctx, {filename:'gascheck-core.js'});
  return {GC:win.GC, win, ctx};
}

(async () => {
  /* 1. CLOUD.post waits for the server by default (no 40 s abort). */
  {
    const {GC, win, ctx} = tab();
    const timers = [];
    win.fetch = () => Promise.resolve({ok:true,status:200,text:async()=>'{"ok":true}'});
    const orig = ctx.setTimeout;
    ctx.setTimeout = function (fn, ms) { timers.push(ms); return orig(fn, ms > 1000 ? 10 ** 9 : ms); };
    try { await GC.cloud.post({action:'ping'}); } finally { ctx.setTimeout = orig; }
    assert(timers.some(ms => ms >= 300000), 'default POST timeout must be ≥300 s, got ' + JSON.stringify(timers));
    pass('POST requests wait for the server (≥300 s) instead of aborting at 40–60 s');
  }

  /* 2. A timed-out smartCommit is NOT re-sent immediately (server may still be saving). */
  {
    const {GC} = tab();
    let remote = null; const calls = {bucket:0, commit:0}; const staged = {};
    GC.cloud.get = async p => {
      if (p.action === 'smartManifest') return remote ? {ok:true,data:{exists:true,hashes:Object.fromEntries(Object.entries(remote.buckets).map(([k,b])=>[k,b.hash])),counts:{},metaHash:'',meta:{}}} : {ok:true,data:{exists:false,legacy:false}};
      if (p.action === 'smartBucket') return {ok:true,data:{records:[]}};
      return {ok:true,data:{}};
    };
    GC.cloud.post = async (p) => {
      if (p.action === 'smartBucket') { calls.bucket++; staged[p.bucket] = p; return {ok:true,data:{}}; }
      if (p.action === 'smartCommit') { calls.commit++; const e = new Error('Cloud request timed out; please retry'); e.timeout = true; e.code = 'TIMEOUT'; throw e; }
      return {ok:true};
    };
    let err = null;
    try { await GC.smartSync.upload('cleaning', [{id:'a1',date:'2026-09-30',updatedAt:'2026-09-30 10:00:00'}], {}); } catch (e) { err = e; }
    assert(err && err.timeout, 'timeout surfaces to the caller');
    assert.strictEqual(calls.commit, 1, 'smartCommit sent exactly once after a timeout (was 3 back-to-back)');
    pass('timed-out writes are not re-sent back-to-back (no pile-up on the script lock)');
  }

  /* 3. "busy" answers back off (≥8 s) instead of 0.3 s hammering. */
  {
    const src = core;
    assert(/busy\|鎖\|忙\/i\.test\(String\(e && e\.message \|\| ''\)\) \? 8000 : 300/.test(src), 'retryNetwork busy back-off');
    assert(/120000 \* Math\.pow\(2, Math\.min\(retryCount - 1, 2\)\)/.test(src), 'auto-sync retry after busy/timeout waits 2–8 min');
    assert(/\[60000,120000,300000,600000,900000\]/.test(src), 'photo retry backs off 1→15 min');
    pass('busy/timeout back-off: 8 s in-call, 2–8 min between auto-sync rounds, photo retry 1–15 min');
  }

  /* 4. EHS: a failing legacy delete never blocks upload / Telegram; timeouts don't fan out to per-id deletes. */
  {
    const m = ehs.match(/beforeCloudSync:function\(\)\{[\s\S]*?\n\s*\},/);
    assert(m && /ehsFlushTombstones\(\{silent:true\}\)\.catch/.test(m[0]), 'beforeCloudSync swallows flush errors');
    const fn = new Function('ehsFlushTombstones', 'return {' + m[0].replace(/,\s*$/, '') + '};')(async () => { throw new Error('pending cloud deletes: 3'); });
    const r = await fn.beforeCloudSync();
    assert(r && r.deferred, 'flush failure is deferred, not thrown');
    assert(/batchErr\.timeout\|\|\/busy\|retry\|timed out\|逾時\/i/.test(ehs), 'no per-id fan-out after batch timeout/busy');
    const tombRead = /function ehsCloudReadAll\(\)\{[\s\S]*?tombstones[\s\S]*?_deleted:true/.test(ehs);
    assert(tombRead, 'deleted EHS rows still travel to the cloud through smart sync (no resurrection)');
    pass('EHS: legacy cloud delete is best-effort; deletions still sync as tombstones; Telegram not blocked');
  }

  /* 5. Backend: deleteBatch for ids already deleted returns instantly without taking the lock. */
  {
    const props = {}; let lockTaken = 0; const deletedReg = {version:1,tool:'ehs',ids:{a:{deletedAt:'x'},b:{deletedAt:'x'}}};
    const ctx = {console, Logger:{log(){}}, PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=v;},deleteProperty(){},getProperties:()=>props})},
      LockService:{getScriptLock:()=>({tryLock(){lockTaken++;return true;},waitLock(){lockTaken++;},releaseLock(){}})},
      Utilities:{formatDate:()=>'2026-09-30 15:00:00',getUuid:()=>'u',computeDigest:()=>[],DigestAlgorithm:{},Charset:{},base64Encode:()=>''},
      ScriptApp:{getProjectTriggers:()=>[],deleteTrigger(){}}, CacheService:{getScriptCache:()=>({get(){return null;},put(){}})},
      DriveApp:{getFoldersByName:()=>({hasNext:()=>false}),createFolder:()=>({})}, SpreadsheetApp:{openById:()=>{throw new Error('sheet should not be touched');}},
      UrlFetchApp:{fetch(){throw new Error('no network');}}, ContentService:{MimeType:{JSON:'json'},createTextOutput:t=>({setMimeType(){return this;},getContent:()=>t})}, HtmlService:{}, MimeType:{} };
    vm.createContext(ctx); vm.runInContext(gs, ctx);
    ctx.readGcDeletedRegistry_ = () => deletedReg;
    const out = ctx.handleDeleteBatch_('ehs', ['a', 'b']);
    assert(out.ok && out.already, 'already-deleted ids short-circuit');
    assert.strictEqual(lockTaken, 0, 'no script lock taken for repeat deletes');
    pass('backend: repeated delete of already-deleted ids is instant and lock-free');

    /* 6. orphan trigger cleanup removes handlers that no longer exist (pollTelegramUpdates). */
    const removed = []; const trig = n => ({getHandlerFunction:()=>n});
    ctx.ScriptApp = {getProjectTriggers:()=>[trig('pollTelegramUpdates'), trig('monthlyMissingReportReminder')], deleteTrigger:t=>removed.push(t.getHandlerFunction())};
    const r = ctx.gcRemoveOrphanTriggers_();
    assert.deepStrictEqual(removed, ['pollTelegramUpdates'], 'only the orphan trigger is removed: ' + JSON.stringify(removed));
    assert(/function 更新部署連線\(\)\{\n?\r?\n?\s*try\{gcRemoveOrphanTriggers_\(\);\}catch\(e\)\{\}/.test(gs), '更新部署連線 cleans orphan triggers');
    pass('orphan trigger pollTelegramUpdates (failing every minute) is removed; live triggers kept');
  }

  console.log('fix_busy_0930: ' + passed + ' checks passed');
})().catch(e => { console.error('FAIL', e && e.stack || e); process.exit(1); });
