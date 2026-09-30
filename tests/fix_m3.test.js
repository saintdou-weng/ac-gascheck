// FIX-M3 regression tests: Cleaning / Temperature / Water Drum
// (tombstones, validation, double-click guards, i18n single-language, sync scheduling).
// Standalone: `node tests/fix_m3.test.js` — prints PASS lines, exits non-zero on failure.
const assert=require('assert');
const {load}=require('./dom-harness.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const CJK=/[㐀-鿿豈-﫿]/;
const eq=(a,b,m)=>assert.equal(JSON.stringify(a),JSON.stringify(b),m); // cross-realm safe

// Minimal in-memory smart-sync backend (manifest / bucket / commit) shared by several jsdom "phones".
function fakeGas(){
  const tools={};
  const T=t=>tools[t]||(tools[t]={buckets:{},staged:{},meta:{},metaHash:''});
  async function handle(method,url,body){
    const u=new URL(url);let p={};
    if(method==='GET')u.searchParams.forEach((v,k)=>p[k]=v);else{try{p=JSON.parse(body);}catch(e){try{p=JSON.parse(new URLSearchParams(body).get('payload'));}catch(_){}}}
    const t=T(p.tool||'');
    if(p.action==='smartManifest'){const hashes={},counts={};Object.entries(t.buckets).forEach(([k,b])=>{hashes[k]=b.hash;counts[k]=b.count;});return {ok:true,data:{exists:Object.keys(hashes).length>0||!!t.init,legacy:false,hashes,counts,metaHash:t.metaHash,meta:t.meta}};}
    if(p.action==='smartBucket'&&method==='GET')return {ok:true,data:{records:(t.buckets[p.bucket]||{}).records||[]}};
    if(p.action==='smartBucket'){t.staged[p.uploadId+'|'+p.bucket]={hash:p.hash,count:p.count,records:p.records};return {ok:true,data:{hash:p.hash,count:p.count}};}
    if(p.action==='smartCommit'){const nb={};Object.entries(p.hashes).forEach(([k,h])=>{const st=t.staged[p.uploadId+'|'+k];nb[k]=st?st:(t.buckets[k]&&t.buckets[k].hash===h?t.buckets[k]:{hash:h,count:p.counts[k],records:[]});});t.buckets=nb;t.init=true;t.meta=p.meta||{};t.metaHash=(p.meta||{})._smartMetaHash||'';return {ok:true,data:{timestamp:new Date().toISOString()}};}
    if(p.action==='telegram')return {ok:true,messageId:1};
    return {ok:true,records:[]};
  }
  return {rows:tool=>Object.values(T(tool).buckets).flatMap(b=>b.records),
    fetchFor:()=>async(url,opt={})=>{const res=await handle((opt.method||'GET').toUpperCase(),String(url),String(opt.body||''));return {ok:true,status:200,json:async()=>res,text:async()=>JSON.stringify(res)};}};
}
const ts='2026-09-28 08:00:00';
const cleanRec=(id,loc)=>({id,batchId:id,timestamp:ts,updatedAt:ts,date:'2026-09-28',locId:loc,shift:'Day',cleaner:'Srey',checker:'Nin',slots:['08:00'],checks:{smell:true},note:'',photos:[]});

(async()=>{
  // ───────────── CLEANING ─────────────
  {
    const S=fakeGas(),conf=w=>{w.fetch=S.fetchFor();};
    const A=await load('ac_gascheck_cleaning_v2.html',{},conf);await wait(900);
    assert.equal(A.errors.length,0,A.errors.join('\n'));
    const w=A.w;
    // first screen = daily work tab
    assert(w.document.getElementById('pane-rec').classList.contains('active'),'Cleaning opens on the New Record tab');
    // A3 tombstones survive a concurrent add on another phone
    w.state.upsertRecords([cleanRec('X','loc_office')],{sync:false});
    assert((await w.GC.sync.upload('cleaning',{silent:true})).ok);
    const B=await load('ac_gascheck_cleaning_v2.html',{},conf);await wait(900);
    await B.w.GC.sync.download('cleaning',{silent:true});
    w.delRec('X');
    eq(w.__configs.cleaning.read().map(r=>r.id),[],'deleted record hidden immediately');
    B.w.state.upsertRecords([cleanRec('Y','loc_canteen')],{sync:false});
    assert((await B.w.GC.sync.upload('cleaning',{silent:true})).ok);
    await w.GC.sync.reconcile('cleaning','resume');await wait(200);
    eq(w.__configs.cleaning.read().map(r=>r.id),['Y'],'deleted record does not resurrect');
    assert(S.rows('cleaning').some(r=>r.id==='X'&&r._deleted===true),'tombstone reaches the cloud');
    await B.w.GC.sync.reconcile('cleaning','resume');await wait(200);
    assert(!B.w.__configs.cleaning.read().some(r=>r.id==='X'),'other phone drops the deleted record');
    // re-entering the same date+location+slot after a delete revives it
    w.state.upsertRecords([Object.assign(cleanRec('X2','loc_office'),{updatedAt:'2026-12-31 23:00:00',_deleted:false})],{sync:false});
    assert(w.__configs.cleaning.read().some(r=>r.locId==='loc_office'),'new entry at a deleted key is live again');
    console.log('PASS cleaning A3 tombstones (delete propagates, no resurrection, revive by re-entry)');

    // A12 checker kept across background reconcile + required on save
    w.state.db().checkers=['Phea','Nin'];w.state.populate();
    w.document.getElementById('r-checker').value='Phea';
    w.document.dispatchEvent(new w.Event('visibilitychange'));await wait(700);
    w.state.populate();
    assert.equal(w.document.getElementById('r-checker').value,'Phea','checker selection survives reconcile/populate');
    w.document.getElementById('r-checker').value='';
    w.state.toggleLoc('loc_office');w.state.toggleLocSlot('loc_office','07:30');w.state.cycleLocCheck('loc_office','smell');
    const before=w.__configs.cleaning.read().length;
    await w.rec.save();
    assert.equal(w.__configs.cleaning.read().length,before,'save without checker is refused');
    assert(w.document.getElementById('r-checker').classList.contains('gcx-invalid'),'checker field highlighted');
    w.document.getElementById('r-checker').value='Nin';
    await Promise.all([w.rec.save(),w.rec.save()]);
    assert.equal(w.__configs.cleaning.read().length,before+1,'double tap saves once');
    assert.equal(w.document.getElementById('r-date').value,w.de.fmt(new Date()),'date resets to today');
    console.log('PASS cleaning A12 checker preserved + validated, double-click guard');

    // C11 6S: validation, double-click guard, cleared form, included in cloud sync rows
    w.ui.tab('sixs');
    await w.sixs.save();
    assert.equal(w.state.db().sixsRecords.length,0,'6S without location is refused');
    w.document.getElementById('s6-loc').value='loc_office';w.sixs.mark('sort',0,'ok');
    await Promise.all([w.sixs.save(),w.sixs.save()]);
    assert.equal(w.state.db().sixsRecords.length,1,'6S double tap saves once');
    assert.equal(w.document.getElementById('s6-loc').value,'','6S form cleared after save');
    const cloudRows=w.__configs.cleaning.cloudRead();
    assert(cloudRows.some(r=>r._syncKind==='cleaning_sixs'),'6S rides the smart sync');
    assert(!w.__configs.cleaning.read().some(r=>r._syncKind),'6S never mixes into cleaning stats/Telegram');
    assert(Array.isArray(w.__configs.cleaning.extra().bins)&&Array.isArray(w.__configs.cleaning.extra().mapZones),'bins/map zones in config sync');
    assert((await w.GC.sync.upload('cleaning',{silent:true})).ok);
    await B.w.GC.sync.download('cleaning',{silent:true});
    assert.equal(B.w.state.db().sixsRecords.length,1,'6S reaches the other phone');
    console.log('PASS cleaning C11 6S guard/clear/sync');

    // B11 location types stored as codes; old Chinese values mapped; export translated
    const C=await load('ac_gascheck_cleaning_v2.html',{gc_lang:'en',vrt_clean_hub_v2:{records:[],locations:[{id:'L1',name:'Toilet 1',type:'廁所'},{id:'L2',name:'Hall',type:'飯堂'}],cleaners:[],checkers:[],slots:[],cfg:{}}});await wait(500);
    eq(C.w.state.db().locations.map(l=>l.type),['toilet','canteen'],'old Chinese types mapped to codes');
    let aoa=null;C.w.XLSX={utils:{aoa_to_sheet:a=>{aoa=a;return {};},book_new:()=>({}),book_append_sheet(){}},writeFile(){}};
    C.w.areas.exportXL();
    assert(aoa&&!aoa.flat().some(v=>CJK.test(String(v))),'Areas Excel in English mode has no Chinese: '+JSON.stringify(aoa));
    assert.equal(aoa[1][1],'Toilet');
    // cleaning:505 floor term (km)
    C.w.i18n.set('km');assert.equal(C.w.i18n.t('ci-floor'),'កម្រាលឥដ្ឋ');
    C.w.i18n.set('en');
    // B2 translator: exact only, never rewrites user data
    C.w.state.db().cleaners=['Cleaner A'];C.w.renderStaff();C.w.applyCleaningStaticLanguage();
    assert.equal(C.w.document.getElementById('cleaner-tags').textContent.replace('✕',''),'Cleaner A');
    C.w.i18n.set('km');C.w.applyCleaningStaticLanguage();
    assert.equal(C.w.document.getElementById('cleaner-tags').textContent.replace('✕',''),'Cleaner A','user data untouched in km');
    C.w.i18n.set('en');
    // Telegram modal: default language = UI language; summary only
    C.w.document.querySelector('[data-gc-open-tg]').click();await wait(60);
    const modal=C.w.document.querySelector('.gc-common-modal[data-gc-tool=cleaning]');
    assert.equal(modal.querySelector('[data-gc-lang]').value,'en','report language defaults to UI language');
    assert(modal.querySelector('[data-gc-mode=approval]').hidden&&modal.querySelector('[data-gc-mode=review]').hidden,'no fake approval option');
    console.log('PASS cleaning B11 codes + export, floor term, B2 exact translator, Telegram defaults');

    // cleaning:1668 JSON restore merges (newer wins) instead of overwriting
    const db=C.w.state.db();db.records=[Object.assign(cleanRec('N','L1'),{updatedAt:'2026-09-29 09:00:00',note:'newer'})];
    C.w.confirm=()=>true;
    const file={files:[new C.w.File([JSON.stringify({records:[Object.assign(cleanRec('O','L1'),{updatedAt:'2026-01-01 00:00:00',note:'older'})],locations:[{id:'L9',name:'New',type:'office',updatedAt:'2026-01-01'}]})],'b.json')],value:''};
    C.w.dataMgmt.importAll(file);await wait(150);
    eq(C.w.state.db().records.map(r=>r.note),['newer'],'older backup does not overwrite newer local record');
    assert(C.w.state.db().locations.some(l=>l.id==='L9')&&C.w.state.db().locations.some(l=>l.id==='L1'),'locations merged, none lost');
    // A18 clear-all: requires CLEAR; clears data + sync state
    C.w.__gcNoReload=true;C.w.localStorage.setItem('ac_gc_smart_sync_v1_cleaning','{"hashes":{"m:2026-09":"x"}}');
    C.w.prompt=()=>'no';await C.w.dataMgmt.clear();
    assert(C.w.localStorage.getItem('vrt_clean_hub_v2'),'wrong confirmation keeps data');
    C.w.prompt=()=>'CLEAR';await C.w.dataMgmt.clear();
    assert.equal(C.w.localStorage.getItem('vrt_clean_hub_v2'),null,'local data cleared');
    assert.equal(C.w.localStorage.getItem('ac_gc_smart_sync_v1_cleaning'),null,'sync state cleared so the cloud is not wiped');
    console.log('PASS cleaning JSON restore merge + A18 CLEAR confirmation');
    [A,B,C].forEach(x=>x.dom.window.close());
  }

  // ───────────── TEMPERATURE ─────────────
  {
    const S=fakeGas(),conf=w=>{w.fetch=S.fetchFor();};
    const A=await load('ac_gascheck_temperature_v2.html',{},conf);await wait(900);
    assert.equal(A.errors.length,0,A.errors.join('\n'));
    const w=A.w,z=w.eval('getZ()')[0].id,z2=w.eval('getZ()')[1].id;
    assert(w.document.getElementById('pnl-rec').classList.contains('on'),'Temperature opens on the Record tab');
    w.eval(`setR([{id:'r1',z:'${z}',d:'2026-07-10',p:'morning',t:30,h:60,ts:'2026-07-10 08:00:00',updatedAt:'2026-07-10 08:00:00'}])`);
    assert((await w.GC.sync.upload('temperature',{silent:true})).ok);
    w.delRec('r1');w.document.getElementById('cf-ok').onclick();
    eq(w.eval('getR().map(r=>r.id)'),[]);
    await w.GC.sync.reconcile('temperature','resume');await wait(200);
    assert(S.rows('temperature').some(r=>r.id==='r1'&&r._deleted===true),'temperature tombstone synced (no no-cors delete)');
    const B=await load('ac_gascheck_temperature_v2.html',{vrt_th_r:[{id:'r1',z,d:'2026-07-10',p:'morning',t:30,h:60,ts:'2026-07-10 08:00:00',updatedAt:'2026-07-10 08:00:00'}]},conf);await wait(900);
    await B.w.GC.sync.reconcile('temperature','resume');await wait(200);
    eq(B.w.eval('getR().map(r=>r.id)'),[],'other phone drops the deleted reading');
    console.log('PASS temperature A3 tombstones');

    // C10 empty save → validation, not "saved"
    const toasts=[];w.toast=(m,k)=>toasts.push(k+':'+m);
    w.showTab('rec');w.saveAllRec();
    assert(toasts.length&&toasts[0].startsWith('err:')&&!/已儲存|Saved/.test(toasts[0]),'empty Save All shows a validation error');
    w.popREmod(null);w.document.getElementById('re-date').value='2026-09-29';await w.saveREedit();
    assert.equal(w.eval("getR().filter(r=>r.d==='2026-09-29').length"),0);
    assert(w.document.getElementById('re-tmp').classList.contains('gcx-invalid'),'empty add-modal highlights temperature');
    // C7 collision → ask; cancel keeps both, confirm replaces and tombstones the old key
    w.eval(`setR(getR().concat([{id:'a',z:'${z}',d:'2026-09-28',p:'morning',t:31,h:61,ts:'${ts}',updatedAt:'${ts}'},{id:'b',z:'${z2}',d:'2026-09-28',p:'morning',t:25,h:55,ts:'${ts}',updatedAt:'${ts}'}]))`);
    let asked='';w.confirm=m=>{asked=m;return false;};
    w.openREmod('a');w.document.getElementById('re-zon').value=z2;await w.saveREedit();
    assert(asked,'collision asks first');
    eq(w.eval("getR().filter(r=>r.d==='2026-09-28').map(r=>r.id).sort()"),['a','b'],'cancel never deletes the other reading');
    w.confirm=()=>true;w.openREmod('a');w.document.getElementById('re-zon').value=z2;await w.saveREedit();
    eq(w.eval("getR().filter(r=>r.d==='2026-09-28').map(r=>r.id+':'+r.z)"),['a:'+z2]);
    assert(w.eval(`getRAll().some(r=>r._deleted&&r.z==='${z}'&&r.d==='2026-09-28')`),'old slot gets a tombstone');
    console.log('PASS temperature C10 validation + C7 collision prompt');

    // A9 import limit 5000 rows + warning (stub SheetJS)
    const rows=[['日期 Date','區域 Zone','時段 Period','溫度 Temp','濕度 Humidity']];
    for(let i=0;i<5200;i++)rows.push([46235+Math.floor(i/8),['Sewing','Cutting','Finishing','Warehouse'][i%4],i%8<4?'AM':'PM',30,70]);
    let lastRange=null;
    w.XLSX={read:()=>({SheetNames:['Data'],Sheets:{Data:{'!ref':'A1:E5201'}}}),utils:{decode_range:()=>({s:{r:0,c:0},e:{r:5200,c:4}}),sheet_to_json:(ws,o)=>{lastRange=o.range;return rows.slice(0,o.range.e.r+1);}}};
    const meta=await w.parseTemperatureSmartImport(new w.File(['x'],'t.xlsx'));
    assert.equal(lastRange.e.r,5000,'reads up to 5000 rows');
    assert(meta.summary.warnings.some(x=>/5000/.test(x)),'truncation warning shown');
    assert(meta.objects.length>200,'more than 200 rows imported');
    console.log('PASS temperature A9 import limit');

    // B10 single-language UI in en/km (toolbar, settings, title)
    w.setLang('en');
    ['i-zsel-title','i-zsel-all','i-zsel-none','i-zsel-hint','i-tg-help','i-tg-auto','i-gas-title'].forEach(id=>assert(!CJK.test(w.document.getElementById(id).textContent),id+' has no Chinese in en'));
    assert(!CJK.test(w.document.title),'document title single-language');
    w.setLang('km');assert(!CJK.test(w.document.getElementById('i-zsel-hint').textContent));
    assert.equal(w.eval("T('danwarn')").includes('ប្រឡែក'),false,'Khmer typo fixed');
    w.setLang('zh');
    console.log('PASS temperature B10 single-language toolbar/settings/title');
    [A,B].forEach(x=>x.dom.window.close());
  }

  // ───────────── WATER DRUM ─────────────
  {
    const S=fakeGas(),conf=w=>{w.fetch=S.fetchFor();};
    const now=new Date(),ym=now.getFullYear()+'_'+String(now.getMonth()+1).padStart(2,'0'),day=now.getDate();
    const seed={['wdr_'+ym]:[{day,fTime:'08:10',fQty:'4',fPrice:'2000',fTtl:8000,fPhotos:['https://drive.example/f.jpg'],sTime:'',sQty:'',sPrice:'',sTtl:0,checkBy:'Nin',updatedAt:'2026-09-01 08:00:00'}]};
    const A=await load('ac_gascheck_waterdrum_v2.html',seed,conf);await wait(900);
    assert.equal(A.errors.length,0,A.errors.join('\n'));
    const w=A.w;let asked='';w.confirm=m=>{asked=m;return true;};
    const scheduled=[];const orig=w.GC.sync.schedule;w.GC.sync.schedule=(...a)=>{scheduled.push(a[1]);return orig.apply(w.GC.sync,a);};
    // C5 add record on a day that already has data: merge, warn, keep photos
    w.openAddModal();
    assert.equal(+w.document.getElementById('modal-date').value,day,'modal date defaults to today');
    assert(w.document.getElementById('modal-existing-note').style.display!=='none','"date already has data" note shown');
    w.document.getElementById('modal-sta-qty').value='2';w.document.getElementById('modal-sta-price').value='3000';
    await Promise.all([w.saveModalRecord(),w.saveModalRecord()]);
    const row=JSON.parse(w.localStorage.getItem('wdr_'+ym)).find(r=>r.day===day);
    assert(asked,'asks before touching an existing day');
    assert.equal(row.fQty,'4');eq(row.fPhotos,['https://drive.example/f.jpg']);assert.equal(row.fTime,'08:10');
    assert.equal(row.sQty,'2');assert(row.sTime,'staff time defaulted');
    // A11 save schedules sync (pending state)
    assert(scheduled.includes('record_save'),'water save schedules cloud sync');
    // empty modal save → validation
    w.openAddModal();await w.saveModalRecord();
    assert(w.document.getElementById('modal-fac-qty').classList.contains('gcx-invalid'),'empty add-record highlights qty');
    w.closeModal('add-modal');
    console.log('PASS water C5 merge/warn + A11 sync scheduling + validation');

    // C14 ✕ asks before clearing a day
    asked='';w.confirm=m=>{asked=m;return false;};
    const idx=w.eval('currentRows').findIndex(r=>+r.day===day);w.clearRow(idx);
    assert(asked&&JSON.parse(w.localStorage.getItem('wdr_'+ym)).find(r=>r.day===day).fQty==='4','clear-day asks and cancel keeps data');
    // Today button scrolls/flashes today's row
    w.goToday();await wait(120);
    assert(w.document.getElementById('row-'+day).classList.contains('wdr-flash'),'Today highlights today\'s row');
    console.log('PASS water C14 confirm + Today row');

    // A3 month delete → tombstones, synced, not resurrected by another phone
    w.confirm=()=>true;
    assert((await w.GC.sync.upload('waterdrum',{silent:true})).ok);
    w.deleteHistoryMonth(String(now.getFullYear()),String(now.getMonth()+1).padStart(2,'0'));
    assert.equal(w.__configs.waterdrum.read().filter(r=>r.fQty||r.sQty).length,0,'month gone locally');
    await w.GC.sync.reconcile('waterdrum','resume');await wait(200);
    assert(S.rows('waterdrum').some(r=>r._deleted===true),'month tombstones reach the cloud');
    const B=await load('ac_gascheck_waterdrum_v2.html',seed,conf);await wait(900);
    await B.w.GC.sync.reconcile('waterdrum','resume');await wait(200);
    assert.equal(B.w.__configs.waterdrum.read().filter(r=>r.fQty||r.sQty).length,0,'other phone does not resurrect the month');
    // typing into a deleted day revives it
    const bi=B.w.eval('currentRows').findIndex(r=>+r.day===day);B.w.updateRow(bi,'fQty','3');
    assert(B.w.__configs.waterdrum.read().some(r=>+r.day===day&&r.fQty==='3'),'re-entered day is live');
    console.log('PASS water A3 month delete tombstones');

    // single-language title / buttons
    w.setLang('en');assert(!CJK.test(w.document.title));assert(!CJK.test(w.document.querySelector('[data-wdr-location=all]').textContent));
    w.setLang('km');assert(!CJK.test(w.document.title));
    [A,B].forEach(x=>x.dom.window.close());
  }
  console.log('fix_m3 (cleaning/temperature/waterdrum): ALL PASS');
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
