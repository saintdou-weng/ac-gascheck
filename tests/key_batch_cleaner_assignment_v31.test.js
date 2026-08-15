const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const key = read('ac_gascheck_keymovement_v2.html');
const cleaning = read('ac_gascheck_cleaning_v2.html');
const core = read('gascheck-core.js');

for (const [name, html] of [['key', key], ['cleaning', cleaning]]) {
  let scripts = 0;
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    scripts++;
    assert.doesNotThrow(() => new vm.Script(m[1], {filename:name + '-inline-' + scripts}), name + ' script ' + scripts + ' parses');
  }
}

assert(core.includes('vrt_key_master'), 'Key master must use IndexedDB business storage');
assert(core.includes(".closest('.tg-config, .gas-config, .cloud-config, .connection-config, .form-group')"), 'legacy config hiding must not hide whole Settings cards');

for (const token of [
  '鑰匙批次登記', 'key-batch-table', 'keyMasterOpen', 'keyMasterImport',
  'keyMasterExport', 'keyMasterDelete', 'km-master-photos', 'keyPrefsSave',
  "GC.sync.schedule('keymovement','batch_save')", "_syncKind:'key_master'"
]) assert(key.includes(token), 'Key v31 missing: ' + token);

for (const token of [
  'loc-cleaner-map', 'getLocCleaner', 'setLocCleaner', 'applyDefaultCleaner',
  'renderLocationCleanerAssignments', 'missing-location-cleaner',
  'cleaner:state.getLocCleaner(locId)'
]) assert(cleaning.includes(token), 'Cleaning assignment missing: ' + token);

assert(cleaning.includes("'f-default-cleaner':'Default cleaner (apply to all)'"));
assert(cleaning.includes("'f-default-cleaner':'អ្នកសម្អាតលំនាំដើម (អនុវត្តទាំងអស់)'"));

console.log('Key batch/master and Cleaning per-location cleaner v31 tests: PASS');
