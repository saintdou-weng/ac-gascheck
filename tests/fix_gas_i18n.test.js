// GAS bot text i18n: every bot message / button / error is single-language (zh / en / km).
// en & km outputs contain no Chinese; km contains real Khmer; en/km use no full-width punctuation.
const assert=require('assert'),fs=require('fs'),path=require('path');
process.chdir(path.join(__dirname,'..'));
const {server,copy}=require('./gas-approval-harness.cjs');
const CJK=/[㐀-鿿]/,KM=/[ក-៿]/,FULLWIDTH=/[！-～　-〿]/;
let checks=0;
function flat(v){
  if(v==null)return '';
  if(typeof v==='string')return v;
  if(Array.isArray(v))return v.map(flat).join('\n');
  if(typeof v==='object')return Object.keys(v).filter(k=>!/^(url|data|callback_data)$/.test(k)).map(k=>flat(v[k])).join('\n');
  return String(v);
}
function expectLang(label,lang,value,{userData=[]}={}){
  let s=flat(value);userData.forEach(u=>{s=s.split(u).join('');});
  assert(s.trim(),label+' ['+lang+'] is empty');
  assert(s.length<4096,label+' ['+lang+'] longer than a Telegram message');
  if(lang==='en'||lang==='km'){
    assert(!CJK.test(s),label+' ['+lang+'] contains Chinese: '+(s.match(/.{0,30}[㐀-鿿].{0,30}/)||[''])[0]);
    assert(!FULLWIDTH.test(s),label+' ['+lang+'] contains full-width punctuation: '+(s.match(/.{0,20}[！-～　-〿].{0,20}/)||[''])[0]);
  }
  if(lang==='km')assert(KM.test(s),label+' [km] has no Khmer text');
  if(lang==='en')assert(!KM.test(s),label+' [en] contains Khmer');
  if(lang==='zh'){assert(CJK.test(s),label+' [zh] has no Chinese');assert(!KM.test(s),label+' [zh] contains Khmer');}
  checks++;
}
const LANGS=['zh','en','km'];
const base={id:'dorm-i18n',type:'搬入',name:'Sok Dara',idNo:'5833',roomNo:'A-106',date:'2026-09-25',reason:'Near factory',department:'Production',position:'Sewer',reviewer:'Phea',note:'Bring ID',items:[{code:'fan',name:'Fan',checked:true,condition:'Good'},{code:'key',name:'Key',checked:false,condition:'Lost'}],photos:[],status:'待審核',timestamp:'2026-09-23 10:40:47'};
const userData=['Sok Dara','5833','A-106','Near factory','Production','Sewer','Phea','Bring ID','Paul Weng','2026-09-25','2026-09-23 10:40:47'];
function setup(){const s=server();s.files.set(s.g.gcSmartManifestName_('dormitory'),JSON.stringify({version:1,tool:'dormitory',buckets:{},recordCount:0}));return s;}

// ── Helper semantics ──
{
  const s=setup(),g=s.g;
  assert.equal(g.L3('zh','中','En','ខ្មែរ'),'中');assert.equal(g.L3('en','中','En','ខ្មែរ'),'En');assert.equal(g.L3('km','中','En','ខ្មែរ'),'ខ្មែរ');
  assert.equal(g.L3('km','中','En',''),'En','km falls back to English, never Chinese');
  assert.equal(g.L3('','中','En','ខ្មែរ','LEGACY'),'LEGACY','GROUP_LANG unset keeps legacy combined text');
  s.props.GROUP_LANG='km';assert.equal(g.L3('','中','En','ខ្មែរ','LEGACY'),'ខ្មែរ','GROUP_LANG=km applies when no request lang');
  assert.equal(g.L3('en','中','En','ខ្មែរ','LEGACY'),'En','explicit lang beats GROUP_LANG');
  assert.equal(g.gcLangOf_('bi'),'multi');assert.equal(g.gcLangOf_('KM'),'km');assert.equal(g.gcLangOf_('zh-TW'),'zh');
  // All short bot texts (callback toasts, page errors) in every language.
  const keys=Object.keys(vmGet(g,'GC_BOT_TEXT_'));assert(keys.length>=30);
  for(const lang of LANGS)for(const k of keys)expectLang('bot text '+k,lang,g.gcBotText_(lang,k,{name:'Paul Weng',n:2}),{userData:['Paul Weng','Paul']});
  for(const lang of LANGS)for(const t of ['asset','dormitory','cleaning','keymovement','ehs','waterdrum','temperature'])expectLang('tool '+t,lang,g.gcToolName_(t,lang),{userData:['EHS']});
  console.log('PASS helpers: L3 / GROUP_LANG / km→en fallback / '+keys.length+' bot texts x3');
}
function vmGet(g,name){return require('vm').runInContext(name,g);}

// ── Dorm approval card: submit → card + buttons; decision via Telegram → edited card + toast ──
for(const lang of LANGS){
  const s=setup();
  const r=s.g.handleDormSubmitGet_({data:Object.assign(copy(base),{lang})});assert(r.ok,r.error);
  assert.equal(r.record.lang,lang,'record keeps the sender language');
  const sent=s.telegram.filter(t=>t.method==='sendMessage').at(-1).payload;
  expectLang('dorm approval card',lang,sent.text,{userData});
  expectLang('dorm approval buttons',lang,sent.reply_markup.inline_keyboard,{userData});
  assert(sent.reply_markup.inline_keyboard.flat().some(b=>/^dorm2:ok:/.test(b.callback_data)),'callback_data format unchanged');
  // Telegram message.text is the plain text of the card.
  const cardText=s.g.telegramSafeFallback_(sent.text);
  const cq=(id,from)=>({update_id:id,callback_query:{id:'cb'+id,data:'dorm2:ok:'+r.record.approvalToken,from:{id:from},message:{chat:{id:s.config.chat},message_id:r.record.approvalMessageId,text:cardText}}});
  s.g.processGascheckTelegramUpdate_(cq(1,'someone-else'));
  const acks=s.telegram.filter(t=>t.method==='answerCallbackQuery').map(t=>t.payload.text);
  acks.forEach(a=>expectLang('dorm callback toast (denied)',lang,a,{userData}));
  s.g.processGascheckTelegramUpdate_(cq(2,s.config.approver));
  const edit=s.telegram.filter(t=>t.method==='editMessageText').at(-1).payload;
  expectLang('dorm decided card',lang,edit.text,{userData});
  expectLang('dorm decided buttons',lang,edit.reply_markup.inline_keyboard);
  s.telegram.filter(t=>t.method==='answerCallbackQuery').map(t=>t.payload.text).forEach(a=>expectLang('dorm callback toast',lang,a,{userData}));
  // Rejected card with legacy stored reason + move-out type.
  const rej=Object.assign(copy(base),{lang,type:'搬出',status:'已退件',rejectReason:'Telegram 退件 / Rejected from Telegram'});
  expectLang('dorm rejected card',lang,s.g.dormApplicationText_(rej),{userData});
  expectLang('dorm superseded suffix',lang,s.g.gcBotText_(lang,'superseded2'));
  // Errors returned to the page follow the request language (doPost → GC_REQ_LANG_).
  const bad=JSON.parse(s.g.doPost({postData:{contents:JSON.stringify({action:'dormSubmit',data:JSON.stringify({id:'x',lang})})}}).text);
  assert.equal(bad.ok,false);expectLang('dormSubmit error',lang,bad.error);
}
{ // Legacy (no lang, GROUP_LANG unset) keeps the existing combined card.
  const s=setup();const r=s.g.handleDormSubmitGet_({data:copy(base)});assert(r.ok);
  const t=s.telegram.filter(t=>t.method==='sendMessage').at(-1).payload.text;
  assert(t.includes('Reviewer：Phea')&&t.includes('待審核 / Pending'),'legacy card unchanged when no language is chosen');
  s.props.GROUP_LANG='en';const r2=s.g.handleDormSubmitGet_({data:Object.assign(copy(base),{id:'dorm-group',idNo:'9999'})});assert(r2.ok,r2.error);
  expectLang('dorm card via GROUP_LANG',
    'en',s.telegram.filter(t=>t.method==='sendMessage').at(-1).payload.text,{userData:userData.concat(['9999'])});
}
console.log('PASS dorm: approval card, buttons, toasts, decided/rejected card, page errors in zh/en/km');

// ── Water approval callback (card language detected from the report card) ──
for(const lang of LANGS){
  const s=setup(),g=s.g;
  const rows=[{id:'d2',date:'2026-08-02',fQty:4,fPrice:3000,fTime:'08:00',sQty:2,sPrice:4000,sTime:'15:30',exchangeRate:4000,updatedAt:'2026-08-02'}];
  Object.assign(g,{readCanonicalAuditRecords_:()=>rows,replaceRecords_:()=>{},mergeGcSmartDirect_:()=>{}});
  const digest=g.waterApprovalDigest(g.waterReportEntries(rows,'all','all'),'all','all');
  const title={zh:'💧 送水月報核可 2026-08',en:'💧 Water monthly approval 2026-08',km:'💧 ការអនុម័តរបាយការណ៍ទឹកប្រចាំខែ 2026-08'}[lang];
  const cq=from=>({id:'w',from:{id:from},message:{chat:{id:s.config.chat},message_id:77,text:title+'\nFactory 4 × 3000'}});
  let res=g.handleWaterApprovalCallback_(s.config.chat,'wdr_ok_2026-08_all_all_'+digest,cq('stranger'));
  expectLang('water denied',lang,res.message,{userData:['Paul Weng']});
  res=g.handleWaterApprovalCallback_(s.config.chat,'wdr_ok_2026-08_all_all_'+digest,cq(s.config.approver));assert(res.ok,res.message);
  expectLang('water decision toast',lang,res.message);
  const edit=s.telegram.filter(t=>t.method==='editMessageText').at(-1).payload;
  expectLang('water decided card',lang,edit.text.replace(title,''),{userData:['Paul Weng','Factory 4 × 3000','2026-09-19 10:00:00']});
  expectLang('water dashboard button',lang,edit.reply_markup.inline_keyboard);
  // Re-deciding replaces the previous footer instead of stacking (any language).
  const again=Object.assign(cq(s.config.approver),{message:{chat:{id:s.config.chat},message_id:77,text:s.g.telegramSafeFallback_(edit.text)}});
  rows[0].waterApprovals={};g.handleWaterApprovalCallback_(s.config.chat,'wdr_ok_2026-08_all_all_'+digest,again);
  const e2=s.telegram.filter(t=>t.method==='editMessageText').at(-1).payload.text;
  assert.equal(e2.split(g.gcBotText_(lang,'approved')).length,2,'one decision footer only ['+lang+']');
}
console.log('PASS water: denied/approved toast, edited card footer, dashboard button in zh/en/km');

// ── Menu, cloud status, weekly status, upload notice, photo captions ──
for(const lang of LANGS){
  const s=setup(),g=s.g,mods={asset:3,dormitory:1,cleaning:0,keymovement:2,ehs:5,waterdrum:30,temperature:60};
  const menu=g.buildTelegramMenu_(lang,'09/29 10:00');
  expectLang('menu text',lang,menu.text);expectLang('menu buttons',lang,menu.keyboard.inline_keyboard,{userData:['EHS']});expectLang('menu fallback',lang,menu.fallbackTitle);
  expectLang('cloud status',lang,g.buildStatusMessage_(mods,lang,'2026/09/29 10:00'));
  expectLang('weekly status report',lang,g.buildWeeklyStatusReport_(mods,lang,'2026/09/29'),{userData:['Vantage River Textiles · SHV']});
  expectLang('upload notice',lang,g.buildPushNoticeText_(lang,{mode:'merge',tool:'cleaning',received:3,added:1,updated:1,kept:1,photos:2,before:10,total:11,time:'09/29 10:00'}));
  // /gc km → Khmer menu through the real Telegram handler.
  const before=s.telegram.length;g.handleTelegram({message:{chat:{id:s.config.chat},text:'/gc '+lang}});
  const sent=s.telegram.slice(before).find(t=>t.method==='sendMessage').payload;expectLang('/gc menu',lang,[sent.text,sent.reply_markup.inline_keyboard]);
  const r=g.sendTelegramMessage(s.config.chat,'report',[],['https://example.test/p.jpg'],'waterdrum',{lang});assert(r.ok);
  expectLang('photo caption',lang,s.telegram.filter(t=>t.method==='sendPhoto').at(-1).payload.caption.replace('AC GASCHECK · ',''));
  const partial=g.gcBotText_(lang,'photoPartial',{n:1});expectLang('photo partial error',lang,partial);
}
console.log('PASS menu / cloud status / weekly report / upload notice / photo caption in zh/en/km');

// ── Reminders (group language via GROUP_LANG) ──
for(const lang of LANGS){
  const s=setup(),g=s.g;s.props.GROUP_LANG=lang;
  const mods=vmGet(g,'MONTHLY_REPORT_MODULES');
  g.auditMonthlyCompletion_=()=>({ok:true,reportMonth:'2026-08',modules:mods,missing:mods.map((m,i)=>Object.assign({},m,{cloud:i%2===0,telegram:i%3===0}))});
  let res=g.sendMonthlyMissingReport_('2026-08',false);assert(res.sent);
  let p=s.telegram.filter(t=>t.method==='sendMessage').at(-1).payload;expectLang('monthly missing reminder',lang,[p.text,p.reply_markup.inline_keyboard],{userData:['EHS','Cloud']});
  const recs=[{record:{id:'t1',updatedAt:'2026-09-03 08:00:00'},businessDate:'2026-09-03'}];
  g.auditRecentUpdateCompletion_=()=>({ok:true,currentMonth:'2026-09',missing:[Object.assign({},mods[7],{groupKey:'temperature:all:2026-09',reportMonth:'2026-09',records:recs,dateList:['2026-09-03'],dateCounts:{'2026-09-03':1},count:1,totalPending:4})]});
  res=g.sendRecentUpdateMissingReport_({now:new Date('2026-09-10T03:00:00Z'),markDone:false,ignoreState:true});assert(res.sent,JSON.stringify(res));
  p=s.telegram.filter(t=>t.method==='sendMessage').at(-1).payload;expectLang('recent update reminder',lang,[p.text,p.reply_markup.inline_keyboard],{userData:['Summary / Approval']});
  const pending=[Object.assign(copy(base),{id:'p1'}),Object.assign(copy(base),{id:'p2',idNo:'6000',type:'搬出'})];
  g.auditWeeklyPendingApprovals_=()=>({ok:true,weekStart:'2026-09-28',missing:[Object.assign({},mods[1],{count:2,records:pending,examples:pending.map(r=>g.approvalRecordLabel_('dormitory',r))})]});
  res=g.sendWeeklyPendingApprovalReport_(new Date('2026-09-29T03:00:00Z'));assert(res.sent,JSON.stringify(res));
  p=s.telegram.filter(t=>t.method==='sendMessage').at(-1).payload;expectLang('weekly pending reminder',lang,[p.text,p.reply_markup.inline_keyboard],{userData:userData.concat(['6000'])});
  expectLang('pending label (missing fields)',lang,g.approvalRecordLabel_('dormitory',{},lang));
}
{ // Unset GROUP_LANG keeps the trilingual legacy reminder.
  const s=setup(),g=s.g,mods=vmGet(g,'MONTHLY_REPORT_MODULES');
  const msg=g.buildMonthlyMissingMessage_({reportMonth:'2026-08',missing:[Object.assign({},mods[0],{cloud:false,telegram:false})]});
  assert(CJK.test(msg)&&KM.test(msg)&&msg.includes('Previous-month report reminder'),'legacy trilingual reminder kept by default');
}
console.log('PASS reminders: monthly / recent-update / weekly-pending + buttons in zh/en/km (GROUP_LANG)');

// ── Static scan: no unguarded Chinese literals in message builders ──
{
  let src=fs.readFileSync('ac_gascheck_core_v3_fixed.gs','utf8');
  src=src.replace(/\/\*[\s\S]*?\*\//g,m=>m.replace(/[^\n]/g,' '));
  const builders=['buildPushNoticeText_','dormKeyboard_','dormApplicationText_','dormSupersedeMessage_','handleDormApprovalCallback_','handleWaterApprovalCallback_',
    'handleTelegram','processGascheckTelegramUpdate_','gcResolveCallbackNotice_','buildTelegramMenu_','sendTelegramMenu','buildStatusLines_','buildStatusMessage_','sendStatusMessage_',
    'sendTelegramMessage','handleTelegramSend_','buildRecentUpdateMissingMessage_','sendRecentUpdateMissingReport_','buildMonthlyMissingMessage_','sendMonthlyMissingReport_',
    'approvalRecordLabel_','buildWeeklyPendingApprovalMessage_','sendWeeklyPendingApprovalReport_','buildWeeklyStatusReport_','weeklyReport','handleDormPlatformDecision_',
    'handleDormSubmitGet_','gcWithApprovalLock_','offloadWaterPhotosToDrive_','testTg','gcPortalButtonText_','gcDashboardButtonText_','gcDormTypeText_','gcModuleTitle_','gcReasonText_','gcToolName_'];
  // v5 approval flows (EHS / Asset) added by the backend fix, when present.
  ['handleEhsApprovalCallback_','gcSendAssetRequest_','handleAssetApprovalCallback_','gcFinishDecisionCard_'].forEach(n=>{if(new RegExp('\\nfunction '+n+'\\s*\\(').test(src))builders.push(n);});
  // Stored data values (legacy Chinese statuses/types/reasons) are data, not output text.
  const dataTokens=["'已核可'","'已退件'","'待審核'","'搬出'","'搬入'","'Telegram 退件 / Rejected from Telegram'","'Dashboard 退件 / Rejected from Dashboard'","'申請人收回 / Withdrawn by applicant'"];
  const lit=/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g,offenders=[];
  for(const name of builders){
    const start=src.search(new RegExp('\\nfunction '+name.replace(/\$/g,'\\$')+'\\s*\\('));
    assert(start>=0,'builder not found: '+name);
    let body=src.slice(start+1),depth=0,end=0,seen=false;
    for(let i=0;i<body.length;i++){const c=body[i];if(c==='{'){depth++;seen=true;}else if(c==='}'){depth--;if(seen&&depth===0){end=i+1;break;}}}
    body=body.slice(0,end);
    // Legacy combined output, reachable only when no language was chosen (GROUP_LANG unset).
    body=body.replace(/if\(lang==='multi'\)return[\s\S]*?x\.time;/,'');
    // A multi-line L3( … ) call is one guarded expression: join its lines.
    for(let at=body.indexOf('L3(');at>=0;at=body.indexOf('L3(',at+3)){
      let d=0,j=at+2;for(;j<body.length;j++){if(body[j]==='(')d++;else if(body[j]===')'&&--d===0)break;}
      body=body.slice(0,at)+body.slice(at,j).replace(/\n/g,' ')+body.slice(j);
    }
    body.split('\n').forEach((line,i)=>{
      const code=line.replace(/\/\/[^'"\n]*$/,'');
      const bad=(code.match(lit)||[]).filter(s=>CJK.test(s)&&!dataTokens.includes(s));
      if(bad.length&&!/L3\(|gcBotText_|gcCbText_|gcV5Text_|\bt\(|\bf\(|zhNote|Logger\.log/.test(code))offenders.push(name+': '+code.trim().slice(0,140));
    });
  }
  assert.deepStrictEqual(offenders,[],'unguarded Chinese literals in message builders:\n'+offenders.join('\n'));
  console.log('PASS static scan: '+builders.length+' message builders have no unguarded Chinese literals');
}
console.log('fix_gas_i18n: '+checks+' language checks PASS');
