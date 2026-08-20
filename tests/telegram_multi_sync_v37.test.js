const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const core = read('gascheck-core.js');
const gas = read('ac_gascheck_core_v3_fixed.gs');
const cleaning = read('ac_gascheck_cleaning_v2.html');
const temp = read('ac_gascheck_temperature_v2.html');
const dorm = read('ac_gascheck_dormitory_v2.html');

assert(core.includes('extra:opt.extra, toCloud:opt.toCloud, fromCloud:opt.fromCloud, onRemote:opt.onRemote'),
  'download must forward remote metadata to the module');
assert(core.includes("GC.version = '3.4-photo-camera-full-summary-dorm-tg'"));
assert(gas.includes('function telegramSafeFallback_'), 'Telegram needs an HTML-safe retry');
assert(gas.includes("if (!ok) return tgSendText_(chatId, '♻️ AC GASCHECK Platform\\n'"),
  '/gc must report a successful plain-text fallback');

for (const html of [cleaning, temp, dorm]) {
  assert(html.includes('gascheck-core.js?v=38-photo-camera-full-summary-dorm-tg'));
}

assert(cleaning.includes('function applyCleaningCloudMeta'), 'Cleaning must restore shared staff/settings');
assert(cleaning.includes('cleaners:(d.cleaners||[]).map(personName)'));
assert(cleaning.includes('onRemote:applyCleaningCloudMeta'));
assert(cleaning.includes('records:Array.isArray(smart.list)?smart.list:[]'),
  'Cleaning manual download must use the smart-sync result');

assert(temp.includes('let _tempSelectedZones = new Set()'));
assert(temp.includes('function selectTempZones(yes)'));
assert(temp.includes('toggleTempZone'));
assert(temp.includes('if(!_tempSelectedZones.has(String(z.id)))return;'));
assert(temp.includes('async function sendTemperatureTelegramPacket'));

assert(dorm.includes('onclick="insp.allOk()"'));
assert(dorm.includes('onclick="insp.clearAll()"'));
assert(dorm.includes('class="insp-room-ok"'));
assert(dorm.includes('const clearAll = () =>'));

console.log('Telegram / cross-phone staff sync / Temperature multi-select / Dorm quick-check v37: PASS');
