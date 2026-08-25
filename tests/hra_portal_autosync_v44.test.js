const assert=require('assert');
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.join(__dirname,'..');
const core=fs.readFileSync(path.join(root,'gascheck-core.js'),'utf8');
const gas=fs.readFileSync(path.join(root,'ac_gascheck_core_v3_fixed.gs'),'utf8');
const htmls=fs.readdirSync(root).filter(x=>/^ac_gascheck_.*\.html$/.test(x));

assert(core.includes("GC.version = '3.9-hra-portal-autosync'"));
assert(core.includes("cache:'no-store'"), 'cloud GET must bypass mobile/WebView caches');
assert(core.includes("{ _t:Date.now().toString(36)"), 'cloud GET must contain a cache buster');
assert(core.includes("scheduleReconcile(hasPending() ? 'pending_resume' : 'startup', 500)"));
assert(core.includes("global.document.addEventListener('visibilitychange'"));
assert(core.includes("global.addEventListener('pageshow'"));
assert(core.includes("scheduleReconcile('network_restored', 150)"));
assert(core.includes("mode === 'summary' || mode === 'review' || mode === 'approval'"));
assert(core.includes("if (base && lb.hash === base) { removed += lb.count; continue; }"), 'unchanged local rows must accept confirmed cloud deletion');
assert(core.includes("if (opt.allowDeletes && !lh && rh && base && rh === base)"), 'three-way-safe local deletion must reach cloud');
assert(core.includes('retryNetwork(function ()'), 'smart buckets/commit must retry transient failures');
assert(gas.includes("CORE_VERSION : 'v4.2-recent-report-reminder'"));
assert(gas.includes("String(old.lastUploadId||'')===uploadId"), 'smart commit retry must be idempotent');
assert(gas.includes('replaceRecords_(sheet,gcSmartSortRows_(kept.concat(changedRows)))'), 'Sheet compatibility index must remove stale rows from changed buckets');
htmls.forEach(name=>assert(fs.readFileSync(path.join(root,name),'utf8').includes('gascheck-core.js?v=44-hra-portal-autosync'),name+' must load v44 core'));

const store={};
const document={
  head:{appendChild(){}},body:{appendChild(){},insertBefore(){},firstChild:null},
  getElementById(){return null},querySelector(){return null},querySelectorAll(){return[]},addEventListener(){},
  createElement(){return{classList:{add(){},remove(){},toggle(){}},setAttribute(){},appendChild(){},remove(){}}}
};
const localStorage={getItem:k=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}};
const window={document,localStorage,crypto:crypto.webcrypto,TextEncoder,addEventListener(){},setTimeout,clearTimeout,console,navigator:{onLine:true}};
window.window=window;
const context={window,document,localStorage,console,setTimeout,clearTimeout,URLSearchParams,Blob:function(){},URL:{createObjectURL(){return''},revokeObjectURL(){}},TextEncoder};
vm.createContext(context);
vm.runInContext(core,context,{filename:'gascheck-core.js'});

(async()=>{
  const sync=window.GC.smartSync;
  const opt={idKey:'id',dateField:'date',tsKey:'updatedAt',allowDeletes:true};
  let remoteRows=[
    {id:'jul',date:'2026-07-01',value:1,updatedAt:'2026-07-01 10:00:00'},
    {id:'aug',date:'2026-08-01',value:1,updatedAt:'2026-08-01 10:00:00'}
  ];
  let remoteBuckets=await sync.buildBuckets(remoteRows,opt);
  window.GC.cloud.get=async p=>{
    if(p.action==='smartManifest'){
      const hashes={},counts={};Object.keys(remoteBuckets).forEach(k=>{hashes[k]=remoteBuckets[k].hash;counts[k]=remoteBuckets[k].count});
      return {ok:true,data:{exists:true,hashes,counts,recordCount:remoteRows.length,metaHash:'m1',meta:{}}};
    }
    if(p.action==='smartBucket')return {ok:true,data:remoteBuckets[p.bucket]};
    throw new Error('unexpected '+p.action);
  };
  const firstLocal=[{id:'localaug',date:'2026-08-02',value:7,updatedAt:'2026-08-02 10:00:00'}];
  const firstMerge=await sync.download('asset',firstLocal,opt);
  assert.strictEqual(Array.from(firstMerge.list,r=>r.id).sort().join(','),'aug,jul,localaug','first sync must merge divergent local and cloud records');
  assert(firstMerge.conflicts.includes('m:2026-08'),'first divergent bucket must be reported for follow-up upload');

  let first=await sync.download('ehs',[],opt);
  assert.strictEqual(first.list.length,2,'first reconcile downloads cloud baseline');

  remoteRows=remoteRows.filter(r=>r.id!=='aug');
  remoteBuckets=await sync.buildBuckets(remoteRows,opt);
  let afterDelete=await sync.download('ehs',first.list,opt);
  assert.strictEqual(Array.from(afterDelete.list,r=>r.id).join(','),'jul','confirmed cloud deletion must not be resurrected');
  assert.strictEqual(afterDelete.removed,1);

  remoteRows=[{id:'jul',date:'2026-07-01',value:2,updatedAt:'2026-07-02 10:00:00'}];
  remoteBuckets=await sync.buildBuckets(remoteRows,opt);
  let afterRemoteEdit=await sync.download('ehs',afterDelete.list,opt);
  assert.strictEqual(afterRemoteEdit.list[0].value,2,'remote-only changed bucket becomes the new baseline');

  const localEdit=[Object.assign({},afterRemoteEdit.list[0],{value:3,updatedAt:'2026-07-03 10:00:00'})];
  let afterLocalEdit=await sync.download('ehs',localEdit,opt);
  assert.strictEqual(afterLocalEdit.list[0].value,3,'local-only unsent edit must be retained');
  assert.strictEqual(afterLocalEdit.pendingUpload,1);

  let tries=0;
  const retried=await sync.retryNetwork(async()=>{tries++;if(tries<3)throw new Error('temporary');return'ok'},3);
  assert.strictEqual(retried,'ok');assert.strictEqual(tries,3);
  console.log('HRA Portal AutoSync parity v44 tests: PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
