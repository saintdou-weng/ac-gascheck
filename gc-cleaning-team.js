/* Cleaning personnel / PSJHR bridge. HR and attendance are read-only;
 * only employee references and work assignments belong to Cleaning metadata. */
(function (g) {
  'use strict';
  const text = v => String(v == null ? '' : v).trim();
  const norm = v => text(v).normalize('NFKC').toLocaleLowerCase().replace(/[\s\-_.·]+/g, '');
  const name = v => typeof v === 'string' ? v : text(v && (v.name || v.label || v.id));
  const unique = a => Array.from(new Set(a.map(text).filter(Boolean)));
  const E = v => text(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const kitchen = e => /kitchen|cook|chef|廚房|廚師|厨师|ផ្ទះបាយ|ចុងភៅ/i.test([e.grp,e.pos].join(' '));
  const cleaner = e => /clean(?:er|ing)?|housekeep|janitor|清潔|清洁|សម្អាត/i.test([e.grp,e.pos].join(' '));
  const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Phnom_Penh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  function metadata(v) {
    v = v && typeof v === 'object' ? v : {};
    const links = {}, assignments = {};
    Object.entries(v.links || {}).forEach(([a,id]) => {if(norm(a) && text(id)) links[norm(a)] = text(id);});
    Object.entries(v.assignments || {}).forEach(([id,refs]) => {if(Array.isArray(refs)) assignments[id] = unique(refs);});
    return {links,assignments,kitchenRemoved:v.kitchenRemoved === true};
  }
  function migrate(db) {
    db.personnel = metadata(db.personnel);
    db.locations = db.locations || [];
    let loc = db.locations.find(l => l.type === 'kitchen' || /^(kitchen|廚房|厨房|ផ្ទះបាយ)$/i.test(text(l.name)));
    if(loc) {loc.type = 'kitchen'; return false;}
    if(db.personnel.kitchenRemoved) return false;
    let id = 'loc_kitchen';
    while(db.locations.some(l => l.id === id)) id += '_1';
    db.locations.push({id,name:'Kitchen',type:'kitchen',resp:'',teamSource:'kitchen'});
    return true;
  }
  function unpack(b) {
    if(!b || !Array.isArray(b.rows)) return [];
    let cols = b.cols || [];
    if(typeof cols === 'string') {try{cols=JSON.parse(cols);}catch(_){cols=[];}}
    return b.rows.map(a => Array.isArray(a) ? Object.fromEntries(cols.map((c,i) => [c,a[i]])) : a).filter(Boolean);
  }
  function roster(db) {
    const people = new Map();
    // Employee master is authoritative for current status; detail adds group / job.
    (db.emp || []).concat(db.empdet || []).forEach(r => {
      if(!r || !text(r.emp_no)) return;
      const id = text(r.emp_no), old = people.get(id) || {id,name:'',en:'',grp:'',pos:'',join:'',exit:'',status:''};
      [['name','name'],['en','name_en'],['grp','group'],['pos','position'],['join','join_date'],['exit','leave_date'],['status','status']].forEach(([to,from])=>{if(text(r[from]))old[to]=text(r[from]);});
      people.set(id,old);
    });
    (db.emp || []).forEach(r=>{const p=people.get(text(r.emp_no));if(p){if(text(r.status))p.status=text(r.status);if(text(r.leave_date))p.exit=text(r.leave_date);}});
    // Respect PSJHR's saved edits, without copying unrelated private fields.
    ['emp','empdet'].forEach(k => Object.entries((db.edits || {})[k] || {}).forEach(([id,patch]) => {
      const p=people.get(text(id)); if(!p || !patch || typeof patch !== 'object')return;
      if(patch.del){if(k==='emp')people.delete(text(id));return;}
      const fields=patch.f || patch.fields || patch;
      [['name','name'],['en','name_en'],['grp','group'],['pos','position'],['join','join_date'],['exit','leave_date'],['status','status']].forEach(([to,from])=>{if(Object.prototype.hasOwnProperty.call(fields,from))p[to]=text(fields[from]);});
    }));
    return Array.from(people.values()).sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}));
  }
  function active(p,date) {
    return !(p.join && p.join.slice(0,10)>date) && !(p.exit && p.exit.slice(0,10)<=date) && !/^(resigned|terminated|inactive|離職|离职)$/i.test(p.status);
  }
  function match(alias,people,links) {
    const k=norm(alias), explicit=links && links[k];
    if(explicit) return people.find(p=>p.id===explicit) || null; // Never silently replace a saved link.
    const ids=people.filter(p=>[p.id,p.name,p.en].some(s=>norm(s)===k));
    return k && ids.length===1 ? ids[0] : null;
  }
  function attendance(batches,date) {
    const rows=new Map();
    // Newest revision wins for a person/day, so overlapping imports cannot double count.
    batches.slice().sort((a,b)=>text(a.at).localeCompare(text(b.at)) || text(a.key).localeCompare(text(b.key))).forEach(b=>{
      unpack(b).forEach(r=>{
        const d=text(r.date).slice(0,10), id=text(r.emp_no);
        if(d!==date || !id)return;
        const tin=text(r.time_in),tout=text(r.time_out),hrs=Number(r.hrs_actual)||0;
        const punched=v=>v && !/^(?:-|—|0|00:00(?::00)?)$/.test(v);
        rows.set(id,{id,date:d,tin,tout,hrs,status:punched(tin)||punched(tout)||hrs>0?'present':'no-punch'});
      });
    });
    return rows;
  }
  function binRows(zones) {
    return (zones || []).flatMap(z=>Object.entries(z.bins || {}).filter(([no,q])=>+no>=1 && +no<=5 && Number(q)>0).map(([no,q])=>({zone:z.id,label:z.label,sub:z.sub || '',no:+no,qty:Number(q)})));
  }
  function assigned(db,loc,people,date) {
    const m=metadata(db.personnel),refs=m.assignments[loc.id];
    if(refs) return unique(refs); // An explicit empty list intentionally means unassigned.
    if(loc.type==='kitchen' || loc.teamSource==='kitchen') return people.filter(p=>kitchen(p)&&active(p,date)).map(p=>'hr:'+p.id);
    let memo='';try{memo=JSON.parse(g.localStorage.getItem('ac_gc_clean_memo_v1')||'{}').cleaners?.[loc.id]||'';}catch(_){}
    if(memo && date===today())return [memo];
    const responsible=name(loc.resp),known=(db.cleaners||[]).some(r=>norm(name(r))===norm(responsible))||match(responsible,people,m.links);
    if(known)return unique([responsible]);
    // Old default resp names can predate the real roster. Reuse actual recorded
    // cleaners for the latest inspection day, without rewriting those settings.
    const recorded=(db.records||[]).filter(r=>r&&!r._deleted&&r.locId===loc.id&&text(r.date)<=date&&name(r.cleaner));
    const latest=recorded.reduce((d,r)=>text(r.date)>d?text(r.date):d,'');
    const recent=unique(recorded.filter(r=>text(r.date)===latest).map(r=>name(r.cleaner)));
    return recent.length?recent:unique([responsible]);
  }
  const core={norm,metadata,migrate,unpack,roster,active,match,attendance,binRows,assigned,kitchen,cleaner};
  if(typeof module!=='undefined' && module.exports)module.exports=core;
  if(!g.document)return;
  const doc=g.document, $=id=>doc.getElementById(id);
  const L=(zh,en,km)=>{const l=g.i18n?.get()||'zh';return l==='en'?en:l==='km'?(km||en):zh;};
  const db=()=>g.state.db();
  let people=[],files=[],hrDB=null,dbPromise=null,loadPromise=null,loaded=false,source='',error='',selectedDate=today(),view='locations',search='';
  let att=new Map(),attDate='',attRequest=0,readRequest=0,renderRequest=0,busy=false;
  const batches=new Map(),photos=new Map();
  // Same read endpoint used by PSJHR. Reuse its existing connection on this device.
  const HR_URL='https://script.google.com/macros/s/AKfycbx9Pdt5vu_AcTHCrlLH4lcVONXS_VoE47SEjDUn7Iv27C2CRgoADRLpalVIJQHWBcqK/exec';
  function idb() {
    if(dbPromise)return dbPromise;
    return dbPromise=new Promise(resolve=>{
      try{
        const q=g.indexedDB.open('psjhr');
        q.onupgradeneeded=()=>q.transaction.abort(); // Do not create or modify HR's database.
        q.onsuccess=()=>{const d=q.result;if(!d.objectStoreNames.contains('kv')){d.close();resolve(null);}else{d.onversionchange=()=>{d.close();dbPromise=null;};resolve(d);}};
        q.onerror=q.onblocked=()=>resolve(null);
      }catch(_){resolve(null);}
    });
  }
  async function get(key) {
    const d=await idb();if(!d)return null;
    return new Promise(resolve=>{try{const q=d.transaction('kv','readonly').objectStore('kv').get(key);q.onsuccess=()=>resolve(q.result||null);q.onerror=()=>resolve(null);}catch(_){resolve(null);}});
  }
  function connection() {
    let key='';try{key=JSON.parse(g.localStorage.getItem('psjhr_synckey')||'""');}catch(_){}
    // PSJHR already distributes this shared read configuration in its frontend.
    return {url:text(hrDB?.sync?.gas)||HR_URL,key:text(key)||'12345'};
  }
  async function read(params) {
    const c=connection(),url=new URL(c.url);
    if(url.protocol!=='https:' || url.hostname!=='script.google.com' || !/\/exec$/.test(url.pathname))throw Error(L('PSJHR 連線網址無效','Invalid PSJHR endpoint'));
    Object.entries(Object.assign({k:c.key},params)).forEach(([k,v])=>url.searchParams.set(k,v));
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try{const r=await g.fetch(url.href,{signal:controller.signal});if(!r.ok)throw Error('HTTP '+r.status);const j=await r.json();if(!j.ok)throw Error(j.msg||j.error||'PSJHR');return j;}finally{clearTimeout(timer);}
  }
  async function remoteBatch(f) {
    let rows=[],off=0,total=0,cols=f.cols||[];
    do {const j=await read({action:'hr_get',key:f.key,offset:off,limit:3000});rows=rows.concat(j.rows||[]);total=Number(j.total)||0;cols=j.cols||cols;off+=3000;if(off>300000)throw Error('PSJHR row limit');}while(off<total);
    return {cols,rows,at:f.at,key:f.key};
  }
  async function load(force) {
    if(loadPromise)return loadPromise;
    if(loaded && !force)return true;
    busy=true;error='';
    loadPromise=(async()=>{
      hrDB=await get('db_v1')||{};
      const localPeople=roster(hrDB);
      if(localPeople.length){people=localPeople;files=(hrDB.hrfiles||[]).filter(f=>f.rep==='att');source='local';}
      // Refresh is an explicit one-shot cloud read, never a timer or upload.
      if(force || !people.length){
        try{
          const manifest=await read({action:'hr_manifest'}), all=manifest.files||[];
          const remote={emp:[],empdet:[],edits:JSON.parse(JSON.stringify(hrDB.edits||{}))};
          const wanted=[];
          for(const rep of ['emp','empdet']){
            const fs=all.filter(f=>f.rep===rep).sort((a,b)=>text(a.at||a.asof).localeCompare(text(b.at||b.asof)));
            for(const f of rep==='emp'?fs.slice(-1):fs)wanted.push(f);
          }
          const editFile=all.find(f=>f.rep==='edits');if(editFile)wanted.push(editFile);
          const downloaded=await Promise.all(wanted.map(f=>remoteBatch(f)));
          wanted.forEach((f,i)=>{if(f.rep!=='edits')remote[f.rep].push(...unpack(downloaded[i]));});
          if(editFile){
            for(const r of unpack(downloaded[wanted.indexOf(editFile)])){
              if(!['emp','empdet'].includes(r.ds))continue;
              let patch;try{patch=JSON.parse(r.data);}catch(_){continue;}
              const bucket=remote.edits[r.ds]||(remote.edits[r.ds]={}),old=bucket[r.rk];
              if(patch.revert){if(old&&text(old.at)<=text(r.at))delete bucket[r.rk];}
              else if(!old||text(old.at)<text(patch.at))bucket[r.rk]=patch;
            }
          }
          const rosterRemote=roster(remote);
          if(rosterRemote.length)people=rosterRemote;
          const allFiles=new Map(files.map(f=>[f.key,f]));all.filter(f=>f.rep==='att').forEach(f=>{const old=allFiles.get(f.key);if(!old || !old.dirty)allFiles.set(f.key,f);});
          files=Array.from(allFiles.values());source='cloud';
        }catch(e){error=L('PSJHR 雲端讀取未完成：','PSJHR cloud read incomplete: ')+e.message;}
      }
      loaded=true;attDate='';batches.clear();attRequest++;
      if(g.state?.populate)g.state.populate();
      return people.length>0;
    })().finally(()=>{busy=false;loadPromise=null;});
    return loadPromise;
  }
  async function loadAttendance(date) {
    if(attDate===date)return;
    const ticket=++attRequest;
    const fs=files.filter(f=>{let r=f.range;try{if(typeof r==='string')r=JSON.parse(r);}catch(_){return false;}return r && r[0]<=date && (r[1]||r[0])>=date;});
    const all=[];
    for(const f of fs){
      const cacheKey=f.key+'@'+text(f.version||f.at);
      if(!batches.has(cacheKey))batches.set(cacheKey,(async()=>{
        const local=await get('bat|'+f.key), lm=(hrDB?.hrfiles||[]).find(x=>x.key===f.key);
        if(local && (source!=='cloud' || lm?.dirty || text(lm?.version)===text(f.version)))return Object.assign({},local,{at:f.at,key:f.key});
        if(source==='cloud')return remoteBatch(f);
        return {rows:[],cols:[],at:f.at,key:f.key};
      })().catch(e=>{batches.delete(cacheKey);throw e;}));
      try{all.push(await batches.get(cacheKey));}catch(e){if(ticket===attRequest)error=L('部分出勤資料未取得：','Some attendance data is unavailable: ')+e.message;}
    }
    if(ticket!==attRequest)return;
    att=attendance(all,date);attDate=date;
  }
  function person(ref) {
    return ref.startsWith('hr:')?people.find(p=>p.id===ref.slice(3))||null:match(ref,people,metadata(db().personnel).links);
  }
  function display(ref) {const p=person(ref);return p?[(g.i18n?.get()==='km'?p.name:p.en||p.name),p.id].filter(Boolean).join(' · '):ref.replace(/^hr:/,'');}
  function refs(loc) {return assigned(db(),loc,people,selectedDate);}
  function status(p) {
    const r=p && attDate===selectedDate && att.get(p.id);
    if(!r)return '<span class="ct-badge muted">'+L('出勤未取得','Attendance unavailable','មិនមានទិន្នន័យវត្តមាន')+'</span>';
    return '<span class="ct-badge '+(r.status==='present'?'good':'warn')+'">'+(r.status==='present'?'● '+L('有出勤','Present','មានវត្តមាន'):'◌ '+L('無刷卡紀錄','No punch recorded','គ្មានកំណត់ត្រាស្កេន'))+'</span>'+(r.status==='present'?'<small>'+E([r.tin,r.tout].filter(Boolean).join(' – '))+(r.hrs?' · '+E(r.hrs)+'h':'')+'</small>':'');
  }
  function personCard(ref,role) {
    const p=person(ref),id=p?.id||'',related=(db().locations||[]).filter(l=>refs(l).some(r=>r===ref || (p && person(r)?.id===id)));
    return '<article class="ct-person"><div class="ct-avatar" '+(id?'data-ct-photo="'+E(id)+'"':'')+'>👤</div><div class="ct-person-main"><b>'+E(display(ref))+'</b><small>'+E(p?[p.grp,p.pos].filter(Boolean).join(' · '):L('待連結 PSJHR 工號','Link a PSJHR employee ID','ភ្ជាប់លេខកូដ PSJHR'))+'</small><small>'+E(role || related.map(l=>l.name).join(' / '))+'</small>'+status(p)+'</div><button class="btn bo" data-ct-action="person" data-ref="'+E(ref)+'">'+L('查看','View','មើល')+'</button></article>';
  }
  function allRefs() {
    return unique((db().cleaners||[]).map(name).concat((db().checkers||[]).map(name),(db().locations||[]).flatMap(refs),people.filter(p=>(cleaner(p)||kitchen(p))&&active(p,selectedDate)).map(p=>'hr:'+p.id))).filter((r,i,a)=>{
      const p=person(r);return !p || !a.slice(0,i).some(x=>person(x)?.id===p.id);
    });
  }
  function locationCard(loc,editable) {
    const rs=refs(loc),title=(loc.type==='kitchen'?'🍳 ':g.cleaningLocIcon?g.cleaningLocIcon(loc)+' ':'📍 ')+loc.name;
    const count=rs.filter(r=>person(r)&&att.get(person(r).id)?.status==='present').length;
    const recorded=(db().records||[]).some(r=>r&&!r._deleted&&r.locId===loc.id&&rs.includes(name(r.cleaner)));
    return '<section class="ct-location"><div class="ct-location-head"><button class="ct-link" data-ct-action="location" data-id="'+E(loc.id)+'"><b>'+E(title)+'</b><small>'+E(rs.map(display).join(' / ')||L('尚未分配人員','No people assigned','មិនទាន់ចាត់តាំងបុគ្គលិក'))+'</small></button><span class="ct-badge">'+rs.length+' '+L('人','people','នាក់')+'</span></div><small>'+E(L('已取得出勤','Attendance confirmed','បានបញ្ជាក់វត្តមាន'))+' '+count+' / '+rs.length+(recorded?' · '+L('含最近紀錄人員','Includes latest recorded cleaners','រួមបុគ្គលិកក្នុងកំណត់ត្រាចុងក្រោយ'):'')+'</small>'+(editable?'<div class="ct-actions"><button class="btn bo" data-ct-action="assign" data-id="'+E(loc.id)+'">'+L('分配人員','Assign people','ចាត់តាំងបុគ្គលិក')+'</button><button class="btn bo" data-ct-action="location" data-id="'+E(loc.id)+'">'+L('人員列表','Personnel list','បញ្ជីបុគ្គលិក')+'</button></div>':'')+'</section>';
  }
  function paint() {
    const root=$('clean-team-root');if(!root)return;
    const rs=allRefs(),filtered=rs.filter(r=>norm(display(r)+' '+[person(r)?.grp,person(r)?.pos].join(' ')).includes(norm(search)));
    const locations=(db().locations||[]).filter(l=>norm(l.name+' '+refs(l).map(display).join(' ')).includes(norm(search)));
    root.innerHTML='<div class="ct-toolbar"><div><h2>👥 '+L('人員與工作分配','People & work assignments','បុគ្គលិក និងការចាត់តាំង')+'</h2><small>'+L('沿用原清潔員與檢查員；以工號連結 PSJHR 與每日出勤。','Existing cleaners and inspectors, linked to PSJHR and daily attendance.','ភ្ជាប់អ្នកសម្អាត និងអ្នកត្រួតពិនិត្យទៅ PSJHR និងវត្តមានប្រចាំថ្ងៃ។')+'</small></div><button class="btn bp" data-ct-action="refresh" '+(busy?'disabled':'')+'>'+(busy?'⏳ ':'☁️ ')+L('更新人員／出勤','Refresh people / attendance','ធ្វើបច្ចុប្បន្នភាពបុគ្គលិក / វត្តមាន')+'</button></div>'+
      '<div class="ct-controls"><label>'+L('出勤日期','Attendance date','កាលបរិច្ឆេទវត្តមាន')+' <input class="fi" type="date" id="ct-date" value="'+E(selectedDate)+'"></label><input class="fi" id="ct-search" value="'+E(search)+'" placeholder="'+L('找姓名、工號、組別…','Search name, ID, group…','ស្វែងរកឈ្មោះ លេខកូដ ក្រុម…')+'"></div>'+
      '<p class="ct-note" role="status">'+(busy?L('讀取中…','Reading…','កំពុងអាន…'):E(error || (source==='cloud'?L('已讀取 PSJHR 雲端；不會定時重複拉取。','PSJHR cloud loaded. No repeated polling.','បានអាន PSJHR ពពក។'):source==='local'?L('已讀取本機 PSJHR；按更新可讀取雲端新版。','Local PSJHR loaded; refresh for the latest cloud data.','បានអាន PSJHR ក្នុងឧបករណ៍។'):L('尚未取得 PSJHR 資料；原人名保留。','PSJHR is unavailable; existing names are retained.','មិនមានទិន្នន័យ PSJHR។'))))+'</p>'+
      '<div class="ct-segments" role="group">'+[['locations',L('區域人員','Areas','តំបន់')],['people',L('人員名單','People','បុគ្គលិក')],['org',L('組織／工作分配圖','Work assignment chart','គំនូសតាងការចាត់តាំង')]].map(([k,label])=>'<button class="btn '+(view===k?'bp':'bo')+'" data-ct-action="view" data-view="'+k+'" aria-pressed="'+(view===k)+'">'+label+'</button>').join('')+'</div>'+
      (view==='locations'?'<div class="ct-location-grid">'+locations.map(l=>locationCard(l,true)).join('')+'</div>':view==='people'?'<div class="ct-person-grid">'+filtered.map(r=>personCard(r)).join('')+'</div>':
        '<div class="ct-org"><section class="ct-org-head"><b>🔎 '+L('檢查人員（沿用設定）','Inspectors (existing settings)','អ្នកត្រួតពិនិត្យ (ការកំណត់ដើម)')+'</b><div class="ct-person-grid">'+((db().checkers||[]).length?(db().checkers||[]).map(r=>personCard(name(r),L('檢查人','Inspector','អ្នកត្រួតពិនិត្យ'))).join(''):'<p>'+L('尚未設定檢查人','No inspectors configured','មិនទាន់កំណត់អ្នកត្រួតពិនិត្យ')+'</p>')+'</div></section><p class="ct-note">'+L('下方依清潔地點顯示負責人；此圖表示工作分配。','Responsible teams by cleaning area; this chart represents work assignments.','ក្រុមទទួលខុសត្រូវតាមតំបន់សម្អាត។')+'</p><div class="ct-org-grid">'+(db().locations||[]).map(l=>'<section class="ct-org-branch">'+locationCard(l,false)+refs(l).map(r=>personCard(r)).join('')+'</section>').join('')+'</div></div>');
    const latest=files.reduce((m,f)=>{let r=f.range;try{if(typeof r==='string')r=JSON.parse(r);}catch(_){return m;}const d=text(r?.[1]||r?.[0]);return d>m?d:m;},'');
    if(latest){const note=doc.createElement('p');note.className='ct-note';note.textContent=L('可用出勤資料截至：','Available attendance through: ','ទិន្នន័យវត្តមានដល់៖ ')+latest;root.querySelector('.ct-controls').after(note);}
    photoCards(root);
  }
  async function render(force) {
    const ticket=++renderRequest;
    const work=load(force);paint();await work;if(ticket!==renderRequest)return;paint();await loadAttendance(selectedDate);if(ticket!==renderRequest)return;paint();
  }
  async function photoCards(root) {
    for(const el of root.querySelectorAll('[data-ct-photo]')){
      const id=el.dataset.ctPhoto;if(!photos.has(id))photos.set(id,get('photo|'+id));
      const p=await photos.get(id),src=typeof p==='string'?p:p?.data||p?.dataUrl||'';
      if(el.isConnected && /^data:image\//.test(src)){el.textContent='';const im=doc.createElement('img');im.alt='';im.src=src;el.appendChild(im);}
    }
  }
  let previousFocus=null;
  function modal(title,html) {
    const old=$('clean-team-modal');if(old)old.remove();else previousFocus=doc.activeElement;
    const box=doc.createElement('div');box.id='clean-team-modal';box.setAttribute('data-no-i18n','');
    box.innerHTML='<section class="ct-dialog" role="dialog" aria-modal="true" aria-labelledby="ct-modal-title" tabindex="-1"><header><h2 id="ct-modal-title">'+E(title)+'</h2><button class="btn bo" data-ct-action="close" aria-label="'+L('關閉','Close','បិទ')+'">✕</button></header><div class="ct-dialog-body">'+html+'</div></section>';
    doc.body.appendChild(box);box.querySelector('.ct-dialog').focus();photoCards(box);
  }
  function close() {const el=$('clean-team-modal');if(el){el.remove();if(previousFocus?.isConnected)previousFocus.focus();}}
  async function openLocation(id) {
    const loc=(db().locations||[]).find(l=>l.id===id);if(!loc)return;
    const ticket=++readRequest;
    modal(loc.name,'<p>'+L('讀取人員與出勤…','Reading people and attendance…','កំពុងអានបុគ្គលិក និងវត្តមាន…')+'</p>');
    await load();await loadAttendance(selectedDate);if(ticket!==readRequest||!$('clean-team-modal'))return;
    modal(loc.name,'<p>'+E(selectedDate)+' · '+E(L('檢查人沿用記錄頁目前設定','Inspector follows the record form setting','អ្នកត្រួតពិនិត្យប្រើការកំណត់លើទម្រង់'))+'</p>'+refs(loc).map(r=>personCard(r)).join('')+(!refs(loc).length?'<p>'+L('尚未分配人員；可從 PSJHR 選人。','No people assigned. Select people from PSJHR.','មិនទាន់ចាត់តាំងបុគ្គលិក។')+'</p>':'')+'<button class="btn bp" data-ct-action="assign" data-id="'+E(id)+'">'+L('編輯分配','Edit assignments','កែសម្រួលការចាត់តាំង')+'</button>');
  }
  async function openPerson(ref) {
    await load();const p=person(ref);
    if(ref.startsWith('hr:')&&p){modal(display(ref),personCard(ref)+'<div class="ct-actions"><a class="btn bo" href="https://saintdou-weng.github.io/psjhr/#empno-'+encodeURIComponent(p.id)+'" target="_blank" rel="noopener">PSJHR ↗</a></div>');return;}
    modal(display(ref),personCard(ref)+
      '<p class="ct-note">'+L('相同完整姓名或工號才自動連結；同名或簡稱請在此指定。','Only an exact full name or ID is linked automatically. Select an ID for short or ambiguous names.','ភ្ជាប់ស្វ័យប្រវត្តិតែឈ្មោះពេញ ឬលេខកូដដូចគ្នា។')+'</p><label>'+L('PSJHR 員工','PSJHR employee','បុគ្គលិក PSJHR')+'<input class="fi" id="ct-link-search" placeholder="'+L('輸入姓名或工號篩選','Filter by name or ID','ស្វែងរកឈ្មោះ ឬលេខកូដ')+'"><select class="fi" id="ct-link-id" data-selected="'+E(p?.id||'')+'">'+options(p?.id)+'</select></label><div class="ct-actions"><button class="btn bp" data-ct-action="link" data-ref="'+E(ref)+'">'+L('儲存工號連結','Save employee link','រក្សាទុកការភ្ជាប់')+'</button>'+(p?'<a class="btn bo" href="https://saintdou-weng.github.io/psjhr/#empno-'+encodeURIComponent(p.id)+'" target="_blank" rel="noopener">PSJHR ↗</a>':'')+'</div>');
  }
  function options(id,filter) {
    return '<option value="">'+L('尚未連結','Unlinked','មិនទាន់ភ្ជាប់')+'</option>'+people.filter(p=>!filter||norm([p.id,p.name,p.en,p.grp,p.pos].join(' ')).includes(norm(filter))||p.id===id).map(p=>'<option value="'+E(p.id)+'" '+(p.id===id?'selected':'')+'>'+E([p.id,p.en||p.name,p.grp,p.pos].filter(Boolean).join(' · '))+'</option>').join('');
  }
  async function assign(id) {
    await load();const loc=db().locations.find(l=>l.id===id);if(!loc)return;
    const selected=refs(loc),candidates=unique(selected.concat((db().cleaners||[]).map(name),people.filter(p=>active(p,selectedDate)&&(loc.type==='kitchen'?kitchen(p):cleaner(p))).map(p=>'hr:'+p.id)));
    modal(L('分配人員 · ','Assign people · ','ចាត់តាំងបុគ្គលិក · ')+loc.name,'<p class="ct-note">'+L('可多選；不會更動檢查人。廚房可選自動跟隨 PSJHR 廚房編制。','Select multiple people. Inspectors are unchanged. Kitchen can follow the PSJHR kitchen team.','អាចជ្រើសច្រើន។ មិនផ្លាស់ប្តូរអ្នកត្រួតពិនិត្យ។')+'</p><input class="fi" id="ct-assign-search" placeholder="'+L('搜尋姓名或工號','Search name or ID','ស្វែងរកឈ្មោះ ឬលេខកូដ')+'"><div id="ct-assignment-options">'+candidates.map(r=>'<label class="ct-choice" data-search="'+E(norm(display(r)))+'"><input type="checkbox" value="'+E(r)+'" '+(selected.includes(r)?'checked':'')+'> '+E(display(r))+'</label>').join('')+'</div><p>'+L('加入其他員工','Add another employee','បន្ថែមបុគ្គលិក')+'</p><select class="fi" id="ct-add-person">'+options('')+'</select><button class="btn bo" data-ct-action="add-choice">＋</button><div class="ct-actions"><button class="btn bp" data-ct-action="save-assignment" data-id="'+E(id)+'">'+L('儲存分配','Save assignments','រក្សាទុកការចាត់តាំង')+'</button>'+(loc.type==='kitchen'?'<button class="btn bo" data-ct-action="auto-kitchen" data-id="'+E(id)+'">'+L('跟隨 PSJHR 廚房人員','Follow PSJHR kitchen team','តាមក្រុមផ្ទះបាយ PSJHR')+'</button>':'')+'</div>');
  }
  function save() {db().personnel=metadata(db().personnel);g.state.touchConfig();const ok=g.state.save();if(ok!==false){g.state.populate();g.areas.render();paint();g.ui.toast('✅ '+L('人員設定已儲存','Personnel settings saved','បានរក្សាទុកការកំណត់បុគ្គលិក'));}return ok!==false;}
  function defaultCleaner(loc) {
    return assigned(db(),loc,people,today()).map(r=>person(r)?.en||person(r)?.name||r.replace(/^hr:/,'')).join(' / ');
  }
  function areaButtons() {
    const grid=$('areas-grid');if(!grid)return;
    grid.querySelectorAll('.alc').forEach((card,i)=>{
      const loc=db().locations[i];if(!loc || card.querySelector('[data-ct-action]'))return;
      const b=doc.createElement('button');b.className='btn bo';b.dataset.ctAction='location';b.dataset.id=loc.id;b.textContent='👥 '+L('人員','People','បុគ្គលិក');card.appendChild(b);
    });
  }
  function binIcon(no,color,size) {
    no=Number(no);color=/^#[0-9a-f]{3,8}$/i.test(color||'')?color:['','#22C55E','#3B82F6','#F59E0B','#8B5CF6','#EF4444'][no]||'#64748B';
    const shape=no===3?'<path d="M5 8h22l-3 19H8z"/><path d="M10 11l2 13m4-13v13m6-13l-2 13M8 16h16M7 21h18" fill="none" stroke="white" stroke-width="1.4"/>':no===5?'<path d="M5 8h20v17H5z"/><path d="M24 4h4v22H4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8" cy="28" r="3"/><circle cx="24" cy="28" r="3"/>':'<path d="M7 9h18l-2 18H9z"/><path d="M6 6h20M12 3h8" fill="none" stroke="currentColor" stroke-width="2.5"/>'+(no===4?'<path d="M4 5h24v4H4z"/>':'')+'<path d="M12 13v10m8-10v10" stroke="white" stroke-width="1.5"/>';
    return '<svg class="ct-bin-icon" viewBox="0 0 32 32" width="'+(size||28)+'" height="'+(size||28)+'" style="color:'+color+';fill:'+color+'" aria-hidden="true">'+shape+'</svg>';
  }
  function renderBins() {
    const root=$('clean-bin-inventory');if(!root)return;
    const rows=binRows(db().mapZones),tot=rows.reduce((n,r)=>n+r.qty,0);
    root.innerHTML='<div class="ct-toolbar"><h3>🗑️ '+L('垃圾桶清冊','Dustbin inventory','បញ្ជីធុងសំរាម')+' · '+tot+'</h3><input class="fi" id="ct-bin-search" placeholder="'+L('搜尋區域、種類…','Search area, type…','ស្វែងរកតំបន់ ប្រភេទ…')+'"></div><div class="ct-bin-list">'+rows.map(r=>{const label=g.i18n.t(['','bin-green','bin-small','bin-basket','bin-lid','bin-trolley'][r.no]);return '<button class="ct-bin-row" data-ct-action="bin" data-id="'+E(r.zone)+'" data-search="'+E(norm(r.label+' '+r.sub+' '+label))+'">'+binIcon(r.no)+'<span><b>'+E(r.label)+(r.sub?' · '+E(r.sub):'')+'</b><small>'+E(label)+'</small></span><strong>'+r.qty+'</strong><span>›</span></button>';}).join('')+'</div><p class="ct-note">'+L('清冊與地圖使用相同數量，點選可編輯該區。個別登記只作明細，不重複加總。','Inventory and map share counts. Tap to edit an area. Individual registrations are details and are not added twice.','បញ្ជី និងផែនទីប្រើចំនួនដូចគ្នា។ ចុចដើម្បីកែតំបន់។')+'</p>';
    renderLegacyBins();
  }
  function renderLegacyBins() {
    const root=$('clean-bin-legacy');if(!root)return;
    root.innerHTML='<h3>'+L('個別登記明細','Individual registrations','ព័ត៌មានចុះបញ្ជីនីមួយៗ')+' · '+(db().bins||[]).length+'</h3>'+(db().bins||[]).map(b=>'<article class="ct-bin-row"><span>🗑️</span><span><b>'+E(b.area)+' · '+E(b.desc)+'</b><small>'+E([b.resp,b.freq,b.lastClean].filter(Boolean).join(' · '))+'</small></span><button class="btn bo" data-ct-action="delete-bin" data-id="'+E(b.id)+'">'+L('刪除','Delete','លុប')+'</button></article>').join('');
  }
  function setup() {
    areaButtons();
    // Opening the module reads local HR once. Network access is lazy on the people page.
    get('db_v1').then(d=>{if(d&&!loaded&&!loadPromise){hrDB=d;people=roster(d);files=(d.hrfiles||[]).filter(f=>f.rep==='att');loaded=people.length>0;source=loaded?'local':'';}g.state.populate();});
  }
  doc.addEventListener('click',async e=>{
    const b=e.target.closest('[data-ct-action]');if(!b)return;
    const a=b.dataset.ctAction,id=b.dataset.id,ref=b.dataset.ref;
    if(a==='close'){readRequest++;close();}
    if(a==='view'){view=b.dataset.view;paint();}
    if(a==='refresh')render(true);
    if(a==='location')openLocation(id);
    if(a==='person')openPerson(ref);
    if(a==='assign')assign(id);
    if(a==='link'){const selected=$('ct-link-id').value;if(selected)db().personnel.links[norm(ref)]=selected;else delete db().personnel.links[norm(ref)];if(save())close();}
    if(a==='save-assignment'||a==='auto-kitchen'){
      if(a==='auto-kitchen')delete db().personnel.assignments[id];
      else db().personnel.assignments[id]=unique(Array.from(doc.querySelectorAll('#ct-assignment-options input:checked'),n=>n.value));
      if(save()){const loc=db().locations.find(l=>l.id===id);if(loc)g.state.setLocCleaner(id,defaultCleaner(loc),{auto:a==='auto-kitchen'});close();}
    }
    if(a==='add-choice'){
      const value=$('ct-add-person').value;if(!value)return;
      const rs=Array.from(doc.querySelectorAll('#ct-assignment-options input'));
      const old=rs.find(x=>x.value==='hr:'+value || person(x.value)?.id===value);if(old){old.checked=true;old.closest('label').hidden=false;return;}
      const label=doc.createElement('label');label.className='ct-choice';label.dataset.search=norm(display('hr:'+value));const input=doc.createElement('input');input.type='checkbox';input.value='hr:'+value;input.checked=true;label.appendChild(input);label.appendChild(doc.createTextNode(' '+display(input.value)));$('ct-assignment-options').appendChild(label);
    }
    if(a==='bin')g.binMap.editZone(id);
    if(a==='delete-bin' && g.confirm(L('刪除這筆個別登記？地圖數量不變。','Delete this registration? Map quantities stay unchanged.','លុបការចុះបញ្ជីនេះ?'))){db().bins=db().bins.filter(x=>x.id!==id);g.state.touchConfig();g.state.save();renderLegacyBins();}
  });
  doc.addEventListener('input',e=>{
    if(e.target.id==='ct-search'){search=e.target.value;const pos=e.target.selectionStart;paint();$('ct-search').focus();$('ct-search').setSelectionRange(pos,pos);}
    if(e.target.id==='ct-link-search')$('ct-link-id').innerHTML=options($('ct-link-id').dataset.selected,e.target.value);
    if(e.target.id==='ct-assign-search')doc.querySelectorAll('#ct-assignment-options .ct-choice').forEach(x=>x.hidden=!x.dataset.search.includes(norm(e.target.value)));
    if(e.target.id==='ct-bin-search')doc.querySelectorAll('.ct-bin-list [data-search]').forEach(x=>x.hidden=!x.dataset.search.includes(norm(e.target.value)));
  });
  doc.addEventListener('change',e=>{if(e.target.id==='ct-link-id')e.target.dataset.selected=e.target.value;if(e.target.id==='ct-date' && /^\d{4}-\d{2}-\d{2}$/.test(e.target.value)){selectedDate=e.target.value;render();}});
  doc.addEventListener('keydown',e=>{
    if((e.key==='Enter'||e.key===' ')&&e.target.matches('.map-zone[data-ct-action]')){e.preventDefault();e.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}
    const box=$('clean-team-modal');if(!box)return;
    if(e.key==='Escape'){readRequest++;close();}
    if(e.key==='Tab'){const items=Array.from(box.querySelectorAll('button,a[href],input,select,[tabindex="0"]')).filter(x=>!x.disabled&&!x.hidden);if(!items.length)return;const first=items[0],last=items[items.length-1];if(e.shiftKey && (doc.activeElement===first||doc.activeElement.classList.contains('ct-dialog'))){e.preventDefault();last.focus();}else if(!e.shiftKey&&doc.activeElement===last){e.preventDefault();first.focus();}}
  });
  g.GCCleaningTeam=Object.assign(core,{render,paint,setup,openLocation,areaButtons,defaultCleaner,binIcon,renderBins,renderLegacyBins});
})(typeof window!=='undefined'?window:globalThis);
