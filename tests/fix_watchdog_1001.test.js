/* fix_watchdog_1001: 2026-10-01 — group buttons (review/approve) stopped responding because the bot's
   webhook was removed by another program using the same token. The watchdog re-attaches it. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const gs = fs.readFileSync(path.join(__dirname, '..', 'ac_gascheck_core_v3_fixed.gs'), 'utf8');

function world(transport) {
  const props = {GC_WEBHOOK_KEY:'secretkey123'}; if (transport) props.GC_TELEGRAM_TRANSPORT = transport;
  let hook = {url:'', allowed_updates:['message']}; const calls = []; const triggers = [];
  const EXEC = 'https://script.google.com/macros/s/TEST/exec';
  const ctx = {console, Logger:{log(){}},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=String(v);},deleteProperty:k=>{delete props[k];},getProperties:()=>props})},
    LockService:{getScriptLock:()=>({tryLock(){return true;},waitLock(){},releaseLock(){}})},
    Utilities:{formatDate:()=>'2026-10-01 13:00:00',getUuid:()=>'u',computeDigest:()=>[],DigestAlgorithm:{},Charset:{},base64Encode:()=>''},
    ScriptApp:{getProjectTriggers:()=>triggers.map(n=>({getHandlerFunction:()=>n})),deleteTrigger:t=>{const i=triggers.indexOf(t.getHandlerFunction());if(i>=0)triggers.splice(i,1);},
      newTrigger:n=>{const ch={timeBased:()=>ch,everyMinutes:()=>ch,everyHours:()=>ch,everyDays:()=>ch,atHour:()=>ch,create:()=>{triggers.push(n);return ch;}};return ch;},
      getService:()=>({getUrl:()=>EXEC})},
    CacheService:{getScriptCache:()=>({get(){return null;},put(){}})},
    DriveApp:{getFoldersByName:()=>({hasNext:()=>false}),createFolder:()=>({})}, SpreadsheetApp:{openById:()=>{throw new Error('no sheet');}},
    UrlFetchApp:{fetch:(url,o)=>{const m=/\/bot[^/]+\/(\w+)/.exec(url)||[];const body=o&&o.payload?JSON.parse(o.payload):{};calls.push({m:m[1],body});
      const out=m[1]==='setWebhook'?(hook={url:body.url,allowed_updates:body.allowed_updates},{ok:true,result:true}):m[1]==='getWebhookInfo'?{ok:true,result:hook}:{ok:true,result:{}};
      return {getContentText:()=>JSON.stringify(out),getResponseCode:()=>200};}},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:t=>({setMimeType(){return this;},getContent:()=>t})}, HtmlService:{}, MimeType:{}};
  vm.createContext(ctx); vm.runInContext(gs, ctx);
  ctx.currentExecUrl_ = () => EXEC;
  return {ctx, props, calls, triggers, getHook:()=>hook, setHook:h=>{hook=h;}, EXEC};
}

let n = 0; const pass = m => { n++; console.log('PASS ' + m); };
{
  const w = world();
  let r = w.ctx.gcWebhookWatchdogJob();
  assert(r.repaired && r.reason === 'missing', JSON.stringify(r));
  assert(w.getHook().url.startsWith(w.EXEC + '?') && w.getHook().url.includes('k=secretkey123'), 'restored with key: ' + w.getHook().url);
  assert.deepStrictEqual(w.getHook().allowed_updates, ['message', 'callback_query']);
  pass('webhook deleted by another poller → restored with secret key and button callbacks');
  const before = w.calls.filter(c => c.m === 'setWebhook').length;
  r = w.ctx.gcWebhookWatchdogJob();
  assert(r.healthy && w.calls.filter(c => c.m === 'setWebhook').length === before, 'healthy → untouched');
  pass('healthy webhook is left alone (1 read every 10 min, no writes)');
  w.setHook({url:'https://evil.example/x', allowed_updates:['message']});
  r = w.ctx.gcWebhookWatchdogJob();
  assert(r.repaired && r.reason === 'other-url' && w.getHook().url.startsWith(w.EXEC));
  assert(/other-url/.test(w.props.GC_WEBHOOK_LAST_REPAIR));
  pass('webhook pointed elsewhere → taken back, repair logged');
}
{
  const w = world('polling');
  let r = w.ctx.gcWebhookWatchdogJob();
  assert(r.repaired && w.triggers.includes('pollGascheckTelegram'), 'polling mode → poll trigger recreated');
  assert(!w.calls.some(c => c.m === 'setWebhook'), 'polling mode never sets a webhook');
  r = w.ctx.gcWebhookWatchdogJob(); assert(r.healthy);
  pass('polling mode: missing poll trigger recreated, no webhook fight');
}
{
  const w = world();
  w.ctx.gcEnsureWebhookWatchdog_(); w.ctx.gcEnsureWebhookWatchdog_();
  assert.strictEqual(w.triggers.filter(t => t === 'gcWebhookWatchdogJob').length, 1, 'single watchdog trigger');
  assert(/function 更新部署連線\(\)\{[\s\S]{0,200}gcEnsureWebhookWatchdog_\(\)/.test(gs.replace(/\r/g, '')), '更新部署連線 installs the watchdog');
  pass('watchdog trigger installed once by 更新部署連線');
}
{
  /* Regression 2026-10-01: in a time trigger getService().getUrl() is the HEAD/test URL (404 on /exec). */
  const w = world();
  delete w.ctx.currentExecUrl_; vm.runInContext('void 0', w.ctx);
  const HEAD = 'https://script.google.com/macros/s/AKfycbHEADtest/exec';
  w.ctx.ScriptApp.getService = () => ({getUrl:()=>HEAD});
  const src = gs.replace(/\r/g,''); const m = src.match(/function currentExecUrl_\(\) \{[\s\S]*?\n\}/);
  vm.runInContext(m[0], w.ctx);
  const prodBase = (src.match(/EXEC_URL\s*:\s*'([^']+)'/) || [])[1];
  assert.strictEqual(w.ctx.currentExecUrl_(), prodBase, 'pinned production URL wins over getService()');
  const r = w.ctx.gcWebhookWatchdogJob();
  assert(r.repaired && w.getHook().url.startsWith(prodBase + '?'), 'repaired onto production URL, never HEAD: ' + w.getHook().url);
  assert(!w.getHook().url.includes('HEADtest'));
  pass('trigger context: webhook always set to the production /exec (not the HEAD/test URL)');
}
console.log('fix_watchdog_1001: ' + n + ' checks passed');
