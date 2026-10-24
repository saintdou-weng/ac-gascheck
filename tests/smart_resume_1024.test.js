/* 2026-10-24：上傳中斷（commit 前）後，下一輪沿用同一 uploadId，已送達的 bucket 不重送；提交成功後清掉續傳記錄；
   GAS 讀檔改用 ID 快取、宿舍核可保護只讀同一 bucket。 */
const assert=require('assert'),crypto=require('crypto'),fs=require('fs'),path=require('path'),vm=require('vm');
const core=fs.readFileSync(path.join(__dirname,'..','gascheck-core.js'),'utf8');
const store={};const ls={getItem:k=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
const doc={head:{appendChild(){}},body:{appendChild(){},insertBefore(){},firstChild:null},getElementById(){return null;},querySelector(){return null;},querySelectorAll(){return[];},addEventListener(){},createElement(){return {classList:{add(){},remove(){},toggle(){}},setAttribute(){},appendChild(){},remove(){}};}};
const events=[];const win={document:doc,localStorage:ls,crypto:crypto.webcrypto,TextEncoder,addEventListener(){},dispatchEvent(e){events.push(e.detail);},CustomEvent:function(t,o){this.type=t;this.detail=o&&o.detail;},setTimeout,clearTimeout,console};win.window=win;
const ctx={window:win,document:doc,localStorage:ls,console,setTimeout,clearTimeout,URLSearchParams,Blob:function(){},URL:{createObjectURL(){return'';},revokeObjectURL(){}},TextEncoder};
vm.createContext(ctx);vm.runInContext(core,ctx,{filename:'gascheck-core.js'});
(async()=>{
  const GC=win.GC;let remote=null,posts=[],failCommit=1,commits=0;const staged={};
  GC.cloud.get=async p=>{if(p.action==='smartManifest'){if(!remote)return{ok:true,data:{tool:p.tool,exists:false,legacy:false}};const h={},c={};Object.keys(remote.buckets).forEach(k=>{h[k]=remote.buckets[k].hash;c[k]=remote.buckets[k].count;});return{ok:true,data:{tool:p.tool,exists:true,hashes:h,counts:c,metaHash:remote.metaHash,meta:remote.meta,lastUploadId:remote.lastUploadId}};}
    if(p.action==='smartBucket'){const b=remote.buckets[p.bucket];return{ok:true,data:{records:b.records,hash:b.hash,count:b.count}};}throw new Error('GET '+p.action);};
  GC.cloud.post=async p=>{if(p.action==='smartBucket'){posts.push(p.uploadId+'|'+p.bucket);(staged[p.uploadId]||(staged[p.uploadId]={}))[p.bucket]={records:p.records,hash:p.hash,count:p.count};return{ok:true,data:{saved:true,hash:p.hash,count:p.count}};}
    if(p.action==='smartCommit'){commits++;if(failCommit-->0){const e=new Error('Cloud request timed out');e.timeout=true;throw e;}const next={};Object.keys(p.hashes).forEach(k=>{next[k]=(staged[p.uploadId]||{})[k]||(remote&&remote.buckets[k]);});remote={buckets:next,metaHash:p.meta._smartMetaHash,meta:p.meta,lastUploadId:p.uploadId};return{ok:true,data:{timestamp:'x'}};}throw new Error('POST '+p.action);};
  const rows=[];for(let m=1;m<=6;m++)rows.push({id:'r'+m,date:'2026-0'+m+'-02',v:m});
  const opt={idKey:'id',dateField:'date',tsKey:'updatedAt'};
  await assert.rejects(()=>GC.cloud.upload('dormitory',rows,opt),/timed out/);
  assert.equal(posts.length,6,'6 buckets posted in first run');
  const st=JSON.parse(store['ac_gc_smart_stage_v1_dormitory']);assert.equal(Object.keys(st.buckets).length,6,'stage remembers staged buckets');
  assert(events.some(e=>e.tool==='dormitory'&&e.phase==='upload'&&e.done===6&&e.total===6),'progress events');
  const second=await GC.cloud.upload('dormitory',rows,opt);
  assert.equal(posts.length,6,'second run re-sends nothing');assert.equal(second.uploaded,6);assert.equal(commits,2);
  assert.equal(store['ac_gc_smart_stage_v1_dormitory'],undefined,'stage cleared after commit');
  assert.equal(remote.lastUploadId,posts[0].split('|')[0],'same uploadId reused');
  // a new change after commit uses a fresh uploadId and sends only the changed bucket
  rows[0].v=99;await GC.cloud.upload('dormitory',rows,opt);assert.equal(posts.length,7);assert.notEqual(posts[6].split('|')[0],posts[0].split('|')[0]);
  // stage pointing to an already-committed upload is discarded
  const committed=remote.lastUploadId;
  store['ac_gc_smart_stage_v1_dormitory']=JSON.stringify({uploadId:committed,at:Date.now(),buckets:{'m:2026-02':{local:'x',res:{hash:'x'}}}});
  rows[1].v=55;const before=posts.length;await GC.cloud.upload('dormitory',rows,opt);
  assert.equal(posts.length,before+1,'changed bucket posted');assert.notEqual(posts[posts.length-1].split('|')[0],committed,'stale stage of a committed upload is not reused');
  // GAS patch markers
  const gs=fs.readFileSync(path.join(__dirname,'..','ac_gascheck_core_v3_fixed.gs'),'utf8');
  assert(/GC_SMART_FOLDER_ID/.test(gs)&&/gcsf1:/.test(gs)&&/lastUploadId:m.lastUploadId/.test(gs),'gas fast drive + lastUploadId');
  assert(/if\(tool==='dormitory'\)\{try\{const m=readGcSmartManifest_\(tool\);return m\?gcRowsById_\(readGcSmartBucket_\(tool,m,bucket\)\)/.test(gs),'dorm guard same bucket');
  console.log('PASS resumable smart upload + gas fast path');process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
