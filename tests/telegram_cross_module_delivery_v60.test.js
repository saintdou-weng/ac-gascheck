const assert=require('assert');
const {load}=require('./dom-harness.cjs');
const copy=v=>JSON.parse(JSON.stringify(v));
const pause=()=>new Promise(r=>setTimeout(r,30));
const fixtures={
  waterdrum:{wdr_2026_09:[{day:18,fQty:4,fPrice:2000,fTime:'08:00',checkBy:'Inspector'}]},
  temperature:{vrt_th_z:[{id:'za',en:'Building A Workshop',on:true}],vrt_th_r:[{id:'t1',d:'2026-09-18',z:'za',p:'morning',t:27,h:70,checker:'Inspector'}]},
  cleaning:{ac_gc_sender_cleaning_v1:'Inspector',vrt_clean_hub_v2:{records:[{id:'c1',date:'2026-09-18',locId:'loc_canteen',cleaner:'Cleaner',checker:'Inspector',slots:['07:30'],checks:{smell:true,light:true,floor:true,door:true,corner:true,ceiling:true}}]}},
  keymovement:{vrt_keys:Array.from({length:60},(_,i)=>({id:'k'+i,key_no:'K'+i,issue_date:'2026-09-18',issue_time:'08:30',dept:'Factory department',recipient_name:'Employee number '+i,checker:'Inspector'}))},
  ehs:{vrt_waste_v3:{gate:Array.from({length:28},(_,i)=>({id:'g'+i,date:'2026-09-18',name:'Driver',supplier:'Supplier company '+i,weight_kg:100+i,time_in:'08:00',time_out:'08:30',checked_by:'Inspector '+i})),internal:Array.from({length:28},(_,i)=>({id:'r'+i,date:'2026-09-18',plastic_kg:i+1,fabric_kg:5,core_kg:4,total_kg:i+10,checked_by:'Inspector '+i}))}},
  asset:{vrt_a7:[{id:'AHA001',code:'AHA001',name:'Desk',purchaseDate:'2026-09-18',zone:'expat',category:'furniture',qty:1,unitPrice:50,recordedBy:'Recorder',status:'active'}]},
  dormitory:{vrt_dorm_hub_v2:{records:[{id:'d1',date:'2026-09-18',type:'搬入',name:'Resident',idNo:'8000',roomNo:'A-101',status:'待審核',timestamp:'2026-09-18 08:00:00'}]}}
};
function setup(w){
  const RealDate=w.Date,realTimeout=w.setTimeout.bind(w);
  w.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-09-19T14:52:00']));}static now(){return new RealDate('2026-09-19T14:52:00').getTime();}};
  Object.defineProperty(w.navigator,'onLine',{configurable:true,get:()=>false});
  w.setTimeout=(fn,ms,...args)=>realTimeout(fn,ms===1100?0:ms,...args);
}
function validateHtml(text){
  const stack=[];
  for(const match of text.matchAll(/<(\/)?([\w-]+)(?:\s[^>]*)?>/g)){
    if(match[1])assert.equal(stack.pop(),match[2],'Page tags are balanced');else stack.push(match[2]);
  }
  assert.equal(stack.length,0,'Every page closes its own HTML');
}
(async()=>{
  for(const [tool,seed] of Object.entries(fixtures)){
    const x=await load('ac_gascheck_'+tool+'_v2.html',seed,setup);
    try{
      const w=x.w,cfg=w.__configs[tool],posts=[],remote=new Map();let failUpload=true;
      assert.deepStrictEqual(x.errors,[],tool+' boot');
      w.GC.cloud.get=async p=>p.action==='smartManifest'?{ok:false,error:'unknown action smartManifest'}:{ok:true,list:copy(remote.get(p.tool)||[])};
      w.GC.cloud.post=async p=>{
        posts.push(copy(p));
        if(p.type==='save'){
          if(failUpload)throw new Error('Upload unavailable');
          remote.set(p.tool,copy(p.list));return {ok:true};
        }
        if(p.action==='telegram'){
          assert(p.text.length<=3900,tool+' page is within size limit');validateHtml(p.text);
          return {ok:true,messageId:100+posts.length,photosSent:(p.photos||[]).length};
        }
        throw new Error('Unexpected mock action: '+(p.action||p.type));
      };
      w.document.querySelector('[data-gc-open-tg]').onclick();await pause();
      const modal=w.document.querySelector('.gc-common-modal[data-gc-tool='+tool+']'),get=k=>modal.querySelector('[data-gc-'+k+']');
      get('period').value='week';get('period').onchange();await pause();
      // zh UI → report language defaults to single-language Chinese; user may still pick bilingual.
      assert.equal(get('lang').value,'zh',tool+' report language defaults to UI language');
      get('lang').value='bi';get('lang').onchange();await pause();
      assert.equal(get('ref').value,'2026-09-14',tool+' selects current week');
      assert(!get('send').disabled,tool+': '+get('send-state').textContent+' / '+get('preview').textContent);
      const count=cfg.read().length;
      await get('send').onclick();
      assert(get('send-state').textContent.includes('Cloud upload failed'),tool+' explains upload failure');
      assert.equal(posts.filter(p=>p.action==='telegram').length,0,tool+' never sends before failed upload');
      assert.equal(cfg.read().length,count,tool+' preserves local rows on failure');
      assert(!get('send').disabled,tool+' can retry');

      failUpload=false;posts.length=0;
      const expected=cfg.telegramBuilder?await cfg.telegramBuilder({cfg,period:'week',ref:'2026-09-14',mode:'summary',scope:cfg.telegramScopeMultiple?['all']:'all',slot:cfg.telegramSlotMultiple?['all']:'all',sender:'Inspector',lang:'bi'}):null;
      const sending=get('send').onclick();await get('send').onclick();await sending;
      assert(get('send-state').textContent.startsWith('✓'),tool+': '+get('send-state').textContent);
      const messages=posts.filter(p=>p.action==='telegram');assert(messages.length,tool+' has confirmed messages');
      assert(posts.findIndex(p=>p.type==='save')<posts.findIndex(p=>p.action==='telegram'),tool+' uploads first');
      assert.equal(messages.at(-1).reportRef,'2026-09-14');
      assert.equal(messages.at(-1).reportPeriod,'week');
      assert.equal(messages.filter(p=>p.reportMode).length,1,'Completion recorded once, on final page only');
      // 1003 TG format: EHS is a compact card (supplier lines + exceptions), so only Key Movement still reproduces the long report.
      if(tool==='keymovement'){
        const asText=html=>{const el=w.document.createElement('div');el.innerHTML=html;return el.textContent;};
        if(Array.isArray(expected.pages)){
          // GC.TG compact format: the builder splits the long report itself (every record still listed, one per line).
          assert(expected.pages.length>1,tool+' builder paginates the long report');
          assert(messages.length===expected.pages.length,tool+' sends every page');
          assert.deepStrictEqual(messages.map(p=>p.text),Array.from(expected.pages),tool+' no report text lost while splitting');
          const allText=asText(expected.pages.join('\n'));
          cfg.read().filter(r=>!r._deleted).forEach(r=>assert(allText.includes(r.key_no||r.supplier||r.id),tool+' lists every record across pages'));
        }else{
          assert(expected.text.length>4096,tool+' reproduces original long report failure');
          assert(messages.length>1,tool+' automatically paginates');
          assert.equal(messages.map(p=>asText(p.text.replace(/^\[\d+\/\d+\]\n/,''))).join(''),asText(expected.text),tool+' no report text lost while splitting');
        }
        assert.equal(new Set(messages.map(p=>p.messageKey)).size,messages.length,'No duplicate page sent by rapid double-click');
        if(tool==='keymovement'){
          const long='<b><i>'+('🗝️ &lt;倉庫&gt; &amp; សោ '.repeat(500))+'</i></b>';
          const pages=w.GC.telegram.paginateHtml(long);
          pages.forEach(p=>{assert(p.length<3900);validateHtml(p);});
          assert.equal(pages.map(p=>asText(p.replace(/^\[\d+\/\d+\]\n/,''))).join(''),asText(long),'Long single-line Unicode/HTML entities are preserved');
          const attempts=[];let rejectPage=true;
          w.GC.cloud.post=async p=>{attempts.push(copy(p));if(rejectPage&&attempts.length===2)throw new Error('Simulated page failure');return{ok:true,messageId:200+attempts.length,photosSent:(p.photos||[]).length};};
          const meta={reportPeriod:'month',reportRef:'2026-09-01',reportMode:'summary'};
          await assert.rejects(()=>w.GC.telegram.send(long,[],[],'test-chat','keymovement',meta),/Page 2|第 2\/4 頁/);
          assert(!attempts.some(p=>p.reportMode),'Partial delivery cannot record completion');
          const firstKey=attempts[0].messageKey;rejectPage=false;attempts.length=0;
          await w.GC.telegram.send(long,[],[],'test-chat','keymovement',meta);
          assert.equal(attempts[0].messageKey,firstKey,'Retry reuses page identity');
          assert.equal(attempts.filter(p=>p.reportMode).length,1);
        }
      }else{assert.equal(messages.length,1,'Double-click sends one report');if(tool==='ehs'){assert(expected.text.length<=3900,'ehs compact card fits one page');assert.equal(messages[0].text,expected.text,'ehs report text sent as built');}}
      if(tool==='keymovement'){
        w.promptDelete('k0');w.promptDelete('k1');
        const dead=JSON.parse(w.localStorage.getItem('vrt_key_tombstones'));
        assert.deepStrictEqual(dead.map(r=>r.id).sort(),['k0','k1'],'Deleted movement IDs stay separate');
        w.KEY_V31.cloudWrite(w.KEY_V31.cloudRead());
        assert.equal(cfg.read().filter(r=>!r._deleted).length,58,'Cloud write preserves deletions and other loans');
        assert.equal(JSON.parse(w.localStorage.getItem('vrt_key_tombstones')).length,2);
      }
      assert.deepStrictEqual(x.errors,[],tool+' send');
      console.log('v60 '+tool+': actual modal, week, upload failure, retry, delivery confirmation and double-click PASS');
    }finally{x.dom.window.close();}
  }
  const portal=await load('ac_gascheck_portal_v1.html',{},setup);
  try{
    const w=portal.w,notices=[];let calls=0,resolve;
    w.toast=s=>notices.push(s);w.gasPost=()=>{calls++;return new Promise(r=>resolve=r);};
    const first=w.sendTgMenu();w.sendTgMenu();assert.equal(calls,1,'Portal ignores duplicate clicks');
    resolve({ok:true});await first;assert(/No delivery confirmation|未回傳送達確認|送達確認/.test(notices.at(-1)),'Portal cannot claim success without a receipt');
    w.gasPost=async()=>({ok:true,messageId:123});await w.sendTgMenu();assert(notices.at(-1).startsWith('✅'));
    assert.deepStrictEqual(portal.errors,[]);
    console.log('v60 Portal: double-click, missing receipt, confirmed retry PASS');
  }finally{portal.dom.window.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
