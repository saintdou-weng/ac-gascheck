const assert=require('assert');
const {load}=require('./dom-harness.cjs');
const pause=()=>new Promise(r=>setTimeout(r,25));
function clock(w){
  const RealDate=w.Date;
  w.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-09-19T14:52:00']));}static now(){return new RealDate('2026-09-19T14:52:00').getTime();}};
  Object.defineProperty(w.navigator,'onLine',{configurable:true,get:()=>false});
}
function controls(w){
  const modal=w.document.querySelector('.gc-common-modal[data-gc-tool]');
  return {modal,get:k=>modal.querySelector('[data-gc-'+k+']'),change:async(k,v)=>{const el=modal.querySelector('[data-gc-'+k+']');el.value=v;el.onchange();await pause();}};
}
(async()=>{
  // Reproduce 19 Sep screenshot: all 30 calendar rows exist, but most have no delivery.
  const rows=Array.from({length:30},(_,i)=>({day:i+1,fQty:'',sQty:'',fPrice:2000,sPrice:3000,checkBy:'Checker',updatedAt:'2026-09-19 10:00:00'}));
  Object.assign(rows[17],{fQty:4,fTime:'08:00'});
  Object.assign(rows[11],{fQty:0,fTime:'08:00'});
  Object.assign(rows[5],{sQty:2,sTime:'15:30'});
  const x=await load('ac_gascheck_waterdrum_v2.html',{wdr_2026_09:rows},clock);
  try{
    const w=x.w,cfg=w.__configs.waterdrum,c=controls(w);
    w.document.querySelector('[data-gc-open-tg]').onclick();await pause();
    await c.change('scope','factory');await c.change('period','week');
    assert.equal(c.get('ref').value,'2026-09-14','Month -> Week stays in the real current week');
    assert(!Array.from(c.get('ref').options).some(o=>o.value==='2026-09-28'),'Empty last week must not become a report period');
    assert(!c.get('send').disabled,c.get('send-state').textContent);
    // 1003 TG format: the week card shows the period range and the 09-18 Factory delivery as totals (no per-day table).
    assert(c.get('preview').textContent.includes('09-14~09-20')&&c.get('preview').textContent.includes('4 桶 · 8,000 KHR'),c.get('preview').textContent);
    await c.change('period','day');assert.equal(c.get('ref').value,'2026-09-18','Choose latest real day on/before today');
    assert(!Array.from(c.get('ref').options).some(o=>o.value==='2026-09-30'));
    assert(Array.from(c.get('ref').options).some(o=>o.value==='2026-09-12'),'Explicit zero-quantity record remains selectable');
    await c.change('scope','staff');assert.equal(c.get('ref').value,'2026-09-18','Scope changes do not silently send a different day');
    assert(c.get('send').disabled,'No staff delivery on selected date stays blocked');
    await c.change('ref','2026-09-06');assert(!c.get('send').disabled);
    await c.change('slot','morning');assert(c.get('send').disabled,'Factory AM cannot qualify a staff PM report');
    await c.change('slot','afternoon');assert(!c.get('send').disabled);
    c.get('mode=approval').onclick();await pause();
    assert.equal(c.get('period').value,'month','Water approval automatically uses its required monthly scope');
    assert.equal(c.get('period').options.length,1);
    assert(!c.get('send').disabled);
    assert(c.get('preview').textContent.includes('2026-09'));
    assert.equal(w.GC.telegram.filter(cfg.read(),cfg,'all',null,'factory','all').length,2,'Only two actual Factory delivery rows');
    assert.equal(w.GC.telegram.filter([{id:'gone',date:'2026-09-19',_deleted:true}],{dateField:'date'},'all').length,0);
    assert.deepStrictEqual(x.errors,[]);
  }finally{x.dom.window.close();}

  const temp=await load('ac_gascheck_temperature_v2.html',{
    vrt_th_z:[{id:'za',en:'Building A Workshop',on:true}],
    vrt_th_r:[{id:'pm',d:'2026-09-18',z:'za',p:'afternoon',t:28,h:70,checker:'Inspector'}]
  },clock);
  try{
    const w=temp.w,c=controls(w);w.document.querySelector('[data-gc-open-tg]').onclick();await pause();
    await c.change('slot','morning');assert(c.get('send').disabled,'Month AM filter has no AM data');
    await c.change('period','day');
    assert.equal(c.get('slot').value,'all');assert.equal(c.get('slot').options.length,1);
    assert.equal(c.get('ref').value,'2026-09-18');assert(!c.get('send').disabled);
    assert(c.get('preview').textContent.includes('28°C'),'Combined daily summary includes the saved PM reading');
    assert.deepStrictEqual(temp.errors,[]);
  }finally{temp.dom.window.close();}
  console.log('v60 screenshot reproduction: real delivery periods, stable explicit selection, scope/slot, zero quantity, Water approval and Temp AM+PM PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
