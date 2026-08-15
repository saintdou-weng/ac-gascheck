const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const core = read('gascheck-core.js');
const portal = read('ac_gascheck_portal_v1.html');
const asset = read('ac_gascheck_asset_v2.html');
const cleaning = read('ac_gascheck_cleaning_v2.html');
const ehs = read('ac_gascheck_ehs_v2.html');
const temperature = read('ac_gascheck_temperature_v2.html');

for (const name of [
  'ac_gascheck_portal_v1.html',
  'ac_gascheck_asset_v2.html',
  'ac_gascheck_dormitory_v2.html',
  'ac_gascheck_cleaning_v2.html',
  'ac_gascheck_keymovement_v2.html',
  'ac_gascheck_ehs_v2.html',
  'ac_gascheck_waterdrum_v2.html',
  'ac_gascheck_temperature_v2.html'
]) {
  const html = read(name);
  let scripts = 0;
  for (const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    scripts++;
    assert.doesNotThrow(() => new Function(match[1]), `${name} inline script ${scripts} must parse`);
  }
  assert(scripts > 0, `${name} must contain inline JavaScript`);
  assert(html.includes('gascheck-core.js?v=32-water-asset-authority'), `${name} must bust the old shared-core cache`);
}

assert(core.includes("GC.version = '2.9-water-asset-authority'"));
assert(core.includes('(C.cloudRead || C.read)()'));
assert(core.includes('(C.cloudWrite || C.write)(list)'));
assert(core.includes('GC.sync = (() => {'));
assert(core.includes("GC.sync.register(C.tool"));
assert(core.includes("reason:'queued_change'"));
assert(core.includes("reason:'retry'"));
assert(core.includes('if (running) { queued = true; return running; }'));
assert(core.includes('const uploaded = new Map();'), 'same photo must be deduplicated within one sync');
assert(core.includes('if (startMap.has(key) && !latestMap.has(key)) return; // 同步途中已刪除'));
assert(core.includes('SMART.stable(row) !== SMART.stable(before)'));

const hook = core.indexOf("await C.onTelegramSent({ period:period");
const auto = core.indexOf("cloudControl.scheduleAuto('telegram_' + mode)", hook);
assert(hook >= 0 && auto > hook, 'sender/review/approval audit must be saved before Telegram auto upload');
assert(core.includes("mode === 'summary' || mode === 'approval'"));

assert(portal.includes('await GC.cloud.upload(m.id,recs,portalSyncOpt(m))'));
assert(portal.includes('await GC.cloud.download(m.id,portalRecords(m),portalSyncOpt(m))'));
assert(portal.includes("'vrt_asset_tombstones'"));
assert(portal.includes("'vrt_key_tombstones'"));

assert(asset.includes("GC.sync.schedule('asset','record_change')"));
assert(asset.includes('updateUHdr();loadAssetCachedThenRefresh();'), 'Asset login must render cached data before background sync');
assert(asset.includes("GC.sync.download('asset',{silent:true})"), 'Asset startup refresh must use silent smart download');
assert(asset.includes("GC.sync.hasPending('asset')"), 'Asset startup refresh must not race a retained pending upload');
assert(!asset.includes('updateUHdr();loadFromGAS();'), 'Asset login must not block on the legacy full-load path');
assert(!/window\.assetTelegramSent=[^;]+await saveToGAS\(\)/.test(asset));
assert(cleaning.includes("GC.sync.schedule('cleaning','record_save')"));
assert(cleaning.includes("GC.sync.schedule('cleaning','telegram_record')"));
assert(ehs.includes("GC.sync.schedule('ehs','recycle_save')"));
assert(ehs.includes("GC.sync.schedule('ehs','waste_save')"));
assert(ehs.includes("GC.sync.schedule('ehs','smart_import')"));
assert(temperature.includes("GC.sync.schedule('temperature','record_save')"));
assert(temperature.includes("GC.sync.schedule('temperature','smart_import')"));
assert(core.includes('[onclick="sendAnalyticsTelegram()"]'), 'legacy aggregate Telegram buttons must be hidden');
assert(core.includes('rec.sendTelegramRecord()/insp.sendTg()'), 'record/photo Telegram actions must remain explicitly preserved');

console.log('HRA Pay v3.3 sync parity v30 tests: PASS');
