// FIX sprint — Dormitory + EHS regression tests (standalone; exits non-zero on failure).
const assert=require('assert'),fs=require('fs'),path=require('path');
const {load}=require('./dom-harness.cjs');
const root=path.join(__dirname,'..');
const dormSrc=fs.readFileSync(path.join(root,'ac_gascheck_dormitory_v2.html'),'utf8');
const ehsSrc=fs.readFileSync(path.join(root,'ac_gascheck_ehs_v2.html'),'utf8');
const CJK=/[㐀-鿿豈-﫿]/;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const ymd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const TODAY=ymd(new Date());
const pass=m=>console.log('PASS '+m);
const same=(a,b,m)=>assert.equal(JSON.stringify(a),JSON.stringify(b),m);
function cjkLeaks(w){
  const d=w.document,out=[];const tw=d.createTreeWalker(d.body,w.NodeFilter.SHOW_TEXT);let n;
  while((n=tw.nextNode())){const p=n.parentElement;if(!p||/^(SCRIPT|STYLE)$/.test(p.tagName)||p.closest('.lang-grp,.lang-toggle,.gc-head-langs,.gc-lang,[data-gc-preview]'))continue;if(CJK.test(n.nodeValue))out.push(n.nodeValue.trim());}
  d.querySelectorAll('[placeholder],[title],[aria-label]').forEach(el=>['placeholder','title','aria-label'].forEach(a=>{const v=el.getAttribute(a);if(v&&CJK.test(v))out.push('@'+a+':'+v);}));
  if(CJK.test(d.title))out.push('title:'+d.title);
  return out;
}
/* 假 SheetJS：直接回傳 raw:true 的二維陣列，測試頁面自己的轉換邏輯。 */
function fakeXLSX(w,aoa){w.XLSX={read:()=>({SheetNames:['S'],Sheets:{S:{'!ref':'A1:Z200'}},files:null}),utils:{sheet_to_json:()=>aoa,decode_range:()=>({s:{r:0,c:0},e:{r:200,c:25}})}};}
function file(w){return new w.File([new Uint8Array([1,2,3])],'x.xlsx');}

(async()=>{
  // ── static ──
  for(const [name,html] of [['dorm',dormSrc],['ehs',ehsSrc]]){
    for(const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi))assert.doesNotThrow(()=>new Function(m[1]),name+' script parses');
    assert(!/MutationObserver/.test(html),name+': no page-wide substring translation observer (B2)');
    assert(html.includes('gascheck-core.js?v=20261006a'),name+' keeps core cache key');
  }
  assert(!/5026942575/.test(dormSrc)&&!/approverId/.test(dormSrc)&&!/dormDecision/.test(dormSrc),'dorm: no web approval / hardcoded approver (C1)');
  assert(!/mode:'replace'/.test(dormSrc),'dorm: no replace push (merge only)');
  assert(!/PAUL_UID|5026942575/.test(ehsSrc),'ehs: no hardcoded approver id');
  assert(!/raw:false/.test(ehsSrc),'ehs: SheetJS raw:true only (A10)');
  assert(!/固體 · I=Industrial|Waste \/ 廢料'\)/.test(ehsSrc),'ehs: Telegram type legend single-language (B3)');
  pass('static checks');

  // ── i18n dictionaries complete ──
  for(const [name,html,varName] of [['dorm',dormSrc,'DORM_TEXT'],['ehs',ehsSrc,'EHS_TEXT']]){
    const x=await load(name==='dorm'?'ac_gascheck_dormitory_v2.html':'ac_gascheck_ehs_v2.html');
    const rows=x.w.eval(varName),keys=new Set();
    rows.forEach(r=>{assert.equal(r.length,4,name+' row '+r[0]);assert(!keys.has(r[0]),name+' duplicate key '+r[0]);keys.add(r[0]);
      assert(r[1]&&r[2]&&r[3],name+' empty text for '+r[0]);assert(!CJK.test(r[2])&&!CJK.test(r[3]),name+' CJK in en/km for '+r[0]);});
    const usedAttr=[...html.matchAll(/data-i(?:-ph|-title)?="([\w-]+)"/g)].map(m=>m[1]);
    usedAttr.forEach(k=>assert(keys.has(k),name+' missing dictionary key used in HTML: '+k));
    if(name==='dorm'){const usedT=[...html.matchAll(/\bT\('([\w-]+)'\s*[,)]/g)].map(m=>m[1]);usedT.forEach(k=>assert(keys.has(k),'dorm missing key used in T(): '+k));}
    x.dom.window.close();
  }
  pass('dictionaries complete (zh/en/km, no raw keys)');

  // ── Dormitory ──
  const A={id:'appA',type:'搬入',status:'待審核',name:'Sokha',gender:'Female',idNo:'1001',department:'Sewing',roomNo:'A-101',date:TODAY,reason:'Near',items:[{name:'床單 Sheet',checked:true,condition:'Good'}],photos:[],approvalRevision:1,approvalToken:'tokA',timestamp:TODAY+' 08:00:00',updatedAt:TODAY+' 08:00:00'};
  const seed=()=>({vrt_dorm_hub_v2:{records:[JSON.parse(JSON.stringify(A)),{id:'old',type:'搬入',name:'Legacy',idNo:'77',roomNo:'A-1',date:46268,status:'已核可',timestamp:'2026-09-01 08:00:00'}],inspections:[],violations:[{id:'v0',date:TODAY,name:'W',type:'噪音擾人',level:'Minor'}],cfg:{}}});
  for(const lang of ['zh','en','km']){
    const x=await load('ac_gascheck_dormitory_v2.html',Object.assign({gc_lang:lang},seed()));await wait(700);const w=x.w;
    assert.deepStrictEqual(x.errors,[],'dorm boot '+lang);
    assert.equal(w.document.querySelector('.tab.active').dataset.tab,'apply','dorm opens on the daily-work tab');
    assert.equal(w.document.title,{zh:'VRT 宿舍管理',en:'VRT Dormitory',km:'VRT អន្តេវាសិកដ្ឋាន'}[lang]);
    assert.equal(w.document.querySelectorAll('.sub-hdr').length,0,'single header');
    if(lang!=='zh'){
      const leaks=new Set();
      for(const t of ['apply','insp','records','dash','roster','viol','settings']){w.ui.tab(t);await wait(20);cjkLeaks(w).forEach(s=>leaks.add(t+':'+s));}
      w.records.detail('appA');w.insp.setLoc('factory',null);w.document.querySelectorAll('.pane').forEach(p=>p.classList.add('active'));cjkLeaks(w).forEach(s=>leaks.add('all:'+s));
      assert.deepStrictEqual([...leaks],[],'dorm '+lang+' CJK leaks');
      const rows=w.records.exportRows(w.state.db().records.filter(r=>!r._deleted));
      assert(!rows.flat().some(v=>CJK.test(String(v))&&!/Legacy|Sokha/.test(String(v))),'dorm export '+lang+' has no Chinese headers/values');
      assert(!rows.flat().some(v=>String(v).includes('[object Object]')),'dorm export has no [object Object]');
      assert.equal(rows[1][2],lang==='en'?'Pending':'កំពុងរង់ចាំ','status translated in export');
    }
    x.dom.window.close();
  }
  pass('dorm zh/en/km boot, first tab, title, 0 CJK leaks in en/km, export columns (B1/A16)');

  {
    const x=await load('ac_gascheck_dormitory_v2.html',seed());await wait(700);const w=x.w,posts=[];
    assert.equal(w.state.db().records.find(r=>r.id==='old').date,'2026-09-03','legacy serial date repaired (A7)');
    w.fetch=async(url,opt={})=>{let p={};try{p=JSON.parse(new URLSearchParams(String(opt.body)).get('payload')||'{}');}catch(e){}posts.push(p);
      if(p.action==='dormSubmit'){const d=JSON.parse(p.data);return {ok:true,json:async()=>({ok:true,saved:true,record:Object.assign({},d,{items:JSON.parse(d.items),photos:JSON.parse(d.photos),approvalRevision:(d.expectedRevision||0)+1,approvalToken:'tok'+posts.length})})};}
      if(p.action==='delete')return {ok:true,json:async()=>({ok:true})};
      return {ok:true,json:async()=>({ok:false,error:'offline'})};};
    // C1: no web approve / reject
    assert.equal(typeof w.records.approve,'undefined');assert.equal(typeof w.records.reject,'undefined');
    w.ui.tab('records');w.records.showAllPending();w.records.detail('appA');
    const html=w.document.getElementById('pane-records').innerHTML;
    assert(!/records\.approve|records\.reject/.test(html),'no approve/reject buttons in records');
    pass('C1 web approval removed; applicant actions kept');
    // C4: edit, switch tab, come back → new application does not overwrite the old one
    w.appForm.edit('appA');assert(!w.document.getElementById('edit-banner').hidden,'edit banner shown');
    w.ui.tab('records');w.ui.tab('dash');w.ui.tab('apply');
    assert(w.document.getElementById('edit-banner').hidden,'edit cancelled on tab switch');
    const setv=(id,v)=>{const el=w.document.getElementById(id);if(el.tagName==='SELECT'&&!Array.from(el.options).some(o=>o.value===v)){const o=w.document.createElement('option');o.value=o.textContent=v;el.appendChild(o);}el.value=v;};
    for(const [id,v] of [['f-name','Dara'],['f-gender','Male'],['f-id','2002'],['f-dept','Cutting'],['f-room','B-102'],['f-date',TODAY],['f-reason','New hire']])setv(id,v);
    const s1=w.appForm.submit(),s2=w.appForm.submit();await s1;await s2;
    assert.equal(posts.filter(p=>p.action==='dormSubmit').length,1,'double-tap submits once');
    assert.equal(JSON.parse(posts[0].data).reopen,false,'new application is not a reopen');
    same(w.state.db().records.filter(r=>!r._deleted).map(r=>r.name).sort(),['Dara','Legacy','Sokha']);
    pass('C4 edit state reset on tab switch + banner; submit double-tap guard');
    // Required-field highlight
    await wait(450);w.appForm.reset(true);w.ui.tab('apply');await w.appForm.submit();
    assert(w.document.getElementById('f-name').classList.contains('invalid'),'missing field highlighted');
    pass('required fields highlighted');
    // A3 tombstone on delete
    await w.records.del('appA');
    const t=w.state.db().records.find(r=>r.id==='appA');
    assert(t&&t._deleted===true&&t.idNo==='1001'&&t.date===TODAY,'tombstone keeps key fields');
    const cfg=w.__configs.dormitory;
    assert(!cfg.read().some(r=>r.id==='appA'),'read() hides tombstones');
    assert(cfg.cloudRead().some(r=>r.id==='appA'&&r._deleted),'cloudRead() syncs tombstones');
    cfg.write(cfg.read());assert(w.state.db().records.some(r=>r.id==='appA'&&r._deleted),'write() keeps local tombstones');
    pass('A3 dorm tombstones');
    // C11 inspections / violations: guard + cleared form + tombstones
    w.ui.tab('insp');w.document.getElementById('insp-inspector').value='Phea';
    await w.insp.save();assert.equal(w.state.db().inspections.length,0,'empty inspection not saved');
    w.insp.tap('#201','gas');w.insp.save();w.insp.save();
    assert.equal(w.state.db().inspections.length,1,'double-tap inspection saved once');
    assert.equal(w.document.querySelectorAll('.insp-tbl .sc-N').length,0,'inspection grid cleared after save');
    w.ui.tab('viol');w.document.getElementById('vf-name').value='Nita';w.document.getElementById('vf-type').value='noise';
    w.viol.save();w.viol.save();
    assert.equal(w.state.db().violations.filter(r=>!r._deleted).length,2,'violation saved once (plus seed)');
    assert.equal(w.document.getElementById('vf-name').value,'','violation form cleared');
    assert.equal(w.state.db().violations.find(r=>r.id==='v0').type,'noise','legacy Chinese violation type mapped to code');
    w.viol.del('v0');assert(w.state.db().violations.find(r=>r.id==='v0')._deleted,'violation tombstone');
    pass('C11 inspection/violation guards, form clear, codes, tombstones');
    // extra data sets: unsupported backend → honest local status; supported → synced
    w.GC.smartSync.upload=async()=>{const e=new Error('unknown tool');e.smartUnsupported=true;throw e;};
    await w.dormExtraSync.run();assert.equal(w.dormExtraSync.status(),'local');
    assert(/phone|ទូរស័ព្ទ|手機/.test(w.document.getElementById('xsync-viol').textContent),'status says data is on this phone only');
    w.sessionStorage.clear();const seen=[];
    w.GC.smartSync.upload=async(tool,list)=>{seen.push(tool);return {ok:true,list:list.concat(tool==='dormitory_violations'?[{id:'vx',date:TODAY,name:'Remote',type:'other',updatedAt:TODAY+' 09:00:00'}]:[])};};
    await w.dormExtraSync.run();assert.equal(w.dormExtraSync.status(),'ok');same(seen,['dormitory_inspections','dormitory_violations']);
    assert(w.state.db().violations.some(r=>r.id==='vx'),'remote violation merged');
    pass('C11 inspections/violations cloud sync (smart-sync tools, honest status)');
    // A7 roster import + A11 schedules sync
    const sched=[];w.GC.sync.schedule=(tool,reason)=>{sched.push(tool+':'+reason);};
    const inp=w.document.querySelector('input[onchange*="roster.importXL"]');
    fakeXLSX(w,[['Name','Gender','ID','Dept','Room','MoveIn','Phone'],['Sok Dara','M','A123','Sewing','B-201',46268,'012'],['','','','','','',''],['Chan Srey','F','A124','QC','B-202','15/09/2026','013'],['Bad Month','F','A125','QC','B-203','13/13/2026','']]);
    Object.defineProperty(inp,'files',{value:[file(w)],configurable:true});w.roster.importXL(inp);await wait(300);
    Object.defineProperty(inp,'files',{value:[file(w)],configurable:true});w.roster.importXL(inp);await wait(300);
    const imported=w.state.db().records.filter(r=>r.source==='roster_import');
    same(imported.map(r=>[r.name,r.date,r.gender]),[['Sok Dara','2026-09-03','Male'],['Chan Srey','2026-09-15','Female']],'serial + day-first dates, dedupe, invalid month rejected, blank row skipped');
    assert(sched.includes('dormitory:roster_import'),'roster import schedules sync (A11)');
    fakeXLSX(w,[['foo','bar'],[1,2]]);Object.defineProperty(inp,'files',{value:[file(w)],configurable:true});w.roster.importXL(inp);await wait(300);
    assert.equal(w.state.db().records.filter(r=>r.source==='roster_import').length,2,'wrong file inserts nothing');
    w.ui.tab('roster');assert.equal(w.document.getElementById('rs-count').textContent,'3','roster renders (no localeCompare crash)');
    pass('A7 roster import (dates, dedupe, header validation, blank rows) + A11');
    // week starts Monday
    w.de.set('week',null);const r=w.de.getRange();const f=new Date(r.from+'T00:00:00'),to=new Date(r.to+'T00:00:00');
    assert.equal(f.getDay(),1,'week starts Monday');assert.equal((to-f)/86400000,6);
    pass('date engine week starts Monday');
    // Telegram modal: language follows UI, no approval mode
    w.i18n.set('km');await wait(50);
    w.document.querySelector('.gc-head-tools[data-gc-tool="dormitory"] [data-gc-open-tg]').click();await wait(80);
    const modal=w.document.querySelector('.gc-common-modal[data-gc-tool="dormitory"]');
    assert.equal(modal.querySelector('[data-gc-lang]').value,'km','report language follows UI');
    same(w.__configs.dormitory.telegramModes,['summary','review']);
    pass('dorm Telegram modal language + no approval mode');
    x.dom.window.close();
  }

  // ── EHS ──
  const ehsSeed=()=>({vrt_waste_v3:{internal:[{id:'i1',date:TODAY,plastic_kg:5,fabric_kg:3,core_kg:1,total_kg:9,photos:[]}],gate:[{id:'g1',date:TODAY,supplier:'K.S.W.M',name:'Na Rin',solid_waste:'V',weight_kg:120,time_in:'08:00',time_out:'08:40',photos:[],updatedAt:TODAY+' 09:00:00'}],monthly:[],tombstones:[]}});
  for(const lang of ['zh','en','km']){
    const x=await load('ac_gascheck_ehs_v2.html',Object.assign({gc_lang:lang},ehsSeed()));await wait(700);const w=x.w;
    assert.deepStrictEqual(x.errors,[],'ehs boot '+lang);
    assert.equal(w.document.querySelector('.tab.active').dataset.tab,'modB','ehs opens on the daily Waste tab');
    assert.equal(w.document.title,{zh:'VRT 回收／廢料管理',en:'VRT Recycle / Waste',km:'VRT កែច្នៃ / សំណល់'}[lang]);
    assert.equal(w.eval('bRows')[0].date,TODAY,'batch row date defaults to today');
    if(lang!=='zh'){
      const leaks=new Set();
      for(const t of ['modB','modA','report','history']){w.switchTab(t);await wait(20);cjkLeaks(w).forEach(s=>leaks.add(t+':'+s));}
      assert.deepStrictEqual([...leaks],[],'ehs '+lang+' CJK leaks');
      const pk=w.buildEhsTelegram({cfg:w.__ehsGcCfg,period:'month',ref:TODAY.slice(0,8)+'01',mode:'summary',scope:'all',slot:'all',lang});
      assert(!CJK.test(pk.text),'ehs Telegram '+lang+' single-language');
      if(lang==='en')assert(pk.text.includes('Waste trips')&&pk.text.includes('K.S.W.M</b> · 1/4 trips')&&pk.text.includes('Month to date <b>1</b> trips / target 8'),'waste trips section English only (B3)');
      const tabB=w.document.querySelector('[data-tab="modB"]').textContent;assert(/Waste|សំណល់/.test(tabB)&&!/Recycling/.test(tabB),'Waste tab says Waste (B13)');
    }
    x.dom.window.close();
  }
  pass('ehs zh/en/km boot, first tab, title, today default, 0 CJK leaks, Telegram single-language');
  {
    const x=await load('ac_gascheck_ehs_v2.html',ehsSeed());await wait(700);const w=x.w;
    same(w.__configs.ehs.telegramModes,['summary'],'summary-only modal (no fake approval option)');
    // C13 confirm before discarding unsaved batch rows
    w.HTMLElement.prototype.scrollIntoView=function(){};
    w.updateBRow(w.eval('bRows')[0].id,'supplier','SONYAPICH');
    let asked=0;w.confirm=()=>{asked++;return false;};
    w.editRecord('g1','gate');assert.equal(asked,1,'confirm before discarding');assert.equal(w.eval('bRows')[0].supplier,'SONYAPICH','rows kept when cancelled');
    w.confirm=()=>true;w.editRecord('g1','gate');assert.equal(w.eval('bRows')[0]._editId,'g1');
    assert(!w.document.getElementById('b-edit-banner').hidden,'edit banner');
    w.switchTab('history');w.switchTab('modB');assert(!w.eval('bRows').some(r=>r._editId),'edit cancelled on tab switch');
    pass('C13 confirm before discarding + edit banner/cancel');
    // C8 monthly report: guard, upload first, real errors, honest status
    const sent=[];let failSend=true;
    w.GC.sync.upload=async()=>({ok:true});
    w.GC.telegram.send=async(text,photos,buttons,chat,tool,meta)=>{sent.push({text,buttons,meta});if(failSend)throw new Error('Telegram down');return {ok:true,messageId:55};};
    const p1=w.submitMonthlyApproval(),p2=w.submitMonthlyApproval();await p1;await p2;
    assert.equal(sent.length,1,'double-tap sends once');assert.equal(w.loadLocal().monthly.length,0,'failed send records nothing');
    failSend=false;await w.submitMonthlyApproval();
    assert.equal(sent.length,2);const last=sent[1];
    assert(!JSON.stringify(last.buttons).includes('ehs_ok_'),'no approval buttons until backend supports ehs callbacks');
    assert.equal(last.meta.reportMode,'summary');
    const m=w.loadLocal().monthly;assert.equal(m.length,1);assert.equal(m[0].status,'summary_sent');assert(m[0].digest);
    const bar=w.document.getElementById('b-pending-text').textContent;assert(bar.includes('摘要')&&!/等待 Paul/.test(bar),'honest status: summary sent, not fake pending');
    pass('C8 monthly report: guard, upload-first, error handling, honest summary status');
    // A3 tombstones kept after cloud delete
    w.GC.cloud.post=async p=>({ok:true,deleted:(p.ids||[]).length});
    await w.deleteRecord('g1','gate');const ld=w.loadLocal();
    assert(ld.tombstones.some(t=>t.id==='g1'&&t.cloudDeletedAt),'tombstone kept after cloud delete');
    assert(w.__configs.ehs.cloudRead().some(r=>r.id==='g1'&&r._deleted),'tombstone synced');
    assert(!w.__configs.ehs.read().some(r=>r.id==='g1'),'read hides tombstone');
    w.__configs.ehs.write([{id:'g1',date:TODAY,supplier:'K.S.W.M',weight_kg:120,time_in:'08:00',module:'gate',sourceType:'waste',updatedAt:'2099-01-01 00:00:00'}]);
    assert(!w.loadLocal().gate.some(r=>r.id==='g1'),'stale cloud copy does not resurrect');
    pass('A3 ehs tombstones kept ≥90 days and synced');
    // A10 import dates: raw serials, day-first text, invalid month rejected, time fractions
    fakeXLSX(w,[['Waste Check Sep 2026'],['x'],['Date','Name','Suppliers','Solid Waste','Industrial Waste','Kg','Time In','Time Out'],
      [46268,'Na Rin','KSWM','V','',100,0.3541666667,0.375],['15/09/2026','Nhem','SONY','','V',50,'3:10pm','3:40pm'],['13/13/2026','X','KSWM','V','',60,'08:00','09:00']]);
    const meta=await w.parseEhsSmartImport(file(w));
    same(meta.objects.map(r=>[r.date,r.time_in,r.time_out]),[['2026-09-03','08:30','09:00'],['2026-09-15','15:10','15:40']]);
    assert(meta.summary.warnings.some(s=>/13|invalid|無效/.test(s)),'invalid dates reported');
    assert.equal(w.excelDateToISO('03/09/2026'),'2026-09-03','day-first');assert.equal(w.excelDateToISO('2026-13-01'),'','month > 12 rejected');
    pass('A10 import dates/times (raw:true, day-first, validation)');
    x.dom.window.close();
  }
  console.log('fix_dormehs: all PASS');
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
