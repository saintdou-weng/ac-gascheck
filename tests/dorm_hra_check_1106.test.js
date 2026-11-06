/* 2026-11-06 宿舍 × HRA 住宿名單自動對照 */
const assert=require('assert'),path=require('path');process.chdir(path.join(__dirname,'..'));
const {load}=require('./dom-harness.cjs');
const H=[{_kind:'members',period:'2026-10',employeeId:'1111',name:'A',gender:'M',accommodation:true,status:'active'},
 {_kind:'members',period:'2026-10',employeeId:'0372',name:'X',gender:'M',accommodation:true},
 {_kind:'members',period:'2026-10',employeeId:'5832',name:'B',gender:'F',accommodation:true},
 {_kind:'members',period:'2026-09',employeeId:'9999',name:'Old',gender:'F',accommodation:true},
 {_kind:'members',period:'2026-10',employeeId:'7777',name:'Stop',accommodation:true,status:'stopped'},
 {_kind:'summaries',period:'2026-10',accommodationLocal:2,accommodationExpat:3}];
(async()=>{
 const x=await load('ac_gascheck_dormitory_v2.html',{},w=>{Object.defineProperty(w.navigator,'onLine',{configurable:true,get:()=>false});
   const real=w.fetch;w.fetch=async(u,o)=>{u=String(u);if(u.includes('AKfycbya4jZG')){const q=new URL(u).searchParams;const body=q.get('action')==='smartManifest'?{ok:true,data:{counts:{'h:00':3,'m:2026-10':2}}}:{ok:true,data:{records:q.get('bucket')==='h:00'?H.slice(0,4):H.slice(4)}};return {json:async()=>body};}return real?real(u,o):{json:async()=>({})};};});
 const w=x.w;
 try{
  w.state.replaceRecords([{id:'r1',name:'B',idNo:'5832',roomNo:'A-106',date:'2026-09-23',type:'搬入',status:'已核可',timestamp:'2026-09-23 10:00'},
    {id:'r2',name:'C',idNo:'2222',roomNo:'109',date:'2026-08-01',type:'搬入',status:'已核可',timestamp:'2026-08-01 10:00'},
    {id:'r3',name:'D',idNo:'5626',roomNo:'109',date:'2026-08-01',type:'搬入',status:'已核可',timestamp:'2026-08-01 10:00'}]);
  const h=await w.dormHra.get(true);
  assert.equal(h.period,'2026-10');assert.equal(h.list.length,3);assert.equal(h.expat,3);
  const d=w.dormHra.diff();
  assert.equal(d.missing.map(r=>r.idNo).join(),'1111');assert.equal(d.extra.map(r=>r.idNo).join(),'2222');assert.equal(d.matched.length,1);assert.equal(d.excepted.length,2,'0372 + 5626 are pre-October exceptions');
  w.ui.tab('roster');w.dormHra.render();
  const t=w.document.getElementById('hra-check').textContent;assert(t.includes('1111')&&t.includes('2222')&&!t.includes('0372 X'),'only real mismatches listed');
  assert.equal(w.document.getElementById('rs-count').textContent,'3','resident count follows HRA');
  const rep=await w.__configs.dormitory.telegramBuilder({cfg:w.__configs.dormitory,period:'day',ref:'2026-11-06',lang:'zh',scope:'all'});
  const txt=typeof rep==='string'?rep:rep.text;
  assert(txt.includes('目前在住 <b>3</b>')&&txt.includes('外籍 3')&&txt.includes('HRA 有、沒有搬入申請 <b>1</b>'),'telegram line');
  // 10 月前例外：0372 在 HRA、沒申請 → 例外；5626 有申請、HRA 沒有 → 例外
  w.roster.load();const ids=w.roster.list().map(r=>String(r.idNo)).sort().join();assert.equal(ids,'0372,2222,5832','exceptions applied: 0372 in, 5626 out');
  console.log('dorm HRA check ok');
 }catch(e){console.error(e);process.exitCode=1;}finally{x.dom.window.close();}
})();
