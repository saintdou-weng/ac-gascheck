// 2026-11-11 Paul：有人反應「按儲存卻發出去了」。儲存只儲存；發送一定先跳確認（看得到內容），取消就不發；
// 上方狀態列一眼看出早上／下午記了幾區、群組發了沒、發後有沒有改。真 Chromium＋真 .gs。
const fs=require('fs'),path=require('path'),assert=require('assert');
let chromium;try{({chromium}=require('playwright'));}catch(e){console.log('SKIP temp_save_no_send_1111 (playwright not installed)');process.exit(0);}
const {server}=require('./gas-approval-harness.cjs');const root=path.join(__dirname,'..');
(async()=>{const S=server();S.g.SpreadsheetApp={openById:()=>({getSheetByName:()=>null,getSheets:()=>[]}),getActiveSpreadsheet:()=>null};
 const browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 try{const ctx=await browser.newContext({viewport:{width:1280,height:800}});
  await ctx.route('**/*',async r=>{const req=r.request(),u=new URL(req.url());
   if(u.hostname==='offline.test'){const p=path.join(root,decodeURIComponent(u.pathname));if(fs.existsSync(p)&&fs.statSync(p).isFile())return r.fulfill({status:200,contentType:p.endsWith('.html')?'text/html':p.endsWith('.js')?'application/javascript':'text/css',body:fs.readFileSync(p)});return r.fulfill({status:404,body:''});}
   if(u.hostname==='script.google.com'){const p={};u.searchParams.forEach((v,k)=>{p[k]=v;});const out=req.method()==='GET'?S.g.doGet({parameter:p}):S.g.doPost({postData:{contents:req.postData()||'',type:'text/plain'},parameter:p});return r.fulfill({status:200,contentType:'application/json',body:out.text});}
   return r.fulfill({status:200,contentType:'application/javascript',body:'window.Chart=class{destroy(){} update(){}};'});});
  const pg=await ctx.newPage(),errors=[];pg.on('pageerror',e=>errors.push(e.message));pg.on('dialog',d=>d.accept());
  await pg.addInitScript(()=>{try{localStorage.setItem('gc_lang','en');}catch(e){}});
  await pg.goto('https://offline.test/ac_gascheck_temperature_v2.html');await pg.waitForFunction(()=>document.querySelectorAll('[id^="ri-t-"]').length>=4&&typeof sendTodayCombinedTemp==='function');await pg.waitForTimeout(2500);
  await pg.evaluate(()=>{const t=[...document.querySelectorAll('.tab,[data-tab],button')].find(x=>/Record$|登錄$/.test(x.textContent.trim())&&!/Overview|總覽/.test(x.textContent)&&x.offsetParent);if(t)t.click();setRP('morning');});
  assert(/no send/i.test(await pg.textContent('#i-saveall')),'save button says it does not send');
  const fill=(t,h)=>pg.evaluate(([t,h])=>{document.querySelectorAll('[id^="ri-t-"]').forEach(x=>{x.value=t;});document.querySelectorAll('[id^="ri-h-"]').forEach(x=>{x.value=h;});},[t,h]);
  const tg=()=>S.telegram.filter(x=>/^send|^edit/.test(x.method)).length,strip=()=>pg.evaluate(()=>document.getElementById('temp-day-status').innerText.replace(/\s+/g,' '));
  /* ① 儲存：不會發 */
  const n0=tg();await fill('29','68');await pg.click('#i-saveall');await pg.waitForTimeout(6000);
  assert.strictEqual(tg(),n0,'Save must not send anything to Telegram');
  let s=await strip();assert(/Morning 4\/4 ✅/.test(s)&&/Afternoon 0\/4 ⏳/.test(s)&&/Group: not sent yet/.test(s),'status strip after save: '+s);
  /* ② 發送：先確認；取消＝不發 */
  await pg.click('#i-send-combined');await pg.waitForSelector('.tcs-box');
  const box=await pg.textContent('.tcs-box');assert(/Send to the Telegram group\?/.test(box)&&/AM 29°C\/68% → PM ⏳/.test(box),'confirmation shows the message: '+box.slice(0,300));
  await pg.click('#tcs-no');await pg.waitForTimeout(2500);assert.strictEqual(tg(),n0,'Cancel sends nothing');assert(!await pg.$('.tcs-box'));
  /* ③ 確認後才發 */
  await pg.click('#i-send-combined');await pg.click('#tcs-yes');await pg.waitForFunction(()=>/Group: sent/.test(document.getElementById('temp-day-status').innerText),null,{timeout:60000});
  assert.strictEqual(tg(),n0+1,'exactly one message after confirming');s=await strip();assert(/Group: sent \d\d:\d\d ✅/.test(s),s);
  /* ④ 發後補下午：仍不會自動發，狀態提醒要再發 */
  await pg.evaluate(()=>setRP('afternoon'));await fill('32','52');await pg.click('#i-saveall');await pg.waitForTimeout(6000);
  assert.strictEqual(tg(),n0+1,'saving the afternoon does not send either');s=await strip();assert(/Afternoon 4\/4 ✅/.test(s)&&/changed after sending/.test(s),s);
  await pg.click('#i-send-combined');await pg.waitForSelector('.tcs-box');assert(/already sent/.test(await pg.textContent('.tcs-box')),'tells the user the same message is updated');await pg.click('#tcs-yes');
  await pg.waitForFunction(()=>/Group: sent \d\d:\d\d ✅/.test(document.getElementById('temp-day-status').innerText),null,{timeout:60000});
  assert(!/[㐀-鿿]/.test(await strip()),'en strip has no Chinese');assert.deepStrictEqual(errors,[]);
  if(process.env.SHOT){await pg.evaluate(()=>window.scrollTo(0,0));await pg.screenshot({path:process.env.SHOT+'_status.png'});await pg.evaluate(()=>{setRP('afternoon');});await pg.click('#i-send-combined');await pg.waitForSelector('.tcs-box');await pg.screenshot({path:process.env.SHOT+'_confirm.png'});}
  console.log('PASS temp_save_no_send_1111: Save never sends; Send asks first (cancel = nothing sent); status strip shows AM/PM progress, sent time and changed-after-sending');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
