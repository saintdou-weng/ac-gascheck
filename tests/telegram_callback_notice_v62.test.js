const assert=require('assert');
const {server,copy}=require('./gas-approval-harness.cjs');
const base={id:'dorm-repeat',type:'搬入',name:'Test Applicant',idNo:'5833',roomNo:'A-106',date:'2026-09-25',reason:'Near factory',department:'Production',reviewer:'Phea',items:[{name:'Key',checked:true}],photos:[],status:'待審核',timestamp:'2026-09-23 10:40:47'};
function setup(){const s=server();s.files.set(s.g.gcSmartManifestName_('dormitory'),JSON.stringify({version:1,tool:'dormitory',buckets:{},recordCount:0}));const r=s.g.handleDormSubmitGet_({data:copy(base)});assert(r.ok,r.error);return {s,r:r.record};}
function update(s,r,id,decision='ok'){return {update_id:id,callback_query:{id:'different-click-'+id,data:'dorm2:'+decision+':'+r.approvalToken,from:{id:s.config.approver},message:{chat:{id:s.config.chat},message_id:r.approvalMessageId,text:'Dorm application'}}};}
function count(s,method){return s.telegram.filter(t=>t.method===method).length;}
// The screenshot shows three different clicks/updates, not one replayed update ID.
// Telegram has expired their popup by the time polling receives them.
const a=setup();a.s.setAckFailure(true);const before=count(a.s,'sendMessage');
for(let id=10;id<13;id++)a.s.g.processGascheckTelegramUpdate_(update(a.s,a.r,id));
assert.equal(count(a.s,'sendMessage'),before,'Three approval clicks must update the original card without adding success replies');
let rows=a.s.g.readDormRecordForDecision_(base.id);assert.equal(rows.rows.length,1);assert.equal(rows.record.status,'已核可');
const card=a.s.telegram.filter(t=>t.method==='editMessageText'&&String(t.payload.message_id)===String(a.r.approvalMessageId)).at(-1).payload;
for(const content of ['Test Applicant','5833','A-106','Near factory','Reviewer：Phea','Approver：'+a.s.config.name,'已核可 / Approved'])assert(card.text.includes(content),content);
assert(card.reply_markup.inline_keyboard.flat().some(b=>b.url&&b.url.endsWith('ac_gascheck_portal_v1.html')),'Keep Main Portal shortcut from user reference');
assert(card.reply_markup.inline_keyboard.flat().every(b=>!b.callback_data),'Decision buttons removed');
a.s.g.processGascheckTelegramUpdate_(update(a.s,a.r,13,'rej'));assert.equal(count(a.s,'sendMessage'),before);assert.equal(a.s.g.readDormRecordForDecision_(base.id).record.status,'已核可');
// A genuine message-edit failure gets one visible notice across distinct clicks,
// and it becomes a resolved notice after retry instead of adding another reply.
const b=setup();b.s.setAckFailure(true);b.s.setEditFailure(true);const n=count(b.s,'sendMessage');
for(let id=20;id<23;id++)assert.throws(()=>b.s.g.processGascheckTelegramUpdate_(update(b.s,b.r,id)),/Saved; retry/);
assert.equal(count(b.s,'sendMessage'),n+1,'Only one failure notice for the same application');
b.s.setEditFailure(false);b.s.g.processGascheckTelegramUpdate_(update(b.s,b.r,23));assert.equal(count(b.s,'sendMessage'),n+1);
const noticeId=b.s.telegram.filter(t=>t.method==='sendMessage'&&t.payload.reply_parameters).at(-1).payload;
assert(noticeId);const resolved=Object.values(JSON.parse(b.s.props.GC_CALLBACK_NOTICES_V2)).find(v=>v.resolved);assert(resolved,'earlier failure notice marked resolved');assert(b.s.telegram.filter(t=>t.method==='editMessageText').some(t=>String(t.payload.message_id)===String(resolved.messageId)&&t.payload.text.includes('已核可 / Approved')));
// Denied clicks do not approve and do not flood the group after popup expiry.
const c=setup();c.s.setAckFailure(true);const cBefore=count(c.s,'sendMessage');
for(let id=30;id<33;id++){const u=update(c.s,c.r,id);u.callback_query.from.id='unauthorized';c.s.g.processGascheckTelegramUpdate_(u);}
assert.equal(c.s.g.readDormRecordForDecision_(base.id).record.status,'待審核');assert.equal(count(c.s,'sendMessage'),cBefore+1);
// The common receiver must apply the same no-extra-success policy to Water.
const w=server();const wr={id:'water1',date:'2026-09-18',fQty:4,fPrice:2000,sQty:2,sPrice:3000};
w.files.set(w.g.gcSmartManifestName_('waterdrum'),JSON.stringify({version:1,tool:'waterdrum',buckets:{},recordCount:0}));w.g.replaceRecords_(w.g.getOrCreateSheet_('waterdrum'),[wr]);w.g.mergeGcSmartDirect_('waterdrum',[wr]);
const digest=w.g.waterApprovalDigest(w.g.waterReportEntries([wr],'all','all'),'all','all');w.setAckFailure(true);
for(let id=40;id<43;id++){const u=update(w,{approvalToken:'unused',approvalMessageId:999},id);u.callback_query.data='wdr_ok_2026-09_all_all_'+digest;u.callback_query.message.text='Water cost approval';w.g.processGascheckTelegramUpdate_(u);}
assert.equal(count(w,'sendMessage'),0,'Water also edits its report without extra success replies');
console.log('v62 different callback IDs / expired popup / retry / denied user: one full card, Phea and both links, no repeated success messages PASS');
