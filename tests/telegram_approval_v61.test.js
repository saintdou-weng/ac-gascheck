const assert=require('assert'),fs=require('fs');
const {server,copy}=require('./gas-approval-harness.cjs');
const {load}=require('./dom-harness.cjs');
const base={id:'application-1',type:'搬入',name:'Test Applicant',idNo:'5833',roomNo:'A-106',date:'2026-09-25',reason:'Near factory',department:'Production',reviewer:'Phea',items:[{name:'Key',checked:true}],photos:[],status:'待審核',timestamp:'2026-09-23 10:40:47'};
function initialize(s,tool='dormitory'){s.files.set(s.g.gcSmartManifestName_(tool),JSON.stringify({version:1,tool,buckets:{},recordCount:0}));}
function submit(s,data){return s.g.handleDormSubmitGet_({data:copy(data)});}
function cq(s,r,decision='ok',extras={}){return Object.assign({id:'click-'+Math.random(),data:'dorm2:'+decision+':'+r.approvalToken,from:{id:s.config.approver},message:{chat:{id:s.config.chat},message_id:r.approvalMessageId,text:'Dorm application'}},extras);}
function click(s,r,decision='ok',extras={}){const q=cq(s,r,decision,extras);return s.g.handleDormApprovalCallback_(q.message.chat.id,q.data,q);}
function current(s){return s.g.readDormRecordForDecision_(base.id).record;}
function smart(s,tool='dormitory'){return s.g.readGcSmartAllRecords_(tool,s.g.readGcSmartManifest_(tool));}
(async()=>{
 const s=server();initialize(s);
 let sent=submit(s,base);assert(sent.ok,sent.error);let first=copy(sent.record);
 assert(first.approvalMessageId);assert.equal(first.approvalDeliveryPending,false);assert.equal(smart(s)[0].approvalMessageId,first.approvalMessageId,'same-second receipt persists in SmartSync');
 assert.equal(s.g.sheetToJson_(s.sheets.get('dormitory'))[0].approvalMessageId,first.approvalMessageId,'same-second receipt persists in Sheet');
 const sendCount=()=>s.telegram.filter(x=>x.method==='sendMessage').length;
 const n=sendCount();sent=submit(s,{...first,expectedRevision:first.approvalRevision,expectedToken:first.approvalToken});assert(sent.duplicate);assert.equal(sendCount(),n);
 assert.equal(click(s,first,'ok',{from:{id:'not-approver'}}).denied,true);assert.equal(current(s).status,'待審核');
 assert.equal(click(s,first,'ok',{message:{chat:{id:'wrong'},message_id:first.approvalMessageId}}).denied,true);
 assert.equal(click(s,first,'ok',{message:{chat:{id:s.config.chat},message_id:'wrong'}}).stale,true);
 assert(s.g.handleDormApprovalCallback_(s.config.chat,'dorm_ok_'+first.id,cq(s,first)).stale,'legacy buttons explain resend instead of silently acting');
 sent=submit(s,{...first,reason:'Changed reason',expectedRevision:first.approvalRevision,expectedToken:first.approvalToken});assert(sent.ok,sent.error);
 let second=copy(sent.record);assert.equal(second.approvalRevision,2);assert.notEqual(second.approvalToken,first.approvalToken);assert(click(s,first).stale);
 assert.equal(submit(s,{...first,reason:'Stale phone',expectedRevision:first.approvalRevision,expectedToken:first.approvalToken}).ok,false);
 sent=submit(s,{...first,forceResend:true});assert(sent.ok,sent.error);let third=copy(sent.record);
 assert.equal(third.reason,'Changed reason','Resend uses server content, never stale client snapshot');assert(click(s,second).stale);assert.equal(third.approvalRevision,2);
 assert.equal(s.g.handleDormPlatformDecision_({id:first.id,decision:'approve',approver:s.config.name,approverId:s.config.approver,expectedRevision:first.approvalRevision,expectedToken:first.approvalToken}).ok,false);
 s.setSmartFailure(true);assert.throws(()=>click(s,third),/Drive temporarily/);
 assert.equal(s.g.sheetToJson_(s.sheets.get('dormitory'))[0].status,'已核可');assert.equal(smart(s)[0].status,'待審核');
 s.setSmartFailure(false);let result=click(s,third);assert(result.ok);assert.equal(smart(s)[0].status,'已核可');assert.equal(current(s).approvalSyncPending,false);
 assert(click(s,third,'rej').alreadyProcessed);assert.equal(current(s).status,'已核可','repeat opposite decision cannot flip approved state');
 const edit=s.telegram.filter(x=>x.method==='editMessageText').at(-1);assert(!edit.payload.reply_markup.inline_keyboard.flat().some(b=>b.callback_data),'settled message has no decision buttons');
 // UI/Smart/legacy merges cannot resurrect an old pending copy, even with a later clock.
 const x=await load('ac_gascheck_dormitory_v2.html');
 try{assert.deepStrictEqual(x.errors,[]);const approved=copy(current(s)),stale={...third,updatedAt:'2099-01-01'};
  assert.equal(x.w.GC.cloud.merge([stale],[approved]).list[0].status,'已核可');
  assert.equal(x.w.GC.smartSync.mergeRows([approved],[stale])[0].status,'已核可');
 }finally{x.dom.window.close();}
 // Photos are uploaded before the Sheet write. Failed Telegram photo delivery is saved, but not approved.
 const p=server();initialize(p);p.setPhotoFailure(true);
 const photorec={...base,photos:['https://example.test/photo.jpg']};
 let partial=submit(p,photorec);assert.equal(partial.ok,false);assert.equal(partial.saved,true);assert.equal(click(p,partial.record).ok,false);
 const partialToken=partial.record.approvalToken;const messages=p.telegram.filter(t=>t.method==='sendMessage').length;
 p.setPhotoFailure(false);const retried=submit(p,{...partial.record,expectedRevision:partial.record.approvalRevision,expectedToken:partialToken});
 assert(retried.ok,retried.error);assert.equal(retried.record.approvalToken,partialToken);assert.equal(p.telegram.filter(t=>t.method==='sendMessage').length,messages);
 const large=server();initialize(large);const uploaded=submit(large,{...base,photos:['data:image/jpeg;base64,'+'A'.repeat(70000)]});assert(uploaded.ok,uploaded.error);assert(uploaded.record.photos[0].startsWith('https://'));
 // Polling keeps failed updates for retry, preserves offsets across repair, and consumes terminal denied clicks.
 const q=server();initialize(q);let qr=submit(q,base).record;q.props.GC_TELEGRAM_OFFSET='40';q.props.tg_processed_uids='20';
 const beforeRepair=q.telegram.length;let health=q.g.repairGascheckTelegram();q.g.repairGascheckTelegram();
 assert.equal(health.version,'v62-single-decision-card');assert.equal(q.triggers.length,1);assert.equal(q.props.GC_TELEGRAM_OFFSET,'40');assert.equal(q.props.tg_processed_uids,'20');
 assert(q.telegram.slice(beforeRepair).every(t=>!['sendMessage','sendPhoto'].includes(t.method)));assert(q.telegram.filter(t=>t.method==='deleteWebhook').every(t=>t.payload.drop_pending_updates===false));
 q.updates.push({update_id:40,callback_query:cq(q,qr,'ok',{from:{id:'denied'}})},{update_id:41,callback_query:cq(q,qr)});
 q.setSmartFailure(true);result=q.g.pollGascheckTelegram();assert.equal(result.ok,false);assert.equal(q.props.GC_TELEGRAM_OFFSET,'41');assert(!q.props.tg_processed_uids.split(',').includes('41'));
 q.setSmartFailure(false);q.setAckFailure(true);result=q.g.pollGascheckTelegram();assert(result.ok,result.error);assert.equal(q.props.GC_TELEGRAM_OFFSET,'42');assert.equal(smart(q)[0].status,'已核可');
 assert(q.telegram.some(t=>t.method==='editMessageText'&&t.payload.text.includes('已核可/Approved')),'expired popup still leaves visible result on original card');
 const settledEdits=q.telegram.filter(t=>t.method==='editMessageText').length;q.g.processGascheckTelegramUpdate_(q.updates[1]);assert.equal(q.telegram.filter(t=>t.method==='editMessageText').length,settledEdits);
 // Decision saves despite a transient Telegram edit error and repairs the same message on retry.
 const e=server();initialize(e);const er=submit(e,base).record;e.setEditFailure(true);assert.throws(()=>click(e,er),/Saved; retry/);assert.equal(current(e).status,'已核可');e.setEditFailure(false);assert(click(e,er).ok);
 // Water partial Sheet/Smart failure has the same repair behavior.
 const water=server();initialize(water,'waterdrum');const wr={id:'water1',date:'2026-09-18',fQty:4,fPrice:2000,sQty:2,sPrice:3000};
 water.g.replaceRecords_(water.g.getOrCreateSheet_('waterdrum'),[wr]);water.g.mergeGcSmartDirect_('waterdrum',[wr]);
 const digest=water.g.waterApprovalDigest(water.g.waterReportEntries([wr],'all','all'),'all','all');const wq={id:'waterclick',from:{id:water.config.approver},message:{chat:{id:water.config.chat},message_id:999,text:'Water approval'}};
 water.setSmartFailure(true);assert.equal(water.g.handleWaterApprovalCallback_(water.config.chat,'wdr_ok_2026-09_all_all_'+digest,wq).ok,false);
 water.setSmartFailure(false);assert(water.g.handleWaterApprovalCallback_(water.config.chat,'wdr_ok_2026-09_all_all_'+digest,wq).ok);assert.equal(smart(water,'waterdrum')[0].waterApprovals['2026-09|all|all'].status,'approved');
 // Real browser form -> URL-encoded POST -> GAS parser -> simulated storage / Telegram.
 const browserServer=server();initialize(browserServer);
 const br=submit(browserServer,{...base,gender:'Male',photos:['https://example.test/existing.jpg']}).record;
 const browser=await load('ac_gascheck_dormitory_v2.html',{vrt_dorm_hub_v2:{records:[br],inspections:[],violations:[],cfg:{}}},w=>Object.defineProperty(w.navigator,'onLine',{get:()=>false}));
 try{
  const w=browser.w,posts=[];
  w.fetch=async(url,opt={})=>{assert.equal(opt.method,'POST');const body=String(opt.body);posts.push(JSON.parse(new URLSearchParams(body).get('payload')));
   const result=browserServer.g.doPost({postData:{contents:body}});return {ok:true,json:async()=>JSON.parse(result.text)};};
  w.appForm.edit(br.id);
  for(const [id,val] of [['f-gender','Male'],['f-dept','Production'],['f-room','A-106']]){const el=w.document.getElementById(id);if(el.tagName==='SELECT'&&!Array.from(el.options).some(o=>o.value===val)){const o=w.document.createElement('option');o.value=val;o.textContent=val;el.appendChild(o);}el.value=val;}
  w.document.getElementById('f-reason').value='Edited in actual form';
  await w.appForm.submit();assert.equal(posts[0].action,'dormSubmit');assert.equal(current(browserServer).reason,'Edited in actual form');
  assert.equal(w.state.db().records.length,1);assert.equal(w.state.db().records[0].approvalRevision,2);assert.equal(w.state.db().records[0].photos[0],br.photos[0],'editing preserves existing photos');
  await w.records.resend(br.id);const latest=copy(current(browserServer));assert.equal(w.state.db().records[0].approvalToken,latest.approvalToken);
  // FIX pass (C1): the page has NO approve/reject (it used to post a hard-coded approver id).
  // Paul approves with the genuine Telegram button; the page picks the result up via sync.
  assert.equal(typeof w.records.approve,'undefined','no in-page approve');assert.equal(typeof w.records.reject,'undefined','no in-page reject');
  assert(!posts.some(p=>p.action==='dormDecision'),'page never posts dormDecision');
  assert.equal(browserServer.g.handleDormPlatformDecision_({id:br.id,decision:'approve',approver:'Paul',approverId:browserServer.config.approver,expectedRevision:latest.approvalRevision,expectedToken:latest.approvalToken}).ok,false,'HTTP decision refused');
  assert(click(browserServer,latest).ok,'genuine Telegram press approves');assert.equal(current(browserServer).status,'已核可');
  w.GC.cloud.get=async p=>browserServer.get(copy(p));w.GC.cloud.post=async p=>browserServer.post(copy(p));
  await w.records.refreshStatus(true);
  assert.equal(w.state.db().records.find(r=>r.id===br.id).status,'已核可','approval reaches the page through sync');
  assert.deepStrictEqual(browser.errors,[]);
 }finally{browser.dom.window.close();}
 console.log('v61 full approval: submit/edit/resend/photo retry, stale/group/user/revision guards, same-second and partial saves, expired popup, polling offset/idempotency, Water repair PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
