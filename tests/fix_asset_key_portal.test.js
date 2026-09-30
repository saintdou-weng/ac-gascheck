// FIX sprint regression tests — Asset / Key Movement / Portal (standalone; exits non-zero on failure).
const assert=require('assert');
const fs=require('fs'),path=require('path');
const {load}=require('./dom-harness.cjs');
const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const CJK=/[㐀-鿿豈-﫿]/;
const plain=v=>JSON.parse(JSON.stringify(v));
const pause=ms=>new Promise(r=>setTimeout(r,ms||30));
const todayYMD=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());};
const serialToYMD=n=>{const d=new Date(Date.UTC(1899,11,30)+n*86400000),p=x=>String(x).padStart(2,'0');return d.getUTCFullYear()+'-'+p(d.getUTCMonth()+1)+'-'+p(d.getUTCDate());};
let failures=0;
async function test(name,fn){try{await fn();console.log('PASS '+name);}catch(e){failures++;console.error('FAIL '+name+'\n'+(e&&e.stack||e));}}
/* Visible-ish UI text (skips script/style, inputs, hidden legacy blocks and user-data cells marked data-user). */
function uiText(w){
  const out=[];const tw=w.document.createTreeWalker(w.document.body,w.NodeFilter.SHOW_TEXT);let n;
  while((n=tw.nextNode())){const el=n.parentElement;if(!el||/^(SCRIPT|STYLE|TEXTAREA|OPTION)$/.test(el.tagName))continue;
    if(el.closest('.hidden,.gc-legacy-hidden,[hidden],.gc-head-langs,.lang-sw,.lang-btn,.lb,[data-gc-preview],.gc-common-modal,.gc-unified-shell'))continue;
    let hid=false;for(let p=el;p&&p!==w.document.body;p=p.parentElement){if(p.style&&p.style.display==='none'){hid=true;break;}}if(hid)continue;
    const s=n.nodeValue.trim();if(s)out.push(s);}
  w.document.querySelectorAll('select option').forEach(o=>{if(!o.closest('.hidden,.gc-legacy-hidden,.gc-common-modal'))out.push(o.textContent);});
  w.document.querySelectorAll('[placeholder],[title],[aria-label]').forEach(el=>{if(el.closest('.hidden,.gc-legacy-hidden,.gc-head-langs,.lang-sw,.gc-common-modal,.gc-unified-shell'))return;['placeholder','title','aria-label'].forEach(a=>{const v=el.getAttribute(a);if(v)out.push(v);});});
  out.push(w.document.title);
  return out;
}
function xlsxStub(w,aoa){
  const cap={reads:[],sheets:[],names:[]};
  w.XLSX={read:(d,o)=>{cap.reads.push(o);return {SheetNames:['Admin Asset'],Sheets:{'Admin Asset':{'!ref':'A1:Z99'}}};},
    utils:{sheet_to_json:()=>aoa||[],aoa_to_sheet:a=>{cap.sheets.push(a);return {};},json_to_sheet:r=>{cap.sheets.push([Object.keys(r[0]||{})].concat(r.map(x=>Object.values(x))));return {};},book_new:()=>({}),book_append_sheet:(wb,ws,n)=>cap.names.push(n)},
    writeFile:()=>{},SSF:{parse_date_code:()=>null}};
  return cap;
}

(async()=>{
  const assetHtml=read('ac_gascheck_asset_v2.html'),keyHtml=read('ac_gascheck_keymovement_v2.html'),portalHtml=read('ac_gascheck_portal_v1.html');
  const mk=(n,extra)=>Object.assign({id:'AOA00'+n,code:'AOA00'+n,name:'Chair '+n,zone:'factory',category:'辦公家具 Office Furniture',status:'active',qty:1,unit:'pcs',purchaseDate:'2026-09-0'+n,updatedAt:'2026-09-0'+n+' 10:00:00'},extra||{});

  await test('C2 asset has no PIN / role login / web approval',async()=>{
    for(const bad of ["pin:'",'login-screen','doLogin','approveReq','verifyReq','rejectReq','openPending',"role:'approver'"])assert(!assetHtml.includes(bad),'asset still contains '+bad);
    const x=await load('ac_gascheck_asset_v2.html',{vrt_a7:[mk(1)]});
    assert.deepStrictEqual(x.errors,[]);
    assert(!x.w.document.getElementById('app').classList.contains('hidden'),'app visible without login');
    assert(x.w.document.querySelectorAll('#tbod tr').length>=1);
    x.dom.window.close();
  });

  await test('C3 numbering = max(existing + tombstones)+1, recomputed after cloud write (r1)',async()=>{
    const x=await load('ac_gascheck_asset_v2.html',{vrt_a7:[mk(1),mk(2),mk(3)],gc_actor_name:'Nin'});const w=x.w;
    w.openAdd();w.document.getElementById('f-nm').value='New Fan';
    assert.equal(w.document.getElementById('cp-val').textContent,'AOA004');
    await w.saveAsset();
    let codes=plain(w.eval('assets.map(a=>a.code)'));assert.deepStrictEqual(codes.filter((c,i)=>codes.indexOf(c)!==i),[]);assert(codes.includes('AOA004'));
    // delete top code, drop the local counter (new phone) → must not reuse AOA004
    await w.deleteAssetRow('AOA004');w.localStorage.removeItem('vrt_c7');w.eval('loadLocal()');
    assert(w.eval("ASSET_V29.tombstones().some(t=>t.code==='AOA004'&&t._deleted&&t.updatedAt)"),'tombstone kept');
    w.openAdd();w.document.getElementById('f-nm').value='Desk';await w.saveAsset();
    assert.equal(w.eval('assets[0].code'),'AOA005');
    // cloud brings a higher code → next number follows it
    const cfg=w.__configs.asset;cfg.write(cfg.read().concat([mk(9,{id:'AOA009',code:'AOA009',name:'Cloud chair'})]));
    w.openAdd();assert.equal(w.document.getElementById('cp-val').textContent,'AOA010');
    assert.deepStrictEqual(x.errors,[]);x.dom.window.close();
  });

  await test('r1b cloud read/write cycle keeps codes and names',async()=>{
    const x=await load('ac_gascheck_asset_v2.html',{vrt_a7:[mk(1),mk(2),mk(3)],gc_actor_name:'Nin'});const w=x.w;
    w.openAdd();w.document.getElementById('f-nm').value='New Fan';await w.saveAsset();await pause(100);
    const cfg=w.__configs.asset;cfg.write(cfg.read());
    assert.deepStrictEqual(plain(w.eval('assets.map(a=>a.code+":"+a.name).sort()')),['AOA001:Chair 1','AOA002:Chair 2','AOA003:Chair 3','AOA004:New Fan']);
    x.dom.window.close();
  });

  await test('Asset required fields are highlighted and double-click saves once',async()=>{
    const x=await load('ac_gascheck_asset_v2.html',{vrt_a7:[mk(1)]});const w=x.w;
    w.openAdd();assert.equal(await w.saveAsset(),false);assert(w.document.getElementById('f-nm').classList.contains('gc-invalid'));
    w.document.getElementById('f-nm').value='Fan';assert.equal(await w.saveAsset(),false);assert(w.document.getElementById('f-by').classList.contains('gc-invalid'),'recorder required');
    w.document.getElementById('f-by').value='Phea';
    await Promise.all([w.saveAsset(),w.saveAsset()]);
    assert.equal(w.eval('assets.length'),2,'double click adds one asset');
    assert.equal(w.document.getElementById('f-dt').value==='' ? 'x' : 'ok','ok');
    x.dom.window.close();
  });

  await test('C2 transfer/disposal request → Telegram notice only (no web approve), failure keeps nothing',async()=>{
    const x=await load('ac_gascheck_asset_v2.html',{vrt_a7:[mk(1)],gc_lang:'en'});const w=x.w;const sent=[];
    let fail=true;w.GC.telegram.send=async(text,photos,buttons,chat,tool,meta)=>{if(fail)throw new Error('offline');sent.push({text,buttons,tool,meta});return {ok:true,messageId:7};};
    w.openReq('transfer','AOA001');
    assert.equal(w.document.getElementById('req-dt').value,todayYMD(),'request date defaults to today');
    assert.equal(await w.submitReq(),false);assert(w.document.getElementById('req-by').classList.contains('gc-invalid'));
    w.document.getElementById('req-by').value='Jenny';w.document.getElementById('req-loc').value='Store B';w.document.getElementById('req-reason').value='Move';
    assert.equal(await w.submitReq(),false,'send failure');assert.equal(w.eval("assets[0].history?assets[0].history.filter(h=>h.type==='pending').length:0"),0,'nothing recorded on failure');
    assert(!w.document.getElementById('m-req').classList.contains('hidden'),'modal stays open for retry');
    fail=false;assert.equal(await w.submitReq(),true);
    assert.equal(sent.length,1);assert.equal(sent[0].tool,'asset');assert.deepStrictEqual(plain(sent[0].buttons),[]);
    assert(!CJK.test(sent[0].text),'en notice has no Chinese');assert(/Transfer request/.test(sent[0].text)&&/Store B/.test(sent[0].text));
    assert.equal(w.eval("assets[0].location||''"),'','asset not changed until Paul decides');
    assert.equal(JSON.parse(w.localStorage.getItem('vrt_p7'))[0].telegram,'sent');
    x.dom.window.close();
  });

  await test('B6 asset reads gc_lang and never resets core language; B7 export headers per language; C12 export excludes deleted',async()=>{
    const x=await load('ac_gascheck_asset_v2.html',{vrt_a7:[mk(1),mk(2)],vrt_asset_tombstones:[{id:'AOA003',code:'AOA003',_deleted:true,updatedAt:'2026-09-03'}],gc_lang:'km',vrt_lang:'zh'});const w=x.w;
    assert.equal(w.eval('lang'),'km');assert.equal(w.GC.i18n.lang,'km');
    const cap=xlsxStub(w);w.exportExcel();
    assert.equal(cap.sheets[0].length,3,'header + 2 live rows (tombstone excluded)');
    assert(!cap.sheets[0].flat().some(v=>CJK.test(String(v))),'km export has no Chinese (headers + values)');
    assert(/[ក-៿]/.test(cap.sheets[0][0].join(' ')),'km headers are Khmer');
    w.setLang('en');assert.equal(w.GC.i18n.lang,'en');w.exportExcel();
    assert.equal(cap.sheets[1][0][0],'Code');assert(!cap.sheets[1].flat().some(v=>CJK.test(String(v))));
    assert.equal(cap.sheets[1][1][2],'Office furniture','legacy bilingual category exported as label');
    x.dom.window.close();
  });

  await test('A6 asset import reads raw serials (cellDates:false, raw:true) without day shift',async()=>{
    const aoa=[['資產編號','資產名稱','取得日期','存放位置'],['AOA010','Cabinet',46268,'Office'],['AOA011','Desk','03/09/2026','Office']];
    const x=await load('ac_gascheck_asset_v2.html',{vrt_a7:[mk(1)],gc_actor_name:'Nin'});const w=x.w;const cap=xlsxStub(w,aoa);
    const blob=new w.Blob(['x']);w.parseImportFile(blob);await pause(200);
    assert.equal(cap.reads[0].cellDates,false);assert.equal(cap.reads[0].raw,true);
    const rows=plain(w.eval('importData.map(r=>r.existingCode+"|"+r.purchaseDate)'));
    assert.deepStrictEqual(rows,['AOA010|'+serialToYMD(46268),'AOA011|2026-09-03']);
    x.dom.window.close();
  });

  await test('Asset export (en/km) re-imports: headers recognised, codes/status/category/price kept',async()=>{
    for(const l of ['en','km']){
      const x=await load('ac_gascheck_asset_v2.html',{vrt_a7:[mk(1,{status:'repair',unitPrice:12.5,category:'metal_cabinet'})],gc_lang:l,gc_actor_name:'Nin'});const w=x.w;
      const cap=xlsxStub(w);w.exportExcel();const aoa=cap.sheets[0];
      xlsxStub(w,aoa.concat([aoa[1].map((v,i)=>i===0?'AOA002':v)]));w.parseImportFile(new w.Blob(['x']));await pause(200);
      const got=plain(w.eval('importData.map(r=>[r.existingCode,r.status,r.category,r.unitPrice,r.purchaseDate].join("|"))'));
      assert.deepStrictEqual(got,['AOA001|repair|metal_cabinet|12.5|2026-09-01','AOA002|repair|metal_cabinet|12.5|2026-09-01'],l+' '+JSON.stringify(aoa[0]));
      x.dom.window.close();
    }
  });

  await test('Asset en/km UI shows no Chinese',async()=>{
    for(const l of ['en','km']){
      const x=await load('ac_gascheck_asset_v2.html',{vrt_a7:[mk(1,{history:[{type:'created',date:'2026-09-01',actor:'Nin'}]})],gc_lang:l});const w=x.w;
      w.openAdd();let leaks=uiText(w).filter(s=>CJK.test(s));assert.deepStrictEqual(leaks,[],l+' add form');w.closeM('m-form');
      w.openDetail('AOA001');leaks=uiText(w).filter(s=>CJK.test(s));assert.deepStrictEqual(leaks,[],l+' detail');w.closeM('m-det');
      w.openReq('disposal','AOA001');leaks=uiText(w).filter(s=>CJK.test(s));assert.deepStrictEqual(leaks,[],l+' request');w.closeM('m-req');
      w.openLog();leaks=uiText(w).filter(s=>CJK.test(s));assert.deepStrictEqual(leaks,[],l+' log');w.closeM('m-log');
      w.openImport();leaks=uiText(w).filter(s=>CJK.test(s));assert.deepStrictEqual(leaks,[],l+' import');w.closeM('m-import');
      x.dom.window.close();
    }
  });

  const master=[{id:'m1',key_no:'K-01',key_name:'Store',dept:'倉庫',key_type:'一般鑰匙',status:'active',createdAt:'2026-09-01 08:00:00',updatedAt:'2026-09-01 08:00:00'},{id:'m2',key_no:'K-02',key_name:'Office',dept:'GA',status:'active',createdAt:'2026-09-01',updatedAt:'2026-09-01'}];
  const oldRec={id:'k1',masterId:'m1',key_no:'K-01',dept:'倉庫',issue_date:'2026-09-01',issue_time:'08:00',recipient_name:'Sokha',checker:'Nin',key_type:'一般鑰匙',key_condition:'良好',createdAt:'2026-09-01 08:00:00',updatedAt:'2026-09-01 08:00:00'};

  await test('Key: opens on daily work tab, remembers last tab, B5 Khmer uses សោ',async()=>{
    assert(!keyHtml.includes('គ្រាប់ចុច'));
    const x=await load('ac_gascheck_keymovement_v2.html',{vrt_keys:[oldRec],vrt_key_master:master});const w=x.w;await pause(50);
    assert(w.document.getElementById('section-record').classList.contains('active'),'record tab first');
    w.showSection('list');assert.equal(w.localStorage.getItem('ac_key_tab_v1'),'list');
    x.dom.window.close();
    const y=await load('ac_gascheck_keymovement_v2.html',{vrt_keys:[oldRec],vrt_key_master:master,ac_key_tab_v1:'list'});await pause(50);
    assert(y.w.document.getElementById('section-list').classList.contains('active'),'last tab remembered');
    y.dom.window.close();
  });

  await test('Key C9 (r4): after saving an edited old record the next entry uses today/now; edit banner + auto-cancel',async()=>{
    const x=await load('ac_gascheck_keymovement_v2.html',{vrt_keys:[oldRec],vrt_key_master:master});const w=x.w;w.HTMLElement.prototype.scrollIntoView=function(){};
    w.showSection('record');assert.equal(w.document.getElementById('km-batch-date').value,todayYMD());
    w.editRecord('k1');assert.equal(w.document.getElementById('km-batch-date').value,'2026-09-01');
    assert(/K-01/.test(w.document.getElementById('km-edit-banner').textContent),'edit banner shows record');
    w.showSection('list');w.showSection('record');
    assert.equal(w.document.getElementById('km-edit-banner').textContent,'','tab switch cancels edit');
    assert.equal(w.document.getElementById('km-batch-date').value,todayYMD(),'cancel resets date');
    w.editRecord('k1');w.keyBatchSaveAll();
    assert.equal(w.records.find(r=>r.id==='k1').issue_date,'2026-09-01','edited record keeps its date');
    assert.equal(w.document.getElementById('km-batch-date').value,todayYMD(),'next entry date is today');
    assert.equal(w.document.getElementById('km-edit-banner').textContent,'');
    assert.equal(w.records.find(r=>r.id==='k1').key_type,'standard','key type stored as code');
    x.dom.window.close();
  });

  await test('Key validation highlights missing inspector / recipient',async()=>{
    const x=await load('ac_gascheck_keymovement_v2.html',{vrt_keys:[],vrt_key_master:master});const w=x.w;w.HTMLElement.prototype.scrollIntoView=function(){};
    w.showSection('record');w.document.getElementById('km-batch-inspector').value='';
    const row=w.document.querySelector('[id^="km-batch-photos-"]').id.replace('km-batch-photos-','');
    w.keyBatchSet(row,'masterId','m2');w.keyBatchSaveAll();
    assert(w.document.getElementById('km-batch-inspector').classList.contains('gc-invalid'));
    w.document.getElementById('km-batch-inspector').value='Nin';w.keyBatchSaveAll();
    assert(w.document.getElementById('km-row-rec-'+row).classList.contains('gc-invalid'));
    assert.equal(w.records.length,0);
    x.dom.window.close();
  });

  await test('Key A8 import: serial date/time converted, key_no+date+time de-duplicated',async()=>{
    const x=await load('ac_gascheck_keymovement_v2.html',{vrt_keys:[oldRec],vrt_key_master:master});const w=x.w;
    const cfg=w.__configs.keymovement;assert.equal(typeof cfg.mergeImport,'function');
    const rows=[{key_no:'K-09',issue_date:46268,issue_time:0.354,recipient_name:'A'},{key_no:'k-09',issue_date:46268,issue_time:0.354,recipient_name:'A again'},{key_no:'K-01',issue_date:'2026-09-01',issue_time:'08:00'}];
    const out=cfg.mergeImport(cfg.read(),rows);
    const imp=out.filter(r=>r.imported);assert.equal(imp.length,1,'duplicate + existing skipped');
    assert.equal(imp[0].issue_date,serialToYMD(46268));assert.equal(imp[0].issue_time,'08:30');
    x.dom.window.close();
  });

  await test('Key B4/B12 exports per language; master export has no "undefined"; A19 raw updated date',async()=>{
    const x=await load('ac_gascheck_keymovement_v2.html',{vrt_keys:[oldRec],vrt_key_master:master,gc_lang:'en'});const w=x.w;const cap=xlsxStub(w);
    w.exportExcel();const sheet=cap.sheets[0];
    assert(!sheet.flat().some(v=>CJK.test(String(v))),'loan export en has no Chinese: '+JSON.stringify(sheet));
    assert.equal(sheet[0][1],'Issue date');assert(sheet[1].includes('Warehouse')&&sheet[1].includes('Standard key')&&sheet[1].includes('Good'));
    w.keyMasterExport();const ms=cap.sheets[1];
    assert(!ms.flat().some(v=>String(v)==='undefined'),'no undefined cells');assert(!ms.flat().some(v=>CJK.test(String(v))));
    w.setLang('km');w.exportExcel();assert(/[ក-៿]/.test(cap.sheets[2][0].join(' ')));assert(!cap.sheets[2].flat().some(v=>CJK.test(String(v))));
    assert(keyHtml.includes("keyImportDate(keyImportPickRaw(headers,r,['updated','更新日期']))"));
    x.dom.window.close();
  });

  await test('Key C14 clear-all needs typed CLEAR and leaves tombstones',async()=>{
    const x=await load('ac_gascheck_keymovement_v2.html',{vrt_keys:[oldRec],vrt_key_master:master});const w=x.w;
    w.prompt=()=>'yes';w.clearAllData();assert.equal(w.records.length,1);
    w.prompt=()=>'CLEAR';w.clearAllData();assert.equal(w.records.length,0);
    assert(JSON.parse(w.localStorage.getItem('vrt_key_tombstones')).some(t=>t.id==='k1'&&t._deleted));
    x.dom.window.close();
  });

  await test('Key Telegram: summary only, report defaults to UI language, no Chinese in en',async()=>{
    const x=await load('ac_gascheck_keymovement_v2.html',{vrt_keys:[oldRec],vrt_key_master:master,gc_lang:'en'});const w=x.w;
    const cfg=w.__configs.keymovement;assert.deepStrictEqual(Array.from(cfg.telegramModes),['summary']);
    const out=w.buildKeyTelegram({cfg,period:'all',mode:'approval'});assert(!CJK.test(out.text),out.text);assert(/Warehouse/.test(out.text));
    x.dom.window.close();
  });

  await test('Key en/km UI shows no Chinese (dashboard, list, key list, settings)',async()=>{
    for(const l of ['en','km']){
      const x=await load('ac_gascheck_keymovement_v2.html',{vrt_keys:[oldRec],vrt_key_master:master,gc_lang:l});const w=x.w;await pause(50);
      for(const s of ['record','dashboard','list','analytics','anomaly','settings']){w.showSection(s);const leaks=uiText(w).filter(v=>CJK.test(v));assert.deepStrictEqual(leaks,[],l+' '+s);}
      assert.deepStrictEqual(x.errors,[]);x.dom.window.close();
    }
  });

  await test('Portal: counts exclude tombstones (r11), Khmer terms, 44px buttons, gc_lang',async()=>{
    const tomb=[1,2,3].map(n=>({id:'AOA00'+n,code:'AOA00'+n,_deleted:true,purchaseDate:'2026-09-01',updatedAt:'2026-09-02'}));
    const seed={vrt_a7:[{id:'AOA004',code:'AOA004',name:'Fan',zone:'factory',purchaseDate:'2026-09-03'}],vrt_asset_tombstones:tomb,vrt_keys:[],vrt_key_tombstones:[{id:'k9',_deleted:true,issue_date:'2026-09-01'}],gc_lang:'km'};
    const p=await load('ac_gascheck_portal_v1.html',seed);await pause(200);const w=p.w;
    assert.equal(w.document.getElementById('s-recs').textContent,'1');
    assert.equal(w.document.getElementById('sl-recs').textContent,'កំណត់ត្រា');
    assert.equal(w.document.getElementById('n-dorm').textContent,'អន្តេវាសិកដ្ឋាន');
    assert(/បរាជ័យ/.test(w.TXT.km.wh_fail));
    assert.deepStrictEqual(uiText(w).filter(s=>CJK.test(s)),[]);
    assert(/\.ha\{min-width:44px;min-height:44px/.test(portalHtml));
    const sent=[];w.gasPost=async pl=>{sent.push(pl);return {ok:true,messageId:1};};
    await w.sendTgMenu();assert(!CJK.test(sent[0].text),'km menu text has no Chinese');
    p.dom.window.close();
  });

  console.log(failures?failures+' failure(s)':'fix_asset_key_portal: all PASS');
  process.exit(failures?1:0);
})();
