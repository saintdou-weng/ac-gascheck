const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const asset = read('ac_gascheck_asset_v2.html');
const key = read('ac_gascheck_keymovement_v2.html');
const core = read('gascheck-core.js');

for (const [name, html] of [['asset', asset], ['key', key]]) {
  let count = 0;
  for (const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    count++;
    assert.doesNotThrow(() => new Function(match[1]), `${name} inline script ${count} must parse`);
  }
  assert(count > 0);
}

// Day/Week/Month/Year must change both filtering and the native period input.
for (const token of [
  'function assetIsoWeek(', 'function assetWeekDate(', 'function assetCanonicalRef(',
  "assetAnalysisPeriod==='day'?'date':assetAnalysisPeriod", 'syncAssetPeriodInputs()',
  'function keyIsoWeek(', 'function keyWeekDate(', 'function keyCanonicalRef(',
  "keyPeriod==='day'?'date':keyPeriod", 'syncKeyPeriodInput()'
]) assert(asset.includes(token) || key.includes(token), `missing period control: ${token}`);

assert(asset.includes("assetAnalysisPeriod==='year'?'number'"));
assert(key.includes("keyPeriod==='year'?'number'"));
assert(asset.includes('asset-period-buttons button.on{background:#2563eb!important'));
assert(key.includes('.km-period-tabs button.on{background:#1a3a5c!important'));

// Key photo selection is visible and supports mobile gallery/camera choices.
assert(key.includes('class="km-photo-picker"'));
assert(key.includes('keyMasterPickPhotos(this)'));
assert(key.includes('masterDraftPhotos.slice(0,2)'));
assert(key.includes('.key-master-table th,.key-batch-table th{background:#1a3a5c!important;color:#fff!important'));
assert(!core.includes('accept="image/*" capture="environment" multiple hidden'));

console.log('Asset/Key true period controls, Key photo picker and contrast v34 tests: PASS');
