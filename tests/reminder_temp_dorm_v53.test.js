const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const gas=read('ac_gascheck_core_v3_fixed.gs');
const temp=read('ac_gascheck_temperature_v2.html');
const dorm=read('ac_gascheck_dormitory_v2.html');

const propertyData=Object.create(null);
const scriptProperties={
  getProperty:k=>Object.prototype.hasOwnProperty.call(propertyData,k)?propertyData[k]:null,
  setProperty:(k,v)=>{propertyData[k]=String(v);},
  deleteProperty:k=>{delete propertyData[k];}
};
const pad=n=>String(n).padStart(2,'0');
function formatDate(value,_tz,pattern){
  const d=new Date(value),v={yyyy:d.getUTCFullYear(),MM:pad(d.getUTCMonth()+1),M:d.getUTCMonth()+1,dd:pad(d.getUTCDate()),d:d.getUTCDate(),HH:pad(d.getUTCHours()),mm:pad(d.getUTCMinutes()),ss:pad(d.getUTCSeconds())};
  return pattern.replace(/yyyy|MM|dd|HH|mm|ss|M|d/g,k=>v[k]);
}
const context={
  console,JSON,Math,Date,String,Number,Boolean,Array,Object,RegExp,Error,Set,Map,
  Logger:{log(){}},Utilities:{formatDate},
  PropertiesService:{getScriptProperties:()=>scriptProperties},
  SpreadsheetApp:{openById(){throw new Error('not used');}},
  ScriptApp:{},ContentService:{},HtmlService:{},UrlFetchApp:{},
  DriveApp:{},MimeType:{},Blob:function(){},setTimeout,clearTimeout
};
vm.createContext(context);
vm.runInContext(gas,context,{filename:'ac_gascheck_core_v3_fixed.gs'});

// A shrinking pending list must not be mistaken for a new batch.
const now=new Date('2026-09-04T02:00:00Z');
let recentRows=[
  {record:{id:'temp-a',updatedAt:'2026-09-03 08:00:00'},businessDate:'2026-09-03',updatedEpoch:Date.parse('2026-09-03T08:00:00Z')},
  {record:{id:'temp-b',updatedAt:'2026-09-03 08:05:00'},businessDate:'2026-09-03',updatedEpoch:Date.parse('2026-09-03T08:05:00Z')}
];
context.auditRecentUpdateCompletion_=()=>({ok:true,currentMonth:'2026-09',missing:[{
  tool:'temperature',groupKey:'temperature:all:2026-09',reportMonth:'2026-09',
  icon:'🌡️',zh:'溫濕度',en:'Temperature / Humidity',km:'Temp',records:recentRows.slice(),
  dateList:['2026-09-03'],count:recentRows.length,fingerprint:'legacy'
}]});
let recentSends=0;
context.tgSendWithKeyboard_=()=>{recentSends++;return true;};
assert.strictEqual(context.sendRecentUpdateMissingReport_({now}).sent,true);
recentRows=recentRows.slice(1);
assert.strictEqual(context.sendRecentUpdateMissingReport_({now}).skipped,true);
assert.strictEqual(recentSends,1,'completing/deleting one row must not re-remind the unchanged remainder');
recentRows[0]=Object.assign({},recentRows[0],{record:{id:'temp-b',updatedAt:'2026-09-04 08:05:00'},updatedEpoch:Date.parse('2026-09-04T08:05:00Z')});
assert.strictEqual(context.sendRecentUpdateMissingReport_({now}).sent,true);
assert.strictEqual(recentSends,2,'a real later business edit may notify once');

// Weekly pending identity is stable across resend/sync timestamps.
let pending=[
  {id:'dorm-a',type:'搬入',name:'Chi Sreyleab',idNo:'6020',roomNo:'A-102',date:'2026-08-20',reason:'Near Factory',status:'待審核',updatedAt:'2026-09-04 08:00:00'}
];
context.auditWeeklyPendingApprovals_=()=>({ok:true,weekStart:'2026-08-31',missing:[{tool:'dormitory',icon:'🏠',zh:'宿舍',en:'Dormitory',km:'Dorm',count:pending.length,records:pending.slice(),examples:[]}]});
let weeklySends=0;
context.tgSendWithKeyboard_=()=>{weeklySends++;return true;};
assert.strictEqual(context.sendWeeklyPendingApprovalReport_(now).sent,true);
pending[0]=Object.assign({},pending[0],{updatedAt:'2026-09-04 09:00:00',lastTelegramSentAt:'2026-09-04 09:00:00'});
assert.strictEqual(context.sendWeeklyPendingApprovalReport_(now).skipped,true);
assert.strictEqual(weeklySends,1,'resend/sync timestamp must not repeat the same weekly pending reminder');
pending.push({id:'dorm-b',type:'搬入',name:'New Person',idNo:'7000',roomNo:'A-103',date:'2026-09-04',reason:'New hire',status:'待審核',updatedAt:'2026-09-04 10:00:00'});
const weeklyNew=context.sendWeeklyPendingApprovalReport_(now);
assert.strictEqual(weeklyNew.sent,true);
assert.strictEqual(weeklyNew.notify[0].count,1);
assert.strictEqual(weeklyNew.notify[0].totalPending,2);

// Cross-device Dorm duplicates collapse; approved state wins over stale Pending.
const dormRows=context.dedupeDormitoryRecords_([
  {id:'phone-a',type:'搬入',name:'Chi Sreyleab',idNo:'6020',roomNo:'A-102',date:'2026-08-20',reason:'Near Factory',status:'待審核',updatedAt:'2026-09-04 09:00:00'},
  {id:'phone-b',type:'搬入',name:'Chi Sreyleab',idNo:'6020',roomNo:'A-102',date:'2026-08-20',reason:'Near the factory',status:'已核可',approvedBy:'Paul Weng',approvedAt:'2026-09-04 08:30:00',updatedAt:'2026-09-04 08:30:00'}
]);
assert.strictEqual(dormRows.rows.length,1);
assert.strictEqual(dormRows.rows[0].status,'已核可');
assert.strictEqual(dormRows.rows[0].approvedBy,'Paul Weng');
const sameIdRows=context.dedupeDormitoryRecords_([
  {id:'same-id',type:'搬入',name:'Legacy',idNo:'9000',roomNo:'A-202',date:'',reason:'',status:'已核可',approvedBy:'Paul Weng',updatedAt:'2026-09-04 08:00:00'},
  {id:'same-id',type:'搬入',name:'Legacy',idNo:'9000',roomNo:'A-202',date:'2026-09-04',reason:'New hire',status:'待審核',updatedAt:'2026-09-04 09:00:00'}
]);
assert.strictEqual(sameIdRows.rows.length,1);
assert.strictEqual(sameIdRows.rows[0].status,'已核可');
assert.strictEqual(sameIdRows.rows[0].date,'2026-09-04');

// Platform approval persists the canonical status before sending the result notice.
let decisionRecord={id:'dorm-direct',type:'搬入',name:'Direct User',idNo:'8000',roomNo:'A-201',date:'2026-09-04',reason:'New hire',status:'待審核',updatedAt:'2026-09-04 08:00:00'};
const decisionOrder=[];
context.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})};
context.readDormRecordForDecision_=()=>({sheet:{},record:Object.assign({},decisionRecord)});
context.persistDormRecordEverywhere_=(_sheet,record)=>{decisionOrder.push('persist:'+record.status);decisionRecord=Object.assign({},record);return record;};
context.sendTelegramMessage=()=>{decisionOrder.push('notify');return{ok:true};};
const approved=context.handleDormPlatformDecision_({id:'dorm-direct',decision:'approve',approver:'Paul Weng',approverId:'5026942575'});
assert.strictEqual(approved.ok,true);
assert.strictEqual(approved.record.status,'已核可');
assert.deepStrictEqual(decisionOrder,['persist:已核可','notify']);
const repeated=context.handleDormPlatformDecision_({id:'dorm-direct',decision:'approve',approver:'Paul Weng',approverId:'5026942575'});
assert.strictEqual(repeated.alreadyProcessed,true);
assert.deepStrictEqual(decisionOrder,['persist:已核可','notify'],'already processed record must not be saved/notified again');

// Successful Telegram activity immediately marks the exact covered Temp rows complete.
const completionRows=[
  {id:'t-am',d:'2026-09-03',p:'morning',updatedAt:'2026-09-03 08:30:00'},
  {id:'t-pm',d:'2026-09-04',p:'afternoon',updatedAt:'2026-09-04 15:30:00'}
];
const changed=context.applyReportCompletionToRows_(completionRows,'temperature',[{
  ts:'2026-09-03 09:00:00',event:'telegram',tool:'temperature',reportMonth:'2026-09',
  period:'day',mode:'summary',scope:'all',slot:'all',ref:'2026-09-03'
}]);
assert.strictEqual(changed.length,1);
assert.strictEqual(completionRows[0].summarySentAt,'2026-09-03 09:00:00');
assert.strictEqual(completionRows[1].summarySentAt,undefined);

// Temp Telegram details are date-first, all AM rows before all PM rows, with full area names.
assert(temp.includes("['morning','afternoon'].forEach(function(p)"));
assert(temp.includes("AM | Morning 08:00–09:00"));
assert(temp.includes("PM | Afternoon 15:30–16:30"));
assert(temp.includes('zoneFullName(r.z)'));
assert(temp.includes("'📋 <b>'+tempTelegramText('依日期、AM／PM 分開'"));

// Dorm Pending can be opened from reminder, approved/rejected in-page, and refreshes shared memory.
for(const token of [
  "ac_gascheck_dormitory_v2.html?view=pending",
  "action:'dormDecision'","records.approve('","records.reject('",
  'state.replaceRecords(list)','cloudKey:dormRecordKey',
  "if(qv==='pending')","records.refreshStatus(true)",
  'records.showAllPending()','window._dormPendingAllDates===true',
  '全部月份待核 / All pending'
])assert(gas.includes(token)||dorm.includes(token),'missing Dorm v53 token: '+token);
assert(gas.includes('function persistDormRecordEverywhere_'));
assert(gas.includes('function handleDormPlatformDecision_'));
assert(gas.includes('function backfillReportCompletionMarkers()'));
assert(gas.includes('function resumeGascheckV53()'));
assert(gas.includes("const V53_UPGRADE_STATE_KEY='GASCHECK_V53_UPGRADE_STATE_V2'"));
assert(gas.includes("if(tool==='temperature'&&Object.keys(out.tools).length)"));
assert(gas.includes('state.backfillTools=done;saveV53UpgradeState_(state)'));
assert(gas.includes('result.ehsWaste=cleanupEhsWasteDuplicates()'));
assert(gas.includes('result.cleaningTemperature=cleanupCleaningTemperatureDuplicates()'));
assert(gas.includes('result.dormitory=cleanupDormitoryStatusDuplicates()'));

console.log('v53 reminder, Temp AM/PM summary and Dorm direct approval/sync tests: PASS');
