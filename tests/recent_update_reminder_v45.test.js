const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

class Range{
  constructor(sheet,row,col,rows,cols){this.sheet=sheet;this.row=row;this.col=col;this.rows=rows;this.cols=cols;}
  getValues(){return Array.from({length:this.rows},(_,i)=>Array.from({length:this.cols},(_,j)=>(this.sheet.rows[this.row-1+i]||[])[this.col-1+j]??''));}
  setValues(values){values.forEach((line,i)=>line.forEach((value,j)=>{const r=this.row-1+i,c=this.col-1+j;while(this.sheet.rows.length<=r)this.sheet.rows.push([]);while(this.sheet.rows[r].length<=c)this.sheet.rows[r].push('');this.sheet.rows[r][c]=value;}));return this;}
  setBackground(){return this} setFontColor(){return this} setFontWeight(){return this}
}
class Sheet{
  constructor(name,rows){this.name=name;this.rows=rows||[];}
  getLastRow(){return this.rows.length} getLastColumn(){return this.rows.reduce((n,r)=>Math.max(n,r.length),0)}
  getDataRange(){return new Range(this,1,1,this.getLastRow(),this.getLastColumn())}
  getRange(r,c,rs,cs){return new Range(this,r,c,rs,cs)} appendRow(row){this.rows.push(row.slice());return this}
  setFrozenRows(){return this} deleteRows(start,count){this.rows.splice(start-1,count)} clear(){this.rows=[]}
}
const sheets=Object.create(null),props=Object.create(null);
const spreadsheet={getSheetByName:n=>sheets[n]||null,insertSheet:n=>(sheets[n]=new Sheet(n))};
const scriptProperties={getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=String(v)},deleteProperty:k=>{delete props[k]}};
const pad=n=>String(n).padStart(2,'0');
function formatDate(value,_tz,pattern){const d=new Date(value);const v={yyyy:d.getUTCFullYear(),MM:pad(d.getUTCMonth()+1),M:d.getUTCMonth()+1,dd:pad(d.getUTCDate()),d:d.getUTCDate(),HH:pad(d.getUTCHours()),mm:pad(d.getUTCMinutes()),ss:pad(d.getUTCSeconds())};return pattern.replace(/yyyy|MM|dd|HH|mm|ss|M|d/g,k=>v[k]);}
const context={
  console,JSON,Math,Date,String,Number,Boolean,Array,Object,RegExp,Error,
  Logger:{log(){}},Utilities:{formatDate},SpreadsheetApp:{openById(){return spreadsheet}},
  PropertiesService:{getScriptProperties(){return scriptProperties}},ScriptApp:{getProjectTriggers(){return[]},newTrigger(){throw new Error('not used')}},
  ContentService:{createTextOutput(){return{setMimeType(){return this}}},MimeType:{JSON:'json'}},HtmlService:{createHtmlOutput(v){return v}},
  UrlFetchApp:{fetch(){throw new Error('network must be mocked')}},DriveApp:{},MimeType:{},Blob:function(){},setTimeout,clearTimeout
};
vm.createContext(context);
const gas=fs.readFileSync(path.join(__dirname,'..','ac_gascheck_core_v3_fixed.gs'),'utf8');
vm.runInContext(gas,context,{filename:'ac_gascheck_core_v3_fixed.gs'});

function table(headers,rows){return [headers].concat(rows)}
sheets.asset=       new Sheet('asset',table(['id','purchase_date','updatedAt'],[['a-future','2026-09-10','2026-08-20 08:00:00']]));
sheets.dormitory=   new Sheet('dormitory',table(['id','date','updatedAt'],[['d-future','2026-10-01','2026-08-24 08:00:00']]));
sheets.cleaning=    new Sheet('cleaning',table(['id','date','locId','updatedAt'],[
  ['c-old','2026-06-30','loc_factory','2026-08-24 08:00:00'],
  ['c-jul','2026-07-20','loc_factory','2026-08-24 08:00:00'],
  ['c-aug','2026-08-24','loc_factory','2026-08-24 10:00:00'],
  ['c-week','2026-08-23','loc_factory','2026-08-23 08:00:00']
]));
sheets.keymovement= new Sheet('keymovement',table(['id','issue_date','updatedAt'],[['k-old','2026-06-15','2026-08-24 08:00:00']]));
sheets.ehs=         new Sheet('ehs',table(['id','date','sourceType','updatedAt'],[
  ['e-rec','2026-08-22','recycle','2026-08-22 08:00:00'],['e-waste','2026-08-22','waste','2026-08-22 08:00:00']
]));
sheets.waterdrum=   new Sheet('waterdrum',table(['id','date','updatedAt'],[['w-aug','2026-08-21','2026-08-21 08:00:00']]));
sheets.temperature= new Sheet('temperature',table(['id','d','updatedAt'],[['t-aug','2026-08-20','2026-08-20 08:00:00']]));

const ah=['ts','event','tool','reportMonth','period','mode','scope','slot','language','ref','count','note','sender'];
sheets.ActivityLog=new Sheet('ActivityLog',table(ah,[
  ['2026-08-21 09:00:00','telegram','asset','2026-09','month','approval','all','','bi','2026-09-01',1,'test','Paul'],
  ['2026-08-24 09:00:00','telegram','cleaning','2026-08','day','summary','all','','bi','2026-08-24',1,'too early','Phea'],
  ['2026-08-24 09:00:00','telegram','cleaning','2026-08','week','summary','all','','bi','2026-08-17',1,'covers week','Phea'],
  ['2026-08-23 09:00:00','telegram','ehs','2026-08','month','summary','waste','','bi','2026-08-01',1,'waste only','Phea'],
  ['2026-08-22 09:00:00','telegram','waterdrum','2026-08','month','review','all','','bi','2026-08-01',1,'review is not completion','Phea'],
  ['2026-08-21 09:00:00','telegram','temperature','2026-08','year','approval','all','','bi','2026-01-01',1,'year approval','Paul']
]));

const now=new Date('2026-08-24T12:00:00Z');
const audit=context.auditRecentUpdateCompletion_(now);
const keys=Array.from(audit.missing,x=>x.groupKey);
assert.deepStrictEqual(keys,[
  'cleaning:all:2026-07','cleaning:all:2026-08','dormitory:all:2026-10','ehs:recycle:2026-08','waterdrum:all:2026-08'
]);
assert(!audit.missing.some(x=>x.records.some(item=>item.record.id==='c-old'||item.record.id==='k-old')),'June business dates must be ignored when running in August');
assert.strictEqual(audit.missing.find(x=>x.groupKey==='cleaning:all:2026-08').count,1,'weekly summary must cover the Aug 23 record but the later Aug 24 edit remains pending');
assert(audit.missing.some(x=>x.groupKey==='waterdrum:all:2026-08'),'Review must not count as Summary/Approval completion');
assert(!audit.missing.some(x=>x.tool==='asset'),'future record with a later approval is complete');
assert(!audit.missing.some(x=>x.tool==='temperature'),'year approval covers the dated record');

const msg=context.buildRecentUpdateMissingMessage_(audit,audit.missing);
assert(msg.includes('Updated data report reminder'));
assert(msg.includes('No summary or approval after update'));
assert(msg.includes('ទិន្នន័យដែលបានកែប្រែ'));

let sent=0,lastText='';
context.tgSendWithKeyboard_=function(_chat,text){sent++;lastText=text;return true};
const first=context.sendRecentUpdateMissingReport_({now});
const second=context.sendRecentUpdateMissingReport_({now});
assert.strictEqual(first.sent,true);
assert.strictEqual(second.skipped,true);
assert.strictEqual(sent,1,'same unchanged pending batch must notify once');
assert(lastText.includes('2026-10'),'future dated pending data must appear');

sheets.waterdrum.rows[1][2]='2026-08-24 11:00:00';
const third=context.sendRecentUpdateMissingReport_({now});
assert.strictEqual(third.sent,true);
assert.strictEqual(third.notify.length,1,'only the newly changed group should notify again');
assert.strictEqual(third.notify[0].groupKey,'waterdrum:all:2026-08');
assert.strictEqual(sent,2);

assert(gas.includes("markMonths:monthly&&monthly.sent?[target]:[]"),'day-5 monthly reminder must suppress an immediate duplicate recent reminder');
assert(gas.includes("CORE_VERSION : 'v4.2-recent-report-reminder'"));
console.log('recent update reminder v45 tests: PASS');
