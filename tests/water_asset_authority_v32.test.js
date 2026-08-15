const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const core = fs.readFileSync(path.join(root, 'gascheck-core.js'), 'utf8');
const water = fs.readFileSync(path.join(root, 'ac_gascheck_waterdrum_v2.html'), 'utf8');
const asset = fs.readFileSync(path.join(root, 'ac_gascheck_asset_v2.html'), 'utf8');

for (const [name, html] of [['water', water], ['asset', asset]]) {
  let scripts = 0;
  for (const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    scripts++;
    assert.doesNotThrow(() => new Function(match[1]), `${name} inline script ${scripts} must parse`);
  }
  assert(scripts > 0);
}

assert(core.includes('function workforce(rows, start, end)'));
assert(core.includes('function attendanceSnapshot(rows, start, end)'));
assert(core.includes("source:'hra-attendance'"));
assert(core.includes("source:'none'"));
assert(core.includes('averageDaily'));
assert(water.includes('function attendanceStats(rows)'));
assert(water.includes("waterTelegramText('平均每日出勤','Avg daily attendance'"));
assert(!water.includes("'+persons+' person-days'"), 'Telegram must not present calendar-row count as employee count');

assert(asset.includes("const AUTHORITY_KEY='vrt_asset_authority_v1'"));
assert(asset.includes('function cleanupMalformed(list,reason)'));
assert(asset.includes("'duplicate_asset_code'"));
assert(asset.includes("if(ci.code<0)return"), 'inventory sheets without Asset Code must be ignored');
assert(asset.includes("_authoritativeMaster:true"));
assert(asset.includes("GC.sync.schedule('asset','invalid_asset_cleanup')"));
assert(!asset.includes('function stableCode('), 'uncoded inventory rows must never receive generated fake asset codes');

const assetV29 = [...asset.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(m => m[1]).find(s => s.includes('Asset v29'));
const assetStore = Object.create(null);
const assetStorage = {getItem:k=>assetStore[k]||null,setItem:(k,v)=>{assetStore[k]=String(v);},removeItem:k=>{delete assetStore[k];}};
const assetDocument = {readyState:'loading',addEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},getElementById(){return null;},head:{appendChild(){}},body:{appendChild(){}},createElement(){return {classList:{add(){},remove(){},toggle(){}},appendChild(){}};}};
const assetWindow = {document:assetDocument,localStorage:assetStorage,GC:{storage:{ready:{then(){}}}}};assetWindow.window=assetWindow;
const assetContext = {window:assetWindow,document:assetDocument,localStorage:assetStorage,GC:assetWindow.GC,console,setTimeout(){return 0;},clearTimeout(){},assets:[],photos:{},currentUser:{name:'Tester'},currentLang:'en',CATS:['Furniture','','Machine','Dorm Furniture','Dorm Appliance','Vehicle','Other'],assetPhotoValue:v=>Array.isArray(v)?v[0]||'':typeof v==='string'?v:'',_localTS:()=> '2026-08-15 12:00:00',_localYMD:()=> '2026-08-15',today:()=> '2026-08-15'};
vm.createContext(assetContext);vm.runInContext(assetV29,assetContext,{filename:'asset-v29.js'});
const governed = assetWindow.ASSET_V29.cleanupMalformed([
  {id:'bad-1',code:'AOA',name:'fake'},
  {id:'bad-2',code:'AHA123456',name:'generated'},
  {id:'old-a',code:'AHA001',name:'Fridge',brand:'Panasonic'},
  {id:'old-b',code:'AHA001',name:'Fridge'},
  {code:'AOA1',name:'Asset code machine'},
  {id:'code-only',code:'AOA002',name:'AOA002'},
  {id:'blank-name',code:'AHA002',name:''}
],'test_cleanup');
assert.deepStrictEqual(Array.from(governed.active, a=>a.code).sort(),['AHA001','AOA001']);
assert(governed.dead.some(x=>x.id==='bad-1'&&x._deleted));
assert(governed.dead.some(x=>x.id==='bad-2'&&x._deleted));
assert(governed.dead.some(x=>x.id==='old-b'&&x._deleted));
assert(governed.dead.some(x=>x.id==='code-only'&&x.deleteReason==='missing_asset_name'));
assert(governed.dead.some(x=>x.id==='blank-name'&&x.deleteReason==='missing_asset_name'));

const values = Object.create(null);
values['vrt_att_v5'] = JSON.stringify([
  {date:'2026-07-01',dept:'總人數',isGrand:true,m:242,f:213,att:437},
  {date:'2026-07-02',dept:'Grand Total',isGrand:true,m:241,f:214,att:439}
]);
const storage = {
  get length(){ return Object.keys(values).length; },
  key(i){ return Object.keys(values)[i] || null; },
  getItem(k){ return Object.prototype.hasOwnProperty.call(values, k) ? values[k] : null; },
  setItem(k,v){ values[k] = String(v); },
  removeItem(k){ delete values[k]; }
};
const document = {
  readyState:'complete', head:{appendChild(){}}, body:{appendChild(){},insertBefore(){},firstChild:null},
  getElementById(){return null;}, querySelector(){return null;}, querySelectorAll(){return[];}, addEventListener(){},
  createElement(){return {style:{},dataset:{},classList:{add(){},remove(){},toggle(){}},setAttribute(){},appendChild(){},remove(){}};}
};
const window = {document,localStorage:storage,crypto:crypto.webcrypto,TextEncoder,console,setTimeout,clearTimeout,addEventListener(){}};
window.window = window;
const context = {window,document,localStorage:storage,console,setTimeout,clearTimeout,URLSearchParams,TextEncoder,Blob:function(){},URL:{createObjectURL(){return'';},revokeObjectURL(){}}};
vm.createContext(context);
vm.runInContext(core, context, {filename:'gascheck-core.js'});

(async function(){
  const result = await window.GC.attendance.headcount('2026-07-01','2026-07-31');
  assert.strictEqual(result.source, 'hra-attendance');
  assert.strictEqual(result.headcount, 438);
  assert.strictEqual(result.averageDaily, 438);
  assert.strictEqual(result.days, 2);
  assert.strictEqual(result.personDays, 876);
  assert.strictEqual(result.daily['2026-07-01'], 437);
  assert.strictEqual(result.daily['2026-07-02'], 439);
  console.log('Water attendance and Asset authority v32 tests: PASS');
})().catch(err => { console.error(err); process.exitCode = 1; });
