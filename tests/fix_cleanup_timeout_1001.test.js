/* fix_cleanup_timeout_1001: 2026-10-01 09:55 monthlyMissingReportReminder hit the 6-minute limit (360 s 逾時).
   Cause: on the 1st of the month the daily reminder also ran the monthly cleanup in the same execution.
   Guards: reminder only schedules a separate one-off cleanup job; cleanup respects its time budget. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const gs = fs.readFileSync(path.join(__dirname, '..', 'ac_gascheck_core_v3_fixed.gs'), 'utf8');
let n = 0; const pass = m => { n++; console.log('PASS ' + m); };

function world() {
  const props = {}; const triggers = []; const created = [];
  const ctx = {console, Logger:{log(){}},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=String(v);},deleteProperty:k=>{delete props[k];},getProperties:()=>props})},
    LockService:{getScriptLock:()=>({tryLock(){return true;},waitLock(){},releaseLock(){}})},
    Utilities:{formatDate:(d,tz,f)=>f==='d'?'1':f==='yyyy-MM'?'2026-10':'2026-10-01 09:55:00',getUuid:()=>'u',computeDigest:()=>[],DigestAlgorithm:{},Charset:{},base64Encode:()=>''},
    ScriptApp:{getProjectTriggers:()=>triggers.map(h=>({getHandlerFunction:()=>h})),deleteTrigger:t=>{const i=triggers.indexOf(t.getHandlerFunction());if(i>=0)triggers.splice(i,1);},
      newTrigger:h=>{const o={};const ch={timeBased:()=>ch,after:ms=>{o.after=ms;return ch;},everyMinutes:()=>ch,everyDays:()=>ch,atHour:()=>ch,create:()=>{triggers.push(h);created.push(Object.assign({h},o));return ch;}};return ch;}},
    CacheService:{getScriptCache:()=>({get(){return null;},put(){}})},
    DriveApp:{getFoldersByName:()=>({hasNext:()=>false}),createFolder:()=>({})}, SpreadsheetApp:{openById:()=>{throw new Error('no sheet');}},
    UrlFetchApp:{fetch(){throw new Error('no network');}}, ContentService:{MimeType:{JSON:'json'},createTextOutput:t=>({setMimeType(){return this;},getContent:()=>t})}, HtmlService:{}, MimeType:{}};
  vm.createContext(ctx); vm.runInContext(gs, ctx);
  ctx.currentMonthKey_ = () => '2026-10';
  return {ctx, props, triggers, created};
}

{
  const w = world(); let cleanupRan = 0;
  w.ctx.sendRecentUpdateMissingReport_ = () => ({ok:true}); w.ctx.sendWeeklyPendingApprovalReport_ = () => ({ok:true});
  w.ctx.gascheckMonthlyCleanup = () => { cleanupRan++; return {ok:true}; };
  const r = w.ctx.monthlyMissingReportReminder();
  assert.strictEqual(cleanupRan, 0, 'daily reminder must not run the cleanup inline');
  assert(r.cleanup && r.cleanup.scheduled, JSON.stringify(r.cleanup));
  assert.deepStrictEqual(w.created.map(c => c.h), ['gcMonthlyCleanupJob']);
  assert(w.created[0].after >= 60000, 'one-off job a few minutes later');
  w.ctx.monthlyMissingReportReminder();
  assert.strictEqual(w.triggers.filter(t => t === 'gcMonthlyCleanupJob').length, 1, 'never scheduled twice');
  pass('1st of month: reminder schedules one cleanup job instead of running it inline (no 6-min timeout)');

  const out = w.ctx.gcMonthlyCleanupJob();
  assert.strictEqual(cleanupRan, 1); assert(out.ok);
  assert(!w.triggers.includes('gcMonthlyCleanupJob'), 'job removes its own one-off trigger');
  assert.strictEqual(w.props.GC_LAST_CLEANUP_MONTH, '2026-10');
  w.ctx.monthlyMissingReportReminder();
  assert(!w.triggers.includes('gcMonthlyCleanupJob'), 'not rescheduled after it ran this month');
  pass('cleanup job runs once, removes its trigger, and the month is marked done');
  assert.strictEqual(typeof w.ctx.gcRemoveOrphanTriggers_, 'function');
  w.triggers.push('gcMonthlyCleanupJob'); w.ctx.globalThis = w.ctx;
  assert.strictEqual(vm.runInContext("typeof gcMonthlyCleanupJob", w.ctx), 'function', 'handler exists → not removed as orphan');
  pass('cleanup job handler exists (orphan-trigger cleanup keeps it)');
}
{
  /* Time budget: with little time left, the heavy one-time water scan is skipped, not cut off half-way. */
  const w = world(); let water = 0, drive = 0;
  w.ctx.gcStoreRead_ = () => ({}); w.ctx.gcStoreWrite_ = () => {};
  w.ctx.gcCleanupWaterBlankRows_ = () => { water++; return {ok:true}; };
  w.ctx.gcBackupFolder_ = () => ({}); w.ctx.gcListBackups_ = () => [];
  w.ctx.gcCleanupSmartFiles_ = () => { drive++; return {complete:true}; };
  let out = w.ctx.gascheckMonthlyCleanup({budgetMs:60000});
  assert.strictEqual(water, 0); assert(out.waterBlank.skipped && out.incomplete);
  assert.strictEqual(drive, 1, 'drive scan still runs within the remaining budget');
  out = w.ctx.gascheckMonthlyCleanup({budgetMs:240000});
  assert.strictEqual(water, 1); assert(!out.incomplete, JSON.stringify(out));
  pass('cleanup respects its time budget: heavy one-time step skipped when time is short, full run otherwise');
}
console.log('fix_cleanup_timeout_1001: ' + n + ' checks passed');
