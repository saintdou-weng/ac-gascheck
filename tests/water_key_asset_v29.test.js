const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const core = read('gascheck-core.js');
const water = read('ac_gascheck_waterdrum_v2.html');
const key = read('ac_gascheck_keymovement_v2.html');
const asset = read('ac_gascheck_asset_v2.html');

for (const [name, html] of [['water',water],['key',key],['asset',asset]]) {
  let scripts = 0;
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    scripts++;
    assert.doesNotThrow(() => new Function(m[1]), name + ' inline script ' + scripts + ' must parse');
  }
  assert(scripts > 0, name + ' must contain executable scripts');
}

assert(core.includes("GC.version = '3.7-dorm-approval-permissions'"));
assert(core.includes('GC.attendance = (() => {'));
assert(core.includes('wdr_cfg_\\d{4}_\\d{2}'));
assert(core.includes('vrt_key_tombstones'));
assert(core.includes('vrt_asset_tombstones'));

assert(water.includes("telegramSlots:[{value:'all'"));
assert(water.includes("{value:'morning'"));
assert(water.includes("{value:'afternoon'"));
assert(!/telegramSlots:\[[\s\S]{0,500}value:'night'/.test(water));
assert(water.includes('function migrateMonthConfigs()'));
assert(water.includes("drumLiters:20"));
assert(water.includes('syncAttendanceHeadcount'));
assert(water.includes("photos.slice(0,2)"));
assert(water.includes("'💰 '+waterTelegramText('總額','Grand total'"));
assert(water.includes("data-wdr-period=\"day\""));
assert(water.includes("data-wdr-period=\"week\""));
assert(water.includes("data-wdr-period=\"month\""));
assert(water.includes("data-wdr-period=\"year\""));

assert(key.includes("window.loadDemoData = loadDemoData = function(){purgeDemo();};"));
assert(key.includes("_deleted:true"));
assert(key.includes("before:keySnapshot(old),after:keySnapshot(next)"));
assert(key.includes('showKeyHistory'));
assert(key.includes("photo:true"));
assert(key.includes("const MASTER_KEY='vrt_key_master'"));
assert(key.includes('keyBatchSaveAll'));
assert(key.includes('keyMasterImport'));
assert(key.includes('cloudRead(){ return window.KEY_V31'));

assert(asset.includes('window.parseAssetSmartImport=function(file)'));
assert(asset.includes('window.mergeAssetSmartImport=function(current,rows)'));
assert(asset.includes('importParser:parseAssetSmartImport'));
assert(asset.includes('mergeImport:mergeAssetSmartImport'));
assert(asset.includes("GC.cloud.upload('asset'"));
assert(asset.includes("GC.cloud.download('asset'"));
assert(!asset.includes('await deleteAssetFromGAS(delCode)'));
assert(asset.includes('window.printLabelsA4'));
assert(asset.includes('grid-template-columns:repeat(3,1fr)'));
assert(asset.includes("currentUser.name!=='Phea'"));
assert(asset.includes("currentUser.name!=='Paul'"));
assert(asset.includes('before,after:assetSnapshot(next)'));
assert(asset.includes("data-asset-period=\"day\""));
assert(asset.includes("data-asset-period=\"week\""));
assert(asset.includes("data-asset-period=\"month\""));
assert(asset.includes("data-asset-period=\"year\""));

console.log('Water / Key / Asset v29 tests: PASS');
