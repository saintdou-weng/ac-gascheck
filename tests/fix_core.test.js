/* fix_core: shared-core regression tests for the 2026-09 fix sprint.
   A1 multi-tab, A2 cloud-wipe guard, A3 tombstones, A4 IndexedDB failure, A5/A14 photos,
   A8 import dates, A15 timeout, A17 sync meta, B8/B9 language, C12 export, GC.guard/toast. */
process.env.TZ = 'Asia/Phnom_Penh';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const root = path.join(__dirname, '..');
const core = fs.readFileSync(path.join(root, 'gascheck-core.js'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CJK = /[㐀-鿿豈-﫿]/;
const plain = x => JSON.parse(JSON.stringify(x));
let passed = 0;
function pass(name) { passed++; console.log('PASS ' + name); }

/* ── minimal browser-less tab (same shape as the existing smart_sync test) ── */
function minimalDoc() {
  return {head:{appendChild(){}},body:null,getElementById(){return null;},querySelector(){return null;},querySelectorAll(){return[];},addEventListener(){},
    createElement(){return {classList:{add(){},remove(){},toggle(){}},setAttribute(){},appendChild(){},remove(){}};}};
}
function plainTab(sharedStore) {
  const store = sharedStore || {};
  const doc = minimalDoc();
  const ls = {getItem:k=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
  const win = Object.assign(new EventTarget(), {document:doc,localStorage:ls,crypto:crypto.webcrypto,TextEncoder,setTimeout,clearTimeout,console});
  win.window = win;
  const ctx = {window:win,document:doc,localStorage:ls,console,setTimeout,clearTimeout,URLSearchParams,Blob:function(){},URL:{createObjectURL(){return'';},revokeObjectURL(){}},TextEncoder,CustomEvent,AbortController};
  vm.createContext(ctx); vm.runInContext(core, ctx, {filename:'gascheck-core.js'});
  return {GC:win.GC, win, store};
}
/* fake GAS smart endpoints (manifest / bucket / commit / photo) */
function wire(GC, remoteRef, hooks) {
  hooks = hooks || {};
  const staged = {}, log = [];
  GC.cloud.get = async p => {
    log.push({m:'GET', a:p.action, p});
    const R = remoteRef.r;
    if (p.action === 'smartManifest') {
      if (!R) return {ok:true,data:{exists:false,legacy:false}};
      const hashes = {}, counts = {};
      for (const k in R.buckets) { hashes[k] = R.buckets[k].hash; counts[k] = R.buckets[k].count; }
      return {ok:true,data:{exists:true,hashes,counts,metaHash:R.metaHash,meta:R.meta}};
    }
    if (p.action === 'smartBucket') return {ok:true,data:JSON.parse(JSON.stringify(R.buckets[p.bucket] || {records:[]}))};
    throw new Error('unexpected GET ' + p.action);
  };
  GC.cloud.post = async (p, opt) => {
    log.push({m:'POST', a:p.action, p, opt});
    if (p.action === 'uploadPhoto') return hooks.photo ? hooks.photo(p) : {ok:true,url:'https://drive.google.com/uc?id=P' + log.length};
    if (p.action === 'smartBucket') { (staged[p.uploadId] || (staged[p.uploadId] = {}))[p.bucket] = JSON.parse(JSON.stringify({records:p.records,hash:p.hash,count:p.count})); return {ok:true,data:{}}; }
    if (p.action === 'smartCommit') {
      const R = remoteRef.r, next = {};
      for (const k in p.hashes) next[k] = (staged[p.uploadId] || {})[k] || (R && R.buckets[k]);
      remoteRef.r = {buckets:next, metaHash:p.meta._smartMetaHash, meta:p.meta};
      return {ok:true,data:{timestamp:'2026-09-29 10:00:00'}};
    }
    throw new Error('unexpected POST ' + p.action);
  };
  return log;
}
const cloudRows = remoteRef => Object.values((remoteRef.r || {buckets:{}}).buckets).flatMap(b => b.records);
const cloudCount = remoteRef => cloudRows(remoteRef).length;

/* ── fake IndexedDB + Storage + BroadcastChannel (for A1 storage / A4) ── */
function fakeWorld() {
  const dbs = {}, lsMap = new Map(), channels = {};
  const idb = {failPut:false, open(name) {
    const req = {};
    setTimeout(() => {
      const created = !dbs[name]; if (created) dbs[name] = {stores:{}};
      const d = dbs[name];
      const dbObj = {objectStoreNames:{contains:n=>!!d.stores[n]},createObjectStore(n){d.stores[n]=new Map();},close(){},
        transaction(n) {
          const store = d.stores[n], ops = [], t = {error:null}; let aborted = false;
          t.objectStore = () => ({
            put(rec){ if (idb.failPut) { aborted = true; t.error = new Error('The quota has been exceeded.'); } else ops.push(() => store.set(rec.key, Object.assign({}, rec))); return {}; },
            delete(k){ ops.push(() => store.delete(k)); return {}; },
            get(k){ const r = {}; setTimeout(() => { r.result = store.has(k) ? Object.assign({}, store.get(k)) : undefined; r.onsuccess && r.onsuccess(); }, 0); return r; },
            getAll(){ const r = {}; setTimeout(() => { r.result = Array.from(store.values()).map(x => Object.assign({}, x)); r.onsuccess && r.onsuccess(); }, 0); return r; }
          });
          setTimeout(() => { if (aborted) { (t.onabort || t.onerror || (()=>{}))(); return; } ops.forEach(f => f()); t.oncomplete && t.oncomplete(); }, 0);
          return t;
        }};
      req.result = dbObj;
      if (created && req.onupgradeneeded) req.onupgradeneeded();
      req.onsuccess && req.onsuccess();
    }, 0);
    return req;
  }};
  class BC { constructor(n){ this.n = n; (channels[n] || (channels[n] = [])).push(this); } postMessage(m){ const data = JSON.parse(JSON.stringify(m)); channels[this.n].forEach(c => { if (c !== this) setTimeout(() => c.onmessage && c.onmessage({data}), 0); }); } close(){} }
  function tab() {
    class Storage {
      getItem(k){ return lsMap.has(String(k)) ? lsMap.get(String(k)) : null; }
      setItem(k,v){ lsMap.set(String(k), String(v)); }
      removeItem(k){ lsMap.delete(String(k)); }
      key(i){ const a = Array.from(lsMap.keys()); return i < a.length ? a[i] : null; }
      get length(){ return lsMap.size; }
    }
    const ls = new Storage();
    const doc = minimalDoc();
    const toasts = [];
    const win = Object.assign(new EventTarget(), {document:doc,localStorage:ls,crypto:crypto.webcrypto,TextEncoder,setTimeout,clearTimeout,console});
    win.window = win;
    const ctx = {window:win,document:doc,localStorage:ls,Storage,indexedDB:idb,BroadcastChannel:BC,console,setTimeout,clearTimeout,URLSearchParams,TextEncoder,CustomEvent,AbortController,Blob:function(){},URL:{createObjectURL(){return'';},revokeObjectURL(){}}};
    vm.createContext(ctx); vm.runInContext(core, ctx, {filename:'gascheck-core.js'});
    win.GC.toast = (m, t, o) => { toasts.push({m, t, o}); return null; };
    doc.body = {};   // lets core call GC.toast for storage errors
    return {GC:win.GC, win, ls, toasts};
  }
  return {idb, lsMap, tab};
}

(async () => {
  /* ═════ GC.parseDate / GC.parseTime ═════ */
  {
    const {GC} = plainTab();
    const D = GC.parseDate, T = GC.parseTime;
    assert.strictEqual(D(46268), '2026-09-03', 'Excel serial (local, never one day early)');
    assert.strictEqual(D(46268.354), '2026-09-03', 'date+time serial');
    assert.strictEqual(D('46268'), '2026-09-03');
    assert.strictEqual(D('2026-09-18'), '2026-09-18');
    assert.strictEqual(D('2026/9/8'), '2026-09-08');
    assert.strictEqual(D('2026.09.08 07:30'), '2026-09-08');
    assert.strictEqual(D('18/09/2026'), '2026-09-18', 'D/M/YYYY');
    assert.strictEqual(D('08/09/2026'), '2026-09-08', 'ambiguous → day first');
    assert.strictEqual(D('09/18/2026'), '2026-09-18', 'M/D/YYYY only when day > 12');
    assert.strictEqual(D('13/13/2026'), '');
    assert.strictEqual(D('31/02/2026'), '', 'invalid day');
    assert.strictEqual(D('2026-13-01'), '', 'month > 12 rejected');
    assert.strictEqual(D(new Date(2026, 8, 18, 23, 30)), '2026-09-18');
    assert.strictEqual(D('18-Sep-2026'), '2026-09-18');
    assert.strictEqual(D('Sep 18, 2026'), '2026-09-18');
    assert.strictEqual(D('2026年9月18日'), '2026-09-18');
    assert.strictEqual(D('2026-09-17T17:00:00.000Z'), '2026-09-18', 'UTC ISO → local date');
    assert.strictEqual(D(20260918), '2026-09-18');
    assert.strictEqual(D(5), '', 'small numbers are not dates');
    ['', null, undefined, 'abc', true].forEach(v => assert.strictEqual(D(v), ''));
    assert.strictEqual(T(0.3541666667), '08:30');
    assert.strictEqual(T(46268.75), '18:00');
    assert.strictEqual(T('0.5'), '12:00');
    assert.strictEqual(T('8:05'), '08:05');
    assert.strictEqual(T('08:05:59'), '08:05');
    assert.strictEqual(T('2:30 PM'), '14:30');
    assert.strictEqual(T('12:10 am'), '00:10');
    assert.strictEqual(T('12:10 p.m.'), '12:10');
    assert.strictEqual(T('下午3:15'), '15:15');
    assert.strictEqual(T('0830'), '08:30');
    assert.strictEqual(T('25:00'), '');
    assert.strictEqual(T(46268), '', 'date-only serial has no time');
    assert.strictEqual(T(new Date(2026, 0, 1, 7, 9)), '07:09');
    assert.strictEqual(T('2026-09-18 07:45'), '07:45');
    assert.strictEqual(T('18/09/2026 16:20'), '16:20');
    assert.strictEqual(T('abc'), '');
    pass('GC.parseDate / GC.parseTime (serials, D/M vs M/D, AM/PM, ISO, invalid)');
  }

  /* ═════ A1: two tabs of the same module, stale tab uploads ═════ */
  {
    const shared = {}, remote = {r:null};
    const T1 = plainTab(shared), T2 = plainTab(shared);
    wire(T1.GC, remote); wire(T2.GC, remote);
    await sleep(5);
    const opt = {idKey:'id',dateField:'date',tsKey:'updatedAt'};
    const r1 = {id:'r1',date:'2026-09-03',v:1,updatedAt:'2026-09-03 08:00:00'};
    await T1.GC.cloud.upload('cleaning', [r1], opt);
    await T1.GC.cloud.upload('cleaning', [r1, {id:'r2',date:'2026-09-05',v:1,updatedAt:'2026-09-05 08:00:00'}], opt);
    const res = await T2.GC.cloud.upload('cleaning', [Object.assign({}, r1, {v:2,updatedAt:'2026-09-06 08:00:00'})], opt);
    const ids = cloudRows(remote).map(r => r.id + ':v' + r.v).sort();
    assert.deepStrictEqual(ids, ['r1:v2', 'r2:v1'], 'stale tab must not erase the other tab\'s record');
    assert.deepStrictEqual(plain(res.list.map(r => r.id).sort()), ['r1', 'r2'], 'stale tab receives the merged list');
    pass('A1 stale tab: foreign sync base ignored → safe merge (no lost record)');
  }

  /* ═════ A1 storage layer + A4 IndexedDB write failure ═════ */
  {
    const world = fakeWorld();
    const A = world.tab(), B = world.tab();
    assert.strictEqual(await A.GC.storage.ready, true);
    assert.strictEqual(await B.GC.storage.ready, true);
    const seen = [];
    B.win.addEventListener('gc:storagechange', e => seen.push(e.detail.keys.join(',')));
    A.ls.setItem('vrt_keys', JSON.stringify([{id:'k1'}]));
    assert.strictEqual(await A.GC.storage.flush(), true);
    await sleep(20);
    assert.strictEqual(B.ls.getItem('vrt_keys'), JSON.stringify([{id:'k1'}]), 'other tab cache refreshed from IndexedDB');
    assert(seen.includes('vrt_keys'), 'gc:storagechange fired in the other tab');
    // refresh() re-reads everything after a remote signal
    assert.strictEqual(await B.GC.storage.refresh({ifStale:true}), false, 'already current');
    // A4: put fails → returns false, red persistent toast, fallback copy restored on next open
    world.idb.failPut = true;
    const ok = await A.GC.storage.set('vrt_keys', JSON.stringify([{id:'k1'},{id:'k2'}]));
    assert.strictEqual(ok, false, 'IndexedDB write failure must return false');
    const t = A.toasts.find(x => x.t === 'error');
    assert(t && t.o && t.o.persist === true, 'persistent red toast shown');
    assert(A.GC.storage.lastError && /quota/i.test(A.GC.storage.lastError.message));
    world.idb.failPut = false;
    const C = world.tab();   // "reload"
    assert.strictEqual(await C.GC.storage.ready, true);
    assert.strictEqual(C.ls.getItem('vrt_keys'), JSON.stringify([{id:'k1'},{id:'k2'}]), 'newer fallback copy wins after reopen');
    assert.strictEqual(world.lsMap.has('ac_gc_idb_fallback_keys_v1'), false);
    // removing a main data key clears that module's sync base (A2 clear-all)
    world.lsMap.set('ac_gc_smart_sync_v1_keymovement', '{"hashes":{"m:2026-09":"x"}}');
    C.ls.removeItem('vrt_keys');
    assert.strictEqual(world.lsMap.has('ac_gc_smart_sync_v1_keymovement'), false, 'clear-all resets sync state');
    pass('A1 BroadcastChannel cache refresh + A4 write failure → false, persistent toast, fallback restore');
  }
  {
    // IndexedDB cannot open → sync states cleared (A2) and warning shown
    const world = fakeWorld();
    world.lsMap.set('ac_gc_smart_sync_v1_cleaning', '{"hashes":{"m:2026-09":"abc"}}');
    world.idb.open = () => { const req = {}; setTimeout(() => { req.error = new Error('blocked'); req.onerror && req.onerror(); }, 0); return req; };
    const X = world.tab();
    assert.strictEqual(await X.GC.storage.ready, false);
    assert.strictEqual(world.lsMap.has('ac_gc_smart_sync_v1_cleaning'), false, 'IDB fallback clears sync base');
    assert(X.toasts.some(x => x.t === 'error'), 'user told the phone database is unavailable');
    pass('A2 IndexedDB open failure clears ac_gc_smart_sync_v1_* state');
  }

  /* ═════ A2: never wipe the cloud when local was cleared ═════ */
  {
    const opt = {idKey:'id',dateField:'date',tsKey:'updatedAt',allowDeletes:true};
    const rows = [];
    for (let m = 7; m <= 9; m++) for (let d = 1; d <= 5; d++) rows.push({id:`r${m}_${d}`,date:`2026-0${m}-0${d}`,v:1,updatedAt:'2026-09-01 08:00:00'});
    const fresh = [{id:'new1',date:'2026-09-20',v:1,updatedAt:'2026-09-20 08:00:00'}];
    // Case A: reconcile (download then upload)
    let remote = {r:null}, A = plainTab(); wire(A.GC, remote);
    await A.GC.cloud.upload('cleaning', rows, opt);
    const d = await A.GC.cloud.download('cleaning', fresh, opt);
    await A.GC.cloud.upload('cleaning', d.list, opt);
    assert.strictEqual(cloudCount(remote), 16, 'download-first keeps 15 + new');
    // Case B: direct upload with only the new record → big shrink blocked, cloud kept, list restored
    remote = {r:null}; const B = plainTab(); wire(B.GC, remote);
    await B.GC.cloud.upload('cleaning', rows, opt);
    const up = await B.GC.cloud.upload('cleaning', fresh, opt);
    assert.strictEqual(cloudCount(remote), 16, 'cloud not wiped (15→1 bug)');
    assert(up.shrinkBlocked && up.shrinkBlocked.removed === 14, 'shrink reported');
    assert.strictEqual(up.list.length, 16, 'cloud rows restored to the phone');
    // Case C: local completely empty → nothing deleted
    remote = {r:null}; const Cc = plainTab(); wire(Cc.GC, remote);
    await Cc.GC.cloud.upload('cleaning', rows, opt);
    const empty = await Cc.GC.cloud.upload('cleaning', [], opt);
    assert.strictEqual(cloudCount(remote), 15, 'empty phone never deletes cloud buckets');
    assert.strictEqual(empty.list.length, 15);
    // Case D: user explicitly confirms → deletion allowed
    remote = {r:null}; const Dd = plainTab(); wire(Dd.GC, remote);
    await Dd.GC.cloud.upload('cleaning', rows, opt);
    let asked = null;
    await Dd.GC.cloud.upload('cleaning', fresh, Object.assign({}, opt, {confirmShrink:i => { asked = i; return true; }}));
    assert(asked && asked.removed === 14 && asked.total === 15);
    assert.strictEqual(cloudCount(remote), 1, 'confirmed shrink applied');
    // Case E: a small hard delete (1 row) is not blocked
    remote = {r:null}; const E = plainTab(); wire(E.GC, remote);
    await E.GC.cloud.upload('cleaning', rows, opt);
    await E.GC.cloud.upload('cleaning', rows.slice(1), opt);
    assert.strictEqual(cloudCount(remote), 14);
    pass('A2 cleared phone / 15→1 shrink: cloud kept unless user confirms; small deletes still work');
  }

  /* ═════ A3: tombstones sync, newest wins, deletion never resurrects ═════ */
  {
    const remote = {r:null};
    const A = plainTab(), B = plainTab();
    wire(A.GC, remote); wire(B.GC, remote);
    const opt = {idKey:'id',dateField:'date',tsKey:'updatedAt'};
    const base = [{id:'r1',date:'2026-09-03',v:1,photos:['https://x/1'],updatedAt:'2026-09-03 08:00:00'},{id:'r2',date:'2026-09-04',v:1,updatedAt:'2026-09-04 08:00:00'}];
    let a = (await A.GC.cloud.upload('cleaning', base, opt)).list;
    let b = (await B.GC.cloud.download('cleaning', [], opt)).list;
    a = A.GC.data.remove(a, 'r1', {reason:'user_delete'});
    const tomb = a.find(r => r.id === 'r1');
    assert(tomb._deleted && tomb.deletedAt && tomb.date === '2026-09-03' && !tomb.photos, 'tombstone keeps key fields, drops photos');
    a = (await A.GC.cloud.upload('cleaning', a, opt)).list;
    b = b.map(r => r.id === 'r2' ? Object.assign({}, r, {v:2,updatedAt:'2026-09-05 09:00:00'}) : r);
    const dl = await B.GC.cloud.download('cleaning', b, opt);
    await B.GC.cloud.upload('cleaning', dl.list, opt);
    const cloud = cloudRows(remote);
    assert(cloud.find(r => r.id === 'r1')._deleted, 'r1 stays deleted in the cloud');
    assert.deepStrictEqual(plain(B.GC.data.live(cloud).map(r => r.id + ':' + r.v)), ['r2:2']);
    // tie → tombstone wins; newer live row (re-created) wins and loses _deleted
    const live = {id:'x',date:'2026-09-01',v:1,updatedAt:'2026-09-10 10:00:00'};
    const dead = {id:'x',date:'2026-09-01',_deleted:true,deletedAt:'2026-09-10 10:00:00',updatedAt:'2026-09-10 10:00:00'};
    assert.strictEqual(A.GC.data.merge([live], [dead])[0]._deleted, true);
    assert.strictEqual(A.GC.data.merge([dead], [live])[0]._deleted, true);
    const again = A.GC.data.merge([dead], [Object.assign({}, live, {updatedAt:'2026-09-11 08:00:00'})])[0];
    assert.strictEqual(again._deleted, undefined, 'newer re-created record is live');
    assert.strictEqual(A.GC.cloud.merge([live], [dead], 'id', 'updatedAt').list[0]._deleted, true, 'legacy merge: tie → deletion');
    // prune after 90 days
    const old = new Date(Date.now() - 100 * 86400000), recent = new Date(Date.now() - 30 * 86400000);
    const ts = d => A.GC.util.ymdhms(d);
    const pr = A.GC.data.prune([{id:'o',_deleted:true,deletedAt:ts(old),updatedAt:ts(old)},{id:'n',_deleted:true,deletedAt:ts(recent),updatedAt:ts(recent)},{id:'l',updatedAt:ts(old)}]);
    assert.deepStrictEqual(plain(pr.map(r => r.id)), ['n', 'l'], 'only tombstones older than 90 days are pruned');
    // read helpers ignore tombstones
    assert.strictEqual(A.GC.period.filter([dead, live], 'all').length, 1);
    assert.strictEqual(A.GC.dash.groupBy([dead, live], r => r.date)[0].value, 1);
    pass('A3 tombstones: synced, tie → delete wins, newest wins, 90-day prune, read helpers filter');
  }

  /* ═════ A5/A14: photo failures never block; no base64 in buckets; ≤3 parallel; no duplicate Drive files ═════ */
  {
    const remote = {r:null};
    const A = plainTab();
    const photoCalls = {};
    const log = wire(A.GC, remote, {photo:p => {
      const n = p.dataUrl.slice(-4); photoCalls[n] = (photoCalls[n] || 0) + 1;
      if (p.idx === 2) throw new Error('timeout');
      return {ok:true,url:'https://drive.google.com/uc?id=' + n};
    }});
    const ph = i => 'data:image/jpeg;base64,' + String(i).repeat(1000) + 'AAA' + i;
    const rows = [{id:'wdr_2026_09_3',date:'2026-09-03',day:3,fPhotos:[ph(1),ph(2),ph(3)],updatedAt:'2026-09-03 08:00:00'}];
    let last;
    for (let i = 0; i < 2; i++) last = await A.GC.cloud.upload('waterdrum', rows, {idKey:'id',dateField:'date',allowDeletes:true});
    const bucketRecs = cloudRows(remote);
    assert.strictEqual(bucketRecs.length, 1, 'module synced despite a failed photo');
    assert(!JSON.stringify(log.filter(x => x.a === 'smartBucket').map(x => x.p.records)).includes('data:image'), 'no base64 inside buckets');
    assert.strictEqual(bucketRecs[0].fPhotos.length, 2);
    assert.strictEqual(last.photoFailures.length, 1);
    assert(last.list[0].fPhotos.some(p => p.indexOf('data:image') === 0), 'failed photo kept on the phone');
    assert.strictEqual(photoCalls.AAA1, 1, 'successful photo uploaded once across syncs');
    assert.strictEqual(photoCalls.AAA2, 1);
    assert.strictEqual(photoCalls.AAA3, 6, 'failed photo retried 3× per sync');
    const photoPosts = log.filter(x => x.a === 'uploadPhoto');
    assert(photoPosts.every(x => x.opt && x.opt.timeout >= 60000 && x.p.photoKey), 'photo upload carries timeout + dedupe key');
    // concurrency
    const B = plainTab(); let inflight = 0, max = 0;
    wire(B.GC, {r:null}, {photo:async () => { inflight++; max = Math.max(max, inflight); await sleep(15); inflight--; return {ok:true,url:'https://d/' + Math.random()}; }});
    const many = []; for (let i = 0; i < 20; i++) many.push({id:'c' + i,date:'2026-09-0' + (1 + i % 9),photos:['data:image/jpeg;base64,A' + i,'data:image/jpeg;base64,B' + i]});
    await B.GC.cloud.upload('cleaning', many, {idKey:'id',dateField:'date',allowDeletes:true});
    assert(max <= 3 && max >= 2, 'max parallel photo uploads ' + max);
    pass('A5/A14 photos: per-photo skip + retry, link cache, never base64 in bucket, ≤3 parallel');
  }

  /* ═════ A15: fetch timeout ═════ */
  {
    const {GC, win} = plainTab();
    win.fetch = () => new Promise(() => {});
    const t0 = Date.now();
    await assert.rejects(() => GC.fetch('https://x', {}, 60), e => e.timeout === true);
    assert(Date.now() - t0 < 1000);
    await assert.rejects(() => GC.cloud.post({action:'x'}, {timeout:40}), e => e.timeout === true);
    pass('A15 cloud fetch aborts after timeout (no stuck "syncing")');
  }

  /* ═════ A17: sync meta = business settings only ═════ */
  {
    const remote = {r:null}, {GC} = plainTab(); const log = wire(GC, remote);
    const rows = [{id:'a',date:'2026-09-01',updatedAt:'2026-09-01 08:00:00'}];
    await GC.cloud.upload('cleaning', rows, {idKey:'id',dateField:'date',extra:{cleaners:['A'],reportRef:'2026-09-01',reportPeriod:'month'}});
    const commit = log.find(x => x.a === 'smartCommit').p;
    assert(!('reportRef' in commit) && !('reportPeriod' in commit) && !('reportRef' in commit.meta), 'no report fields in commit/meta');
    assert.deepStrictEqual(plain(commit.meta.cleaners), ['A']);
    log.length = 0;
    const second = await GC.cloud.upload('cleaning', rows, {idKey:'id',dateField:'date',extra:{cleaners:['A'],reportRef:'2026-09-30'}});
    assert(second.skipped && !log.some(x => x.a === 'smartCommit'), 'changing the report period does not commit');
    pass('A17 smartCommit meta excludes report period/ref');
  }

  /* ═════ I18 fallback, GC.L, gc.approval km, GC.guard ═════ */
  {
    const {GC} = plainTab();
    GC.i18n.extend({zh:{'x.onlyzh':'只有中文'},en:{'x.both':'Both'}});
    GC.i18n.lang = 'en';
    assert.strictEqual(GC.t('x.onlyzh'), 'x.onlyzh', 'en never falls back to Chinese');
    assert.strictEqual(GC.t('x.onlyzh', 'Fallback'), 'Fallback');
    GC.i18n.lang = 'km';
    assert.strictEqual(GC.t('x.both'), 'Both', 'km → en');
    assert.strictEqual(GC.t('x.onlyzh'), 'x.onlyzh');
    assert.strictEqual(GC.t('gc.approval'), 'អនុម័ត');
    assert.strictEqual(GC.tf('gc.pageFailed', {i:2, n:3}), 'ទំព័រ 2/3 មិនទាន់ផ្ញើ');
    assert.strictEqual(GC.L('中', 'EN'), 'EN');
    GC.i18n.lang = 'zh';
    assert.strictEqual(GC.t('x.both'), 'Both', 'zh → en when missing');
    ['en', 'km'].forEach(l => {
      GC.i18n.lang = l;
      Object.keys(GC.i18n.dict.zh).forEach(k => assert(!CJK.test(GC.t(k)), l + ' leaks Chinese for ' + k));
      assert(!CJK.test(GC.telegram.buttonText('dashboard', l)) && !CJK.test(GC.telegram.buttonText('portal', l)), 'Telegram buttons ' + l);
    });
    assert.strictEqual(GC.telegram.buttonText('dashboard', 'en'), '📊 Open Dashboard');
    assert(GC.telegram.buttonText('portal', 'bi').includes('總平台') && GC.telegram.buttonText('portal', 'bi').includes('Main Portal'));
    // GC.guard
    let calls = 0, release;
    const fn = () => { calls++; return new Promise(r => { release = r; }); };
    const p1 = GC.guard('save', fn), p2 = GC.guard('save', fn);
    assert.strictEqual(p1, p2); assert.strictEqual(calls, 1); assert(GC.guard.busy('save'));
    release('done'); assert.strictEqual(await p1, 'done');
    await sleep(0);
    assert(!GC.guard.busy('save'));
    await GC.guard('save', () => 1); assert.strictEqual(calls, 1);
    await assert.rejects(() => GC.guard('boom', () => { throw new Error('x'); }), /x/);
    assert(!GC.guard.busy('boom'));
    pass('B9/I18 fallback never shows Chinese in en/km; B8 Telegram buttons per language; GC.guard');
  }

  /* ═════ jsdom: toast, cloud status text, Telegram modal, import, export ═════ */
  {
    const {JSDOM, VirtualConsole} = require('jsdom');
    const vc = new VirtualConsole(); const errors = [];
    vc.on('jsdomError', e => { if (!/Not implemented/.test(e.message)) errors.push(e.stack); });
    const dom = new JSDOM('<!doctype html><html><head></head><body><div class="topbar">Top</div><main class="main"></main></body></html>',
      {url:'https://local.test/fix.html', runScripts:'outside-only', pretendToBeVisual:true, virtualConsole:vc});
    const w = dom.window;
    w.confirm = () => true; w.alert = () => {};
    w.fetch = async () => ({ok:true,status:200,text:async () => JSON.stringify({ok:false,error:'offline test'})});
    w.eval(core);
    const GC = w.GC;
    // toast
    GC.toast('boom', 'error');
    const css = w.document.getElementById('gc-core-css').textContent;
    assert(/\.gc-toast-box\{position:fixed;top:/.test(css), 'toasts at top');
    let acted = 0;
    GC.toast('info', 'success', {label:'Undo', fn:() => acted++});
    GC.toast('boom', 'error');   // deduped
    let box = w.document.getElementById('gc-toast-box');
    assert.strictEqual(box.querySelectorAll('.gc-toast.error').length, 1);
    box.querySelector('.gc-toast-act').click();
    assert.strictEqual(acted, 1);
    await sleep(3200);
    const err = box.querySelector('.gc-toast.error');
    assert(err && !err.classList.contains('out'), 'error toast persists until tapped');
    err.click(); await sleep(350);
    assert.strictEqual(box.querySelectorAll('.gc-toast.error').length, 0);
    // attach a key-movement-like module
    const list = [
      {id:'k1',key_no:'K1',issue_date:'2026-09-03',issue_time:'08:30',dept:'Office',photos:['data:image/png;base64,AAAA'],updatedAt:'2026-09-03 08:30:00'},
      {id:'k2',key_no:'K2',issue_date:'2026-09-03',issue_time:'09:00',dept:'Office',_deleted:true,deletedAt:'2026-09-04 08:00:00',updatedAt:'2026-09-04 08:00:00'}
    ];
    let exportCols = null;
    const cfg = {tool:'keymovement', exportColumns:() => exportCols, dateField:'issue_date', idField:'id', groupField:'dept', photo:true, telegramLanguage:true,
      importSchema:{key_no:['key no','code'],dept:['dept'],issue_date:['date'],issue_time:['time']},
      read:() => list.slice(), write:l => { list.length = 0; l.forEach(x => list.push(x)); }};
    GC.attach(cfg);
    await sleep(30);
    const doc = w.document;
    const short = doc.querySelector('.gc-cloud-state .gc-state-short');
    assert(short && short.textContent.trim().length > 1, 'cloud status is text, not a lone dot');
    const modal = doc.querySelector('.gc-common-modal[data-gc-tool=keymovement]');
    assert(modal.querySelector('[data-gc-mode=approval]').hidden, 'approval option hidden for summary-only modules');
    assert(!modal.querySelector('[data-gc-mode=review]').hidden);
    GC.i18n.set('en');
    doc.querySelector('[data-gc-open-tg]').onclick();
    await sleep(40);
    assert.strictEqual(modal.querySelector('[data-gc-lang]').value, 'en', 'report language follows the UI language');
    const preview = modal.querySelector('[data-gc-preview]').textContent;
    assert(preview.includes('VRT Key Management') && !CJK.test(preview), 'English preview has no Chinese: ' + preview);
    assert(!CJK.test(Array.from(modal.querySelectorAll('option')).map(o => o.textContent).join('|')), 'no Chinese options in en');
    GC.i18n.set('km');
    await sleep(40);
    assert.strictEqual(modal.querySelector('[data-gc-lang]').value, 'km');
    assert(!CJK.test(modal.querySelector('[data-gc-preview]').textContent), 'km preview has no Chinese');
    assert(!CJK.test(doc.querySelector('.gc-cloud-state').textContent), 'km cloud status has no Chinese');
    // export: live rows only, per-language headers, photos not base64
    let aoa = null;
    w.XLSX = {utils:{book_new:() => ({}), aoa_to_sheet:a => { aoa = a; return {}; }, json_to_sheet:() => { throw new Error('json_to_sheet should not be used'); }, book_append_sheet(){}}, writeFile(){}};
    exportCols = [{key:'key_no', zh:'鑰匙編號', en:'Key No.', km:'លេខសោ'}, {key:'issue_date', zh:'日期', en:'Date', km:'កាលបរិច្ឆេទ'}, {key:'photos', zh:'照片', en:'Photos', km:'រូបថត'}];
    doc.querySelector('[data-gc-export]').onclick();
    assert.deepStrictEqual(plain(aoa[0]), ['លេខសោ', 'កាលបរិច្ឆេទ', 'រូបថត']);
    assert.strictEqual(aoa.length, 2, 'deleted record excluded from export');
    assert.strictEqual(aoa[1][2], '[រូបថត]');
    exportCols = null;
    GC.i18n.set('en');
    doc.querySelector('[data-gc-export]').onclick();
    assert(!aoa[0].some(h => /^_/.test(h)) && !JSON.stringify(aoa).includes('data:image'), 'default export hides internal fields/base64');
    // smart import: serial dates/times converted, re-import deduped
    const sheet = [['Key No', 'Dept', 'Date', 'Time'], ['K9', 'Store', 46268, 0.3541666667], ['K10', 'Store', '18/09/2026', '2:30 PM']];
    w.XLSX.read = () => ({SheetNames:['S'], Sheets:{S:{}}});
    w.XLSX.utils.sheet_to_json = () => sheet.map(r => r.slice());
    const input = doc.querySelector('.gc-common-modal .gc-import-mount input[type=file]');
    const feed = async () => {
      Object.defineProperty(input, 'files', {value:[new w.File(['x'], 'keys.xlsx')], configurable:true});
      input.dispatchEvent(new w.Event('change'));
      await sleep(80);
    };
    await feed();
    const k9 = list.find(r => r.key_no === 'K9'), k10 = list.find(r => r.key_no === 'K10');
    assert.strictEqual(k9.issue_date, '2026-09-03'); assert.strictEqual(k9.issue_time, '08:30');
    assert.strictEqual(k10.issue_date, '2026-09-18'); assert.strictEqual(k10.issue_time, '14:30');
    const n = list.length;
    await feed();
    assert.strictEqual(list.length, n, 're-import does not duplicate (key_no+date+time)');
    assert(/duplicates skipped/.test(doc.querySelector('.gc-common-modal .gc-import-status').textContent));
    // Telegram send uses per-language buttons
    const posts = [];
    GC.cloud.post = async p => { posts.push(p); return {ok:true,messageId:5}; };
    await GC.telegram.send('<b>x</b>', [], [], 'chat', 'keymovement', {reportLanguage:'en'});
    assert(posts[0].buttons.flat().every(b => !CJK.test(b.text)), 'English report buttons');
    assert.deepStrictEqual(errors, []);
    dom.window.close();
    pass('UX core: top toasts (errors persist, action), text cloud status, modal language/approval, C12 export, A8 import');
  }

  console.log(passed + ' fix_core groups passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
