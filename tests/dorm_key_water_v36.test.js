const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const dorm = read('ac_gascheck_dormitory_v2.html');
const key = read('ac_gascheck_keymovement_v2.html');
const water = read('ac_gascheck_waterdrum_v2.html');
const core = read('gascheck-core.js');

for (const [name, html] of [['dorm', dorm], ['key', key], ['water', water]]) {
  let count = 0;
  for (const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    count++;
    assert.doesNotThrow(() => new Function(match[1]), `${name} inline script ${count} must parse`);
  }
  assert(count > 0);
  assert(html.includes('gascheck-core.js?v=37-telegram-multi-sync-dorm'));
}
assert(core.includes("GC.version = '3.3-telegram-multi-sync-dorm'"));

// Dorm: one-tap all OK, one-tap room OK, and independent photo sets by facility.
for (const token of [
  'const PHOTO_LIMIT=8', 'let _dataByLoc = {}', 'let _photosByLoc = {}',
  'const roomOk = room =>', 'const allOk = () =>', 'insp.roomOk', 'insp.allOk',
  'photos:currentPhotos().slice(0,PHOTO_LIMIT)',
  'GC.telegram.send(payload.text||\'\',Array.isArray(payload.photos)?payload.photos:[]',
  'viewRecordPhotos'
]) assert(dorm.includes(token), `dorm missing ${token}`);

// Key: detect the real multilingual header and embedded xlsx drawing/media photos.
for (const token of [
  'bookFiles:true', 'function keyEmbeddedPhotos(wb,sheetName)',
  "keyImportText(wb,'xl/workbook.xml')", 'oneCellAnchor', 'twoCellAnchor',
  'keyFileDataUrl', 'embedded[rowIndex]||[]',
  "['鑰匙／門鎖名稱','鑰匙門鎖名稱','key / lock','key lock'",
  "box.id='km-dashboard-import'", '匯入含照片鑰匙名單'
]) assert(key.includes(token), `key missing ${token}`);

// Water: entry modes are genuinely different and monthly defaults are visible/effective-dated.
for (const token of [
  "if(mainPeriod==='year')return allWaterRows()",
  "if(mainPeriod==='month'||mainPeriod==='year'){renderWaterAggregateTable",
  'function aggregateWaterRows(rows)', 'function renderWaterAggregateTable(rows)',
  'window.prevMonth = prevMonth = function(){shiftWaterPeriod(-1);}',
  'window.nextMonth = nextMonth = function(){shiftWaterPeriod(1);}',
  "analysisPeriod==='month'?r.date.slice(0,7)+' · W'",
  "settings.id='wdr-month-settings-btn'", "badge.id='wdr-current-settings'",
  'month sheet(s) · ', "importAccept:'.xlsx,.xls,.xlsb'"
]) assert(water.includes(token), `water missing ${token}`);

console.log('Dorm / Key / Water v36 tests: PASS');
