const assert=require('assert');
const path=require('path');
process.chdir(path.join(__dirname,'..'));
const {load}=require('./dom-harness.cjs');
const {server,copy}=require('./gas-approval-harness.cjs');
const pause=()=>new Promise(r=>setTimeout(r,20));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function setup(w){
  const Date0=w.Date;
  w.Date=class extends Date0{constructor(...args){super(...(args.length?args:['2026-10-06T11:18:33']));}static now(){return new Date0('2026-10-06T11:18:33').getTime();}};
  Object.defineProperty(w.navigator,'onLine',{configurable:true,get:()=>false});
}
(async()=>{
  const seed={vrt_waste_v3:{gate:[{id:'w1',date:'2026-10-06',supplier:'K.S.W.M',weight_kg:800,time_in:'10:00',time_out:'10:20',photos:['https://example.test/waste.jpg']}],internal:[{id:'r1',date:'2026-10-06',plastic_kg:2450,fabric_kg:65,core_kg:0,total_kg:2515}],tombstones:[{id:'deleted1',date:'2026-10-06',sourceType:'waste',_deleted:true,deletedAt:'2026-10-06 10:00:00',updatedAt:'2026-10-06 10:00:00'}]}};
  const x=await load('ac_gascheck_ehs_v2.html',seed,setup);
  try{
    const w=x.w;
    // Headers arrive but body never finishes: both GET and POST must time out.
    w.fetch=async()=>({ok:true,status:200,text:()=>new Promise(()=>{})});
    for(const method of ['get','post'])await assert.rejects(()=>w.GC.cloud[method]({action:'ping'},{timeout:25}),e=>e.timeout===true);
    console.log('PASS stalled GET/POST response bodies end with a timeout');

    // A report joins an older upload while the user changes its data.
    const mount=w.document.createElement('div');w.document.body.appendChild(mount);
    let rows=[{id:'a',date:'2026-10-06',value:1}],snapshots=[],downloads=0;
    const held=deferred();
    w.GC.cloud.upload=async (_tool,list)=>{snapshots.push(copy(list));if(snapshots.length===1)await held.promise;return {ok:true,list:copy(list),res:{ok:true}};};
    w.GC.cloud.download=async()=>{downloads++;return {ok:true,list:copy(rows),empty:false};};
    const ctrl=w.GC.mountCloudButtons(mount,{tool:'test',autoReconcile:false,getList:()=>rows,setList:v=>rows=v});
    const background=ctrl.upload({auto:true,silent:true});await pause();
    rows=[{id:'a',date:'2026-10-06',value:2}];
    const report=ctrl.upload({auto:false,silent:true,reason:'telegram_preflight'});
    const pull=ctrl.download({silent:true});await pause();
    assert.equal(snapshots.length,1);assert.equal(downloads,0,'download cannot overlap a write');
    held.resolve();await Promise.all([background,report,pull]);
    assert.equal(snapshots.length,2);assert.equal(snapshots[1][0].value,2,'fresh report snapshot is uploaded');
    assert.equal(rows[0].value,2);assert.equal(downloads,1);
    console.log('PASS upload/download serialized; preflight uploads changes made during background sync');

    // Reload restores real cloud upload/download and exercises actual HTML + GAS endpoints.
  }finally{x.dom.window.close();}
  const y=await load('ac_gascheck_ehs_v2.html',seed,setup);
  try{
    const w=y.w,s=server(),cfg=w.__configs.ehs,requests=[],progress=[];
    s.g.SpreadsheetApp={openById:()=>({getSheetByName:n=>s.sheets.get(n)||null})};
    w.ehsFlushTombstones=()=>{throw new Error('Legacy delete must not block report delivery');};
    w.GC.cloud.get=async p=>copy(s.get(p));
    w.GC.cloud.post=async p=>{requests.push(copy(p));return copy(s.post(p));};
    // No pending compatibility deletion can delay either direction.
    assert((await cfg.beforeCloudSync()).deferred);
    w.document.querySelector('[data-gc-open-tg]').onclick();await pause();
    const modal=w.document.querySelector('.gc-common-modal[data-gc-tool=ehs]'),get=k=>modal.querySelector('[data-gc-'+k+']');
    get('period').value='day';get('period').onchange();await pause();
    assert.equal(get('ref').value,'2026-10-06');
    const observer=new w.MutationObserver(()=>progress.push(get('send-state').textContent));
    observer.observe(get('send-state'),{childList:true,subtree:true});
    for(const scope of ['recycle','waste']){
      get('scope').value=scope;get('scope').onchange();await pause();
      assert(!get('send').disabled,scope+' has data');
      const one=get('send').onclick();get('send').onclick();await one;
      assert(get('send-state').textContent.startsWith('✓'),get('send-state').textContent);
      const last=requests.filter(p=>p.action==='telegram').at(-1);
      assert.equal(last.reportScope,scope);assert(last.updateExisting&&last.messageKey);
      if(scope==='recycle')assert(last.text.includes('2,515'));
      const before=s.telegram.filter(p=>p.method==='sendMessage').length;
      await get('send').onclick();
      assert.equal(s.telegram.filter(p=>p.method==='sendMessage').length,before,'same report retry edits its original card');
    }
    observer.disconnect();
    assert(progress.some(t=>/雲端|上傳/.test(t)),'modal reports sync stages');
    assert(requests.some(p=>p.action==='smartCommit'),'GAS commit confirmed before sending');
    const pulled=s.get({action:'smartBucket',tool:'ehs',bucket:'m:2026-10'}).records;
    assert(pulled.some(r=>r.id==='deleted1'&&r._deleted),'deletion tombstone committed without legacy preflight');
    assert(!cfg.read().some(r=>r.id==='deleted1'&&!r._deleted),'deleted row stays absent');
    assert.deepStrictEqual(y.errors,[]);
    console.log('PASS actual Oct 6 Recycle 2,515kg / Waste sends, photos, double click, retries and deletions');
  }finally{y.dom.window.close();}

  // Telegram rate limiting/network failure is not an HTML error: no second send.
  for(const error of ['Too Many Requests: retry after 30','Forbidden: bot was kicked','Socket timeout']){
    const s=server();let calls=0;
    s.g.tgSendResult_=()=>{calls++;return {ok:false,error};};
    const result=s.g.sendTelegramMessage(s.config.chat,'<b>Report</b>',[],[],'ehs',{});
    assert(!result.ok);assert.equal(calls,1,error+' must not trigger a fallback send');
  }
  const f=server();let calls=0;
  f.g.tgSendResult_=()=>++calls===1?{ok:false,error:"Bad Request: can't parse entities"}:{ok:true,messageId:10};
  assert(f.g.sendTelegramMessage(f.config.chat,'<bad>Report',[],[],'ehs',{}).ok);assert.equal(calls,2);
  // A legacy page without a message key gets backend report deduplication too.
  const s=server();const body={tool:'ehs',text:'Report',reportPeriod:'day',reportRef:'2026-10-06',reportMode:'summary',reportScope:'waste'};
  const first=s.g.handleTelegramSend_(body),second=s.g.handleTelegramSend_(body);
  assert.equal(first.messageId,second.messageId);assert.equal(s.telegram.filter(p=>p.method==='sendMessage').length,1);
  console.log('PASS GAS formatting fallback only; legacy report retries reuse one card');
  const diagnostic=server(),methods=[];
  diagnostic.props.GC_TELEGRAM_TRANSPORT='polling';
  diagnostic.triggers.push({getHandlerFunction:()=> 'pollGascheckTelegram'});
  diagnostic.g.gcTgApi_=(method)=>{
    methods.push(method);
    return {ok:true,result:{getMe:{id:1,username:'test'},getChat:{title:'Test group',type:'supergroup'},getChatMember:{status:'administrator'},getWebhookInfo:{url:'',pending_update_count:0}}[method]};
  };
  assert(diagnostic.g.檢查發送連線().ok);
  assert.deepStrictEqual(methods,['getMe','getChat','getChatMember','getWebhookInfo']);
  assert.equal(diagnostic.telegram.length,0,'diagnostic sends no messages');
  console.log('PASS GS send diagnostic reads status only, without messages or configuration changes');
  for(const tool of ['cleaning','dormitory','ehs','portal']){
    const app=await load('ac_gascheck_'+tool+(tool==='portal'?'_v1.html':'_v2.html'),{},setup);
    try{
      const w=app.w,posted=[];
      const timer=w.setTimeout.bind(w);
      w.setTimeout=(fn,ms,...args)=>timer(fn,ms>=90000?25:ms,...args);
      w.fetch=async (_url,init)=>{posted.push(JSON.parse(init.body.get('payload')));return {ok:true,status:200,text:()=>new Promise(()=>{})};};
      await assert.rejects(()=>tool==='cleaning'?w.api.post({action:'ping'}):w.gasPost({action:'ping'}),e=>e.timeout===true);
      assert.equal(posted.length,1,tool+' native request ends at body timeout');
      assert.equal(posted[0].action,'ping','original form payload retained');
      assert.deepStrictEqual(app.errors,[]);
    }finally{app.dom.window.close();}
  }
  console.log('PASS Cleaning, Dorm, EHS and Portal native requests use the protected shared API');
})().catch(e=>{console.error(e);process.exitCode=1;});
