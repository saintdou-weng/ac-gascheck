const assert=require('assert'),fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const {load}=require('./dom-harness.cjs');
const copy=v=>JSON.parse(JSON.stringify(v));
const largePhoto='data:image/jpeg;base64,'+'A'.repeat(70000);
const otherPhoto='data:image/jpeg;base64,'+'B'.repeat(70000);

// In-memory Apps Script adapters. No calls to a real spreadsheet, Drive or chat.
function server(){
  class Range{
    constructor(s,r,c,n,m){Object.assign(this,{s,r,c,n,m});}
    getValues(){return Array.from({length:this.n},(_,i)=>Array.from({length:this.m},(_,j)=>(this.s.rows[this.r+i-1]||[])[this.c+j-1]??''));}
    setValues(v){
      if(v.some(row=>row.some(cell=>typeof cell==='string'&&cell.length>50000)))throw new Error('Your input contains more than the maximum of 50000 characters in a single cell');
      v.forEach((row,i)=>row.forEach((cell,j)=>{(this.s.rows[this.r+i-1]||(this.s.rows[this.r+i-1]=[]))[this.c+j-1]=cell;}));return this;
    }
    setBackground(){return this;}setFontColor(){return this;}setFontWeight(){return this;}
  }
  class Sheet{
    constructor(){this.rows=[];}
    getLastRow(){return this.rows.length;}getLastColumn(){return Math.max(0,...this.rows.map(r=>r.length));}
    getRange(r,c,n,m){return new Range(this,r,c,n,m);}getDataRange(){return this.getRange(1,1,this.getLastRow(),this.getLastColumn());}
    clear(){this.rows=[];}setFrozenRows(){}appendRow(r){this.rows.push(r);}deleteRows(r,n){this.rows.splice(r-1,n);}
  }
  const files=new Map(),sheets=new Map(),props={},photos=new Map(),telegram=[],requests=[];
  let photoFailure=false,nextMessage=100;
  const g={console,Logger:{log(){}},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,s)=>Array.from(crypto.createHash('sha256').update(String(s)).digest()),formatDate:()=> '2026-09-19 10:00:00',base64Decode:()=>[],newBlob:()=>({testBlob:true})},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=String(v);},deleteProperty:k=>{delete props[k];}})},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})},
    DriveApp:{getFileById:id=>{if(![...photos.values()].includes(id))throw new Error('Photo file not found');return {getBlob:()=>({testBlob:true,id})};}},
    UrlFetchApp:{fetch:(url,opt)=>{
      const payload=typeof opt.payload==='string'?JSON.parse(opt.payload):opt.payload;
      telegram.push({method:url.split('/').pop(),payload});
      const blocked=url.endsWith('/sendPhoto')&&(photoFailure||typeof payload.photo==='string'&&payload.photo.includes('drive.google.com'));
      return {getContentText:()=>JSON.stringify(blocked?{ok:false,description:'Bad Request: wrong type of the web page content'}:{ok:true,result:{message_id:payload.message_id||++nextMessage}})};
    }}};
  vm.createContext(g);vm.runInContext(fs.readFileSync('ac_gascheck_core_v3_fixed.gs','utf8'),g);
  Object.assign(g,{
    getOrCreateSheet_:name=>{if(!sheets.has(name))sheets.set(name,new Sheet());return sheets.get(name);},
    loadGcSmartFile_:name=>files.get(name)||null,
    saveGcSmartFile_:(name,content)=>{files.set(name,content);return name;},
    savePhotoToDrive_:(photo)=>{if(photoFailure)return '';if(!photos.has(photo))photos.set(photo,'photo_'+(photos.size+1));return 'https://drive.google.com/uc?export=view&id='+photos.get(photo);}
  });
  const post=body=>{requests.push(copy(body));const out=JSON.parse(g.doPost({postData:{contents:JSON.stringify(body)}}).text);if(out.ok===false)throw new Error(out.error);return out;};
  const get=p=>{const out=JSON.parse(g.doGet({parameter:p}).text);if(out.ok===false)throw new Error(out.error);return out;};
  return {g,post,get,telegram,requests,photos,sheets,setPhotoFailure:v=>{photoFailure=v;}};
}
const delivery={day:18,fQty:4,fPrice:2000,fTime:'08:00',sQty:2,sPrice:3000,sTime:'15:30',checkBy:'Phea',photos:[largePhoto],fPhotos:[largePhoto],sPhotos:[otherPhoto],updatedAt:'2026-09-18 16:00:00'};

(async()=>{
  // Backend must accept both new arrays and old Sheet JSON strings.
  const direct=server(),raw={...copy(delivery),id:'water18',date:'2026-09-18',fPhotos:JSON.stringify([largePhoto])};
  direct.g.offloadPhotosToDrive_('waterdrum',[raw]);
  assert(Array.isArray(raw.fPhotos)&&raw.fPhotos[0].startsWith('https://'),'Factory photo must be offloaded before the Sheet write');
  assert(raw.sPhotos[0].startsWith('https://'),'Staff house photo must be offloaded before the Sheet write');
  assert.equal(direct.photos.size,2,'A photo shared by two fields uploads once');
  assert.doesNotThrow(()=>direct.g.replaceRecords_(direct.g.getOrCreateSheet_('waterdrum'),[raw]));
  direct.setPhotoFailure(true);
  const unsaved=copy(delivery);
  assert.throws(()=>direct.g.offloadPhotosToDrive_('waterdrum',[unsaved]),/photo|照片/i,'Do not drop a photo and pretend upload succeeded');
  assert.equal(unsaved.fPhotos[0],largePhoto);

  const x=await load('ac_gascheck_waterdrum_v2.html',{wdr_2026_09:[delivery],wdr_cfg_2026_09:{facPrice:2000,staPrice:3000,exchangeRate:4000}});
  try{
    const w=x.w,cfg=w.__configs.waterdrum,s=server();
    Object.defineProperty(w.navigator,'onLine',{configurable:true,get:()=>false}); // Disable background reconcile only.
    w.GC.cloud.get=async p=>s.get(copy(p));w.GC.cloud.post=async p=>s.post(copy(p));
    assert.deepStrictEqual(x.errors,[]);
    const open=async()=>{w.document.querySelector('[data-gc-open-tg]').onclick();await new Promise(r=>setTimeout(r,25));};
    await open();
    const modal=w.document.querySelector('.gc-common-modal[data-gc-tool=waterdrum]'),send=modal.querySelector('[data-gc-send]'),state=modal.querySelector('[data-gc-send-state]');
    assert(!send.disabled);
    await send.onclick();
    assert(state.textContent.startsWith('✓'),'Full Water summary send must succeed: '+state.textContent);
    const live=cfg.read().find(r=>r.date==='2026-09-18');
    assert.equal(live.fQty,4);assert.equal(live.sQty,2);
    for(const field of ['photos','fPhotos','sPhotos'])assert(live[field].every(p=>p.startsWith('https://')),'Save converted links to '+field);
    assert.equal(s.photos.size,2);
    const posts=s.requests.filter(p=>p.action==='telegram');
    assert.equal(posts.length,1,'September summary is one compact card (no per-day table)');
    assert(!/│/.test(posts.at(-1).text),'no padded table');assert(posts.at(-1).text.includes('工廠</b> · 4 桶 · 8,000 KHR'));assert(posts.at(-1).text.includes('宿舍</b> · 2 桶 · 6,000 KHR'));
    assert(posts.at(-1).text.includes('14,000 KHR / $3.50'));
    assert.equal(posts.at(-1).photos.length,2);
    assert.equal(s.telegram.filter(p=>p.method==='sendPhoto').length,2);
    assert(s.telegram.filter(p=>p.method==='sendPhoto').every(p=>p.payload.photo.testBlob),'Drive photos use binary files, not preview-page URLs');
    assert.equal(s.g.sheetToJson_(s.sheets.get('waterdrum')).filter(r=>r.date==='2026-09-18').length,1);
    await w.GC.sync.download('waterdrum',{silent:true});
    assert.equal(cfg.read().filter(r=>r.date==='2026-09-18').length,1);
    assert.equal(cfg.read().find(r=>r.date==='2026-09-18').fPhotos.length,1);

    await open();modal.querySelector('[data-gc-mode=approval]').onclick();await new Promise(r=>setTimeout(r,25));
    await send.onclick();assert(state.textContent.startsWith('✓'),state.textContent);
    const last=s.requests.filter(p=>p.action==='telegram').at(-1);
    assert(last.buttons.some(row=>row.some(b=>String(b.data||'').startsWith('wdr_ok_2026-09_all_all_'))));
    assert(!cfg.read().some(r=>r.waterApprovals),'Sending a request never grants approval');
    const created=s.telegram.filter(p=>p.method==='sendMessage').length;
    await send.onclick();assert(state.textContent.startsWith('✓'),state.textContent);
    assert.equal(s.telegram.filter(p=>p.method==='sendMessage').length,created,'Retry edits the existing report pages');

    // Sheet responses encode photos as JSON strings; do not erase them on download/save.
    cfg.write([{...live,photos:JSON.stringify(live.photos),fPhotos:JSON.stringify(live.fPhotos),sPhotos:JSON.stringify(live.sPhotos)}]);
    const normalized=cfg.read().find(r=>r.date==='2026-09-18');
    assert.equal(normalized.fPhotos.length,1);assert.equal(normalized.sPhotos.length,1);
    // The legacy entry point must open the working send modal, not just render
    // the old preview and leave the user believing a message was sent.
    modal.classList.remove('open');w.sendToTelegram();assert(modal.classList.contains('open'));
    assert.deepStrictEqual(x.errors,[]);
  }finally{x.dom.window.close();}

  const failure=await load('ac_gascheck_waterdrum_v2.html',{wdr_2026_09:[delivery]});
  try{
    const w=failure.w,s=server();Object.defineProperty(w.navigator,'onLine',{configurable:true,get:()=>false});
    s.setPhotoFailure(true);w.GC.cloud.get=async p=>s.get(copy(p));w.GC.cloud.post=async p=>s.post(copy(p));
    w.document.querySelector('[data-gc-open-tg]').onclick();await new Promise(r=>setTimeout(r,25));
    const modal=w.document.querySelector('.gc-common-modal[data-gc-tool=waterdrum]');
    await modal.querySelector('[data-gc-send]').onclick();
    // FIX pass: a failed photo no longer aborts the record upload (A5); the records sync, the
    // photo stays on the phone, and the Telegram report is NOT sent without its photos.
    assert(modal.querySelector('[data-gc-send-state]').textContent.includes('上傳'),'Error identifies the cloud upload phase');
    assert.equal(s.requests.filter(p=>p.action==='telegram').length,0);
    const day18=()=>w.__configs.waterdrum.read().find(r=>r.date==='2026-09-18');
    assert.equal(day18().fPhotos[0],largePhoto,'Failed upload preserves local original');
    assert(!modal.querySelector('[data-gc-send]').disabled,'Retry remains available');
    // Same failure in English UI: phase named in English, no Chinese in the message.
    w.document.querySelector('[data-gc-ui-lang=en]').onclick();await new Promise(r=>setTimeout(r,25));
    await modal.querySelector('[data-gc-send]').onclick();
    const enMsg=modal.querySelector('[data-gc-send-state]').textContent;
    assert(/upload/i.test(enMsg)&&!/[\u3400-\u9fff]/.test(enMsg),'English error names the upload phase without Chinese: '+enMsg);
    assert.equal(s.requests.filter(p=>p.action==='telegram').length,0);
    assert.equal(day18().fPhotos[0],largePhoto);
  }finally{failure.dom.window.close();}

  const legacy=await load('ac_gascheck_waterdrum_v2.html',{wdr_2026_09:[delivery]});
  try{
    const w=legacy.w,s=server();Object.defineProperty(w.navigator,'onLine',{configurable:true,get:()=>false});
    w.GC.cloud.get=async p=>p.action==='smartManifest'?{ok:false,error:'unknown action smartManifest'}:s.get(copy(p));
    w.GC.cloud.post=async p=>s.post(copy(p));
    const result=await w.GC.sync.upload('waterdrum',{silent:true});
    assert(result.ok,'Legacy save route remains usable');
    const saved=s.requests.find(p=>p.type==='save');
    assert(saved.list.every(r=>['photos','fPhotos','sPhotos'].every(k=>!JSON.stringify(r[k]||[]).includes('data:image'))));
    assert.equal(s.photos.size,2,'Legacy fallback does not upload images twice');
  }finally{legacy.dom.window.close();}
  console.log('v59 Water full send: photo sizes/fields, Sheet roundtrip, summary/approval, receipts, retry and failure preservation PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
