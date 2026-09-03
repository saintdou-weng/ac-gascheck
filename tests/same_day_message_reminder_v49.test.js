const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.join(__dirname,'..');
const core=fs.readFileSync(path.join(root,'gascheck-core.js'),'utf8');
const gas=fs.readFileSync(path.join(root,'ac_gascheck_core_v3_fixed.gs'),'utf8');
const temp=fs.readFileSync(path.join(root,'ac_gascheck_temperature_v2.html'),'utf8');
const clean=fs.readFileSync(path.join(root,'ac_gascheck_cleaning_v2.html'),'utf8');
const ehs=fs.readFileSync(path.join(root,'ac_gascheck_ehs_v2.html'),'utf8');

assert(core.includes('telegramSameDayUpdate: false, telegramPhotoDedupe: false'));
assert(core.includes("meta.updateExisting = true"));
assert(core.includes("meta.messageKey = String(C.tool || 'module') + '|' + String(ref).slice(0, 10)"));
assert(temp.includes('telegramSameDayUpdate:true'));
assert(temp.includes("const effectiveSlot=period==='day'?'all':slot"));
assert(clean.includes('telegramSameDayUpdate:true'));
assert(clean.includes('telegramPhotoDedupe:true'));
assert(clean.includes("const scope=period==='day'?'all':(opt.scope||'all'), slot=period==='day'?'all':(opt.slot||'all')"));
assert(clean.includes("messageKey:'cleaning|'+date"));
assert(ehs.includes('telegramPhotoDedupe:true'));
assert(gas.includes("TG_MESSAGE_STATE_KEY = 'GASCHECK_TG_MESSAGE_STATE_V1'"));
assert(gas.includes("TG_PHOTO_STATE_KEY = 'GASCHECK_TG_PHOTO_STATE_V1'"));
assert(gas.includes("TG_API()+'/editMessageText'"));
assert(gas.includes("businessDate.slice(0,7)!==currentMonth"));
assert(gas.includes("WEEKLY_APPROVAL_STATE_KEY='GASCHECK_WEEKLY_PENDING_APPROVAL_STATE_V1'"));
assert(gas.includes('sendWeeklyPendingApprovalReport_(now)'));

const propertyData={};
const scriptProperties={
  getProperty:k=>Object.prototype.hasOwnProperty.call(propertyData,k)?propertyData[k]:null,
  setProperty:(k,v)=>{propertyData[k]=String(v)},deleteProperty:k=>{delete propertyData[k]}
};
let sends=0,edits=0,photos=0,nextMessage=100;
const response=value=>({getContentText:()=>JSON.stringify(value)});
const context={
  console,JSON,Math,Date,String,Number,Boolean,Array,Object,RegExp,Error,Set,Map,
  Logger:{log(){}},
  PropertiesService:{getScriptProperties:()=>scriptProperties},
  Utilities:{
    formatDate(d,_tz,pattern){const x=new Date(d);const pad=n=>String(n).padStart(2,'0');const vals={yyyy:x.getUTCFullYear(),MM:pad(x.getUTCMonth()+1),dd:pad(x.getUTCDate()),HH:pad(x.getUTCHours()),mm:pad(x.getUTCMinutes()),ss:pad(x.getUTCSeconds())};return pattern.replace(/yyyy|MM|dd|HH|mm|ss/g,k=>vals[k]);},
    base64Decode(v){return Buffer.from(v,'base64')},newBlob(bytes,type,name){return{bytes,type,name}}
  },
  UrlFetchApp:{fetch(url){
    if(url.includes('/editMessageText')){edits++;return response({ok:true,result:{message_id:101}});}
    if(url.includes('/sendMessage')){sends++;nextMessage++;return response({ok:true,result:{message_id:nextMessage}});}
    if(url.includes('/sendPhoto')){photos++;return response({ok:true,result:{message_id:200+photos}});}
    throw new Error('unexpected URL '+url);
  }},
  SpreadsheetApp:{openById(){throw new Error('not used')}},ScriptApp:{},ContentService:{},HtmlService:{},DriveApp:{},MimeType:{},Blob:function(){},Buffer
};
vm.createContext(context);
vm.runInContext(gas,context,{filename:'ac_gascheck_core_v3_fixed.gs'});

const opt={updateExisting:true,messageKey:'cleaning|2026-08-30',dedupePhotos:true,photoDedupeKey:'cleaning|2026-08-30'};
const first=context.sendTelegramMessage('-1','Morning',[],['data:image/png;base64,YQ=='],'cleaning',opt);
assert.strictEqual(first.ok,true);assert.strictEqual(sends,1);assert.strictEqual(edits,0);assert.strictEqual(photos,1);
const second=context.sendTelegramMessage('-1','Morning + Afternoon',[],['data:image/png;base64,YQ=='],'cleaning',opt);
assert.strictEqual(second.ok,true);assert.strictEqual(second.edited,true);assert.strictEqual(sends,1);assert.strictEqual(edits,1);assert.strictEqual(photos,1);assert.strictEqual(second.photosSkipped,1);
const third=context.sendTelegramMessage('-1','Latest',[],['data:image/png;base64,Yg=='],'cleaning',opt);
assert.strictEqual(third.ok,true);assert.strictEqual(sends,1);assert.strictEqual(edits,2);assert.strictEqual(photos,2);

console.log('same-day Telegram edit, photo dedupe and reminder v49 tests: PASS');
