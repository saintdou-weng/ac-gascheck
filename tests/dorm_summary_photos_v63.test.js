const assert=require('assert'),path=require('path');process.chdir(path.join(__dirname,'..'));
const {load}=require('./dom-harness.cjs'),{server,copy}=require('./gas-approval-harness.cjs');
const pause=()=>new Promise(r=>setTimeout(r,30)),date='2026-10-06';
const photos=Array.from({length:8},(_,i)=>'https://example.test/inspection-'+i+'.jpg');
function setup(w){const D=w.Date;w.Date=class extends D{constructor(...a){super(...(a.length?a:[date+'T11:00:00']));}static now(){return new D(date+'T11:00:00').getTime();}};Object.defineProperty(w.navigator,'onLine',{configurable:true,get:()=>false});}
function bridge(w,s){s.g.Utilities.formatDate=()=>date+' 11:00:00';s.g.SpreadsheetApp={openById:()=>({getSheetByName:n=>s.sheets.get(n)||null})};w.GC.cloud.get=async p=>copy(s.get(p));w.GC.cloud.post=async p=>copy(s.post(p));}
(async()=>{
 const x=await load('ac_gascheck_dormitory_v2.html',{},setup);
 try{
  const w=x.w;assert.deepStrictEqual(x.errors,[]);const cols=w.eval('INSP_COLS').map(c=>c.k),normal=Object.fromEntries(cols.map(k=>[k,'N'])),db=w.state.db();
  Object.assign(w.cfg.get(),{rooms_foreignDorm:['#201','#202','#203'],rooms_factory:['車間A'],rooms_localDorm:[],rooms_office:[]});
  db.records=[];db.inspections=[{id:'i1',date,location:'foreignDorm',inspector:'Phea',timestamp:date+' 08:00:00',updatedAt:date+' 08:00:00',data:{'#201':normal,'#202':{...normal,gas:'X'},'#203':{}},photos},{id:'i2',date,location:'factory',inspector:'Nin',timestamp:date+' 09:00:00',updatedAt:date+' 09:00:00',data:{'車間A':normal},photos:['https://example.test/factory.jpg']}];w.state.save();
  const cfg=w.__configs.dormitory,opt={cfg,period:'day',ref:date,lang:'en'};
  let packet=w.buildDormTelegram({...opt,scope:'part:dorm'});
  assert(packet.text.includes('• ✅ <b>#201</b>'));assert(packet.text.includes('• ❌ <b>#202</b>'));assert(packet.text.includes('• ❌ <b>#203</b>'));assert(packet.text.includes('Incomplete / not checked'));assert(!packet.text.includes('Workshop A'));
  assert.equal(packet.photos.length,8,'all eight normal/abnormal inspection photos included');
  packet=w.buildDormTelegram({...opt,scope:'part:factory'});assert(packet.text.includes('✅ <b>Workshop A</b>'));assert(!packet.text.includes('#201'));assert.equal(packet.photos.length,1);
  db.records=[{id:'a1',type:'搬入',name:'Alice',date,roomNo:'A-101',status:'待審核',photos:['https://example.test/alice.jpg']},{id:'a2',type:'搬出',name:'Bob',date,roomNo:'A-102',status:'待審核',photos:[]},{id:'a3',type:'搬入',name:'Frank',date:'2026-09-01',roomNo:'A-101',status:'已核可'}];
  packet=w.buildDormTelegram({...opt,scope:'part:in'});assert(packet.text.includes('Alice'));assert(!packet.text.includes('Bob'));assert(!packet.text.includes('#201'));assert.deepStrictEqual(copy(packet.photos),['https://example.test/alice.jpg']);
  packet=w.buildDormTelegram({...opt,scope:'part:out'});assert(packet.text.includes('Bob'));assert(!packet.text.includes('Alice'));assert.equal(packet.photos.length,0);
  packet=w.buildDormTelegram({...opt,scope:'room:A-101'});assert(packet.text.includes('Alice'));assert(!packet.text.includes('Bob'));
  db.records=[];
  const s=server();bridge(w,s);
  w.document.querySelector('[data-gc-open-tg]').onclick();await pause();const modal=w.document.querySelector('.gc-common-modal[data-gc-tool=dormitory]'),get=k=>modal.querySelector('[data-gc-'+k+']');
  get('period').value='day';get('period').onchange();get('scope').value='part:dorm';get('scope').onchange();await pause();
  assert.equal(get('ref').value,date);assert(!get('send').disabled,'inspection-only period can send with no personnel applications');
  await get('send').onclick();assert(get('send-state').textContent.startsWith('✓'),get('send-state').textContent);
  assert.equal(s.telegram.filter(t=>t.method==='sendPhoto').length,8);
  const requests=s.requests.filter(p=>p.action==='telegram');assert.deepStrictEqual(requests.map(p=>p.photos.length),[5,3]);assert(requests[1].photosOnly);assert(requests[0].deferReportCompletion);assert(!requests[1].deferReportCompletion);
  assert(s.files.size>0,'inspection data stored in SmartSync before report');assert(s.requests.some(p=>p.tool==='dormitory_inspections'&&p.action!=='telegram'));
  assert(!s.sheets.get('dormitory')?.rows.some(row=>row.includes('i1')),'inspection rows never enter personnel Sheet');
  const cards=s.telegram.filter(t=>t.method==='sendMessage').length;
  await get('send').onclick();assert.equal(s.telegram.filter(t=>t.method==='sendPhoto').length,8,'resend dedupes eight photos');assert.equal(s.telegram.filter(t=>t.method==='sendMessage').length,cards,'resend edits original card');
  // Missing selected inspection photo upload prevents a misleading success/text-only summary.
  const original=w.GC.smartSync.upload;w.GC.smartSync.upload=async(tool,list)=>({ok:true,list,photoFailures:[{id:'i1'}]});
  await get('send').onclick();assert(get('send-state').textContent.startsWith('✕'));assert.equal(s.telegram.filter(t=>t.method==='sendMessage').length,cards);w.GC.smartSync.upload=original;
  // Save clears the draft; native Send must still use saved photos and correct room statuses.
  w.insp.setLoc('foreignDorm');w.document.getElementById('insp-date').value='2026-10-07';w.document.getElementById('insp-inspector').value='Phea';w.insp.allOk();
  w.GC.photo.compress=async()=> 'data:image/jpeg;base64,AA==';await w.insp.pickPhotos({files:[{name:'after-save.jpg'}]});await w.insp.save();assert.equal(w.document.querySelectorAll('#insp-photo-grid img').length,0);
  await w.insp.sendTg();const native=s.requests.filter(p=>p.action==='telegram').at(-1);assert(native.text.includes('10-07'));assert(native.text.includes('✅ <b>#201</b>'));assert.equal(native.photos.length,1);assert(native.photos[0].startsWith('https://drive.google.com/'),'saved local inspection photo uploaded before send');assert(!JSON.stringify(db.inspections.find(r=>r.date==='2026-10-07').photos).includes('data:image'));assert(s.telegram.filter(p=>p.method==='sendPhoto').at(-1).payload.photo.testBlob,'Telegram receives image bytes');assert.equal(db.inspections.filter(r=>r.date==='2026-10-07').length,1);
  assert.deepStrictEqual(x.errors,[]);console.log('PASS Dorm separate sections, per-room results, inspection-only send, eight photos, saved draft, upload gate and retry');
 }finally{x.dom.window.close();}
 // Partial second batch must never complete a report. Retry updates one text card and sends only failed photos.
 const y=await load('ac_gascheck_temperature_v2.html',{},setup);
 try{const w=y.w,s=server();bridge(w,s);let completed=0;s.g.markReportCompletionForActivity_=()=>{completed++;};let fail=true;
  w.GC.cloud.post=async p=>{if(p.photosOnly)s.setPhotoFailure(fail);return copy(s.post(p));};
  const meta={reportPeriod:'day',reportRef:date,reportMonth:'2026-10',reportScope:'all',reportMode:'summary'};
  await assert.rejects(()=>w.GC.telegram.send('Eight photos',photos,[],null,'temperature',meta),/Photo|照片|រូបថត/);assert.equal(completed,0);
  fail=false;s.setPhotoFailure(false);await w.GC.telegram.send('Eight photos',photos,[],null,'temperature',meta);assert.equal(completed,1);assert.equal(s.telegram.filter(t=>t.method==='sendMessage').length,1);assert.equal(s.telegram.filter(t=>t.method==='sendPhoto').length,11,'8 confirmed + 3 failed attempts');
  await w.GC.telegram.send('Eight photos',photos,[],null,'temperature',meta);assert.equal(s.telegram.filter(t=>t.method==='sendPhoto').length,11);
  const rec={type:'搬入',roomNo:'A-101'};assert(s.g.activityScopeCoversRecord_({scope:'part:in'},'dormitory',rec,''));assert(!s.g.activityScopeCoversRecord_({scope:'part:out'},'dormitory',rec,''));assert(!s.g.activityScopeCoversRecord_({scope:'part:dorm'},'dormitory',rec,''));assert(s.g.activityScopeCoversRecord_({scope:'room:A-101'},'dormitory',rec,''));
  const large=Array.from({length:501},(_,i)=>'https://example.test/large-'+i+'.jpg'),options={dedupePhotos:true,photoDedupeKey:'large-month'};
  const first=s.g.gcSendTelegramPhotos_(s.config.chat,large,'temperature',options);assert.equal(first.photosSent,501);
  const retry=s.g.gcSendTelegramPhotos_(s.config.chat,large,'temperature',options);assert.equal(retry.photosSkipped,501,'large report retains every photo receipt beyond 400');
  assert([...s.files.keys()].some(name=>name.startsWith('telegram_photos_')));assert(Object.values(s.props).every(v=>v.length<7800));
  console.log('PASS photo batch failure/retry, 501-photo dedupe and scoped personnel completion');
 }finally{y.dom.window.close();}
})().catch(e=>{console.error(e);process.exit(1)});
