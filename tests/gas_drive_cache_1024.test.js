/* 2026-10-24：GAS 讀寫同步檔改用資料夾 ID＋檔案 ID 快取，不再每次名稱搜尋 Drive。 */
const assert=require('assert'),crypto=require('crypto'),fs=require('fs'),path=require('path'),vm=require('vm');
let searches=0,folderSearch=0;const files=[];const cache={};const props={};
class F{constructor(n,t){this.n=n;this.t=t;this.id='f'+files.length;this.u=Date.now();this.trash=false;}getName(){return this.n;}getId(){return this.id;}getLastUpdated(){return new Date(this.u);}getBlob(){return{getDataAsString:()=>this.t};}setContent(t){this.t=t;this.u=Date.now();return this;}isTrashed(){return this.trash;}}
const it=a=>({hasNext:()=>a.length>0,next:()=>a.shift()});
const folder={getId:()=>'FOLDER',getName:()=>'AC_GASCHECK_SmartSync',isTrashed:()=>false,getFilesByName:n=>{searches++;return it(files.filter(f=>f.n===n&&!f.trash));},createFile:(n,t)=>{const f=new F(n,t);files.push(f);return f;},getFiles:()=>it(files.slice())};
const ctx={console,Logger:{log(){}},Utilities:{Charset:{UTF_8:'utf8'},DigestAlgorithm:{SHA_256:'s'},computeDigest:(_,s)=>Array.from(crypto.createHash('sha256').update(String(s)).digest()),formatDate:()=>'2026-10-24'},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=String(v);},deleteProperty:k=>{delete props[k];}})},
 CacheService:{getScriptCache:()=>({get:k=>cache[k]||null,put:(k,v)=>{cache[k]=v;}})},
 DriveApp:{getFoldersByName:()=>{folderSearch++;return it([folder]);},getFolderById:id=>{if(id!=='FOLDER')throw new Error('nf');return folder;},getFileById:id=>{const f=files.find(x=>x.id===id);if(!f)throw new Error('nf');return f;},createFolder:()=>folder},
 MimeType:{PLAIN_TEXT:'text/plain'},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},ContentService:{createTextOutput:()=>({setMimeType(){return this;}}),MimeType:{JSON:'json'}},
 SpreadsheetApp:{openById:()=>({getSheetByName:()=>null,insertSheet:()=>({})})},ScriptApp:{getProjectTriggers:()=>[]},UrlFetchApp:{fetch(){throw new Error('no');}},HtmlService:{}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'..','ac_gascheck_core_v3_fixed.gs'),'utf8'),ctx);
ctx.saveGcSmartFile_('a.json','1');assert.equal(ctx.loadGcSmartFile_('a.json'),'1');
const s0=searches;
/* new execution: memo cleared, CacheService + Properties persist */
vm.runInContext('GC_SMART_FOLDER_=null;Object.keys(GC_SMART_FILE_MEMO_).forEach(k=>delete GC_SMART_FILE_MEMO_[k]);',ctx);
assert.equal(ctx.loadGcSmartFile_('a.json'),'1');ctx.saveGcSmartFile_('a.json','2');assert.equal(ctx.loadGcSmartFile_('a.json'),'2');
assert.equal(searches,s0,'no name search after cache');assert.equal(folderSearch,1,'folder searched once then by id');
files[0].trash=true;vm.runInContext('Object.keys(GC_SMART_FILE_MEMO_).forEach(k=>delete GC_SMART_FILE_MEMO_[k]);',ctx);ctx.saveGcSmartFile_('a.json','3');vm.runInContext('Object.keys(GC_SMART_FILE_MEMO_).forEach(k=>delete GC_SMART_FILE_MEMO_[k]);',ctx);assert.equal(ctx.loadGcSmartFile_('a.json'),'3','trashed cached file falls back to search / new file');
assert.equal(JSON.parse(JSON.stringify(ctx.gcServiceInfo_())).syncPatch,'v4.9-fast-drive-sync-20261024');
console.log('PASS gas drive cache');
