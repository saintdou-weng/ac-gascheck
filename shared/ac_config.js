/**
 * AC_GASCHECK Platform — Shared Config
 * All modules reference this for GAS URL, Telegram, base settings.
 */
const AC_CFG = (() => {
  const GAS_KEY  = 'ac_gascheck_gas_url';
  const LANG_KEY = 'ac_gascheck_lang';
  const META_KEY = 'ac_gascheck_meta';

  const DEFAULTS = {
    BOT_TOKEN : '8673221735:AAH0KoC89DPLNu4D70inRfkY2xwedLkXjnw',
    CHAT_ID   : '-5113064563',
    BASE_URL  : 'https://saintdou-weng.github.io/ac-gascheck/',
    PORTAL    : 'ac_gascheck_portal_v1.html',
    GAS_PROJECT: 'AC_GASCHECK_CORE',
  };

  const MODULES = [
    { id:'asset',       file:'ac_gascheck_asset_v1.html',       icon:'📦', zhName:'資產管理', enName:'Asset',       kmName:'ទ្រព្យ',         lsKey:'vrt_asset_v1',      color:'#2563EB' },
    { id:'dormitory',   file:'ac_gascheck_dormitory_v1.html',   icon:'🏠', zhName:'宿舍管理', enName:'Dormitory',   kmName:'ផ្ទះ',           lsKey:'vrt_dorm_hub_v2',   color:'#5B4FCF' },
    { id:'cleaning',    file:'ac_gascheck_cleaning_v1.html',    icon:'🧹', zhName:'清潔管理', enName:'Cleaning',    kmName:'ការសំអាត',      lsKey:'vrt_clean_hub_v2',  color:'#2D7A5A' },
    { id:'keymovement', file:'ac_gascheck_keymovement_v1.html', icon:'🔑', zhName:'鑰匙管理', enName:'Key Movement',kmName:'សោ',            lsKey:'vrt_keys',           color:'#E8640A' },
    { id:'ehs',         file:'ac_gascheck_ehs_v1.html',         icon:'♻️', zhName:'EHS 環境',  enName:'EHS',         kmName:'EHS',            lsKey:'vrt_ehs_hub_v2',    color:'#B36010' },
    { id:'waterdrum',   file:'ac_gascheck_waterdrum_v1.html',   icon:'💧', zhName:'水桶管理', enName:'Water Drum',  kmName:'ធុងទឹក',        lsKey:'wdr_data',           color:'#0891B2' },
    { id:'temperature', file:'ac_gascheck_temperature_v1.html', icon:'🌡️', zhName:'溫度記錄', enName:'Temperature', kmName:'សីតុណ្ហភាព',    lsKey:'vrt_temp_db',        color:'#4F6EF7' },
  ];

  const get = () => ({
    gasUrl   : localStorage.getItem(GAS_KEY)  || '',
    lang     : localStorage.getItem(LANG_KEY) || 'zh',
    meta     : JSON.parse(localStorage.getItem(META_KEY) || '{}'),
    ...DEFAULTS,
  });

  const setGasUrl = url => { localStorage.setItem(GAS_KEY, url); };
  const setLang   = l   => { localStorage.setItem(LANG_KEY, l); };
  const setMeta   = obj => {
    const cur = JSON.parse(localStorage.getItem(META_KEY) || '{}');
    localStorage.setItem(META_KEY, JSON.stringify({ ...cur, ...obj }));
  };
  const getLocalCount = () => MODULES.reduce((s,m) => {
    try {
      const raw = localStorage.getItem(m.lsKey);
      const d   = raw ? JSON.parse(raw) : null;
      if (!d) return s;
      if (Array.isArray(d)) return s + d.length;
      if (d.records && Array.isArray(d.records)) return s + d.records.length;
      const all = Object.values(d).filter(Array.isArray).reduce((a,arr) => a + arr.length, 0);
      return s + (all || 0);
    } catch(e) { return s; }
  }, 0);

  return { get, setGasUrl, setLang, setMeta, getLocalCount, MODULES, DEFAULTS };
})();
