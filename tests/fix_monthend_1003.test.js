/* fix_monthend_1003: owner (2026-10-02) — "月底如沒更新要提醒，英柬文一次就夠".
   From day 25 the daily job sends ONE month-end reminder (English + Khmer, no Chinese) naming the modules
   with no data / no monthly summary-approval; once per month; nothing when all complete. */
const assert = require('assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const gs = fs.readFileSync(path.join(__dirname, '..', 'ac_gascheck_core_v3_fixed.gs'), 'utf8');
const CJK=/[㐀-鿿]/, KM=/[ក-៿]/;
function world(day) {
  const props = {}; const sent = [];
  const ctx = {console, Logger:{log(){}},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=String(v);},deleteProperty:k=>{delete props[k];},getProperties:()=>props})},
    LockService:{getScriptLock:()=>({tryLock(){return true;},waitLock(){},releaseLock(){}})},
    Utilities:{formatDate:(d,tz,f)=>f==='d'?String(day):f==='yyyy-MM'?'2026-10':'2026-10-'+String(day).padStart(2,'0')+' 09:55:00',getUuid:()=>'u',computeDigest:()=>[],DigestAlgorithm:{},Charset:{},base64Encode:()=>''},
    ScriptApp:{getProjectTriggers:()=>[],deleteTrigger(){},newTrigger:()=>{const ch={timeBased:()=>ch,after:()=>ch,everyMinutes:()=>ch,everyDays:()=>ch,atHour:()=>ch,create:()=>ch};return ch;}},
    CacheService:{getScriptCache:()=>({get(){return null;},put(){}})},
    DriveApp:{getFoldersByName:()=>({hasNext:()=>false}),createFolder:()=>({})}, SpreadsheetApp:{openById:()=>{throw new Error('no sheet');}},
    UrlFetchApp:{fetch(){throw new Error('no network');}}, ContentService:{MimeType:{JSON:'json'},createTextOutput:t=>({setMimeType(){return this;},getContent:()=>t})}, HtmlService:{}, MimeType:{}};
  vm.createContext(ctx); vm.runInContext(gs, ctx);
  ctx.currentMonthKey_ = () => '2026-10';
  ctx.tgSendWithKeyboard_ = (chat, text, kb) => { sent.push({chat, text, kb}); return true; };
  const mods = vm.runInContext('MONTHLY_REPORT_MODULES', ctx);
  ctx.auditMonthlyCompletion_ = () => ({ok:true, reportMonth:'2026-10', modules:mods.map((m,i)=>Object.assign({}, m, {cloud:i!==1, telegram:i>2, complete:i>2})), missing:[]});
  return {ctx, props, sent, mods};
}
let n = 0; const pass = m => { n++; console.log('PASS ' + m); };
{
  const w = world(20);
  let r = w.ctx.sendMonthEndReminder_(new Date());
  assert(r.skipped && /before_day/.test(r.reason) && !w.sent.length, 'nothing before day 25');
  pass('day 20: no month-end reminder yet');
}
{
  const w = world(26);
  let r = w.ctx.sendMonthEndReminder_(new Date());
  assert(r.sent && w.sent.length === 1, 'sent once on day 26');
  const t = w.sent[0].text;
  assert(!CJK.test(t) && KM.test(t) && /Month-end reminder/.test(t), 'English + Khmer, no Chinese: ' + t);
  assert(/no data this month/.test(t) && /monthly summary \/ approval not sent/.test(t), 'names what is missing');
  assert(t.split('\n').length <= 12, 'compact: ' + t.split('\n').length + ' lines');
  r = w.ctx.sendMonthEndReminder_(new Date());
  assert(r.skipped && r.reason === 'already_sent' && w.sent.length === 1, 'second run same month → nothing');
  assert.strictEqual(w.props.GC_MONTH_END_REMINDED, '2026-10');
  pass('day 26: one reminder in English + Khmer, never repeated in the same month');
  /* daily job carries it */
  w.ctx.sendMonthlyMissingReport_ = () => ({ok:true}); w.ctx.sendRecentUpdateMissingReport_ = () => ({ok:true}); w.ctx.sendWeeklyPendingApprovalReport_ = () => ({ok:true}); w.ctx.gcMaybeMonthlyCleanup_ = () => ({ok:true});
  const out = w.ctx.monthlyMissingReportReminder();
  assert(out.monthEnd && out.monthEnd.skipped, 'daily job calls the month-end check');
  pass('daily reminder job includes the month-end check');
}
{
  const w = world(28);
  w.ctx.auditMonthlyCompletion_ = () => ({ok:true, reportMonth:'2026-10', modules:w.mods.map(m=>Object.assign({}, m, {cloud:true, telegram:true, complete:true})), missing:[]});
  const r = w.ctx.sendMonthEndReminder_(new Date());
  assert(r.skipped && r.reason === 'all_complete' && !w.sent.length, 'all complete → silent');
  pass('all modules complete → no message');
}
console.log('fix_monthend_1003: ' + n + ' checks passed');
