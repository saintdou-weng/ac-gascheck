const assert=require('assert');
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const core=read('gascheck-core.js');
const temp=read('ac_gascheck_temperature_v2.html');
const cleaning=read('ac_gascheck_cleaning_v2.html');

// Shared mapper: blank cells in a multi-row report header must stay unmapped.
const store={};
const document={
  head:{appendChild(){}},body:{appendChild(){},insertBefore(){},firstChild:null},
  getElementById(){return null;},querySelector(){return null;},querySelectorAll(){return[];},addEventListener(){},
  createElement(){return{classList:{add(){},remove(){},toggle(){}},setAttribute(){},appendChild(){},remove(){}};}
};
const localStorage={getItem:k=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
const window={document,localStorage,crypto:crypto.webcrypto,TextEncoder,addEventListener(){},setTimeout,clearTimeout,console,navigator:{onLine:true}};window.window=window;
const coreCtx={window,document,localStorage,console,setTimeout,clearTimeout,URLSearchParams,Blob:function(){},URL:{createObjectURL(){return'';},revokeObjectURL(){}},TextEncoder};
vm.createContext(coreCtx);vm.runInContext(core,coreCtx,{filename:'gascheck-core.js'});
const mapped=window.GC.import.autoMap(['','Temperature','Humidity'],{d:['Date'],z:['Zone'],t:['Temperature'],h:['Humidity']});
assert.deepStrictEqual(JSON.parse(JSON.stringify(mapped)),{d:-1,z:-1,t:1,h:2});
const shortMapped=window.GC.import.autoMap(['d','Temperature'],{date:['Date'],temp:['Temperature']});
assert.deepStrictEqual(JSON.parse(JSON.stringify(shortMapped)),{date:-1,temp:1});

// VRT monthly Temperature layout: zones are on one row, slots on the next and
// Temperature/Humidity on a third row. Thresholds and notes are never records.
const validStart=temp.indexOf('function validTempBusinessDate');
const validEnd=temp.indexOf('function tempPhotoList',validStart);
const importStart=temp.indexOf('function tempImportText');
const importEnd=temp.indexOf('function parseTemperatureSmartImport',importStart);
assert(validStart>=0&&validEnd>validStart&&importStart>=0&&importEnd>importStart);
const tctx={Date,Math,Number,String,Array,Object,Set,Map,isFinite,_localTS(){return'2026-09-07 10:00:00';}};
vm.createContext(tctx);vm.runInContext(temp.slice(validStart,validEnd)+temp.slice(importStart,importEnd),tctx);
assert.strictEqual(tctx.tempImportExcelDate(46265),'2026-08-31','raw Excel date serial must keep the correct local business date');
const row=n=>Array(n).fill('');
const zrow=row(20);zrow[0]='Building A';zrow[6]='Building A Finishing WH';zrow[11]='Building B';zrow[16]='Building B  WH';
const srow=row(20);srow[0]='Date';[1,6,11,16].forEach(c=>srow[c]='Morning-Inside ( 08.00 ~ 09.00)');[3,8,13,18].forEach(c=>srow[c]='Afternoon-Inside 15.30 ~ 16.30');
const mrow=row(20);[1,3,6,8,11,13,16,18].forEach(c=>{mrow[c]='Temperature';mrow[c+1]='Humidity';});
const limits=row(20);[1,3,6,8,11,13,16,18].forEach(c=>{limits[c]='18 ~ 32°C';limits[c+1]='40 ~ 80 %';});
const data=row(20);data[0]=1;[1,6,11,16].forEach((c,i)=>{data[c]=26+i;data[c+1]=70+i;data[c+2]=29+i;data[c+3]=60+i;});
const note=row(20);note[0]=2;note[1]='Change date 01-05-2026';
const zones=[
  {id:'za',en:'Building A Workshop',zh:'A廠車間',on:true},
  {id:'zb',en:'Building B Workshop',zh:'B廠車間',on:true},
  {id:'zc',en:'Building B Warehouse',zh:'B廠倉庫',on:true}
];
const pending=new Map();
const parsed=tctx.parseTemperatureRowsFromSheet('Aug',[
  ['VRT Report for temperature and humidity'],['2026-08-31'],zrow,srow,mrow,limits,data,note
],zones,pending);
assert.strictEqual(parsed.length,8,'one valid day must yield four zones x AM/PM');
assert.strictEqual(new Set(parsed.map(r=>r.z)).size,4,'Finishing Warehouse is preserved as a real fourth zone');
assert.strictEqual(pending.size,1,'only the real new location is added');
assert(parsed.every(r=>r.d==='2026-08-01'&&(r.p==='morning'||r.p==='afternoon')));
assert(!parsed.some(r=>String(r.z).includes('18')||String(r.z)==='2'||String(r.note).includes('Change date')));
assert.strictEqual(tctx.validTempBusinessRecord({d:'18 ~ 32°C',p:'',z:'18 ~ 32°C',t:24,h:25}),false);
const filterCfg={dateField:'d',scopeField:'z',telegramSlotFilter:(r,s)=>s==='all'||r.p===s};
assert.strictEqual(window.GC.telegram.filter(parsed,filterCfg,'month','2026-08-17','all','all').length,8);
assert.strictEqual(window.GC.telegram.filter(parsed,filterCfg,'month','2026-08-17','z_buildingafinishingwh','all').length,2);
assert.strictEqual(window.GC.telegram.filter(parsed,filterCfg,'month','2026-09-01','all','all').length,0);
for(const token of [
  'importParser:parseTemperatureSmartImport','mergeImport:mergeTempSmartImport','telegramRequireData:true',
  "scopeField:'z'",'telegramScopes:function()',
  'buildTGPeriodMsg(period,mode,ref,slot,lang,scope)'
])assert(temp.includes(token),'Temperature v54 missing '+token);

// Cleaning export -> import retains Slots and the six PASS/FAIL checks, so its
// existing Telegram completeness validator can send the imported month.
const cleanStart=cleaning.indexOf('function cleaningImportDate');
const cleanEnd=cleaning.indexOf('var state =',cleanStart);
assert(cleanStart>=0&&cleanEnd>cleanStart);
const CHK_ITEMS=['smell','light','floor','door','corner','ceiling'];
const schema={date:['Date'],locId:['Location'],shift:['Shift'],cleaner:['Cleaner'],checker:['Checker'],slots:['Slots'],smell:['Smell'],light:['Light'],floor:['Floor'],door:['Door'],corner:['Corner'],ceiling:['Ceiling'],note:['Note'],photoCount:['PhotoCount'],timestamp:['Submitted']};
const cleanRows=[['2026-08-31','Toilet A','Day','Nin','Phea','07:30|08:30','PASS','PASS','PASS','FAIL','PASS','PASS','Door hinge','2','2026-08-31 09:00:00']];
const cleanCtx={Date,Math,Number,String,Array,Object,Set,Map,Promise,isFinite,CHK_ITEMS,
  _localTS(){return'2026-09-07 10:00:00';},_localYMD(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');},
  cleaningDateValue(v){const m=String(v||'').match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);return m?m[1]+'-'+String(+m[2]).padStart(2,'0')+'-'+String(+m[3]).padStart(2,'0'):'';},
  cleaningSlotsValue(v){return String(v||'').split(/[|,;，；\s]+/).filter(Boolean);},
  cleaningHash(s){let h=0;for(const c of String(s||''))h=(h*31+c.charCodeAt(0))>>>0;return h.toString(36);},
  cleaningRecordKey(r){return r.date+'|'+r.locId+'|'+(r.slots||[]).join(',');},
  compactCleaningRecords(rows){return rows;},
  state:{db(){return{locations:[{id:'loc_toilet_a',name:'Toilet A'}]};}},
  GC:{import:{autoMap:window.GC.import.autoMap,parse(){return Promise.resolve({headers:Object.keys(schema).map(k=>schema[k][0]),rows:cleanRows,sheetName:'Cleaning'});}}}
};
vm.createContext(cleanCtx);vm.runInContext(cleaning.slice(cleanStart,cleanEnd),cleanCtx);
(async()=>{
  const out=await cleanCtx.parseCleaningSmartImport({},schema),r=out.objects[0];
  assert.strictEqual(out.objects.length,1);
  assert.strictEqual(r.locId,'loc_toilet_a');
  assert.deepStrictEqual(Array.from(r.slots),['07:30','08:30']);
  assert.strictEqual(r.checks.smell,true);assert.strictEqual(r.checks.door,false);
  assert.strictEqual(r.note,'Door hinge');
  for(const token of ['importParser:parseCleaningSmartImport','mergeImport:mergeCleaningSmartImport',"GC.sync.schedule('cleaning','smart_import')"])
    assert(cleaning.includes(token),'Cleaning v54 missing '+token);
  console.log('v54 Temperature/Cleaning attachment import and monthly-summary safeguards: PASS');
})().catch(err=>{console.error(err);process.exit(1);});
