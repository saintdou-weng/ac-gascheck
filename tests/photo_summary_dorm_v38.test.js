const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

const core = read('gascheck-core.js');
const asset = read('ac_gascheck_asset_v2.html');
const key = read('ac_gascheck_keymovement_v2.html');
const clean = read('ac_gascheck_cleaning_v2.html');
const temp = read('ac_gascheck_temperature_v2.html');
const dorm = read('ac_gascheck_dormitory_v2.html');
const water = read('ac_gascheck_waterdrum_v2.html');
const cache = 'gascheck-core.js?v=39-dorm-resend-callback';

assert(core.includes("GC.version = '3.5-dorm-resend-callback'"));
assert(core.includes('capture="environment"'));
assert(core.includes('gc-photo-camera'));
assert(core.includes("I18.t('gc.chooseFile')"));
assert(core.includes("I18.t('gc.takePhoto')"));
assert(core.includes("finalButtons.push([{ text: '📊 Open Dashboard / 開啟平台', url: dashboardUrl }])"));
assert(core.includes("finalButtons.push([{ text: '🏠 Main Portal / 總平台', url: portalUrl }])"));

assert(asset.includes('id="f-pc"') && asset.includes('capture="environment"'));
assert(water.includes('wdr-camera-') && water.includes('capture="environment"'));
assert(key.includes('km-file-picker') && key.includes('km-camera-picker'));
assert(key.includes('id="km-master-photos"'));
assert(key.includes('keyEmbeddedPhotos') || key.includes('embedded photos'));

for (const html of [asset, key, clean, temp, dorm]) assert(html.includes(cache));
assert(!temp.includes('const compact='), 'temperature must not use the compact daily summary');
assert(temp.includes('same full-detail renderer') && temp.includes('VRT 溫濕度'));
assert(clean.includes('const actualSlots=') && clean.includes('actualSlots.length?actualSlots.join'));
assert(dorm.includes('const dormResult = await gasGet'));
assert(dorm.includes('gasSent=!!(dormResult&&dormResult.ok===true)'));
assert(dorm.includes('data: JSON.stringify({'));
assert(dorm.includes('const tgResult = await tgPost'));
assert(dorm.includes('dorm_ok_') && dorm.includes('dorm_rej_'));
assert(dorm.includes('function dormTelegramPayload'));
assert(dorm.includes('const resend = async'));
assert(dorm.includes('操作 / Actions'));
assert(dorm.includes('id="record-detail"'));
assert(core.includes('next.data = next.callback_data'));

console.log('v39 photo/camera, full temperature summary, cleaning slots and dorm Telegram tests: PASS');
