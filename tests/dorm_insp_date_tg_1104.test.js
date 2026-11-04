/* 2026-11-04 宿舍巡查：選日期顯示該日資料、同日更新不重複、歷史日週月年＋重點、Telegram 走共用面板、拿掉季度 */
const assert=require('assert'),path=require('path');process.chdir(path.join(__dirname,'..'));
const {load}=require('./dom-harness.cjs');
const D='2026-11-03',D2='2026-11-04',pause=()=>new Promise(r=>setTimeout(r,40));
function setup(w){const R=w.Date;w.Date=class extends R{constructor(...a){super(...(a.length?a:[D2+'T10:00:00']));}static now(){return new R(D2+'T10:00:00').getTime();}};Object.defineProperty(w.navigator,'onLine',{configurable:true,get:()=>false});}
(async()=>{
 const x=await load('ac_gascheck_dormitory_v2.html',{},setup);
 const w=x.w,doc=w.document;
 try{
  assert.deepStrictEqual(x.errors,[]);
  // 4 季度已拿掉
  assert(!doc.getElementById('insp-q'),'inspection quarter removed');
  assert(!doc.getElementById('cfg-quarter'),'settings quarter removed');
  const cols=w.eval('INSP_COLS').map(c=>c.k),normal=Object.fromEntries(cols.map(k=>[k,'N']));
  Object.assign(w.cfg.get(),{rooms_foreignDorm:['#201','#202'],rooms_localDorm:['L1'],rooms_factory:[],rooms_office:[]});
  const db=w.state.db();db.records=[];db.violations=[];
  db.inspections=[{id:'i1',date:D,location:'foreignDorm',inspector:'Phea',timestamp:D+' 08:00:00',updatedAt:D+' 08:00:00',data:{'#201':normal,'#202':{...normal,[cols[0]]:'X'}},photos:[],anomalies:1}];
  w.state.save();
  w.ui.tab('insp');
  // 1 選日期 → 顯示該日該地點的資料
  doc.getElementById('insp-date').value=D;w.insp.loadForDate(true);
  assert.equal(doc.querySelectorAll('#insp-tbl-wrap .sc-X').length,1,'saved anomaly shown for picked date');
  assert.equal(doc.querySelectorAll('#insp-tbl-wrap .sc-N').length,cols.length*2-1);
  assert(!doc.getElementById('insp-loaded').hidden&&doc.getElementById('insp-loaded').textContent.includes(D));
  // 換到沒資料的日期 → 清空並提示
  doc.getElementById('insp-date').value=D2;w.insp.loadForDate(true);
  assert.equal(doc.querySelectorAll('#insp-tbl-wrap .sc-N,#insp-tbl-wrap .sc-X').length,0,'other day empty');
  // 其他地點分頁
  doc.getElementById('insp-date').value=D;w.insp.setLoc('localDorm',doc.querySelector('[data-loc=localDorm]'));
  assert.equal(doc.querySelectorAll('#insp-tbl-wrap .sc-N,#insp-tbl-wrap .sc-X').length,0,'local dorm has no record that day');
  w.insp.setLoc('foreignDorm',doc.querySelector('[data-loc=foreignDorm]'));
  assert.equal(doc.querySelectorAll('#insp-tbl-wrap .sc-X').length,1);
  // 改了再存 → 更新原紀錄，不多一筆
  w.insp.tap('#202',cols[0]);w.insp.tap('#202',cols[0]);w.insp.tap('#202',cols[0]); // X → - → '' → N
  doc.getElementById('insp-inspector').value='Phea';
  assert.strictEqual(await w.insp.save(),true);
  const live=w.state.db().inspections.filter(r=>!r._deleted);
  assert.equal(live.length,1,'same day+location updates in place');assert.equal(live[0].anomalies,0);assert(!('quarter' in live[0]));
  // 2 歷史：日週月年＋重點
  w.ihDE.set('day',doc.querySelector('#pane-insp .dnp[data-p=day]'));w.ihDE.prev();
  const kn=doc.getElementById('insp-keynote').textContent;
  assert(kn.includes('1')&&/巡查|Inspect|inspect/.test(kn),'key notes rendered');
  assert(doc.querySelectorAll('#insp-hist tbody tr').length===1);
  w.ihDE.next();assert(/沒有任何巡查|No inspection/.test(doc.getElementById('insp-keynote').textContent),'empty day flagged');
  for(const p of ['week','month','year'])assert(doc.querySelector(`#pane-insp .dnp[data-p=${p}]`),p+' option');
  // 3 Telegram → 共用面板（有選項），預設日＝巡查日期，只有巡查也可發
  doc.getElementById('insp-date').value=D;w.insp.loadForDate(true);
  await w.insp.sendTg();await pause();
  const modal=doc.querySelector('.gc-common-modal[data-gc-tool=dormitory]');
  assert(modal.classList.contains('open'),'Telegram options panel opened');
  assert.equal(modal.querySelector('[data-gc-period]').value,'day');
  assert.equal(modal.querySelector('[data-gc-ref]').value,D);
  assert(Array.from(modal.querySelector('[data-gc-ref]').options).some(o=>o.value===D),'inspection date listed');
  const cfg=w.__configs.dormitory;assert.strictEqual(cfg.telegramValidator({records:[],period:'day',ref:D}),true,'inspection-only day can send');
  assert.notStrictEqual(cfg.telegramValidator({records:[],period:'day',ref:'2026-01-01'}),true);
  modal.classList.remove('open');
  doc.getElementById('vf-name').value='';w.viol.sendTg();await pause();
  assert(modal.classList.contains('open'),'violation Telegram opens panel');
  console.log('dorm inspection date/history/telegram ok');
 }catch(e){console.error(e);process.exitCode=1;}
 finally{x.dom.window.close();}
})();
