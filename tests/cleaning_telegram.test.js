const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'ac_gascheck_cleaning_v2.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(Boolean);
const records = [
  {
    id: 'office-1', date: '2026-08-11T00:00:00.000Z', locId: 'loc_office',
    cleaner: 'Sreynin', checker: 'Dara', slots: ['10:30', '14:30'],
    checks: {smell:true, light:true, floor:true, door:true, corner:true, ceiling:true},
    note: 'good', photos: ['data:image/png;base64,AAA']
  },
  {
    id: 'canteen-1', date: '2026-08-11', locId: 'loc_canteen',
    cleaner: 'Monyroth', checker: 'Nin', slots: ['14:30'],
    checks: {smell:true, light:true, floor:false, door:true, corner:true, ceiling:true},
    photos: ['https://example.invalid/cleaning.jpg']
  },
  {
    id: 'factory-1', date: '2026-08-11', locId: 'loc_factory',
    cleaner: 'Phea', checker: 'Nin', slots: ['07:30'],
    checks: {smell:true, light:true, floor:true, door:true, corner:true, ceiling:true}
  }
];
const names = {loc_office:'Office', loc_canteen:'Canteen', loc_factory:'Factory Floor'};
const context = {
  console,
  document: {readyState:'loading', addEventListener(){}},
  localStorage: {getItem(){ return null; }},
  state: {db(){ return {records, locations:Object.keys(names).map(id => ({id,name:names[id]})), slots:['07:30','10:30','14:30']}; }},
  DEF_SLOTS: ['07:30','10:30','14:30'],
  CHK_ITEMS: ['smell','light','floor','door','corner','ceiling'],
  CHK_ICONS: {smell:'👃',light:'💡',floor:'🧹',door:'🚪',corner:'📐',ceiling:'🏠'},
  hasCleaningCheckValue(checks){ return Object.values(checks || {}).some(v => v === true || v === false); },
  locName(id){ return names[id] || id; },
  _localTS(){ return '2026-08-11 18:59:00'; },
  GC: {
    util: {
      asArray(v){ return Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]); },
      escapeHtml(v){ return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    },
    telegram: {
      text(zh,en,km,lang){ return lang === 'zh' ? zh : (lang === 'en' ? en : (lang === 'km' ? km : zh+' / '+en)); },
      filter(list,cfg,period,ref,scope,slot){
        const scopes = (Array.isArray(scope) ? scope : [scope]).map(String);
        const slots = (Array.isArray(slot) ? slot : [slot]).map(String);
        return list.filter(r => (scopes.includes('all') || scopes.includes(String(r[cfg.scopeField || cfg.groupField]))))
          .filter(r => slots.includes('all') || slots.some(value => cfg.telegramSlotFilter(r,value)));
      }
    },
    attach(){}
  }
};
vm.createContext(context);
// Real GC.TG (compact card helpers) from the shared core, so the test renders what the group sees.
const coreSrc = fs.readFileSync(path.join(root, 'gascheck-core.js'), 'utf8');
const tgStart = coreSrc.indexOf('GC.TG = (function'), tgEnd = coreSrc.indexOf('/* 送出成功動畫', tgStart);
assert(tgStart > 0 && tgEnd > tgStart);
new vm.Script('const U = {escapeHtml: GC.util.escapeHtml};\n' + coreSrc.slice(tgStart, tgEnd), {filename:'gc-tg.js'}).runInContext(context);
new vm.Script(scripts[scripts.length - 1], {filename:'cleaning-telegram-inline.js'}).runInContext(context);

const cfg = {
  read(){ return records; },
  scopeField:'locId', groupField:'locId',
  telegramSlotFilter: context.cleaningTelegramSlotFilter
};
const packet = context.buildCleaningTelegram({
  cfg, period:'all', ref:'2026-08-11', mode:'summary', lang:'bi',
  scope:['loc_office','loc_canteen'], slot:['10:30','14:30'], sender:'Paul'
});

// Compact card: one line per area, exceptions first, OK areas counted once, no padded tables.
assert(packet.text.includes('✅ Office ×2'), 'all-pass area appears once with its check count');
assert(packet.text.includes('• <b>Canteen</b> · 08-11 14:30 · ❌ 🧹 · Nin'), 'failed area line: area · when · failed items · checker');
assert(packet.text.includes('🗂 Office, Canteen'), 'selected locations shown in the header');
assert.strictEqual(packet.text.split('\n').filter(l => /Office ×|<b>Office<\/b>/.test(l)).length, 1, 'same area is not repeated');
assert(!packet.text.includes('Factory Floor'));
assert(packet.text.includes('08-11'));
assert(!packet.text.includes('T00:00:00.000Z'));
assert(packet.text.includes('⏱ 10:30, 14:30'), 'selected slots shown');
for (const icon of ['👃','💡','🚪','📐','🏠']) assert(!packet.text.includes(icon), 'passed items are not listed item by item');
assert(packet.text.includes('區域/Areas <b>2</b>') && packet.text.includes('檢查/Checks <b>3</b>') && packet.text.includes('清潔員/Cleaners <b>2</b>'));
assert(packet.text.includes('🔴 <b>1 個區域有異常/1 area with issues</b>'));
assert(/🟥🟥🟥🟥🟥⬜⬜⬜⬜⬜ 50%/.test(packet.text), 'bar = areas OK / areas checked');
assert(packet.text.includes('發送人/Sent by <b>Paul</b>'));
assert(!/padEnd|│/.test(packet.text));
assert(packet.text.split('\n').length <= 25);
// Photos only travel with records that have a ❌ (Canteen), never with all-pass records (Office).
assert.deepStrictEqual(Array.from(packet.photos), ['https://example.invalid/cleaning.jpg']);
assert.strictEqual(packet.recordCount, 2);
const allPass = context.buildCleaningTelegram({cfg, period:'all', ref:'2026-08-11', mode:'summary', lang:'en', scope:['loc_office','loc_factory'], slot:['all'], sender:'Paul'});
assert.deepStrictEqual(Array.from(allPass.photos), [], 'everything ticked → no photos');
assert(allPass.text.includes('🟢 <b>All passed</b>') && allPass.text.includes('✅ Office ×2 · Factory Floor ×1'));
assert(!/[\u4e00-\u9fff]/.test(allPass.text), 'English report has no Chinese');
const km = context.buildCleaningTelegram({cfg, period:'all', ref:'2026-08-11', mode:'summary', lang:'km', scope:['all'], slot:['all'], sender:'Paul'});
assert(!/[\u4e00-\u9fff]/.test(km.text), 'Khmer report has no Chinese');
assert(km.text.includes('Canteen') && km.text.includes('Office'));

assert(context.validateCleaningTelegramSelection({records:[],lang:'en'}).includes('No cleaning records'));
assert(context.validateCleaningTelegramSelection({records:[{slots:[],checks:{smell:true}}],lang:'en'}).includes('no check time'));
assert(context.validateCleaningTelegramSelection({records:[{slots:['10:30'],checks:{}}],lang:'en'}).includes('no checked item'));
assert.strictEqual(context.validateCleaningTelegramSelection({records:[records[0]],lang:'en'}), '');

const formPacket = context.buildCleaningSelectedRecordsTelegram(records.slice(0, 2), 'bi', 'Paul');
assert(formPacket.text.includes('📅 2026-08-11'), 'form quick-send is the day card');
assert(formPacket.text.includes('✅ Office ×2'));
assert(formPacket.text.includes('• <b>Canteen</b> · 14:30 · ❌ 🧹 · Nin'));
assert(formPacket.text.includes('⏱ 10:30, 14:30'));
assert(formPacket.text.includes('📆 <b>本月累計/Month to date</b> · 🔎 4 · 📍 3 · ❌ 1'), 'day card carries month-to-date totals');
assert(!formPacket.text.includes('T00:00:00.000Z'));
assert.deepStrictEqual(Array.from(formPacket.photos), ['https://example.invalid/cleaning.jpg']);

const core = fs.readFileSync(path.join(root, 'gascheck-core.js'), 'utf8');
assert(core.includes('telegramScopeMultiple: false'));
assert(core.includes('telegramSlotMultiple: false'));
assert(core.includes('scopePicks.onclick'));
assert(core.includes('slotPicks.onclick'));
assert(core.includes('data-gc-sender'));
assert(core.includes("localStorage.setItem(senderStorageKey, sender)"));
assert(core.includes('C.telegramAutoUpload || mode === \'summary\''));
assert(html.includes('id="locs-wrap"'));
assert(html.includes('state.getLocs()'));
assert(html.includes('telegramScopeMultiple:true'));
assert(html.includes('telegramSlotMultiple:true'));
assert(html.includes('gascheck-core.js?v=20261006a'));
assert(html.includes('id="loc-cleaner-map"'));
assert(html.includes('state.getLocCleaner(locId)'));
assert(html.includes('missing-location-cleaner'));
assert(html.includes('v===null?true:v===true?false:null'));
assert(html.includes('missingItemLoc'));
assert(html.includes('telegramRequireSender:true'));
assert(html.includes('telegramConfirmSender:true'));
assert(html.includes('telegramRequireData:true'));
assert(html.includes('telegramAutoUpload:true'));
assert(html.includes('telegramSender=ctx.sender'));

console.log('Cleaning Telegram multi-location/multi-slot tests passed.');
