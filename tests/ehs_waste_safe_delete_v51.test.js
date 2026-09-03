const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const ehs = fs.readFileSync(path.join(root, 'ac_gascheck_ehs_v2.html'), 'utf8');
const core = fs.readFileSync(path.join(root, 'gascheck-core.js'), 'utf8');
const gs = fs.readFileSync(path.join(root, 'ac_gascheck_core_v3_fixed.gs'), 'utf8');

const start = ehs.indexOf('/* v51 Waste 防重複／刪除保護');
const end = ehs.indexOf('async function submitModB()', start);
assert(start >= 0 && end > start, 'v51 Waste logic block must exist');

const context = {
  console,
  Set,
  Map,
  Date,
  navigator: { onLine: true },
  document: {
    querySelectorAll: () => [],
    getElementById: () => null
  },
  localStorage: {
    data: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this.data, k) ? this.data[k] : null; },
    setItem(k, v) { this.data[k] = String(v); }
  },
  ehsYmd(v) {
    const m = String(v || '').match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    return m ? m[1] + '-' + String(+m[2]).padStart(2, '0') + '-' + String(+m[3]).padStart(2, '0') : '';
  },
  kgNumber(v) {
    const m = String(v == null ? '' : v).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return m ? +m[0] : 0;
  },
  photoArray(v) { return Array.isArray(v) ? v : (v ? [v] : []); },
  _localTS() { return '2026-09-03 12:00:00'; },
  showToast() {},
  ehsText(a) { return a; },
  refreshEhsAll() {},
  setTimeout() {},
  gasPost: async () => ({ ok: true })
};
context.calcDuration = function (a, b) {
  const x = context.ehsWasteTimeMinutes(a), y = context.ehsWasteTimeMinutes(b);
  return x == null || y == null || y <= x ? null : y - x;
};
vm.createContext(context);
vm.runInContext(ehs.slice(start, end), context);

assert.strictEqual(context.ehsWasteTimeKey('15:06pm'), '15:06', 'legacy 24-hour values with pm suffix must normalize');
assert.strictEqual(context.ehsWasteTimeKey('03:06pm'), '15:06');
assert.strictEqual(context.ehsWasteTimeIssue({ time_in: '15:06pm', time_out: '15:28pm' }), '');
assert.strictEqual(context.ehsWasteTimeIssue({ time_in: '15:28', time_out: '15:06' }), 'time_out');

const exact = context.ehsConsolidateWasteRows([
  { id:'no-photo', module:'gate', sourceType:'waste', date:'2026-08-25', supplier:'SONYAPICH', weight_kg:300, time_in:'10:16am', time_out:'10:23am', checked_by:'Phan Lyda', photos:[], updatedAt:'2026-08-25 11:00:00' },
  { id:'photo', module:'gate', sourceType:'waste', date:'2026-08-25', supplier:'SONYAPICH', weight_kg:300, time_in:'10:16', time_out:'10:23', checked_by:'SreyOun', photos:['photo.jpg'], updatedAt:'2026-08-25 10:30:00' }
]);
assert.strictEqual(exact.rows.length, 1, 'exact duplicate must count once');
assert.strictEqual(exact.rows[0].id, 'photo', 'photo-backed record must win');
assert.strictEqual(exact.rows[0].duration_min, 7);
assert.deepStrictEqual(Array.from(exact.rows[0].photos), ['photo.jpg']);
assert.strictEqual(exact.removed[0].row.id, 'no-photo');

const mismatch = context.ehsConsolidateWasteRows([
  { id:'shadow', module:'gate', sourceType:'waste', date:'2026-08-22', supplier:'K.S.W.M', weight_kg:300, time_in:'15:06pm', time_out:'', photos:[] },
  { id:'proof', module:'gate', sourceType:'waste', date:'2026-08-22', supplier:'K.S.W.M', weight_kg:300, time_in:'15:06', time_out:'15:28', photos:['proof.jpg'] }
]);
assert.strictEqual(mismatch.rows.length, 1, 'no-photo time-mismatch shadow must be removed');
assert.strictEqual(mismatch.rows[0].id, 'proof');

const legitimate = context.ehsConsolidateWasteRows([
  { id:'a', module:'gate', sourceType:'waste', date:'2026-08-22', supplier:'K.S.W.M', weight_kg:300, time_in:'15:06', time_out:'15:20', photos:['a.jpg'] },
  { id:'b', module:'gate', sourceType:'waste', date:'2026-08-22', supplier:'K.S.W.M', weight_kg:300, time_in:'15:06', time_out:'15:28', photos:['b.jpg'] }
]);
assert.strictEqual(legitimate.rows.length, 2, 'two photo-backed records with different Time Out need manual review');

const prepared = context.ehsPrepareLocalData({ gate:[
  { id:'x', module:'gate', sourceType:'waste', date:'2026-08-18', supplier:'K.S.W.M', weight_kg:500, time_in:'10:52am', time_out:'11:41am', photos:[] },
  { id:'y', module:'gate', sourceType:'waste', date:'2026-08-18', supplier:'K.S.W.M', weight_kg:500, time_in:'10:52', time_out:'11:41', photos:['y.jpg'] }
], internal:[], monthly:[], tombstones:[] });
assert.strictEqual(prepared.data.gate.length, 1);
assert.strictEqual(prepared.data.gate[0].duration_min, 49);
assert.strictEqual(prepared.data.tombstones.length, 1, 'removed duplicate must create a pending cloud tombstone');
assert.strictEqual(prepared.data.tombstones[0].id, 'x');

const gsStart = gs.indexOf('/* EHS Waste 的跨裝置內容指紋');
const gsEnd = gs.indexOf('function readGcSmartManifest_', gsStart);
assert(gsStart >= 0 && gsEnd > gsStart, 'GAS EHS duplicate block must exist');
const gasContext = {
  console,
  Set,
  Map,
  Date,
  isFinite,
  CFG:{ TZ:'Asia/Phnom_Penh', ID_FIELD:'id' },
  Utilities:{ formatDate(){ return '2026-08-25'; } },
  nowStr_(){ return '2026-09-03 12:00:00'; },
  filterGcDeletedRecords_(_tool, rows){ return rows; },
  markGcDeletedRecords_(){ return {marked:0}; }
};
vm.createContext(gasContext);
vm.runInContext(gs.slice(gsStart, gsEnd), gasContext);
const gasClean = gasContext.dedupeEhsWasteRecords_([
  { id:'cloud-shadow', module:'gate', sourceType:'waste', date:'2026-08-25', supplier:'SONYAPICH', weight_kg:300, time_in:'10:16am', time_out:'10:23am', photos:[] },
  { id:'cloud-proof', module:'gate', sourceType:'waste', date:'2026-08-25', supplier:'SONYAPICH', weight_kg:300, time_in:'10:16', time_out:'10:23', photos:['cloud.jpg'] }
]);
assert.strictEqual(gasClean.rows.length, 1, 'GAS must deduplicate across device-specific IDs');
assert.strictEqual(gasClean.rows[0].id, 'cloud-proof');
assert.strictEqual(gasClean.removed[0].row.id, 'cloud-shadow');

assert(ehs.includes('deleteSelectedWaste()'), 'multi-select delete action must be visible');
assert(ehs.includes("selectWasteRows('noPhoto')"), 'no-photo selector must exist');
assert(ehs.includes("selectWasteRows('badTime')"), 'invalid-time selector must exist');
assert(ehs.includes('beforeCloudSync:function(){return ehsFlushTombstones'), 'cloud pull/upload must flush deletions first');
assert(core.includes("await opt.beforeSync({direction:'upload'"), 'core upload must run deletion preflight');
assert(core.includes("await opt.beforeSync({direction:'download'"), 'core download must run deletion preflight');
assert(gs.includes("case 'deleteBatch'"), 'GAS must expose batch delete');
assert(gs.includes('markGcDeletedRecords_'), 'GAS must persist a deletion registry');
assert(gs.includes('cleanupEhsWasteDuplicates'), 'GAS must provide one-time cleanup');
assert(gs.includes('dedupeEhsWasteRecords_'), 'GAS must reject content duplicates across senders/devices');
assert(gs.includes('next[k]={hash:actualHash,count:rows.length,source:uploadId}'), 'GAS manifest must use filtered bucket hash/count, including uploads from older clients');
assert(gs.includes("rows=sanitizeGcRecords_(tool,Array.isArray(rows)?rows:[],'smart_commit_waste_duplicate').rows"), 'smart commit must recheck deletion registry after a concurrent delete');
assert(gs.includes('recordCount:Object.keys(next).reduce'), 'smart manifest record count must be calculated from committed buckets');

console.log('v51 EHS Waste duplicate, time, batch-delete and latest-sync tests passed');
