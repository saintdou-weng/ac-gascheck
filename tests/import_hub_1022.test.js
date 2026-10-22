// 2026-10-22 GASCheck 智慧匯入中心（首頁＋頁首 ⇧）與參考報告（Word）。真 Chromium；雲端用真的 ac_gascheck_core_v3_fixed.gs（記憶體模擬）。
// 首頁丟：鑰匙 xlsx ＋ 廢料 xlsx ＋ 認不出的 xlsx → 自動判斷模組、背景用各頁自己的智慧匯入匯入、上雲、「✈️ 發摘要」連結
// → 同檔再丟＝已匯入過；zip／msg 展開；頁首 ⇧ 在本頁直接匯入；📝 報告下載 .docx；?tg= 開 Telegram 視窗並預選期間；en 無中文。
process.env.TZ='Asia/Phnom_Penh';
const fs=require('fs'),path=require('path'),assert=require('assert'),os=require('os');
let chromium;try{({chromium}=require('playwright'));}catch(e){console.log('SKIP import_hub_1022 (playwright not installed)');process.exit(0);}
const {server}=require('./gas-approval-harness.cjs');const XLSX=require('./vendor/xlsx.full.min.js');
const root=path.join(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gc-hub-'));
const CJK=/[㐀-鿿]/;
function xlsxBuf(sheets){const wb=XLSX.utils.book_new();sheets.forEach(s=>XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(s.rows),s.name));return XLSX.write(wb,{type:'buffer',bookType:'xlsx'});}
const keyFile=path.join(tmp,'Key movement register Sep 2026.xlsx');fs.writeFileSync(keyFile,xlsxBuf([{name:'Keys',rows:[['Key No','Department','Recipient','Issue Date','Issue Time','Checked by','Remarks'],['K-01','Admin','Dara','2026-09-03','08:10','Nin',''],['K-02','Warehouse','Sok','2026-09-03','08:30','Nin','returned 17:00'],['K-01','Admin','Dara','2026-09-04','08:05','Nin','']]}]));
const ehsFile=path.join(tmp,'Waste check September 2026.xlsx');fs.writeFileSync(ehsFile,xlsxBuf([{name:'Waste Sep',rows:[['Waste Check September 2026'],['Date','Name','Suppliers','Solid Waste','Industrial Waste','Kg','Time In','Time Out'],['2026-09-03','Na Rin','KSWM','V','',100,'08:30','09:00'],['2026-09-15','Nhem','SONYAPICH','','V',50,'15:10','15:40']]}]));
const oddFile=path.join(tmp,'random.xlsx');fs.writeFileSync(oddFile,xlsxBuf([{name:'Sheet1',rows:[['a','b'],[1,2]]}]));
const zipFile=path.join(tmp,'keys-pack.zip');require('child_process').execFileSync('python3',['-c','import zipfile,sys;z=zipfile.ZipFile(sys.argv[1],"w");z.write(sys.argv[2],"mail/"+sys.argv[2].split("/")[-1]);z.close()',zipFile,keyFile]);
let msgFile='';const mk=process.env.SEC_MSG_WRITER;if(mk&&fs.existsSync(mk)){msgFile=path.join(tmp,'mail.msg');require('child_process').execFileSync('node',[mk,msgFile,'FW: Waste check Sep',ehsFile],{cwd:path.dirname(mk)});}
(async()=>{
 const S=server();S.smart=tool=>{const m=S.g.readGcSmartManifest_(tool);return JSON.parse(JSON.stringify(m&&m.exists!==false?S.g.readGcSmartAllRecords_(tool,m):[]));};S.g.SpreadsheetApp={openById:()=>({getSheetByName:()=>null,getSheets:()=>[]}),getActiveSpreadsheet:()=>null};
 async function route(ctx){
  await ctx.route('**/*',async r=>{const req=r.request(),u=new URL(req.url());
   if(u.hostname==='offline.test'){const p=path.join(root,decodeURIComponent(u.pathname));if(fs.existsSync(p)&&fs.statSync(p).isFile())return r.fulfill({status:200,contentType:p.endsWith('.html')?'text/html':p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':'application/octet-stream',body:fs.readFileSync(p)});return r.fulfill({status:404,body:''});}
   if(u.hostname==='cdnjs.cloudflare.com'&&/xlsx/.test(u.pathname))return r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(path.join(root,'tests/vendor/xlsx.full.min.js'))});
   if(u.hostname==='script.google.com'){const p={};u.searchParams.forEach((v,k)=>{p[k]=v;});let out;if(req.method()==='GET')out=S.g.doGet({parameter:p});else{const body=req.postData()||'';try{const q=new URLSearchParams(body);q.forEach((v,k)=>{p[k]=v;});}catch(_){}out=S.g.doPost({postData:{contents:body,type:'text/plain'},parameter:p});}return r.fulfill({status:200,contentType:'application/json',body:out.text});}
   return r.fulfill({status:200,contentType:'application/javascript',body:'window.Chart=class{destroy(){} update(){}};'});});
 }
 const browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});await route(ctx);const pg=await ctx.newPage(),errors=[],dialogs=[];
  pg.on('pageerror',e=>errors.push(e.message));pg.on('dialog',d=>{dialogs.push(d.message());d.accept();});
  await pg.goto('https://offline.test/ac_gascheck_portal_v1.html');await pg.waitForSelector('#portalHub [data-drop]');
  await pg.setInputFiles('#portalHub [data-file]',[keyFile,ehsFile,oddFile]);
  await pg.waitForFunction(()=>PORTAL_HUB.items.length===3&&PORTAL_HUB.items.every(it=>it.state!=='detect'),null,{timeout:60000});
  let items=await pg.evaluate(()=>PORTAL_HUB.items.map(it=>({name:it.name,tool:it.tool,state:it.state,on:it.on,month:it.month})));
  const ki=items.find(x=>/Key/.test(x.name)),ei=items.find(x=>/Waste/.test(x.name)),oi=items.find(x=>/random/.test(x.name));
  assert.equal(ki.tool,'keymovement',JSON.stringify(items));assert.equal(ki.state,'ready');assert.equal(ki.month,'2026-09');
  assert.equal(ei.tool,'ehs');assert.equal(ei.state,'ready');assert.equal(oi.state,'ask');assert(!oi.on);
  await pg.click('#portalHub [data-run]');await pg.waitForFunction(()=>!PORTAL_HUB.busy&&PORTAL_HUB.items.filter(it=>it.state==='ok').length===2,null,{timeout:240000});
  items=await pg.evaluate(()=>PORTAL_HUB.items.map(it=>({name:it.name,state:it.state,msg:it.msg})));
  assert(items.filter(x=>x.state==='ok').every(x=>/已上雲|uploaded/.test(x.msg)),'waited for cloud: '+JSON.stringify(items));
  assert(S.smart('keymovement').some(r=>r.key_no==='K-02'),'keys reached the (fake) cloud');assert(S.smart('ehs').some(r=>r.supplier==='K.S.W.M'&&r.weight_kg===100),'waste reached the cloud: '+JSON.stringify(S.smart('ehs')).slice(0,200));
  await pg.waitForTimeout(400);assert.equal(await pg.locator('iframe').count(),0);
  const acts=await pg.$$eval('#portalHub .ihub-acts a',a=>a.map(x=>[x.textContent,x.getAttribute('href')]));
  assert(acts.some(a=>/ac_gascheck_keymovement_v2\.html\?tg=summary&ptype=month&period=2026-09/.test(a[1]))&&acts.some(a=>/ac_gascheck_ehs_v2\.html\?tg=summary/.test(a[1])),JSON.stringify(acts));
  if(process.env.SHOT_DIR)await pg.screenshot({path:path.join(process.env.SHOT_DIR,'gc-hub-home.png'),fullPage:true});
  /* 同檔／zip／msg → 已匯入過 */
  await pg.click('#portalHub [data-clear]');await pg.setInputFiles('#portalHub [data-file]',[keyFile,zipFile].concat(msgFile?[msgFile]:[]));
  await pg.waitForFunction(()=>PORTAL_HUB.items.length>=2&&PORTAL_HUB.items.every(it=>it.state!=='detect'),null,{timeout:60000});
  items=await pg.evaluate(()=>PORTAL_HUB.items.map(it=>({name:it.name,via:it.via,state:it.state,on:it.on})));
  assert(items.every(x=>x.state==='done-before'&&!x.on),JSON.stringify(items));assert(items.some(x=>/keys-pack\.zip/.test(x.via)));
  if(msgFile)assert(items.some(x=>/mail\.msg/.test(x.via)&&/Waste check Sep/.test(x.via)),JSON.stringify(items));
  await pg.check('#portalHub [data-on]');await pg.click('#portalHub [data-run]');await pg.waitForFunction(()=>!PORTAL_HUB.busy,null,{timeout:240000});
  /* 鑰匙頁自己會替看到的鑰匙建「master:」登記（不是異動紀錄）；異動紀錄維持 3 筆 */
  assert.equal(S.smart('keymovement').filter(r=>!r._deleted&&!/^master:/.test(String(r.id))).length,3,'re-import does not duplicate key movements');
  /* 發摘要 → 鑰匙頁 Telegram 視窗預選 2026-09 */
  await pg.goto('https://offline.test/ac_gascheck_keymovement_v2.html?tg=summary&ptype=month&period=2026-09');
  await pg.waitForSelector('.gc-common-modal.open [data-gc-ref]',{timeout:30000});
  assert.equal(await pg.inputValue('.gc-common-modal.open [data-gc-period]'),'month');assert.equal(await pg.inputValue('.gc-common-modal.open [data-gc-ref]'),'2026-09-01');
  assert.equal(new URL(pg.url()).search,'');
  await pg.waitForFunction(()=>/K-0[12]|2026-09/.test(document.querySelector('.gc-common-modal.open [data-gc-preview]').textContent));
  await pg.click('.gc-common-modal.open [data-gc-close]');
  /* 頁首 ⇧ 本頁直接匯入 */
  assert(await pg.isVisible('[data-gc-open-hub]'));await pg.click('[data-gc-open-hub]');await pg.waitForSelector('.gc-hub-modal [data-drop]');
  const k2=path.join(tmp,'keys Oct.xlsx');fs.writeFileSync(k2,xlsxBuf([{name:'Keys',rows:[['Key No','Department','Recipient','Issue Date','Issue Time'],['K-07','Office','Mony','2026-10-02','09:00']]}]));
  await pg.setInputFiles('.gc-hub-modal [data-file]',[k2]);await pg.waitForFunction(()=>document.querySelector('.gc-hub-modal [data-run]')&&!document.querySelector('.gc-hub-modal [data-run]').disabled);
  await pg.click('.gc-hub-modal [data-run]');await pg.waitForFunction(()=>document.querySelector('.gc-hub-modal .ihub-row.ok')&&!document.querySelector('.gc-hub-modal').__hub.busy,null,{timeout:120000});
  assert.equal(await pg.locator('iframe').count(),0,'same-module import runs live');
  assert(await pg.evaluate(()=>(window.records||[]).some(r=>r.key_no==='K-07')),'live page has the record');
  await pg.click('.gc-hub-modal [data-close]');
  /* 📝 報告 */
  await pg.click('[data-gc-report]');await pg.waitForSelector('.gc-report-modal [data-go]');
  await pg.selectOption('.gc-report-modal [data-period]','2026-09-01');await pg.waitForFunction(()=>/K-0|Keys|鑰匙/.test(document.querySelector('.gc-report-modal [data-preview]').textContent));
  if(process.env.SHOT_DIR)await pg.screenshot({path:path.join(process.env.SHOT_DIR,'gc-report-modal.png'),fullPage:true});
  const [dl]=await Promise.all([pg.waitForEvent('download',{timeout:60000}),pg.click('.gc-report-modal [data-go]')]);
  const docxPath=path.join(process.env.SHOT_DIR||tmp,dl.suggestedFilename());await dl.saveAs(docxPath);
  assert.match(dl.suggestedFilename(),/^VRT_keymovement_Monthly_2026-09_zh-en\.docx$/);
  const docText=require('child_process').execFileSync('python3',['-c','import zipfile,sys,re;print(re.sub(r"<[^>]+>"," ",zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode()))',docxPath]).toString();
  assert(/鑰匙管理/.test(docText)&&/Key Movement/.test(docText)&&/Monthly Report/.test(docText)&&/Executive Summary/.test(docText)&&/Details/.test(docText)&&/K-02/.test(docText)&&/Prepared by/.test(docText),'docx content');
  await pg.click('.gc-report-modal [data-close]');
  /* en 無中文 */
  await pg.evaluate(()=>GC.i18n.set('en'));await pg.click('[data-gc-open-hub]');await pg.waitForSelector('.gc-hub-modal [data-drop]');
  let txt=await pg.evaluate(()=>document.querySelector('.gc-hub-modal').innerText);assert(!CJK.test(txt),'hub en: '+txt);await pg.click('.gc-hub-modal [data-close]');
  await pg.click('[data-gc-report]');await pg.waitForSelector('.gc-report-modal [data-go]');txt=await pg.evaluate(()=>document.querySelector('.gc-report-modal').innerText.replace(/Chinese \+ English/,''));
  await pg.waitForFunction(()=>!/…/.test(document.querySelector('.gc-report-modal [data-preview]').textContent));txt=await pg.evaluate(()=>document.querySelector('.gc-report-modal').innerText.replace(/Chinese \+ English/,''));
  assert(!CJK.test(txt),'report en: '+txt);
  assert.deepStrictEqual(errors,[]);assert.deepStrictEqual(dialogs,[]);
  console.log('PASS import hub (portal + page ⇧): keys/waste auto-detected, imported via each page\'s own smart import and uploaded, unknown asks, same content skipped, zip'+(msgFile?'/msg':'')+' expanded, no duplicates, ?tg= opens Telegram with the period, live import, Word report, en without Chinese');
 }finally{await browser.close();}
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
