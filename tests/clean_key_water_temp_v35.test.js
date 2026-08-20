const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const cleaning = read('ac_gascheck_cleaning_v2.html');
const key = read('ac_gascheck_keymovement_v2.html');
const water = read('ac_gascheck_waterdrum_v2.html');
const temp = read('ac_gascheck_temperature_v2.html');
const core = read('gascheck-core.js');

for (const [name, html] of [['cleaning',cleaning],['key',key],['water',water],['temperature',temp]]) {
  let scripts = 0;
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    scripts++;
    assert.doesNotThrow(() => new Function(m[1]), `${name} inline script ${scripts} must parse`);
  }
  assert(scripts > 0, `${name} must contain inline scripts`);
  assert(html.includes('gascheck-core.js?v=41-dorm-approval-permissions'));
}
assert(core.includes("GC.version = '3.7-dorm-approval-permissions'"));

// Cleaning: shared defaults plus independent cleaner, slots and checks per location.
for (const token of [
  '_locSlots = {}', '_locChecks = {}', 'getLocSlots', 'toggleLocSlot',
  'getLocChecks', 'cycleLocCheck', 'state.getLocSlots(locId)',
  'checks:state.getLocChecks(locId)', 'telegramSentAt=sentAt',
  'btn-save-send', 'loc-rule-chip'
]) assert(cleaning.includes(token), `cleaning missing ${token}`);

// Key: the native picker must remain visible on mobile and photo URLs can round-trip through Excel.
for (const token of [
  'class="km-native-photo-input"', '::file-selector-button',
  'class="km-camera-picker"', 'positionMasterPhotoSection()',
  'bookFiles:true', 'keyEmbeddedPhotos(wb,best.name)',
  "'Photo / 照片'"
]) assert(key.includes(token), `key missing ${token}`);
assert(!key.includes('.km-native-photo-input{display:none'));

// Water: effective-dated settings keep earlier months intact and expose real AM/PM times.
for (const token of [
  "const scheduleKey = 'wdr_effective_schedule_v35'", 'function effectiveCfg(y,m)',
  'function saveSchedule(cfg)', 'id="cp-effective-month"',
  'id="cp-morning-time"', 'id="cp-afternoon-time"',
  "morningTime:String(old.morningTime||'08:00')",
  "afternoonTime:String(old.afternoonTime||'15:30')",
  "showing>=effective", "earlier months are unchanged"
]) assert(water.includes(token), `water missing ${token}`);
assert(water.includes("row.fTime=row.fTime==='morning'?mc.morningTime"));
assert(!water.includes('row.fTime=slotValue(row.fTime);row.sTime=slotValue(row.sTime)'));

// Temperature: the record page can save the current slot and send one concise AM+PM daily summary.
for (const token of [
  'id="i-send-combined"', 'async function sendTodayCombinedTemp()',
  "buildTGPeriodMsg('day','summary',date,'all','bi')",
  'same full-detail renderer',
  "Morning + Afternoon (combined)",
  "GC.sync.schedule('temperature','combined_daily_summary')"
]) assert(temp.includes(token), `temperature missing ${token}`);

console.log('Cleaning / Key / Water / Temperature v35 workflow tests: PASS');
