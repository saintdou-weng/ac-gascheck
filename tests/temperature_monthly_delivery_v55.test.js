const assert=require('assert');
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const temp=read('ac_gascheck_temperature_v2.html');
const core=read('gascheck-core.js');

// Build a full 208-row month (four zones, AM/PM). Put the only anomaly at the
// end so the regression proves anomalies are selected from the full month,
// rather than only from the first 20 normal records.
const zones=[
  {id:'za',zh:'A廠車間',en:'Building A Workshop'},
  {id:'z_buildingafinishingwh',zh:'Building A Finishing WH',en:'Building A Finishing WH'},
  {id:'zb',zh:'B廠車間',en:'Building B Workshop'},
  {id:'zc',zh:'B廠倉庫',en:'Building B Warehouse'}
];
const records=[];
for(let day=1;day<=26;day++)for(const slot of ['morning','afternoon'])for(const zone of zones){
  records.push({
    id:'r'+records.length,d:'2026-08-'+String(day).padStart(2,'0'),p:slot,z:zone.id,
    t:28,h:70,wx:'cloudy',checker:'Phea',photos:records.length===0?['https://example.test/photo.jpg']:[]
  });
}
records[records.length-1].h=95;

const threshold={t:{cold:18,cool:23,warm:32,hot:35},h:{dry:40,humid:80,vhum:90}};
function tSt(v){const n=Number(v);if(n<threshold.t.cold)return{k:'cold'};if(n<threshold.t.cool)return{k:'cool'};if(n<threshold.t.warm)return{k:'ok'};if(n<threshold.t.hot)return{k:'warm'};return{k:'hot'};}
function hSt(v){const n=Number(v);if(n<threshold.h.dry)return{k:'dry'};if(n<=threshold.h.humid)return{k:'ok'};if(n<=threshold.h.vhum)return{k:'humid'};return{k:'vhum'};}
function isAnom(r){const t=Number(r.t),h=Number(r.h);return t<threshold.t.cold||t>=threshold.t.hot||h<threshold.h.dry||h>threshold.h.vhum;}
function periodFilter(list,period,field,ref){
  const key=String(ref||'');
  if(period==='day')return list.filter(r=>String(r[field]).slice(0,10)===key.slice(0,10));
  if(period==='month')return list.filter(r=>String(r[field]).slice(0,7)===key.slice(0,7));
  return list.slice();
}
const text=(zh,en,km,lang)=>lang==='en'?en:(lang==='km'?km:(lang==='zh'?zh:zh+' / '+en));
const tctx={Date,Math,Number,String,Array,Object,Set,Map,isNaN,getR:()=>records,getZ:()=>zones,tSt,hSt,isAnom,
  parseWeatherObservation:()=>null,liveWeatherNumber:v=>String(v),
  GC:{period:{filter:periodFilter},telegram:{text,pending:()=>false},util:{asArray:v=>Array.isArray(v)?v:[]}}
};
const start=temp.indexOf('function tempTelegramText');
const end=temp.indexOf('async function sendTodayCombinedTemp',start);
assert(start>=0&&end>start);
vm.createContext(tctx);vm.runInContext(temp.slice(temp.indexOf('function tempReportZoneDefaults'),temp.indexOf('function tempImportZoneCanonical')),tctx);vm.runInContext(temp.slice(start,end),tctx);
// The browser may display success only after the GAS bridge relays Telegram's
// message_id. A bare ok:true is not proof that the group received anything.
const store={};
const document={
  head:{appendChild(){}},body:{appendChild(){},insertBefore(){},firstChild:null},documentElement:{},
  getElementById(){return null;},querySelector(){return null;},querySelectorAll(){return[];},addEventListener(){},
  createElement(){return{classList:{add(){},remove(){},toggle(){}},setAttribute(){},appendChild(){},remove(){}};}
};
const localStorage={getItem:k=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
const window={document,localStorage,crypto:crypto.webcrypto,TextEncoder,addEventListener(){},dispatchEvent(){},setTimeout,clearTimeout,console,navigator:{onLine:true}};window.window=window;
const cctx={window,document,localStorage,console,setTimeout,clearTimeout,URLSearchParams,Blob:function(){},URL:{createObjectURL(){return'';},revokeObjectURL(){}},TextEncoder,CustomEvent:function(){}};
vm.createContext(cctx);vm.runInContext(core,cctx,{filename:'gascheck-core.js'});

tctx.GC.telegram.paginateRows=window.GC.telegram.paginateRows;
const monthly=tctx.buildTGPeriodMsg('month','summary','2026-08-01','all','bi','all');
assert.strictEqual(records.length,208);
assert.strictEqual(monthly.pages.length,3);
assert.strictEqual((monthly.text.match(/2026-08-\d{2} │/g)||[]).length,31);
assert(monthly.text.includes('2026-08-26') && monthly.text.includes('28/95⚠'));
assert(monthly.pages.every(p=>p.length<3900));
assert.deepStrictEqual(Array.from(monthly.photos),['https://example.test/photo.jpg']);
const daily=tctx.buildTGPeriodMsg('day','summary','2026-08-01','all','bi','all');
assert(daily.text.includes('AM 08:00–09:00')&&daily.text.includes('PM 15:30–16:30'),'daily AM/PM retained');assert(daily.text.length<1600);assert.equal((daily.text.match(/• /g)||[]).length,8);

(async()=>{
  window.GC.cloud.post=async()=>({ok:true});
  await assert.rejects(()=>window.GC.telegram.send('test',[],[],null,'temperature',{}),/No delivery confirmation/);
  window.GC.cloud.post=async()=>({ok:true,messageId:12345});
  const result=await window.GC.telegram.send('test',[],[],null,'temperature',{});
  assert.strictEqual(result.messageId,12345);
  console.log('v56 Temperature daily monthly rows and Telegram confirmation tests: PASS');
})().catch(err=>{console.error(err);process.exit(1);});
