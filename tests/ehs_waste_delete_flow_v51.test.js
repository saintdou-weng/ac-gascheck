const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const ehs = fs.readFileSync(path.join(root, 'ac_gascheck_ehs_v2.html'), 'utf8');
const gs = fs.readFileSync(path.join(root, 'ac_gascheck_core_v3_fixed.gs'), 'utf8');

const logicStart = ehs.indexOf('/* v51 Waste 防重複／刪除保護');
const logicEnd = ehs.indexOf('async function submitModB()', logicStart);
const localStore = { gate:[], internal:[], monthly:[], tombstones:[{id:'deleted-1',module:'gate',date:'2026-08-25'}] };
const calls = [];
const browser = {
  console,
  Set,
  Map,
  Date,
  navigator:{onLine:true},
  document:{querySelectorAll:()=>[],getElementById:()=>null},
  ehsViewState:{gate:[]},
  ehsYmd:v=>String(v||'').slice(0,10),
  kgNumber:v=>Number(v)||0,
  photoArray:v=>Array.isArray(v)?v:(v?[v]:[]),
  _localTS:()=> '2026-09-03 12:00:00',
  calcDuration:()=>null,
  showToast(){},
  ehsText:a=>a,
  refreshEhsAll(){},
  setTimeout(){},
  loadLocal(){return JSON.parse(JSON.stringify(localStore));},
  saveLocal(next){Object.keys(localStore).forEach(k=>delete localStore[k]);Object.assign(localStore,JSON.parse(JSON.stringify(next)));return {data:next,removed:[]};},
  GC:{cloud:{post:async payload=>{calls.push(payload);return {ok:true,deleted:(payload.ids||[]).length};}}}
};
vm.createContext(browser);
vm.runInContext(ehs.slice(logicStart, logicEnd), browser);

const deleteStart = gs.indexOf('function handleDelete_(tool, id)');
const deleteEnd = gs.indexOf('function getTemperatureZones_()', deleteStart);
assert(deleteStart >= 0 && deleteEnd > deleteStart);
const sheet = {
  rows:[{id:'a'},{id:'b'},{id:'c'}],
  getLastColumn(){return 1;},
  getRange(){return {getValues:()=>[['id']],setValues(){return this;},setBackground(){return this;},setFontColor(){return this;},setFontWeight(){return this;}};},
  clear(){this.rows=[];},
  setFrozenRows(){}
};
const marked = [], smart = [];
const gas = {
  console,
  Set,
  Map,
  Array,
  JSON,
  CFG:{MODULES:['ehs'],ID_FIELD:'id'},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
  getOrCreateSheet_:()=>sheet,
  sheetToJson_:()=>sheet.rows.slice(),
  replaceRecords_:(_sheet,rows)=>{sheet.rows=rows.slice();return {total:rows.length};},
  markGcDeletedRecords_:(_tool,ids)=>{marked.push(...ids);return {marked:ids.length};},
  deleteGcSmartRecords_:(_tool,ids)=>{smart.push(...ids);return ids.length;},
  nowStr_:()=> '2026-09-03 12:00:00'
};
vm.createContext(gas);
vm.runInContext(gs.slice(deleteStart, deleteEnd), gas);

(async function(){
  const flushed = await browser.ehsFlushTombstones({silent:true});
  assert.strictEqual(flushed.deleted, 1);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].action, 'deleteBatch');
  assert.deepStrictEqual(Array.from(calls[0].ids), ['deleted-1']);
  assert.deepStrictEqual(localStore.tombstones, [], 'confirmed deletion marker may clear only after cloud success');

  localStore.tombstones=[{id:'offline-1',module:'gate'}];
  browser.navigator.onLine=false;
  await assert.rejects(()=>browser.ehsFlushTombstones({silent:true}), /offline/);
  assert.strictEqual(localStore.tombstones.length, 1, 'offline deletion marker must remain queued');

  const result=gas.handleDeleteBatch_('ehs',['a','c','a']);
  assert.strictEqual(result.requested,2);
  assert.strictEqual(result.deleted,2);
  assert.deepStrictEqual(sheet.rows,[{id:'b'}]);
  assert.deepStrictEqual(marked,['a','c']);
  assert.deepStrictEqual(smart,['a','c']);
  console.log('v51 EHS queued delete, cloud batch delete and offline retention tests passed');
})().catch(err=>{console.error(err);process.exitCode=1;});
