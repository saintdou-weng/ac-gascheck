const assert=require('assert'),fs=require('fs'),vm=require('vm');
const {load}=require('./dom-harness.cjs');
const target='z_buildingafinishingwh';
const zones=[
  {id:'za',zh:'A廠車間',en:'Building A Workshop',on:true},
  {id:'zb',zh:'B廠車間',en:'Building B Workshop',on:true},
  {id:'zc',zh:'B廠倉庫',en:'Building B Warehouse',on:true},
  {id:'zd',zh:'A廠倉庫',en:'Finishing Warehouse',on:true}
];
const aliases=['zd','Finishing Warehouse','A廠倉庫','A厂仓库','z_finishingwarehouse',
  'Building A Finishing WH','Building A Finishing Warehouse','old-finishing','z_buildingafinishingwh_2'];
const records=[];
zones.forEach((z,i)=>['morning','afternoon'].forEach((p,s)=>records.push({
  id:z.id+'-'+p,d:'2026-09-15',z:z.id,p,t:s?[29,30,31,32][i]:[26,26,27,28][i],
  h:s?[70,71,72,73][i]:[78,78,80,78][i],wx:'sunny',checker:'Sreynin',
  updatedAt:'2026-09-15 16:00:00',photos:i===3?['https://example.test/finishing-'+p+'.jpg']:[]
})));

(async()=>{
  const x=await load('ac_gascheck_temperature_v2.html',{vrt_th_z:zones,vrt_th_r:records});
  try{
    const w=x.w,cfg=w.__configs.temperature;
    assert.deepStrictEqual(x.errors,[]);
    w.document.getElementById('rec-date').value='2026-09-15';
    w.setRP('morning');
    assert.equal(w.document.querySelectorAll('#rec-zgrid .rzcard').length,4);
    assert.equal(w.document.getElementById('ri-t-'+target).value,'28','Record form uses the same AM reading');
    assert.equal(w.document.getElementById('ri-h-'+target).value,'78');
    w.setRP('afternoon');
    assert.equal(w.document.getElementById('ri-t-'+target).value,'32','Record form uses the same PM reading');
    assert.equal(w.document.getElementById('ri-h-'+target).value,'73');
    const before=w.buildTGPeriodMsg('day','summary','2026-09-15','all','bi','all');
    assert(before.text.includes('AM 28°C/78% → PM 32°C/73%'),'Screenshot regression: fourth area AM and PM values must both be present (PM is its own reading)');
    assert(!before.text.includes('Missing'),'All eight readings exist');
    assert.equal(before.notice,'');
    assert.equal((before.text.match(/• /g)||[]).length,4,'one line per zone');
    assert.deepStrictEqual(Array.from(before.photos),['https://example.test/finishing-morning.jpg','https://example.test/finishing-afternoon.jpg'],'normal AM/PM photos retained');
    assert(before.text.includes('Finishing Warehouse'),'Summary uses the configured zone name');
    // A reading out of range carries its photo and is listed as an exception.
    cfg.write(cfg.read().map(r=>r.id==='zd-afternoon'?Object.assign({},r,{t:36}):r));
    const hot=w.buildTGPeriodMsg('day','summary','2026-09-15','all','en','all');
    assert.equal(hot.photos.length,2,'normal and out-of-range photos both retained');assert(hot.photos.some(p=>p.includes('finishing-afternoon')));
    assert(hot.text.includes('🔴 <b>1 out of range</b>') && hot.text.includes('• PM · <b>Finishing Warehouse</b> · 36°C/73% · Too hot'));
    assert(hot.text.includes('→ PM 36°C/73%⚠️'));
    cfg.write(cfg.read().map(r=>r.id==='zd-afternoon'?Object.assign({},r,{t:32}):r));
    for(const name of aliases)assert.equal(w.tempCanonicalZoneId(name),target,name);
    assert.equal(cfg.read().length,8);
    assert.equal(cfg.read().filter(r=>r.z===target).length,2);
    assert.equal(cfg.extra().zones.length,4,'Do not add a fifth zone');
    assert(cfg.extra().zones.find(z=>z.id===target).aliasIds.includes('zd'),'Keep original record reference');
    assert.equal(w.tempCanonicalZoneId('B廠倉庫'),'zc','Never map B warehouse to A');
    assert.equal(w.tempCanonicalZoneId('Unrelated finishing workshop'),'','Do not guess unknown rooms');

    const pending=new w.Map(),defs=cfg.extra().zones.map(z=>Object.assign({},z));
    for(const name of aliases){const r=w.tempImportResolveZone(name,defs,pending);assert.equal(r.id,target);}
    assert.equal(defs.length,4);assert.equal(pending.size,0,'Re-import does not create a new zone');
    const monthly=w.buildTGPeriodMsg('month','summary','2026-09-01','all','en','all');
    assert(monthly.text.includes('• <b>Finishing Warehouse</b> · 28–32°C · 73–78% · ×2'));
    for(const period of ['week','year'])assert(w.buildTGPeriodMsg(period,'summary','2026-09-15','all','en','all').text.includes('Finishing Warehouse'));
    const selected=w.buildTGPeriodMsg('day','summary','2026-09-15','all','en','zd');
    assert(selected.text.includes('AM 28°C/78% → PM 32°C/73%'));assert.equal((selected.text.match(/• /g)||[]).length,1);

    // Simulate stale cloud records after upload: latest values win, identities and photos survive.
    const uploaded=cfg.read().map(cfg.toCloud),stale=records.map(r=>({...r,t:20,updatedAt:'2026-09-14 16:00:00'}));
    cfg.onSync(uploaded.concat(stale).map(cfg.fromCloud));
    assert.equal(cfg.read().length,8);assert.equal(cfg.read().find(r=>r.id==='zd-morning').t,28);
    assert(cfg.read().find(r=>r.id==='zd-morning').photos.includes('https://example.test/finishing-morning.jpg'));
    assert.equal(cfg.extra().zones.length,4);
    const storageSeed={};for(let i=0;i<w.localStorage.length;i++){const k=w.localStorage.key(i);storageSeed[k]=w.localStorage.getItem(k);}
    const reloaded=await load('ac_gascheck_temperature_v2.html',storageSeed);
    try{assert(reloaded.w.buildTGPeriodMsg('day','summary','2026-09-15','all','bi','all').text.includes('AM 28°C/78% → PM 32°C/73%'));assert.equal(reloaded.w.__configs.temperature.read().length,8);}
    finally{reloaded.dom.window.close();}

    // An arbitrary imported ID must remain resolvable after definition compaction and reload.
    const merged=w.compactTempZones(zones.concat({id:'custom-import-id-123',en:'Finishing Warehouse',on:true}));
    assert.equal(merged.length,4);assert.equal(w.tempCanonicalZoneId('custom-import-id-123',merged),target);
    const again=w.compactTempZones(JSON.parse(JSON.stringify(merged)));
    assert.equal(w.tempCanonicalZoneId('custom-import-id-123',again),target);
    // Missing PM stays missing; never fabricate a reading to make the report look complete.
    cfg.write(cfg.read().filter(r=>r.id!=='zd-afternoon'));
    const partial=w.buildTGPeriodMsg('day','summary','2026-09-15','all','en','all');
    assert(partial.text.includes('Missing <b>1</b>'));assert(partial.text.includes('AM 28°C/78% → PM —'));
    assert(!partial.text.includes('32°C/73%'));
  }finally{x.dom.window.close();}

  const g={};vm.createContext(g);vm.runInContext(fs.readFileSync('ac_gascheck_core_v3_fixed.gs','utf8'),g);
  for(const name of aliases){
    assert.equal(g.gcTemperatureCanonicalZone_(name),target,'GAS '+name);
    assert.equal(g.gcTemperatureKey_({d:'2026-09-15',p:'morning',z:name}),g.gcTemperatureKey_({d:'2026-09-15',p:'morning',z:target}));
    assert(g.activityScopeCoversRecord_({scope:'all'},'temperature',{z:name},''),'Sent-state coverage '+name);
    assert(g.activityScopeCoversRecord_({scope:name},'temperature',{z:target},''),'Old selected scope '+name);
  }
  const deduped=g.dedupeTemperatureRecords_([records[6],{...records[6],id:'new-copy',z:target,t:22,updatedAt:'2026-09-14 16:00:00',photos:['https://example.test/extra.jpg']}]);
  assert.equal(deduped.rows.length,1);assert.equal(deduped.rows[0].t,28);assert.equal(deduped.rows[0].photos.length,2);
  console.log('v58 real legacy Finishing Warehouse: preview, AM/PM, monthly, import, reload, stale cloud merge and GAS PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
