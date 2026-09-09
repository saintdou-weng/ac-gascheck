const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const {load}=require('./dom-harness.cjs');
const gas=fs.readFileSync(path.join(__dirname,'..','ac_gascheck_core_v3_fixed.gs'),'utf8');
const clone=v=>JSON.parse(JSON.stringify(v));
const rows=[{id:'d2',date:'2026-08-02',fQty:4,fPrice:3000,fTtl:1,fTime:'08:00',sQty:2,sPrice:4000,sTime:'15:30',exchangeRate:4000,photos:['photo-url'],updatedAt:'2026-08-02'}];
let writes=0,edits=[];
const ctx={console,Math,JSON,Map,Set,CFG:{APPROVER_TG_ID:'7',APPROVER_NAME:'Approver',BASE_URL:'https://example.test/'},
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},readCanonicalAuditRecords_:()=>rows,
 getOrCreateSheet_:()=>({}),replaceRecords_:()=>{writes++},mergeGcSmartDirect_:()=>{},nowStr_:()=> '2026-09-08 10:00:00',
 dormHtml_:v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
 tgEditResult_:(...args)=>{edits.push(args);return {ok:true,messageId:88}}};
vm.createContext(ctx);vm.runInContext(gas.slice(gas.indexOf('function waterReportEntries('),gas.indexOf('function sendTelegramMenu(')),ctx);
const entries=ctx.waterReportEntries(rows,'all','all'),digest=ctx.waterApprovalDigest(entries,'all','all');
assert.equal(entries[0].ft,12000,'ignore stale saved subtotal');
const cq={from:{id:2},message:{message_id:88,text:'Approval report'}};
let result=ctx.handleWaterApprovalCallback_('-1','wdr_ok_2026-08_all_all_'+digest,cq);assert.equal(result.ok,false);assert.equal(writes,0);
cq.from.id=7;result=ctx.handleWaterApprovalCallback_('-1','wdr_ok_2026-08_all_all_'+digest,cq);assert.equal(result.ok,true);assert.equal(writes,1);assert.equal(rows[0].waterApprovals['2026-08|all|all'].status,'approved');assert.deepStrictEqual(rows[0].photos,['photo-url']);
ctx.handleWaterApprovalCallback_('-1','wdr_ok_2026-08_all_all_'+digest,cq);assert.equal(writes,1,'repeated approval is idempotent');
rows[0].fQty=5;result=ctx.handleWaterApprovalCallback_('-1','wdr_ok_2026-08_all_all_'+digest,cq);assert.equal(result.ok,false,'outdated financial report cannot be approved');assert.equal(writes,1);
const factory=ctx.waterReportEntries(rows,'factory','all');assert.equal(factory[0].sq,0);assert.equal(ctx.waterReportEntries(rows,'all','afternoon')[0].fq,0);
assert.equal(ctx.waterReportEntries([{date:'2026-08-01',fQty:0,fPrice:3000}],'factory','all').length,1,'explicit zero is a recorded day');

// Failed photographs do not count as successful report delivery. Retrying
// edits the same text message and only retries photographs without receipts.
let nextId=1,photoOk=false,created=0;const states={};
Object.assign(ctx,{TG_MESSAGE_STATE_KEY:'messages',TG_PHOTO_STATE_KEY:'photos',telegramStateId_:(c,t,k)=>c+t+k,
 readTelegramState_:k=>clone(states[k]||{}),writeTelegramState_:(k,v)=>states[k]=clone(v),telegramPhotoFingerprint_:p=>p,
 tgSendResult_:()=>{created++;return {ok:true,messageId:nextId++}},tgSendPhoto_:()=>photoOk});
vm.runInContext(gas.slice(gas.indexOf('function sendTelegramMessage('),gas.indexOf('/**\n * 前端 Telegram',gas.indexOf('function sendTelegramMessage('))),ctx);
const options={updateExisting:true,messageKey:'report',dedupePhotos:true,photoDedupeKey:'report'};
result=ctx.sendTelegramMessage('-1','hello',[],['https://example.test/photo.jpg'],'waterdrum',options);assert.equal(result.ok,false);assert.equal(result.photosFailed,1);assert.equal(result.textDelivered,true);
photoOk=true;result=ctx.sendTelegramMessage('-1','hello',[],['https://example.test/photo.jpg'],'waterdrum',options);assert.equal(result.ok,true);assert.equal(result.photosSent,1);assert.equal(created,1,'text is not duplicated after photo failure');
result=ctx.sendTelegramMessage('-1','hello',[],['https://example.test/photo.jpg'],'waterdrum',options);assert.equal(result.photosSkipped,1);
ctx.tgEditResult_=()=>({ok:false,error:'Too Many Requests'});result=ctx.sendTelegramMessage('-1','hello',[],[],'waterdrum',options);assert.equal(result.ok,false);assert.equal(created,1,'transient edit errors must not post duplicate messages');

(async()=>{
 const {w,dom,errors}=await load('ac_gascheck_temperature_v2.html');assert.deepStrictEqual(errors,[]);
 const pages=w.GC.telegram.paginateRows('Monthly report','Date | Value',Array.from({length:31},(_,i)=>'2026-08-'+String(i+1).padStart(2,'0')+' | 28/70'),'footer',12);
 assert.equal(pages.length,3);assert(pages.every(p=>p.length<3900));
 const posted=[],messages=new Map();let fail=true;
 w.GC.cloud.post=async body=>{posted.push(clone(body));if(fail&&body.messageKey.endsWith('page2'))throw new Error('Simulated network interruption');if(!messages.has(body.messageKey))messages.set(body.messageKey,messages.size+1);return {ok:true,messageId:messages.get(body.messageKey)}};
 const meta={reportPeriod:'month',reportRef:'2026-08-01',reportMonth:'2026-08',reportMode:'summary',reportScope:'all',reportSlot:'all'};
 await assert.rejects(()=>w.GC.telegram.send(pages,['https://example.test/photo.jpg'],[],null,'temperature',meta),/Page 2\/3/);
 assert(!posted.some(p=>p.reportMonth),'partial report cannot be marked complete');
 fail=false;const delivered=await w.GC.telegram.send(pages,['https://example.test/photo.jpg'],[],null,'temperature',meta);assert.equal(delivered.pagesSent,3);assert.equal(messages.size,3,'retry reuses page message keys');
 assert.equal(posted.at(-1).reportMonth,'2026-08');assert.equal(posted.at(-1).photos.length,1);assert(posted.slice(0,-1).every(p=>p.photos.length===0));
 w.GC.cloud.post=async()=>({ok:true});await assert.rejects(()=>w.GC.telegram.send('hello',[],[],null,'temperature'),/No delivery confirmation/);
 const selected=w.GC.period.filter([{d:'2026-07-31'},{d:'2026-08-01'},{d:'2026-08-31'},{d:'2026-09-01'}],'month','d','2026-08-01');assert.deepStrictEqual(Array.from(selected,r=>r.d),['2026-08-01','2026-08-31']);
 dom.window.close();console.log('v56 approval authorization/stale report/replay, photo receipts, paginated retry and calendar boundaries PASS');
})().catch(e=>{console.error(e);process.exit(1)});
