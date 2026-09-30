/* FIX sprint — backend (ac_gascheck_core_v3_fixed.gs) regression tests.
   Standalone: node tests/fix_backend.test.js  (exit 1 on failure, prints PASS lines). */
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
process.chdir(path.join(__dirname,'..'));
const {server}=require('./gas-approval-harness.cjs');
const GS=fs.readFileSync('ac_gascheck_core_v3_fixed.gs','utf8');
const EHS=fs.readFileSync('ac_gascheck_ehs_v2.html','utf8');
let failed=0;
function test(name,fn){try{fn();console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+(e&&e.stack||e));}}

/* ── Environment: harness + real-ish Drive folders, SpreadsheetApp, formatDate ── */
const pad=n=>String(n).padStart(2,'0');
function formatDate(v,_tz,p){const x=new Date(v);return p.replace(/yyyy|MM|dd|HH|mm|ss|M|d/g,k=>({yyyy:x.getFullYear(),MM:pad(x.getMonth()+1),M:x.getMonth()+1,dd:pad(x.getDate()),d:x.getDate(),HH:pad(x.getHours()),mm:pad(x.getMinutes()),ss:pad(x.getSeconds())})[k]);}
function env(){
  const s=server(),g=s.g;let fid=0;
  class File{constructor(name,content,mime){this.id='f'+(++fid);this.name=name;this.content=String(content||'');this.mime=mime;this.trashed=false;this.created=new Date(Date.now()+fid);this.updated=this.created;}
    getId(){return this.id;}getName(){return this.name;}getBlob(){const c=this.content;return {getDataAsString:()=>c,testBlob:true};}
    setContent(c){this.content=String(c);this.updated=new Date();return this;}setTrashed(v){this.trashed=!!v;}isTrashed(){return this.trashed;}
    getDateCreated(){return this.created;}getLastUpdated(){return this.updated;}setSharing(){return this;}}
  const it=a=>{let i=0;return {hasNext:()=>i<a.length,next:()=>a[i++]};};
  class Folder{constructor(n){this.name=n;this.files=[];}
    createFile(a,b,c){const f=typeof a==='string'?new File(a,b,c):new File(a.name||'blob',a.bytes||'',a.mime);this.files.push(f);return f;}
    getFiles(){return it(this.files.filter(f=>!f.trashed));}getFilesByName(n){return it(this.files.filter(f=>!f.trashed&&f.name===n));}}
  const folders={};
  Object.assign(g.DriveApp,{getFoldersByName:n=>it(folders[n]?[folders[n]]:[]),createFolder:n=>(folders[n]=new Folder(n)),Access:{ANYONE_WITH_LINK:1},Permission:{VIEW:1}});
  g.MimeType={PLAIN_TEXT:'text/plain'};
  g.HtmlService={createHtmlOutput:t=>({text:t})};
  g.Utilities.formatDate=formatDate;
  g.Utilities.newBlob=(bytes,mime,name)=>({bytes:'img:'+name,mime,name});
  g.SpreadsheetApp={openById:()=>({getSheetByName:n=>s.sheets.get(n)||null,insertSheet:n=>g.getOrCreateSheet_(n)})};
  const raw=p=>JSON.parse(g.doPost({postData:{contents:JSON.stringify(p)}}).text);
  const rawGet=p=>JSON.parse(g.doGet({parameter:p}).text);
  const update=(u,k)=>g.doPost({postData:{contents:JSON.stringify(u)},parameter:k?{k}:{}});
  let uid=1000;
  const press=(data,messageId,fromId)=>update({update_id:++uid,callback_query:{id:'cq'+uid,data,from:{id:Number(fromId||s.config.approver)},message:{message_id:messageId,chat:{id:Number(s.config.chat)},text:'Card '+messageId}}});
  const sent=m=>s.telegram.filter(t=>t.method===m);
  const manifest=(tool,rowsByBucket)=>{const buckets={};Object.keys(rowsByBucket).forEach(k=>{s.files.set(g.gcSmartBucketName_(tool,'seed',k),JSON.stringify(rowsByBucket[k]));buckets[k]={hash:'seed'+k,count:rowsByBucket[k].length,source:'seed'};});
    s.files.set(g.gcSmartManifestName_(tool),JSON.stringify({version:1,tool,buckets,recordCount:Object.values(rowsByBucket).reduce((n,r)=>n+r.length,0),meta:{}}));};
  const bucket=(tool,k)=>g.handleGcSmartBucketGet_({tool,bucket:k}).records;
  return Object.assign(s,{raw,rawGet,update,press,sent,manifest,bucket,folders});
}
const lastEdit=s=>s.sent('editMessageText').at(-1);
const hasButtons=t=>!!(t&&t.payload.reply_markup&&t.payload.reply_markup.inline_keyboard.some(r=>r.some(b=>b.callback_data)));

test('capabilities on ping/status; version kept',()=>{
  const s=env();
  const ping=s.rawGet({action:'ping'}),status=s.raw({action:'status'}),post=s.raw({action:'ping'});
  for(const cap of ['ehs-approval','asset-approval','dorm-extra-sync','photo-key-dedupe','webhook-key','tombstones','smart-cas'])
    assert(ping.capabilities.includes(cap)&&status.capabilities.includes(cap)&&post.capabilities.includes(cap),cap);
  assert.equal(status.version,'v4.8-key-water-monthly-reports');
});

test('dormDecision over HTTP is rejected (Telegram-only approvals)',()=>{
  const s=env(),out=s.raw({action:'dormDecision',id:'x',decision:'approve',approver:'Paul Weng',approverId:s.config.approver});
  assert.equal(out.ok,false);assert(out.telegramOnly);
});

test('telegram send: fixed chat, unknown callbacks dropped, bad page URL rewritten, >64B dropped',()=>{
  const s=env();
  s.post({action:'telegram',chatId:'-999',text:'hi',tool:'cleaning',buttons:[[{text:'A',data:'dorm_ok_1'},{text:'B',data:'x'.repeat(70)}],[{text:'P',url:'https://saintdou-weng.github.io/ac-gascheck/nope.html'}],[{text:'S',data:'gc_status'}]]});
  const m=s.sent('sendMessage').at(-1).payload;
  assert.equal(m.chat_id,String(s.config.chat));
  const btns=m.reply_markup.inline_keyboard.flat();
  assert(!btns.some(b=>b.callback_data==='dorm_ok_1'||String(b.callback_data||'').length>64));
  assert(btns.some(b=>b.url==='https://saintdou-weng.github.io/ac-gascheck/ac_gascheck_portal_v1.html'));
  assert(btns.some(b=>b.callback_data==='gc_status'));
});

test('webhook key: forged update ignored once key exists; keyed update processed',()=>{
  const s=env();s.props.GC_WEBHOOK_KEY='secretkey123';
  const before=s.telegram.length;
  s.update({update_id:1,message:{chat:{id:Number(s.config.chat)},text:'/menu'}});
  assert.equal(s.telegram.length,before,'no Telegram call for forged update');
  s.update({update_id:2,message:{chat:{id:Number(s.config.chat)},text:'/menu'}},'secretkey123');
  assert(s.telegram.length>before,'menu sent for keyed update');
  assert(s.g.gcWebhookUrlWithKey_('https://x/exec').endsWith('?k=secretkey123'));
});

test('smartBucket idempotent retry + client hash kept when unaltered',()=>{
  const s=env(),rows=[{id:'k1',issue_date:'2026-09-02',key_no:'1',updatedAt:'2026-09-02 08:00:00'}];
  const a=s.post({action:'smartBucket',tool:'keymovement',uploadId:'u1',bucket:'m:2026-09',hash:'clienthash0001',records:rows});
  const b=s.post({action:'smartBucket',tool:'keymovement',uploadId:'u1',bucket:'m:2026-09',hash:'clienthash0001',records:rows});
  assert.equal(a.hash,'clienthash0001');assert.equal(a.altered,false);assert.deepEqual(a,b);
  assert.equal([...s.files.keys()].filter(k=>k.includes('_u1_')).length,1);
  s.post({action:'smartCommit',tool:'keymovement',uploadId:'u1',hashes:{'m:2026-09':a.hash},counts:{'m:2026-09':1},meta:{_smartMetaHash:'metaclient01'}});
  const m=s.get({action:'smartManifest',tool:'keymovement'});
  assert.equal(m.hashes['m:2026-09'],'clienthash0001','no re-upload churn');assert.equal(m.metaHash,'metaclient01');
  assert.equal(s.post({action:'smartCommit',tool:'keymovement',uploadId:'u1',hashes:{},counts:{}}).idempotent,true);
});

test('smartCommit CAS: stale baseHashes merges instead of rolling back; unknown new bucket kept',()=>{
  const s=env();
  const A=[{id:'a',issue_date:'2026-09-01',updatedAt:'2026-09-01 08:00:00'}];
  s.post({action:'smartBucket',tool:'keymovement',uploadId:'first',bucket:'m:2026-09',hash:'hashfirst01',records:A});
  s.post({action:'smartCommit',tool:'keymovement',uploadId:'first',hashes:{'m:2026-09':'hashfirst01'},counts:{'m:2026-09':1}});
  // device B adds row b + new bucket m:2026-10
  const B=A.concat([{id:'b',issue_date:'2026-09-03',updatedAt:'2026-09-03 08:00:00'}]),Oct=[{id:'o',issue_date:'2026-10-01',updatedAt:'2026-10-01 08:00:00'}];
  s.post({action:'smartBucket',tool:'keymovement',uploadId:'devB',bucket:'m:2026-09',hash:'hashdevb01',records:B});
  s.post({action:'smartBucket',tool:'keymovement',uploadId:'devB',bucket:'m:2026-10',hash:'hashdevb02',records:Oct});
  s.post({action:'smartCommit',tool:'keymovement',uploadId:'devB',baseHashes:{'m:2026-09':'hashfirst01'},hashes:{'m:2026-09':'hashdevb01','m:2026-10':'hashdevb02'},counts:{}});
  // device A (stale, based on 'hashfirst01') adds row c
  const C=A.concat([{id:'c',issue_date:'2026-09-04',updatedAt:'2026-09-04 08:00:00'}]);
  s.post({action:'smartBucket',tool:'keymovement',uploadId:'devA',bucket:'m:2026-09',hash:'hashdeva01',records:C});
  const out=s.post({action:'smartCommit',tool:'keymovement',uploadId:'devA',baseHashes:{'m:2026-09':'hashfirst01'},hashes:{'m:2026-09':'hashdeva01'},counts:{}});
  assert(out.needsPull&&out.mergedBuckets.includes('m:2026-09')&&out.keptBuckets.includes('m:2026-10'));
  assert.deepEqual(s.bucket('keymovement','m:2026-09').map(r=>r.id).sort(),['a','b','c'],'no rollback of device B row');
  assert.equal(s.bucket('keymovement','m:2026-10').length,1,'bucket unknown to device A is not removed');
  // legacy client (no baseHashes) committing right after another upload also merges
  const D=A.concat([{id:'d',issue_date:'2026-09-05',updatedAt:'2026-09-05 08:00:00'}]);
  s.post({action:'smartBucket',tool:'keymovement',uploadId:'legacy',bucket:'m:2026-09',hash:'hashlegacy1',records:D});
  s.post({action:'smartCommit',tool:'keymovement',uploadId:'legacy',hashes:{'m:2026-09':'hashlegacy1'},counts:{}});
  assert.deepEqual(s.bucket('keymovement','m:2026-09').map(r=>r.id).sort(),['a','b','c','d']);
});

test('smartCommit meta merges (Push All without cleaners keeps settings; mapZones/bins guarded)',()=>{
  const s=env();
  s.post({action:'smartCommit',tool:'cleaning',uploadId:'m1',hashes:{},counts:{},meta:{cleaners:['A'],locations:[{id:'l1'}],mapZones:[{id:'z'}],bins:[{id:'b'}],configUpdatedAt:'2026-09-10'}});
  s.post({action:'smartCommit',tool:'cleaning',uploadId:'m2',hashes:{},counts:{},meta:{periods:['2026-09']}});
  let meta=s.get({action:'smartManifest',tool:'cleaning'}).meta;
  assert.deepEqual(meta.cleaners,['A']);assert.equal(meta.mapZones.length,1);
  s.post({action:'smartCommit',tool:'cleaning',uploadId:'m3',hashes:{},counts:{},meta:{mapZones:[],bins:[],configUpdatedAt:'2026-09-01'}});
  meta=s.get({action:'smartManifest',tool:'cleaning'}).meta;
  assert.equal(meta.mapZones.length,1,'older config revision cannot wipe mapZones');assert.equal(meta.bins.length,1);
});

test('legacy delete → tombstone in smart bucket, removed from Sheet, excluded from status/pull/audits',()=>{
  const s=env(),rows=[{id:'d1',type:'in',idNo:'E1',roomNo:'R1',date:'2026-09-02',name:'A',updatedAt:'2026-09-02 08:00:00'},{id:'d2',type:'in',idNo:'E2',roomNo:'R2',date:'2026-09-03',name:'B',updatedAt:'2026-09-03 08:00:00'}];
  s.manifest('dormitory',{'m:2026-09':rows});s.g.replaceRecords_(s.g.getOrCreateSheet_('dormitory'),rows);
  s.post({action:'delete',tool:'dormitory',id:'d1'});
  const b=s.bucket('dormitory','m:2026-09'),t=b.find(r=>r.id==='d1');
  assert(t&&t._deleted===true&&t.date==='2026-09-02'&&t.deletedAt,'tombstone keeps id/date');
  assert.deepEqual(s.g.sheetToJson_(s.sheets.get('dormitory')).map(r=>r.id),['d2']);
  assert.equal(s.raw({action:'status'}).modules.dormitory,1);
  assert.deepEqual(s.get({action:'pull',tool:'dormitory'}).records.map(r=>r.id),['d2']);
  assert.equal(s.get({action:'pull',tool:'dormitory',includeDeleted:'1'}).records.length,2);
  assert.deepEqual(s.g.readCanonicalAuditRecords_('dormitory').map(r=>r.id),['d2']);
  // a stale phone re-uploading live d1 gets a tombstone back (not silent drop) and cannot revive it in the Sheet
  const up=s.post({action:'smartBucket',tool:'dormitory',uploadId:'stale',bucket:'m:2026-09',hash:'stalehash01',records:rows});
  assert.equal(up.altered,true);
  s.post({action:'push',tool:'dormitory',records:[rows[0]]});
  assert.deepEqual(s.g.sheetToJson_(s.sheets.get('dormitory')).map(r=>r.id),['d2'],'legacy push does not resurrect');
});

test('tombstone-aware merges: newer tombstone wins, live winner never inherits _deleted',()=>{
  const s=env(),g=s.g;
  const live={id:'b',date:'2026-09-03',locId:'x',slots:['07:30'],updatedAt:'2026-09-03 10:00:00'},tomb={id:'a',date:'2026-09-03',locId:'x',slots:['07:30'],_deleted:true,deletedAt:'2026-09-03 09:00:00',updatedAt:'2026-09-03 09:00:00'};
  const r1=g.dedupeCleaningRecords_([tomb,live]).rows;assert.equal(r1.length,1);assert.equal(r1[0].id,'b');assert(!r1[0]._deleted,'live winner not deleted');
  const newer=Object.assign({},tomb,{updatedAt:'2026-09-03 11:00:00'});
  assert.equal(g.dedupeCleaningRecords_([newer,live]).rows[0]._deleted,true);
  const m=g.gcSmartMergeRows_([{id:'z',x:1,_deleted:true,updatedAt:'2026-09-01 08:00:00'}],[{id:'z',x:2,updatedAt:'2026-09-02 08:00:00'}]);
  assert.equal(m.length,1);assert(!m[0]._deleted);
  const tie=g.gcSmartMergeRows_([{id:'q',updatedAt:'2026-09-01 08:00:00',note:'long text here'}],[{id:'q',_deleted:true,updatedAt:'2026-09-01 08:00:00'}]);
  assert.equal(tie[0]._deleted,true,'same time → deletion wins (matches front end)');
  const ehs=g.dedupeEhsWasteRecords_([{id:'w1',sourceType:'waste',date:'2026-09-01',supplier:'S',weight_kg:5,time_in:'08:00',photos:['p']},{id:'w2',sourceType:'waste',date:'2026-09-01',supplier:'S',weight_kg:5,time_in:'08:00',_deleted:true,updatedAt:'2026-09-02 08:00:00'}]).rows;
  assert.equal(ehs.length,2);assert(!ehs.find(r=>r.id==='w1')._deleted);
});

test('cleaning 6S rows and tombstones never counted',()=>{
  const s=env(),g=s.g;
  assert.equal(g.gcCountable_('cleaning',{id:'sixs:1',_syncKind:'cleaning_sixs'}),false);
  assert.equal(g.gcCleaningKey_({id:'sixs:1',_syncKind:'cleaning_sixs',date:'2026-09-01',locId:'a',slots:['x']}),'');
  s.g.replaceRecords_(s.g.getOrCreateSheet_('cleaning'),[{id:'sixs:1',_syncKind:'cleaning_sixs',date:'2026-09-01'},{id:'c1',date:'2026-09-01',locId:'l',slots:'["07:30"]'}]);
  assert.equal(s.raw({action:'status'}).modules.cleaning,1);
});

test('upload activity: month derived without reportMonth; tombstone-only commit logs nothing',()=>{
  const s=env(),g=s.g,now=formatDate(new Date(),'', 'yyyy-MM');
  s.post({action:'smartBucket',tool:'asset',uploadId:'as1',bucket:'m:2024-01',hash:'assethash01',records:[{id:'AOA1',purchaseDate:'2024-01-05',purchase_date:'2024-01-05',updatedAt:'2026-09-01 08:00:00'}]});
  s.post({action:'smartCommit',tool:'asset',uploadId:'as1',hashes:{'m:2024-01':'assethash01'},counts:{}});
  const act=g.readActivity_().filter(a=>a.event==='cloud_upload'&&a.tool==='asset').map(a=>a.reportMonth);
  assert(act.includes('2024-01')&&act.includes(now),act.join());
  const before=g.readActivity_().length;
  s.post({action:'smartBucket',tool:'keymovement',uploadId:'t1',bucket:'m:2026-09',hash:'tombhash001',records:[{id:'x',issue_date:'2026-09-01',_deleted:true,updatedAt:'2026-09-01 08:00:00'}]});
  s.post({action:'smartCommit',tool:'keymovement',uploadId:'t1',hashes:{'m:2026-09':'tombhash001'},counts:{}});
  assert.equal(g.readActivity_().length,before);
});

test('approval guard: sync cannot self-approve dorm or forge water/EHS approvals',()=>{
  const s=env();
  s.manifest('dormitory',{'m:2026-09':[{id:'d1',type:'in',idNo:'E',roomNo:'R',date:'2026-09-02',status:'待審核',updatedAt:'2026-09-02 08:00:00'}]});
  s.post({action:'smartBucket',tool:'dormitory',uploadId:'x1',bucket:'m:2026-09',hash:'dormhash001',records:[{id:'d1',type:'in',idNo:'E',roomNo:'R',date:'2026-09-02',status:'已核可',approvedBy:'Paul Weng',updatedAt:'2026-09-03 08:00:00'}]});
  assert.equal(JSON.parse(s.files.get(s.g.gcSmartBucketName_('dormitory','x1','m:2026-09')))[0].status,'待審核');
  s.manifest('waterdrum',{'m:2026-09':[{id:'wdr_2026_09_1',date:'2026-09-01',fQty:1,updatedAt:'2026-09-01 08:00:00'}]});
  const r=s.post({action:'smartBucket',tool:'waterdrum',uploadId:'x2',bucket:'m:2026-09',hash:'waterhash01',records:[{id:'wdr_2026_09_1',date:'2026-09-01',fQty:1,waterApprovals:{'2026-09|all|all':{status:'approved'}}}]});
  assert.equal(r.approvalFieldsRestored,1);
  assert(!JSON.parse(s.files.get(s.g.gcSmartBucketName_('waterdrum','x2','m:2026-09')))[0].waterApprovals);
});

test('dormitory_inspections / dormitory_violations sync (Drive only, no Sheet)',()=>{
  const s=env();
  for(const tool of ['dormitory_inspections','dormitory_violations']){
    const m=s.get({action:'smartManifest',tool});assert.equal(m.exists,false);assert.equal(m.legacy,false);
    s.post({action:'smartBucket',tool,uploadId:'i1',bucket:'m:2026-09',hash:'insphash001',records:[{id:'i1',date:'2026-09-01',roomNo:'R1'}]});
    s.post({action:'smartCommit',tool,uploadId:'i1',hashes:{'m:2026-09':'insphash001'},counts:{}});
    assert.equal(s.get({action:'smartManifest',tool}).recordCount,1);assert(!s.sheets.has(tool));
  }
});

test('uploadPhoto: photoKey dedupe, size limit, invalid data',()=>{
  const s=env(),g=s.g;
  vm.runInContext(GS.slice(GS.indexOf('function savePhotoToDrive_('),GS.indexOf('/**',GS.indexOf('function savePhotoToDrive_('))),g); // restore real Drive writer
  const data='data:image/jpeg;base64,'+Buffer.from('abc').toString('base64');
  const a=s.post({action:'uploadPhoto',dataUrl:data,tool:'cleaning',recId:'r1',idx:0,photoKey:'fp123'});
  const b=s.post({action:'uploadPhoto',dataUrl:data,tool:'cleaning',recId:'r1',idx:0,photoKey:'fp123'});
  assert.equal(a.url,b.url);assert(b.deduped);
  assert.equal(s.folders.AC_GASCHECK_Photos.files.filter(f=>!f.trashed).length,1);
  assert.equal(s.raw({action:'uploadPhoto',dataUrl:'data:image/jpeg;base64,'+'A'.repeat(10*1024*1024+10)}).ok,false);
  assert.equal(s.raw({action:'uploadPhoto',dataUrl:'https://x/y.jpg'}).ok,false);
});

/* EHS digest parity: run the page's own ehsApprovalDigest on the same rows. */
function pageEhsDigest(rows,month){
  const fn=n=>{const i=EHS.indexOf('function '+n+'(');let d=0,j=EHS.indexOf('{',i);for(;j<EHS.length;j++){if(EHS[j]==='{')d++;else if(EHS[j]==='}'&&--d===0)break;}return EHS.slice(i,j+1);};
  const ctx={rows};vm.createContext(ctx);
  vm.runInContext(['_localYMD','kgNumber','ehsYmd','ehsWasteTimeMinutes','ehsWasteTimeKey','ehsRecycleRowTotal','ehsMonthRows','ehsFnv','ehsApprovalDigest'].map(fn).join('\n')+
    '\nfunction loadLocal(){return {gate:rows.filter(r=>r.sourceType==="waste"||r.module==="gate"),internal:rows.filter(r=>!(r.sourceType==="waste"||r.module==="gate"))};}',ctx);
  return ctx.ehsApprovalDigest(month);
}
test('EHS monthly approval: digest parity, Paul only, idempotent, stale on change, new request after decision',()=>{
  const s=env(),g=s.g;
  const rows=[{id:'w1',module:'gate',sourceType:'waste',date:'2026-09-02',supplier:'K.S.W.M',weight_kg:'1,250.5',time_in:'8:05am',time_out:'09:10',updatedAt:'2026-09-02 10:00:00'},
    {id:'r1',module:'internal',sourceType:'recycle',date:'2026-09-03',plastic_kg:10,fabric_kg:2.5,core_kg:0,total_kg:'',updatedAt:'2026-09-03 10:00:00'},
    {id:'r0',module:'internal',sourceType:'recycle',date:'2026-08-30',plastic_kg:1,updatedAt:'2026-08-30 10:00:00'}];
  s.manifest('ehs',{'m:2026-09':rows.slice(0,2),'m:2026-08':rows.slice(2)});
  const digest=pageEhsDigest(rows.filter(r=>!r._deleted),'2026-09');
  assert.equal(g.gcEhsApprovalDigest_(rows,'2026-09').digest,digest,'server digest == page digest');
  const send=()=>s.post({action:'telegram',tool:'ehs',text:'EHS 2026-09',reportLanguage:'en',buttons:[[{text:'✅',data:'ehs_ok_2026-09_all_'+digest},{text:'❌',data:'ehs_rej_2026-09_all_'+digest}]]});
  const msg=send().messageId;
  s.press('ehs_ok_2026-09_all_'+digest,msg,'111');
  assert(!s.bucket('ehs','m:2026-09').some(r=>r.ehsApprovals),'non-Paul press ignored');
  s.press('ehs_rej_2026-09_all_'+digest,msg);
  let recs=s.bucket('ehs','m:2026-09');
  assert(recs.every(r=>r.ehsApprovals['2026-09|all'].status==='rejected'&&r.ehsApprovals['2026-09|all'].digest===digest));
  assert(!hasButtons(lastEdit(s)),'card buttons removed');
  const stamp=recs[0].updatedAt;s.press('ehs_ok_2026-09_all_'+digest,msg);
  assert.equal(s.bucket('ehs','m:2026-09')[0].ehsApprovals['2026-09|all'].status,'rejected','double press on decided card is idempotent');
  assert.equal(s.bucket('ehs','m:2026-09')[0].updatedAt,stamp);
  const before=s.sent('sendMessage').length,msg2=send().messageId;
  assert(s.sent('sendMessage').length>before&&msg2!==msg,'resend after reject → new message');
  s.press('ehs_ok_2026-09_all_'+digest,msg2);
  assert.equal(s.bucket('ehs','m:2026-09')[0].ehsApprovals['2026-09|all'].status,'approved','Paul approves the resent request');
  s.press('ehs_ok_2026-09_all_'+digest,msg);
  assert.equal(s.bucket('ehs','m:2026-09')[0].ehsApprovals['2026-09|all'].status,'approved','old card is stale');
  // data changed → stale
  const changed=s.bucket('ehs','m:2026-09').map(r=>r.id==='r1'?Object.assign({},r,{plastic_kg:11}):r);s.manifest('ehs',{'m:2026-09':changed});
  const msg3=send().messageId;s.press('ehs_ok_2026-09_all_'+digest,msg3);
  assert(/changed|變更/.test(lastEdit(s).payload.text));
});

test('asset transfer/disposal approval via Telegram (ast_ok_/ast_rej_)',()=>{
  const s=env();
  s.manifest('asset',{'m:2025-01':[{id:'AOA001',code:'AOA001',name:'Desk',location:'Office A',user:'Phea',status:'active',purchaseDate:'2025-01-02',history:[],updatedAt:'2026-09-01 08:00:00'}]});
  const req={id:'areq_test01',type:'transfer',assetCode:'AOA001',assetName:'Desk',data:{newLocation:'Office B',newUser:'Nin',date:'2026-09-20'},reason:'move',by:'Phea'};
  const r=s.post({action:'telegram',tool:'asset',text:'<b>Transfer</b> AOA001',assetRequest:req,messageKey:'asset_request|areq_test01',reportLanguage:'en'});
  const card=s.sent('sendMessage').at(-1).payload.reply_markup.inline_keyboard[0].map(b=>b.callback_data);
  assert.deepEqual(card,['ast_ok_areq_test01','ast_rej_areq_test01']);
  const again=s.post({action:'telegram',tool:'asset',text:'<b>Transfer</b> AOA001',assetRequest:req});
  assert.equal(again.messageId,r.messageId,'same request re-sent edits the same card');
  s.press('ast_ok_areq_test01',r.messageId,'222');
  assert.equal(s.bucket('asset','m:2025-01')[0].location,'Office A','non-Paul press ignored');
  s.press('ast_ok_areq_test01',r.messageId);
  const a=s.bucket('asset','m:2025-01')[0];
  assert.equal(a.location,'Office B');assert.equal(a.user,'Nin');assert(a.updatedAt>'2026-09-01 08:00:00');
  assert.equal(a.history.at(-1).type,'approved');assert.equal(a.history.at(-1).request.id,'areq_test01');
  assert.equal(a.lastRequest.status,'approved');
  assert(!hasButtons(lastEdit(s))&&/Office B/.test(lastEdit(s).payload.text));
  s.press('ast_rej_areq_test01',r.messageId);
  assert.equal(s.bucket('asset','m:2025-01')[0].history.filter(h=>h.type==='approved'||h.type==='rejected').length,1,'second press is idempotent');
  assert.equal(s.post({action:'telegram',tool:'asset',text:'x',assetRequest:req}).alreadyDecided,true);
  const disp=Object.assign({},req,{id:'areq_test02',type:'disposal',data:{disposalType:'broken',date:'2026-09-21'}});
  const d=s.post({action:'telegram',tool:'asset',text:'Dispose',assetRequest:disp});s.press('ast_ok_areq_test02',d.messageId);
  assert.equal(s.bucket('asset','m:2025-01')[0].status,'disposed');
  assert.equal(s.raw({action:'telegram',tool:'asset',text:'x',assetRequest:{id:'bad',type:'transfer'}}).ok,false);
});

test('water: resend after reject (same content) → new message; Paul later ✅ succeeds',()=>{
  const s=env(),g=s.g,rows=[{id:'wdr_2026_09_1',date:'2026-09-01',fQty:2,fPrice:2000,fTime:'08:00',sQty:'',updatedAt:'2026-09-01 09:00:00'}];
  s.manifest('waterdrum',{'m:2026-09':rows});g.replaceRecords_(g.getOrCreateSheet_('waterdrum'),rows);
  const digest=g.waterApprovalDigest(g.waterReportEntries(rows,'all','all'),'all','all'),cb='_2026-09_all_all_'+digest;
  const send=()=>s.post({action:'telegram',tool:'waterdrum',text:'Water approval',reportMode:'approval',reportPeriod:'month',reportMonth:'2026-09',buttons:[[{text:'✅',data:'wdr_ok'+cb},{text:'❌',data:'wdr_rej'+cb}]]});
  const m1=send().messageId;s.press('wdr_rej'+cb,m1);
  const state=()=>{let v=g.readCanonicalAuditRecords_('waterdrum')[0].waterApprovals;if(typeof v==='string')v=JSON.parse(v);return (v||{})['2026-09|all|all'];};
  assert.equal(state().status,'rejected');
  const n=s.sent('sendMessage').length,m2=send().messageId;
  assert(m2!==m1&&s.sent('sendMessage').length===n+1,'new message with new buttons');
  s.press('wdr_ok'+cb,m2);assert.equal(state().status,'approved');assert.equal(String(state().messageId),String(m2));
  s.press('wdr_rej'+cb,m1);assert.equal(state().status,'approved','old message cannot override');
});

test('push replace backs up first; 還原備份 restores deleted records (newer edits kept)',()=>{
  const s=env(),g=s.g;
  const rows=[{id:'k1',issue_date:'2026-09-01',holder:'A',updatedAt:'2026-09-01 08:00:00'},{id:'k2',issue_date:'2026-09-02',holder:'B',updatedAt:'2026-09-02 08:00:00'}];
  s.post({action:'push',tool:'keymovement',records:rows});
  s.post({action:'push',tool:'keymovement',mode:'replace',records:[Object.assign({},rows[0],{holder:'A2',updatedAt:'2026-09-05 08:00:00'})]});
  assert.equal(s.folders.AC_GASCHECK_Backups.files.length,1);
  assert(s.sent('sendMessage').some(t=>/🛟/.test(t.payload.text)),'group notice');
  const out=g['還原備份_鑰匙']();
  assert.equal(out.ok,true);assert.equal(out.restored,1);
  const now=g.sheetToJson_(s.sheets.get('keymovement'));
  assert.deepEqual(now.map(r=>r.id).sort(),['k1','k2']);assert.equal(now.find(r=>r.id==='k1').holder,'A2');
  for(const name of ['還原備份_資產','還原備份_宿舍','還原備份_清潔','還原備份_EHS','還原備份_送水','還原備份_溫濕度','更新部署連線','部署後檢查','清理舊資料'])assert.equal(typeof g[name],'function',name);
});

test('reminder state lives in Drive (not a >9KB Script Property)',()=>{
  const s=env(),g=s.g,big={};for(let i=0;i<40;i++)big['cleaning:all:2026-'+i]={version:2,signatures:Array.from({length:60},(_,j)=>'s'+i+'_'+j),updatedAt:'2026-09-01'};
  g.writeRecentReminderState_(big);
  assert(!s.props.GASCHECK_RECENT_REPORT_REMINDER_STATE_V1);assert.equal(Object.keys(g.readRecentReminderState_()).length,40);
});

test('deploy helpers: 更新部署連線 registers keyed webhook; 部署後檢查 masks token',()=>{
  const s=env(),g=s.g;g.ScriptApp.getService=()=>({getUrl:()=>'https://script.google.com/macros/s/X/exec'});
  const out=g['更新部署連線']();
  const hook=s.telegram.find(t=>t.method==='setWebhook');
  assert(/\/exec\?k=[0-9a-f]{40,}/.test(hook.payload.url));assert(s.props.GC_WEBHOOK_KEY);assert.equal(s.props.GC_TELEGRAM_TRANSPORT,'webhook');
  assert(out.webhookRegistered&&out.menuSent);
  g.PropertiesService.getScriptProperties=(orig=>()=>Object.assign(orig(),{getProperties:()=>Object.assign({},s.props)}))(g.PropertiesService.getScriptProperties);
  const chk=g['部署後檢查']();
  assert(!JSON.stringify(chk).includes(g.CFG?'':'AAH0KoC89DPLNu4D70inRfkY2xwedLkXjnw'),'token never printed');
  assert(chk.checks.some(c=>c.label==='Bot token'&&/…/.test(c.detail)));
});

if(failed){console.error(failed+' backend test(s) failed');process.exit(1);}
console.log('fix_backend: all tests passed');
