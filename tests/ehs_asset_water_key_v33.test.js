const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const core = read('gascheck-core.js');
const ehs = read('ac_gascheck_ehs_v2.html');
const asset = read('ac_gascheck_asset_v2.html');
const water = read('ac_gascheck_waterdrum_v2.html');
const key = read('ac_gascheck_keymovement_v2.html');
const gas = read('ac_gascheck_core_v3_fixed.gs');

for (const [name, html] of Object.entries({ehs, asset, water, key})) {
  let count = 0;
  for (const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    count++;
    assert.doesNotThrow(() => new Function(match[1]), `${name} inline script ${count} must parse`);
  }
  assert(count > 0, `${name} must have inline scripts`);
}

// EHS uploaded Drive photos remain viewable without putting large URLs/base64
// JSON in HTML attributes.
assert(core.includes("const PHOTO = GC.photo"));
assert(core.includes("PHOTO._cells.set(key, photos.slice())"));
assert(core.includes('data-photo-key'));
assert(core.includes('https://drive.google.com/thumbnail?id='));
assert(ehs.includes('GC.photo.cell(photoArray(r.photos))'));
assert(gas.includes('offloadPhotosToDrive_(tool,rows)'));

// Asset authoritative cleanup, persistent deletion and visible period analysis.
assert(asset.includes('function hasRealName(asset)'));
assert(asset.includes("'missing_asset_name'"));
assert(asset.includes('window.deleteAssetRow=async function(code)'));
assert(asset.includes("addTombstone(item,'user_delete')"));
for (const p of ['day','week','month','year']) assert(asset.includes(`data-asset-period="${p}"`));
assert(asset.includes('renderAssetInlineAnalysis'));

// Water reads only exact Attendance grand rows and hides the feature otherwise.
assert(core.includes("indexedDB.open('AC_HRA_Attendance')"));
assert(core.includes("readStoreKey(db, 'snapshot', 'database')"));
assert(core.includes('v.isGrand === true'));
assert(core.includes("return {source:'none',daily:{}"));
assert(water.includes("row.headcountSource=r.source||'hra-attendance'"));
assert(water.includes("wdr-attendance-unavailable"));
assert(water.includes("setAttendanceVisibility(false)"));
assert(gas.includes("'headcount','headcountSource'"));

// Key page follows the Fire-style list: searchable master, filters, periods,
// direct native photo picker, thumbnail viewer and delete action.
assert(key.includes("tx('鑰匙清單','Key List'"));
assert(key.includes('id="km-master-search"'));
assert(key.includes('id="km-master-type"'));
assert(key.includes('class="key-master-table"'));
for (const p of ['day','week','month','year']) assert(key.includes(`data-km-period="${p}"`));
assert(key.includes('class="km-photo-picker"'));
assert(key.includes('accept="image/*" multiple onchange="keyMasterPickPhotos(this)"'));
assert(key.includes('masterDraftPhotos.push(await GC.photo.compress(file))'));
assert(key.includes('window.keyMasterViewPhotos=viewMasterPhotos'));
assert(key.includes('window.keyMasterDelete=deleteMaster'));

console.log('EHS photo / Asset / Water Attendance / Key list v34 tests: PASS');
