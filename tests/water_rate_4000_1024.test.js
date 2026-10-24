/* 2026-10-24：送水匯率 1 USD = 4,000 KHR；舊的 4,100（每月設定、預設、排程、每日資料）載入時自動改成 4,000。 */
const assert=require('assert'),fs=require('fs'),path=require('path');const {load}=require('./dom-harness.cjs');
(async()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','ac_gascheck_waterdrum_v2.html'),'utf8');
  assert(!/[^\d,]4100[^\d]/.test(html.replace(/const OLD=4100/g,'')),'no other 4100 default left');
  const rows=[{day:1,fQty:50,fPrice:2000,fTtl:100000,sQty:'',sPrice:2000,sTtl:0,exchangeRate:4100,updatedAt:'2026-10-21 13:57:03'},{day:2,fQty:10,fPrice:2000,fTtl:20000,exchangeRate:4050}];
  const seed={wdr_2026_09:rows,wdr_cfg_2026_09:{facPrice:2000,staPrice:2000,exchangeRate:4100,drumLiters:20},wdr_default_cfg:{facPrice:2000,staPrice:2000,exchangeRate:4100},wdr_exchange_rate:'4100',wdr_effective_schedule_v35:[{effectiveFrom:'2026-08',exchangeRate:4100,facPrice:2000,staPrice:2000}]};
  const {w,errors}=await load('ac_gascheck_waterdrum_v2.html',seed);
  await new Promise(r=>setTimeout(r,600));
  const get=k=>JSON.parse(w.localStorage.getItem(k));
  assert.equal(get('wdr_2026_09')[0].exchangeRate,4000);assert.equal(get('wdr_2026_09')[1].exchangeRate,4050,'custom rate kept');
  assert.notEqual(get('wdr_2026_09')[0].updatedAt,'2026-10-21 13:57:03','changed row stamped newer');
  assert.equal(get('wdr_cfg_2026_09').exchangeRate,4000);assert.equal(get('wdr_default_cfg').exchangeRate,4000);
  assert.equal(w.localStorage.getItem('wdr_exchange_rate'),'4000');assert.equal(get('wdr_effective_schedule_v35')[0].exchangeRate,4000);
  assert.equal(w.WDR_V29.fixRate4000(),0,'second pass changes nothing');
  console.log('PASS water rate 4000',errors.length?'(page errors: '+errors.length+')':'');process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
