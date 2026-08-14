const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class Range {
  constructor(sheet,row,col,rows,cols){Object.assign(this,{sheet,row,col,rows,cols});}
  getValues(){return Array.from({length:this.rows},(_,i)=>Array.from({length:this.cols},(_,j)=>(this.sheet.rows[this.row-1+i]||[])[this.col-1+j]??''));}
  setValues(values){values.forEach((line,i)=>line.forEach((v,j)=>{const r=this.row-1+i,c=this.col-1+j;while(this.sheet.rows.length<=r)this.sheet.rows.push([]);while(this.sheet.rows[r].length<=c)this.sheet.rows[r].push('');this.sheet.rows[r][c]=v;}));return this;}
  setBackground(){return this;} setFontColor(){return this;} setFontWeight(){return this;}
}
class Sheet {
  constructor(name,rows){this.name=name;this.rows=rows||[];}
  getLastRow(){return this.rows.length;} getLastColumn(){return this.rows.reduce((n,r)=>Math.max(n,r.length),0);}
  getDataRange(){return new Range(this,1,1,this.getLastRow(),this.getLastColumn());}
  getRange(r,c,rs,cs){return new Range(this,r,c,rs,cs);} appendRow(row){this.rows.push(row.slice());return this;}
  setFrozenRows(){return this;} deleteRows(start,count){this.rows.splice(start-1,count);} clear(){this.rows=[];}
}
class DriveFile {
  constructor(name,text){this.name=name;this.text=String(text||'');this.updated=new Date();this.id=Math.random().toString(36);}
  getName(){return this.name;} getLastUpdated(){return this.updated;} getBlob(){return {getDataAsString:()=>this.text};}
  setContent(text){this.text=String(text);this.updated=new Date();return this;} getId(){return this.id;}
}
class Iterator { constructor(items){this.items=items.slice();} hasNext(){return this.items.length>0;} next(){return this.items.shift();} }
class Folder {
  constructor(name){this.name=name;this.files=[];}
  getFilesByName(name){return new Iterator(this.files.filter(f=>f.name===name));}
  getFiles(){return new Iterator(this.files);}
  createFile(name,text){const f=new DriveFile(name,text);this.files.push(f);return f;}
}

const sheets=Object.create(null),folders=Object.create(null),props=Object.create(null);
const spreadsheet={getSheetByName:n=>sheets[n]||null,insertSheet:n=>(sheets[n]=new Sheet(n))};
const context={
  console,JSON,Math,Date,String,Number,Boolean,Array,Object,RegExp,Error,
  Logger:{log(){}},
  Utilities:{
    Charset:{UTF_8:'utf8'},DigestAlgorithm:{SHA_256:'sha256'},
    computeDigest(_alg,s){return Array.from(crypto.createHash('sha256').update(String(s),'utf8').digest()).map(x=>x>127?x-256:x);},
    formatDate(d,_tz,p){const x=new Date(d),pad=n=>String(n).padStart(2,'0');return p.replace(/yyyy|MM|dd|HH|mm|ss|M|d/g,k=>({yyyy:x.getUTCFullYear(),MM:pad(x.getUTCMonth()+1),M:x.getUTCMonth()+1,dd:pad(x.getUTCDate()),d:x.getUTCDate(),HH:pad(x.getUTCHours()),mm:pad(x.getUTCMinutes()),ss:pad(x.getUTCSeconds())})[k]);}
  },
  SpreadsheetApp:{openById(){return spreadsheet;}},
  PropertiesService:{getScriptProperties(){return {getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=String(v);},deleteProperty:k=>{delete props[k];}};}},
  DriveApp:{
    getFoldersByName(name){return new Iterator(folders[name]?[folders[name]]:[]);},
    createFolder(name){return (folders[name]=new Folder(name));}
  },
  LockService:{getScriptLock(){return {tryLock(){return true;},releaseLock(){}};}},
  MimeType:{PLAIN_TEXT:'text/plain'},
  ContentService:{createTextOutput(){return {setMimeType(){return this;}};},MimeType:{JSON:'json'}},
  HtmlService:{createHtmlOutput(v){return v;}},UrlFetchApp:{fetch(){throw new Error('network not expected');}},
  ScriptApp:{getProjectTriggers(){return [];},newTrigger(){throw new Error('not expected');}}
};
vm.createContext(context);
const gasSource=fs.readFileSync(path.join(__dirname,'..','ac_gascheck_core_v3_fixed.gs'),'utf8');
vm.runInContext(gasSource,context,{filename:'ac_gascheck_core_v3_fixed.gs'});

sheets.ehs=new Sheet('ehs',[
  ['id','date','sourceType','weight_kg','updatedAt'],
  ['old-1','2026-07-02','waste',100,'2026-07-02 09:00:00']
]);
let manifest=context.handleGcSmartManifestGet_({tool:'ehs'});
assert.strictEqual(manifest.exists,false);
assert.strictEqual(manifest.legacy,true);

const july=[{id:'old-1',date:'2026-07-02',sourceType:'waste',weight_kg:100,updatedAt:'2026-07-02 09:00:00'}];
const julyHash=context.gcSmartHash_(context.gcSmartStable_(context.gcSmartSortRows_(july)));
context.handleGcSmartBucketPost_({tool:'ehs',uploadId:'first',bucket:'m:2026-07',hash:julyHash,records:july});
context.handleGcSmartCommitPost_({tool:'ehs',uploadId:'first',hashes:{'m:2026-07':julyHash},counts:{'m:2026-07':1},recordCount:1,meta:{periods:['2026-07'],_smartMetaHash:'meta1'}});
manifest=context.handleGcSmartManifestGet_({tool:'ehs'});
assert.strictEqual(manifest.exists,true);
assert.strictEqual(manifest.recordCount,1);

const august=[{id:'new-2',date:'2026-08-03',sourceType:'recycle',total_kg:220,updatedAt:'2026-08-03 09:00:00'}];
const augustHash=context.gcSmartHash_(context.gcSmartStable_(context.gcSmartSortRows_(august)));
context.handleGcSmartBucketPost_({tool:'ehs',uploadId:'second',bucket:'m:2026-08',hash:augustHash,records:august});
context.handleGcSmartCommitPost_({tool:'ehs',uploadId:'second',hashes:{'m:2026-07':julyHash,'m:2026-08':augustHash},counts:{'m:2026-07':1,'m:2026-08':1},recordCount:2,meta:{periods:['2026-07','2026-08'],_smartMetaHash:'meta2'}});
assert.strictEqual(context.handleGcSmartBucketGet_({tool:'ehs',bucket:'m:2026-07'}).records.length,1,'unchanged remote bucket must be retained');
assert.strictEqual(context.handleGcSmartBucketGet_({tool:'ehs',bucket:'m:2026-08'}).records.length,1);
assert.strictEqual(context.handleGcSmartManifestGet_({tool:'ehs'}).recordCount,2);

context.deleteGcSmartRecord_('ehs','new-2');
manifest=context.handleGcSmartManifestGet_({tool:'ehs'});
assert.strictEqual(manifest.recordCount,1,'delete must update smart manifest');
assert.strictEqual(manifest.hashes['m:2026-08'],undefined);

const core=fs.readFileSync(path.join(__dirname,'..','gascheck-core.js'),'utf8');
assert(core.includes("cloudControl.scheduleAuto('telegram_' + mode)"));
assert(core.includes("mode === 'summary' || mode === 'approval'"));
assert(core.includes("'ac_gc_auto_sync_v1_'"));
assert(core.includes("action:'smartManifest'"));
assert(core.includes("action:'smartBucket'"));
assert(core.includes("action:'smartCommit'"));

const clientStore={};
const clientDocument={
  head:{appendChild(){}},body:{appendChild(){},insertBefore(){},firstChild:null},
  getElementById(){return null;},querySelector(){return null;},querySelectorAll(){return[];},addEventListener(){},
  createElement(){return {classList:{add(){},remove(){},toggle(){}},setAttribute(){},appendChild(){},remove(){}};}
};
const clientLocalStorage={getItem:k=>Object.prototype.hasOwnProperty.call(clientStore,k)?clientStore[k]:null,setItem:(k,v)=>{clientStore[k]=String(v);},removeItem:k=>{delete clientStore[k];}};
const clientWindow={document:clientDocument,localStorage:clientLocalStorage,crypto:crypto.webcrypto,TextEncoder,addEventListener(){},setTimeout,clearTimeout,console};clientWindow.window=clientWindow;
const clientContext={window:clientWindow,document:clientDocument,localStorage:clientLocalStorage,console,setTimeout,clearTimeout,URLSearchParams,Blob:function(){},URL:{createObjectURL(){return'';},revokeObjectURL(){}},TextEncoder};
vm.createContext(clientContext);vm.runInContext(core,clientContext,{filename:'gascheck-core.js'});
(async()=>{
  const buckets=await clientWindow.GC.smartSync.buildBuckets([
    {id:'july',date:'2026-07-01',value:1},
    {id:'aug',date:'2026-08-01',value:2}
  ],{idKey:'id',dateField:'date'});
  assert.deepStrictEqual(Object.keys(buckets),['m:2026-07','m:2026-08']);
  let remote=null,bucketPosts=0;const staged={};
  clientWindow.GC.cloud.get=async function(p){
    if(p.action==='smartManifest'){
      if(!remote)return {ok:true,data:{tool:p.tool,exists:false,legacy:false}};
      const hashes={},counts={};Object.keys(remote.buckets).forEach(k=>{hashes[k]=remote.buckets[k].hash;counts[k]=remote.buckets[k].count;});
      return {ok:true,data:{tool:p.tool,exists:true,hashes,counts,metaHash:remote.metaHash,meta:remote.meta}};
    }
    if(p.action==='smartBucket'){const b=remote.buckets[p.bucket];return {ok:true,data:{records:b.records,hash:b.hash,count:b.count}};}
    throw new Error('unexpected GET '+p.action);
  };
  clientWindow.GC.cloud.post=async function(p){
    if(p.action==='smartBucket'){bucketPosts++;(staged[p.uploadId]||(staged[p.uploadId]={}))[p.bucket]={records:p.records,hash:p.hash,count:p.count};return {ok:true,data:{saved:true}};}
    if(p.action==='smartCommit'){
      const next={};Object.keys(p.hashes).forEach(k=>{const old=remote&&remote.buckets[k],fresh=staged[p.uploadId]&&staged[p.uploadId][k];next[k]=fresh||old;});
      remote={buckets:next,metaHash:p.meta._smartMetaHash,meta:p.meta};return {ok:true,data:{timestamp:'2026-08-13 12:00:00'}};
    }
    throw new Error('unexpected POST '+p.action);
  };
  const syncOpt={idKey:'id',dateField:'date',tsKey:'updatedAt'};
  const first=await clientWindow.GC.cloud.upload('ehs',[{id:'july',date:'2026-07-01',value:1},{id:'aug',date:'2026-08-01',value:2}],syncOpt);
  assert.strictEqual(first.uploaded,2);
  assert.strictEqual(bucketPosts,2);
  const second=await clientWindow.GC.cloud.upload('ehs',[{id:'july',date:'2026-07-01',value:1},{id:'aug',date:'2026-08-01',value:2}],syncOpt);
  assert.strictEqual(second.skipped,true,'identical second upload must transfer nothing');
  assert.strictEqual(bucketPosts,2);
  const third=await clientWindow.GC.cloud.upload('ehs',[{id:'july',date:'2026-07-01',value:9},{id:'aug',date:'2026-08-01',value:2}],syncOpt);
  assert.strictEqual(third.uploaded,1,'only changed month bucket should upload');
  assert.strictEqual(bucketPosts,3);
  console.log('smart incremental sync tests: PASS');
})().catch(err=>{console.error(err);process.exitCode=1;});
