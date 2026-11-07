/* 2026-11-07 del-guard v2：只攔人按的刪除，列出要刪的人，系統自動刪除不攔 */
const assert=require('assert'),path=require('path');process.chdir(path.join(__dirname,'..'));
const {load}=require('./dom-harness.cjs');
(async()=>{
 const calls=[];
 const x=await load('ac_gascheck_dormitory_v2.html',{},w=>{
   Object.defineProperty(w.navigator,'onLine',{configurable:true,get:()=>true});
   w.localStorage.setItem('dg_who',JSON.stringify('Phea'));
   const base=w.fetch;w.fetch=async(u,o)=>{u=String(u);const b=o&&o.body!=null?String(o.body):'';calls.push({u,b});
     if(u.includes('AKfycbx9P')&&u.includes('hr_get'))return {json:async()=>({rows:[]})};
     return {ok:true,status:200,json:async()=>({ok:true}),text:async()=>'{"ok":true}'};};
 });
 const w=x.w;
 try{
  assert.equal(w.DelGuard&&w.DelGuard.version,2,'v2 installed');
  w.state.replaceRecords([{id:'r1',name:'Sorn Thea',idNo:'5597',roomNo:'102',date:'2026-08-01',type:'搬入',status:'已核可',timestamp:'2026-08-01 10:00'}]);
  w.cfg.get().gasUrl='https://script.google.com/macros/s/AKfycbzRsf_TEST/exec';
  w.confirm=()=>true;
  w.document.body.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  await w.records.del('r1');await new Promise(r=>setTimeout(r,300));
  const tg=calls.find(c=>c.u.includes('AKfycbx9P')&&c.b.includes('hr_tg'));
  assert(tg,'Paul gets one approval message');
  const msg=JSON.parse(tg.b).text;
  assert(msg.includes('Sorn Thea')&&msg.includes('5597')&&msg.includes('Phea')&&msg.includes('#delok/'),'lists who and what');
  const delSent=calls.filter(c=>c.u.includes('AKfycbzRsf_TEST')&&/"action":"delete"/.test(decodeURIComponent(c.b)));
  assert.equal(delSent.length,0,'cloud delete held until approval');
  assert.equal(Object.keys(w.DelGuard.pending()).length,1);
  // 等核可期間：同步上傳拿掉那筆刪除記號
  const before=calls.length;
  await w.fetch('https://script.google.com/macros/s/AKfycbzRsf_TEST/exec',{method:'POST',body:JSON.stringify({action:'smartBucket',tool:'dormitory',bucket:'m:2026-08',count:1,records:[{id:'r1',_deleted:true}]})});
  const up=JSON.parse(calls[calls.length-1].b);assert.equal(up.records.length,0,'tombstone withheld while pending');
  // 自動刪除（沒有人按）不攔
  await new Promise(r=>setTimeout(r,8200));
  await w.fetch('https://script.google.com/macros/s/AKfycbzRsf_TEST/exec',{method:'POST',body:JSON.stringify({action:'deleteBatch',tool:'ehs',ids:['a','b']})});
  assert(calls[calls.length-1].b.includes('deleteBatch'),'automatic delete passes');
  assert.equal(calls.filter(c=>c.b.includes('hr_tg')).length,1,'no extra Telegram');
  // 同步本身（沒有刪除）不攔、不發訊息
  await w.fetch('https://script.google.com/macros/s/AKfycbzRsf_TEST/exec',{method:'POST',body:JSON.stringify({action:'smartBucket',tool:'dormitory',bucket:'m:2026-09',count:0,records:[]})});
  assert.equal(calls.filter(c=>c.b.includes('hr_tg')).length,1);
  console.log('del-guard v2 ok');
 }catch(e){console.error(e);process.exitCode=1;}finally{x.dom.window.close();}
})();
