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
new vm.Script(scripts[scripts.length - 1], {filename:'cleaning-telegram-inline.js'}).runInContext(context);

const cfg = {
  read(){ return records; },
  scopeField:'locId', groupField:'locId',
  telegramSlotFilter: context.cleaningTelegramSlotFilter
};
const packet = context.buildCleaningTelegram({
  cfg, period:'all', ref:'2026-08-11', mode:'summary', lang:'bi',
  scope:['loc_office','loc_canteen'], slot:['10:30','14:30']
});

assert(packet.text.includes('Office'));
assert(packet.text.includes('Canteen'));
assert(!packet.text.includes('Factory Floor'));
assert(packet.text.includes('2026-08-11'));
assert(!packet.text.includes('T00:00:00.000Z'));
assert(packet.text.includes('10:30, 14:30'));
for (const icon of ['👃','💡','🧹','🚪','📐','🏠']) assert(packet.text.includes(icon));
assert(packet.text.includes('Cleaner'));
assert(packet.text.includes('Checker'));
assert.strictEqual(packet.photos.length, 2);

const core = fs.readFileSync(path.join(root, 'gascheck-core.js'), 'utf8');
assert(core.includes('telegramScopeMultiple: false'));
assert(core.includes('telegramSlotMultiple: false'));
assert(core.includes('scopePicks.onclick'));
assert(core.includes('slotPicks.onclick'));

console.log('Cleaning Telegram multi-location/multi-slot tests passed.');
