const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const cleaning=read('ac_gascheck_cleaning_v2.html');
const temp=read('ac_gascheck_temperature_v2.html');
const core=read('gascheck-core.js');
const gas=read('ac_gascheck_core_v3_fixed.gs');

// Cleaning and Temperature each expose one overview instead of duplicate tabs.
assert(!/data-tab="hist"/.test(cleaning),'Cleaning must not expose a second History tab');
assert(cleaning.includes('data-i="t-dash">總覽與記錄'));
for(const id of ['clean-p-day','clean-p-week','clean-p-month','clean-p-year','clean-period-year','clean-period-ref'])
  assert(cleaning.includes(`id="${id}"`),`Cleaning missing unified period control ${id}`);
assert(!/id="tab-(?:hist|anal)"/.test(temp),'Temperature must not expose duplicate History/Analysis tabs');
assert(temp.includes('id="i-tab-dash">總覽與記錄'));
for(const id of ['ovd','ovw','ovm','ovy','ov-year','ov-ref','ov-zone','ov-slot'])
  assert(temp.includes(`id="${id}"`),`Temperature missing unified period control ${id}`);
assert(temp.includes('function mergeTemperatureViews()'));
assert(temp.includes("onclick=\"exportXL('overview')\""));
assert(temp.includes('function tempOverviewFilteredRecords()'));
assert(temp.includes("const periodFilter=document.getElementById('ov-slot')?.value||'all'"));
assert(temp.includes("const pf=document.getElementById('ov-slot')?.value||'all'"));

// D/W/M/Y ranges are calculated from one reference selector; no two-date input is required.
const deStart=cleaning.indexOf('var de = (() => {');
const deEnd=cleaning.indexOf('/* ═══ STATE MODULE',deStart);
const deCtx={Date,Set,Math,Number,isFinite,_localYMD(d){const x=new Date(d),p=n=>String(n).padStart(2,'0');return `${x.getFullYear()}-${p(x.getMonth()+1)}-${p(x.getDate())}`;},document:{getElementById(){return null;},querySelectorAll(){return[];}}};
vm.createContext(deCtx);vm.runInContext(cleaning.slice(deStart,deEnd),deCtx);
deCtx.de.setRef('2026-09-03');
deCtx.de.set('week');assert.deepStrictEqual(JSON.parse(JSON.stringify(deCtx.de.range())),{from:'2026-08-31',to:'2026-09-06'});
deCtx.de.set('month');assert.deepStrictEqual(JSON.parse(JSON.stringify(deCtx.de.range())),{from:'2026-09-01',to:'2026-09-30'});
deCtx.de.set('year');assert.deepStrictEqual(JSON.parse(JSON.stringify(deCtx.de.range())),{from:'2026-01-01',to:'2026-12-31'});
const trStart=temp.indexOf('function tempMidnight(v)');
const trEnd=temp.indexOf('function syncTempOverviewControls()',trStart);
const trCtx={Date,_localYMD:deCtx._localYMD};vm.createContext(trCtx);vm.runInContext(temp.slice(trStart,trEnd),trCtx);
assert.deepStrictEqual(JSON.parse(JSON.stringify(trCtx.tempPeriodRange('week','2026-09-03'))),{from:'2026-08-31',to:'2026-09-06'});
assert.deepStrictEqual(JSON.parse(JSON.stringify(trCtx.tempPeriodRange('month','2026-09-03'))),{from:'2026-09-01',to:'2026-09-30'});
trCtx._tempOverviewPeriod='month';trCtx._tempOverviewRef=new Date('2026-09-03T00:00:00');
trCtx.getR=()=>[
  {id:'keep',d:'2026-09-03',z:'za',p:'morning'},
  {id:'wrong-slot',d:'2026-09-03',z:'za',p:'afternoon'},
  {id:'wrong-zone',d:'2026-09-03',z:'zb',p:'morning'},
  {id:'wrong-month',d:'2026-08-31',z:'za',p:'morning'}
];
trCtx.document={getElementById(id){return {value:id==='ov-zone'?'za':'morning'};}};
assert.deepStrictEqual(Array.from(trCtx.tempOverviewFilteredRecords()).map(r=>r.id),['keep']);

// Cleaning sync reads/writes the same in-memory state used by Dashboard/History.
assert(cleaning.includes('read(){ return compactCleaningRecords(state.db().records||[]); }'));
assert(cleaning.includes('write(list){ state.replaceRecords((list||[]).map(cleaningFromCloud),{sync:false}); }'));
assert(cleaning.includes('onSync:function(list)'));
assert(cleaning.indexOf("await uploadNow('telegram_record_preflight')")<cleaning.indexOf('await api.tg('),'Cleaning must confirm cloud before Telegram');

// Temperature also confirms upload first and refreshes the merged overview after sync.
assert(temp.includes('cloudKey:tempRecordKey'));
assert(temp.includes('telegramAutoUpload:true'));
assert(temp.includes('onSync:(list)=>{if(Array.isArray(list))setR(list);renderAll();updateTempUploadButton();}'));
assert(temp.indexOf("await uploadTemperatureNow('telegram_combined_preflight')")<temp.indexOf('await sendTemperatureTelegramPacket(packet'),'Temperature combined summary must confirm cloud before Telegram');
assert(core.includes("reason:'telegram_preflight'"));
assert(core.indexOf("reason:'telegram_preflight'")<core.indexOf('await GC.telegram.send(',core.indexOf('async function sendCurrentTelegram()')),'Shared Telegram modal must confirm cloud first for opted-in modules');
assert(core.includes("if (opt && typeof opt.keyFn === 'function')"),'SmartSync must use business key before device ID');

// Client Cleaning compaction merges cross-device IDs and preserves both photos.
const cStart=cleaning.indexOf('function cleaningArray(v)');
const cEnd=cleaning.indexOf('var state =',cStart);
assert(cStart>=0&&cEnd>cStart);
const cctx={Map,Set,Date,JSON,Math,String,Number,Object,Array};vm.createContext(cctx);vm.runInContext(cleaning.slice(cStart,cEnd),cctx);
const crows=cctx.compactCleaningRecords([
  {id:'phone-a',date:'2026-09-03',locId:'canteen',slots:['07:30','08:30'],photos:['a.jpg'],updatedAt:'2026-09-03 09:00:00'},
  {id:'phone-b',date:'2026/9/3',locId:'canteen',slots:['08:30','07:30'],photos:['b.jpg'],updatedAt:'2026-09-03 10:00:00'}
]);
assert.strictEqual(crows.length,1);
assert.strictEqual(crows[0].id,'phone-b');
assert.deepStrictEqual(Array.from(crows[0].photos).sort(),['a.jpg','b.jpg']);

const tcStart=temp.indexOf('function tempStoredList(d)');
const tcEnd=temp.indexOf('function tempStorageRecord(r)',tcStart);
const tcCtx={Map,Set,Date,JSON,Math,String,Number,Object,Array,getZ:()=>[]};vm.createContext(tcCtx);vm.runInContext(temp.slice(temp.indexOf('function tempReportZoneDefaults'),temp.indexOf('function tempImportZoneCanonical'))+temp.slice(tcStart,tcEnd),tcCtx);
const trows=tcCtx.compactTempRecords([
  {id:'t-phone-a',d:'2026-09-03',p:'morning',z:'za',t:27,photos:['a.jpg'],updatedAt:'2026-09-03 08:00:00'},
  {id:'t-phone-b',d:'2026-09-03',p:'morning',z:'za',t:28,photos:['b.jpg'],updatedAt:'2026-09-03 08:30:00'}
]);
assert.strictEqual(trows.length,1);
assert.strictEqual(trows[0].id,'t-phone-b');
assert.strictEqual(trows[0].t,28);
assert.deepStrictEqual(Array.from(trows[0].photos).sort(),['a.jpg','b.jpg']);

// GAS rejects those same duplicates even when older clients bypass the new UI.
const gStart=gas.indexOf('function ehsWasteText_');
const gEnd=gas.indexOf('function readGcSmartManifest_',gStart);
assert(gStart>=0&&gEnd>gStart);
const marked=[];
const gctx={Map,Set,Date,JSON,Math,String,Number,Object,Array,isFinite,
  CFG:{TZ:'Asia/Phnom_Penh',ID_FIELD:'id'},
  Utilities:{formatDate(){return '2026-09-03';}},
  nowStr_(){return '2026-09-04 08:00:00';},
  filterGcDeletedRecords_(_tool,rows){return rows;},
  markGcDeletedRecords_(tool,ids,reason){marked.push({tool,ids,reason});return{marked:ids.length};},
  markGcDuplicateAliases_(tool,removed,reason){const ids=removed.map(x=>x.row&&x.row.id).filter(Boolean);marked.push({tool,ids,reason});return{marked:ids.length};}
};
vm.createContext(gctx);vm.runInContext(gas.slice(gStart,gEnd),gctx);
const gc=gctx.sanitizeGcRecords_('cleaning',[
  {id:'clean-old',date:'2026-09-03',locId:'canteen',slots:['07:30'],photos:['old.jpg'],updatedAt:'2026-09-03 08:00:00'},
  {id:'clean-new',date:'2026-09-03',locId:'canteen',slots:['07:30'],photos:['new.jpg'],updatedAt:'2026-09-03 09:00:00'}
],'test');
assert.strictEqual(gc.rows.length,1);
assert.strictEqual(gc.rows[0].id,'clean-new');
assert.deepStrictEqual(Array.from(gc.rows[0].photos).sort(),['new.jpg','old.jpg']);
assert(marked.some(x=>x.tool==='cleaning'&&x.ids.includes('clean-old')));
const gt=gctx.sanitizeGcRecords_('temperature',[
  {id:'temp-old',date:'2026-09-03',period:'morning',zoneId:'za',temperature:27,updatedAt:'2026-09-03 08:00:00'},
  {id:'temp-new',date:'2026-09-03',period:'morning',zoneId:'za',temperature:28,updatedAt:'2026-09-03 08:30:00'}
],'test');
assert.strictEqual(gt.rows.length,1);
assert.strictEqual(gt.rows[0].id,'temp-new');
assert.strictEqual(gt.rows[0].temperature,28);
assert(gas.includes('function cleanupCleaningTemperatureDuplicates()'));
assert(gas.includes("const protectedTool=tool==='ehs'||tool==='cleaning'||tool==='temperature'"));

console.log('v52 Cleaning/Temperature unified overview, upload-first and cross-device dedupe tests: PASS');
