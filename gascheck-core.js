/* ═══════════════════════════════════════════════════════════════
   AC GASCheck — Shared Core  v2.6-water-key-asset
   共用核心：三語 / 安全雲端合併 / 照片 / 智慧匯入 / 期間篩選 / 儀表板
   用法：於 </head> 前加入 script 標籤，src="./gascheck-core.js"
   （與各模組 HTML 放在同一層目錄，不需 shared 資料夾）
   ─────────────────────────────────────────────────────────────
   慣例（不可違反）：
   · GAS POST 一律 Content-Type: text/plain;charset=utf-8
   · 日期一律用 local getters，禁用 toISOString()
   · Telegram 用 parse_mode:'HTML' + escapeHtml()
   · SheetJS 用 cellDates:false, raw:true
   · 所有 onclick handler 掛 window scope
   ═══════════════════════════════════════════════════════════ */
(function (global) {
'use strict';

const GC = {};

/* 使用者指定的固定入口：頁面不再要求每個模組重填 GAS URL／Chat ID。 */
const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbzRsf_DuYJu0kXxqefR8qbLWhO7uz2flCY7jkPQQ73ZMwptcHDwrtJnhBQFwxG_EM3v/exec';
const DEFAULT_CHAT_ID = '-5113064563';
const DASHBOARD_BASE_URL = 'https://saintdou-weng.github.io/ac-gascheck/';
const DASHBOARD_PATHS = {asset:'ac_gascheck_asset_v2.html',dormitory:'ac_gascheck_dormitory_v2.html',cleaning:'ac_gascheck_cleaning_v2.html',keymovement:'ac_gascheck_keymovement_v2.html',ehs:'ac_gascheck_ehs_v2.html',waterdrum:'ac_gascheck_waterdrum_v2.html',temperature:'ac_gascheck_temperature_v2.html'};
try {
  // 只保存小設定；大量業務內容由下方 IndexedDB layer 接管。
  localStorage.setItem('ac_gascheck_gas_url', DEFAULT_GAS_URL);
  localStorage.setItem('ac_gascheck_chat_id', DEFAULT_CHAT_ID);
} catch (e) {}

/* ═══════════════════════════════════════════════════════════
   0. UTIL — 日期（一律 local getters）
   ═══════════════════════════════════════════════════════════ */
const U = GC.util = {
  /** YYYY-MM-DD（本地時區，絕不用 toISOString） */
  ymd(d) {
    d = d ? new Date(d) : new Date();
    if (isNaN(d)) return '';
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  },
  /** YYYY-MM-DD HH:mm:ss（本地時區） */
  ymdhms(d) {
    d = d ? new Date(d) : new Date();
    if (isNaN(d)) return '';
    return U.ymd(d) + ' ' +
           String(d.getHours()).padStart(2, '0') + ':' +
           String(d.getMinutes()).padStart(2, '0') + ':' +
           String(d.getSeconds()).padStart(2, '0');
  },
  /** 本地時間戳，用於 updatedAt 比對 */
  now() { return U.ymdhms(); },
  /** ISO 週數 */
  weekNo(d) {
    d = new Date(d || new Date());
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
    const w1 = new Date(t.getFullYear(), 0, 4);
    return 1 + Math.round(((t - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
  },
  escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },
  /** 把可能被序列化成字串的陣列還原（Sheet 讀回的 photos 常是 JSON 字串）*/
  asArray(v) {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string' && v.trim().charAt(0) === '[') {
      try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch (e) { return []; }
    }
    return v ? [v] : [];
  },
  uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) +
           Math.random().toString(36).slice(2, 7);
  },
  debounce(fn, ms) {
    let t; return function () {
      clearTimeout(t); const a = arguments, c = this;
      t = setTimeout(() => fn.apply(c, a), ms || 300);
    };
  }
};

/* ═══════════════════════════════════════════════════════════
   0.5 STORAGE — 業務資料放 IndexedDB；localStorage 只留小設定
   IndexedDB 是瀏覽器內建資料庫，容量通常遠大於 localStorage。
   為了不破壞既有模組，攔截指定業務 key 的 get/set/removeItem；模組仍可用
   原本同步寫法，實際內容會存到 IndexedDB。第一次開啟會自動搬移舊資料。
   ═══════════════════════════════════════════════════════════ */
const STORAGE = GC.storage = (() => {
  const DB_NAME = 'ac_gascheck_data_v1', STORE = 'kv';
  const DATA_KEY_RE = /^(?:vrt_a7|vrt_c7|vrt_p7|vrt_photos|vrt_asset_tombstones|vrt_asset_audit|vrt_th_z|vrt_th_r|vrt_keys|vrt_key_tombstones|vrt_waste_v3|vrt_ehs_cfg_v1|vrt_dorm_hub_v2|vrt_dorm_cfg_v2|vrt_clean_hub_v2|vrt_dorm_draft|wdr_data|wdr_\d{4}_\d{2}|wdr_cfg_\d{4}_\d{2}|wdr_headcount_\d{4}_\d{2}|wdr_default_cfg|wdr_default_fac_price|wdr_default_sta_price|wdr_default_inspector|wdr_exchange_rate|wdr_last_saved|wdr_tg_config|ac_waterdrum_backup|ac_gascheck_tg_chat|ac_gascheck_tg_token|tg_chat|tg_token)$/;
  const storageProto = typeof Storage !== 'undefined' ? Storage.prototype : null;
  const native = storageProto ? {
    get: storageProto.getItem,
    set: storageProto.setItem,
    remove: storageProto.removeItem,
    key: storageProto.key,
    length: Object.getOwnPropertyDescriptor(storageProto, 'length')
  } : null;
  const cache = new Map();
  const enabled = !!storageProto && typeof indexedDB !== 'undefined' && !!global.localStorage;
  let db = null;

  const isDataKey = key => DATA_KEY_RE.test(String(key || ''));
  const localKeys = () => {
    const out = [];
    if (!native || !global.localStorage) return out;
    try {
      const n = native && native.length && native.length.get ? native.length.get.call(global.localStorage) : global.localStorage.length;
      for (let i = 0; i < n; i++) {
        const k = native.key.call(global.localStorage, i);
        if (k) out.push(k);
      }
    } catch (e) {}
    return out;
  };
  const request = req => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
  });
  const openDb = () => new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB unavailable'));
  });
  const readAll = async () => {
    const tx = db.transaction(STORE, 'readonly');
    return request(tx.objectStore(STORE).getAll());
  };
  const put = (key, value) => {
    if (!db) return Promise.reject(new Error('IndexedDB not ready'));
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ key: String(key), value: String(value) });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB write aborted'));
    });
  };
  const remove = key => {
    if (!db) return Promise.resolve(true);
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(String(key));
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('IndexedDB delete failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB delete aborted'));
    });
  };

  const ready = (async () => {
    if (!enabled) return false;
    db = await openDb();
    const rows = await readAll();
    (rows || []).forEach(row => {
      if (row && row.key != null) cache.set(String(row.key), String(row.value == null ? '' : row.value));
    });
    // 舊版本資料只有在成功寫入 IndexedDB 後才移除，避免搬移中斷造成遺失。
    for (const key of localKeys()) {
      if (!isDataKey(key)) continue;
      const raw = native && native.get ? native.get.call(global.localStorage, key) : null;
      if (!cache.has(key) && raw != null) {
        await put(key, raw);
        cache.set(key, raw);
      }
      if (cache.has(key)) {
        try { if (native && native.remove) native.remove.call(global.localStorage, key); } catch (e) {}
      }
    }
    return true;
  })().catch(err => {
    console.warn('[AC GASCHECK] IndexedDB unavailable; localStorage fallback:', err.message);
    db = null;
    return false;
  });

  function getSync(key) {
    key = String(key || '');
    if (cache.has(key)) return cache.get(key);
    try { return native && native.get ? native.get.call(global.localStorage, key) : null; } catch (e) { return null; }
  }
  function setSync(key, value) {
    key = String(key || ''); value = String(value == null ? '' : value);
    if (!isDataKey(key) || !enabled) { if (native && native.set) native.set.call(global.localStorage, key, value); return; }
    cache.set(key, value);
    ready.then(ok => ok ? put(key, value) : (native && native.set ? native.set.call(global.localStorage, key, value) : null)).catch(() => {});
  }
  function removeSync(key) {
    key = String(key || '');
    if (!isDataKey(key) || !enabled) { if (native && native.remove) native.remove.call(global.localStorage, key); return; }
    cache.delete(key);
    ready.then(ok => ok ? remove(key) : (native && native.remove ? native.remove.call(global.localStorage, key) : null)).catch(() => {});
  }
  function keys(prefix) {
    const out = new Set(cache.keys());
    localKeys().forEach(k => { if (isDataKey(k)) out.add(k); });
    return Array.from(out).filter(k => !prefix || k.indexOf(prefix) === 0).sort();
  }

  // 讓舊模組不必全部改成 async/await；只有業務資料 key 走 IndexedDB。
  if (enabled && storageProto) {
    storageProto.getItem = function (key) {
      return this === global.localStorage && isDataKey(key) ? getSync(key) : native.get.call(this, key);
    };
    storageProto.setItem = function (key, value) {
      return this === global.localStorage && isDataKey(key) ? setSync(key, value) : native.set.call(this, key, value);
    };
    storageProto.removeItem = function (key) {
      return this === global.localStorage && isDataKey(key) ? removeSync(key) : native.remove.call(this, key);
    };
  }
  return { ready, isDataKey, getSync, setSync, removeSync, keys };
})();

/* ═══════════════════════════════════════════════════════════
   0.6 ATTENDANCE BRIDGE — 同網域考勤資料／既有 Attendance GAS
   水桶模組只在使用者按「同步考勤」時掃描，不會拖慢平常開頁。
   優先讀同網域 IndexedDB / localStorage；如 Attendance 已保存 GAS URL，
   再嘗試 attendanceHeadcount 與 pull/attendance 兩種既有端點。
   ═══════════════════════════════════════════════════════════ */
GC.attendance = (() => {
  const DATE_KEYS = ['date','workDate','attendanceDate','recordDate','day','d'];
  const ID_KEYS = ['employeeId','empId','employee_id','staffId','staff_id','id','code'];
  const PRESENT_KEYS = ['present','isPresent','attendance','status','workStatus','shift'];
  function value(row, keys) {
    for (let i = 0; i < keys.length; i++) if (row && row[keys[i]] != null && row[keys[i]] !== '') return row[keys[i]];
    return '';
  }
  function dateOf(row) {
    const raw = value(row, DATE_KEYS);
    if (raw instanceof Date && !isNaN(raw)) return U.ymd(raw);
    const s = String(raw || '').trim();
    let m = s.match(/(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    if (m) return m[1] + '-' + String(+m[2]).padStart(2,'0') + '-' + String(+m[3]).padStart(2,'0');
    m = s.match(/(\d{1,2})[-\/.](\d{1,2})[-\/.](20\d{2})/);
    if (m) return m[3] + '-' + String(+m[2]).padStart(2,'0') + '-' + String(+m[1]).padStart(2,'0');
    return '';
  }
  function isPresent(row) {
    const v = String(value(row, PRESENT_KEYS) || '').trim().toLowerCase();
    if (!v) return true;
    return !/(absent|leave|off|resign|terminated|a\b|休|假|缺勤|離職|អវត្តមាន|ឈប់)/i.test(v);
  }
  function flatten(value, out) {
    out = out || [];
    if (Array.isArray(value)) value.forEach(v => flatten(v, out));
    else if (value && typeof value === 'object') {
      if (dateOf(value)) out.push(value);
      else Object.keys(value).forEach(k => flatten(value[k], out));
    }
    return out;
  }
  function summarize(rows, start, end) {
    const byDay = {};
    flatten(rows || []).forEach(function (row) {
      const d = dateOf(row); if (!d || d < start || d > end || !isPresent(row)) return;
      const id = String(value(row, ID_KEYS) || row.name || row.employeeName || JSON.stringify(row)).trim();
      (byDay[d] || (byDay[d] = new Set())).add(id);
    });
    const daily = {};
    Object.keys(byDay).forEach(d => { daily[d] = byDay[d].size; });
    return { daily, personDays:Object.values(daily).reduce((a,b)=>a+(+b||0),0), days:Object.keys(daily).length };
  }
  function jsonValuesFromLocalStorage() {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i) || '';
        if (!/(attendance|att_|hra.*att|roster|employee)/i.test(key)) continue;
        try { out.push(JSON.parse(localStorage.getItem(key) || 'null')); } catch (e) {}
      }
    } catch (e) {}
    return out;
  }
  function readStore(db, storeName) {
    return new Promise(resolve => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch (e) { resolve([]); }
    });
  }
  async function indexedValues() {
    if (!global.indexedDB || typeof global.indexedDB.databases !== 'function') return [];
    let infos = [];
    try { infos = await global.indexedDB.databases(); } catch (e) { return []; }
    const names = (infos || []).map(x => x && x.name).filter(n => n && n !== 'ac_gascheck_data_v1' && /(attendance|hra|staff|employee|pay)/i.test(n));
    const out = [];
    for (const name of names) {
      const db = await new Promise(resolve => {
        try { const req = global.indexedDB.open(name); req.onsuccess=()=>resolve(req.result); req.onerror=()=>resolve(null); } catch(e) { resolve(null); }
      });
      if (!db) continue;
      for (const storeName of Array.from(db.objectStoreNames || [])) {
        if (!/(attendance|roster|staff|employee|record|data)/i.test(storeName)) continue;
        out.push(await readStore(db, storeName));
      }
      try { db.close(); } catch (e) {}
    }
    return out;
  }
  function configuredUrl() {
    const keys = ['ac_attendance_gas_url','attendance_gas_url','ac_hra_gas_url','hra_gas_url','ac_hra_pay_gas_url'];
    for (const k of keys) { try { const v=localStorage.getItem(k); if (/^https:\/\/script\.google\.com\/macros\/s\//.test(v || '')) return v; } catch(e) {} }
    return '';
  }
  async function remoteValues(start, end) {
    const url = configuredUrl(); if (!url) return [];
    const attempts = [
      {action:'attendanceHeadcount',start,end},
      {action:'pull',tool:'attendance',start,end},
      {action:'list',tool:'attendance',start,end}
    ];
    for (const params of attempts) {
      try {
        const res = await fetch(url + '?' + new URLSearchParams(Object.assign({_t:Date.now()}, params)));
        const json = await res.json();
        if (json && json.daily && typeof json.daily === 'object') return [{__daily:json.daily}];
        const rows = json && (json.records || json.rows || json.data || json.list);
        if (Array.isArray(rows)) return rows;
      } catch (e) {}
    }
    return [];
  }
  async function headcount(start, end) {
    start = start || U.ymd(); end = end || start;
    const local = jsonValuesFromLocalStorage().concat(await indexedValues());
    let summary = summarize(local, start, end);
    if (summary.personDays) return Object.assign({source:'browser'}, summary);
    const remote = await remoteValues(start, end);
    if (remote[0] && remote[0].__daily) {
      const daily = remote[0].__daily, selected = {};
      Object.keys(daily).forEach(d => { if (d >= start && d <= end) selected[d] = +daily[d] || 0; });
      return {source:'attendance-gas',daily:selected,personDays:Object.values(selected).reduce((a,b)=>a+b,0),days:Object.keys(selected).length};
    }
    summary = summarize(remote, start, end);
    return Object.assign({source:summary.personDays?'attendance-gas':'none'}, summary);
  }
  return { headcount, summarize };
})();

/* ═══════════════════════════════════════════════════════════
   1. I18N — 繁中 / English / ខ្មែរ
   ═══════════════════════════════════════════════════════════ */
const BASE_DICT = {
  zh: {
    'gc.upload':'上傳雲端','gc.download':'下載雲端','gc.sync':'同步中…',
    'gc.uploaded':'已上傳雲端','gc.downloaded':'已下載並合併','gc.cloudCurrent':'雲端已是最新',
    'gc.autoSyncing':'Telegram 已發送，雲端背景同步中','gc.cloudPending':'雲端待補傳，連線後自動重試','gc.changedRows':'筆變更',
    'gc.upFail':'上傳失敗','gc.downFail':'下載失敗','gc.noCloud':'雲端尚無資料',
    'gc.merged':'筆已合併','gc.added':'筆新增','gc.updated':'筆更新','gc.kept':'筆本地保留',
    'gc.day':'日','gc.week':'週','gc.month':'月','gc.year':'年','gc.all':'全部',
    'gc.today':'今日','gc.thisWeek':'本週','gc.thisMonth':'本月','gc.thisYear':'今年',
    'gc.photo':'照片','gc.addPhoto':'加照片','gc.takePhoto':'拍照','gc.chooseFile':'選檔案',
    'gc.photoTooBig':'照片過大，已自動壓縮','gc.removePhoto':'移除照片','gc.noPhoto':'無照片',
    'gc.smartImport':'智慧匯入','gc.dropHere':'拖曳檔案到此，或點擊選擇',
    'gc.supportFmt':'支援 Excel (.xlsx/.xls/.xlsb) 與 CSV','gc.importing':'解析中…',
    'gc.imported':'筆已匯入','gc.importFail':'匯入失敗','gc.mapCols':'欄位對應',
    'gc.dashboard':'儀表板','gc.total':'總計','gc.records':'筆記錄',
    'gc.noData':'尚無資料','gc.export':'匯出','gc.search':'搜尋',
    'gc.weather':'天氣','gc.sunny':'晴','gc.cloudy':'多雲','gc.rain':'雨',
    'gc.heavyRain':'大雨','gc.storm':'雷雨','gc.hot':'酷熱','gc.humid':'潮濕',
    'gc.confirm':'確認','gc.cancel':'取消','gc.save':'儲存','gc.delete':'刪除','gc.close':'關閉',
    'gc.cloudTools':'雲端工具','gc.indexedDb':'資料庫：IndexedDB',
    'gc.telegram':'Telegram','gc.sendTelegram':'發送 Telegram','gc.period':'摘要期間','gc.slot':'發送時段','gc.allSlots':'全部時段','gc.reportLanguage':'摘要語言','gc.bilingual':'中英雙語','gc.chinese':'中文','gc.english':'English','gc.khmer':'ខ្មែរ',
    'gc.summary':'摘要','gc.review':'審查','gc.approval':'Approval','gc.quickActions':'快速操作',
    'gc.directHint':'上方按鈕可直接同步、匯入與發送，不需填網址／Token／Chat ID',
    'gc.sentTelegram':'Telegram 已發送','gc.noApproval':'沒有待審查／待核可資料',
    'gc.pendingApproval':'待審查／待核可','gc.mode':'訊息類型','gc.dataType':'資料類型','gc.refDate':'基準日期',
    'gc.cloudReady':'雲端已設定','gc.targetGroup':'目標群組','gc.defaultGroup':'AC GASCHECK 群組',
    'gc.preview':'預覽','gc.send':'發送','gc.periodMode':'期間模式','gc.periodValue':'期間',
    'gc.telegramTitle':'發送到 Telegram','gc.importTitle':'智慧匯入資料','gc.noPeriodData':'此期間沒有資料',
    'gc.bilingualKm':'中／英／柬三語','gc.selectScope':'選擇資料','gc.menuLanguage':'介面語言'
  },
  en: {
    'gc.upload':'Upload','gc.download':'Download','gc.sync':'Syncing…',
    'gc.uploaded':'Uploaded to cloud','gc.downloaded':'Downloaded & merged','gc.cloudCurrent':'Cloud already current',
    'gc.autoSyncing':'Telegram sent; cloud syncing in background','gc.cloudPending':'Cloud upload pending; retries when online','gc.changedRows':'changed',
    'gc.upFail':'Upload failed','gc.downFail':'Download failed','gc.noCloud':'No cloud data',
    'gc.merged':'merged','gc.added':'added','gc.updated':'updated','gc.kept':'kept local',
    'gc.day':'Day','gc.week':'Week','gc.month':'Month','gc.year':'Year','gc.all':'All',
    'gc.today':'Today','gc.thisWeek':'This Week','gc.thisMonth':'This Month','gc.thisYear':'This Year',
    'gc.photo':'Photo','gc.addPhoto':'Add Photo','gc.takePhoto':'Camera','gc.chooseFile':'Choose File',
    'gc.photoTooBig':'Photo compressed','gc.removePhoto':'Remove','gc.noPhoto':'No photo',
    'gc.smartImport':'Smart Import','gc.dropHere':'Drop file here or click to select',
    'gc.supportFmt':'Supports Excel (.xlsx/.xls/.xlsb) and CSV','gc.importing':'Parsing…',
    'gc.imported':'rows imported','gc.importFail':'Import failed','gc.mapCols':'Column Mapping',
    'gc.dashboard':'Dashboard','gc.total':'Total','gc.records':'records',
    'gc.noData':'No data','gc.export':'Export','gc.search':'Search',
    'gc.weather':'Weather','gc.sunny':'Sunny','gc.cloudy':'Cloudy','gc.rain':'Rain',
    'gc.heavyRain':'Heavy Rain','gc.storm':'Storm','gc.hot':'Hot','gc.humid':'Humid',
    'gc.confirm':'Confirm','gc.cancel':'Cancel','gc.save':'Save','gc.delete':'Delete','gc.close':'Close',
    'gc.cloudTools':'Cloud Tools','gc.indexedDb':'Storage: IndexedDB',
    'gc.telegram':'Telegram','gc.sendTelegram':'Send to Telegram','gc.period':'Summary period','gc.slot':'Send time slot','gc.allSlots':'All slots','gc.reportLanguage':'Report language','gc.bilingual':'Chinese + English','gc.chinese':'中文','gc.english':'English','gc.khmer':'ខ្មែរ',
    'gc.summary':'Summary','gc.review':'Review','gc.approval':'Approval','gc.quickActions':'Quick actions',
    'gc.directHint':'Use the buttons above to sync, import and send; no URL/token/chat ID entry is needed',
    'gc.sentTelegram':'Telegram sent','gc.noApproval':'No pending review/approval records',
    'gc.pendingApproval':'Pending review/approval','gc.mode':'Message type','gc.dataType':'Data type','gc.refDate':'As of',
    'gc.cloudReady':'Cloud configured','gc.targetGroup':'Target group','gc.defaultGroup':'AC GASCHECK Group',
    'gc.preview':'Preview','gc.send':'Send','gc.periodMode':'Period mode','gc.periodValue':'Period',
    'gc.telegramTitle':'Send to Telegram','gc.importTitle':'Smart Import Data','gc.noPeriodData':'No data in this period',
    'gc.bilingualKm':'Chinese / English / Khmer','gc.selectScope':'Select data','gc.menuLanguage':'Interface language'
  },
  km: {
    'gc.upload':'ផ្ទុកឡើង','gc.download':'ទាញយក','gc.sync':'កំពុងធ្វើសមកាលកម្ម…',
    'gc.uploaded':'បានផ្ទុកឡើងលើ Cloud','gc.downloaded':'បានទាញយក និងបញ្ចូលគ្នា','gc.cloudCurrent':'Cloud ទាន់សម័យរួចហើយ',
    'gc.autoSyncing':'បានផ្ញើ Telegram; កំពុងផ្ទុកទៅ Cloud នៅផ្ទៃខាងក្រោយ','gc.cloudPending':'រង់ចាំផ្ទុកទៅ Cloud ហើយនឹងសាកល្បងម្ដងទៀតពេលមានអ៊ីនធឺណិត','gc.changedRows':'បានផ្លាស់ប្ដូរ',
    'gc.upFail':'ការផ្ទុកឡើងបរាជ័យ','gc.downFail':'ការទាញយកបរាជ័យ','gc.noCloud':'គ្មានទិន្នន័យលើ Cloud',
    'gc.merged':'បានបញ្ចូលគ្នា','gc.added':'បានបន្ថែម','gc.updated':'បានធ្វើបច្ចុប្បន្នភាព','gc.kept':'រក្សាទុកក្នុងតំបន់',
    'gc.day':'ថ្ងៃ','gc.week':'សប្ដាហ៍','gc.month':'ខែ','gc.year':'ឆ្នាំ','gc.all':'ទាំងអស់',
    'gc.today':'ថ្ងៃនេះ','gc.thisWeek':'សប្ដាហ៍នេះ','gc.thisMonth':'ខែនេះ','gc.thisYear':'ឆ្នាំនេះ',
    'gc.photo':'រូបថត','gc.addPhoto':'បន្ថែមរូបថត','gc.takePhoto':'ថតរូប','gc.chooseFile':'ជ្រើសឯកសារ',
    'gc.photoTooBig':'រូបថតត្រូវបានបង្ហាប់','gc.removePhoto':'លុបចេញ','gc.noPhoto':'គ្មានរូបថត',
    'gc.smartImport':'នាំចូលឆ្លាតវៃ','gc.dropHere':'ទម្លាក់ឯកសារនៅទីនេះ ឬចុចដើម្បីជ្រើស',
    'gc.supportFmt':'គាំទ្រ Excel (.xlsx/.xls/.xlsb) និង CSV','gc.importing':'កំពុងវិភាគ…',
    'gc.imported':'ជួរបាននាំចូល','gc.importFail':'ការនាំចូលបរាជ័យ','gc.mapCols':'ការផ្គូផ្គងជួរឈរ',
    'gc.dashboard':'ផ្ទាំងគ្រប់គ្រង','gc.total':'សរុប','gc.records':'កំណត់ត្រា',
    'gc.noData':'គ្មានទិន្នន័យ','gc.export':'នាំចេញ','gc.search':'ស្វែងរក',
    'gc.weather':'អាកាសធាតុ','gc.sunny':'មេឃស្រឡះ','gc.cloudy':'មានពពក','gc.rain':'ភ្លៀង',
    'gc.heavyRain':'ភ្លៀងខ្លាំង','gc.storm':'ព្យុះ','gc.hot':'ក្ដៅ','gc.humid':'សើម',
    'gc.confirm':'បញ្ជាក់','gc.cancel':'បោះបង់','gc.save':'រក្សាទុក','gc.delete':'លុប','gc.close':'បិទ',
    'gc.cloudTools':'ឧបករណ៍ Cloud','gc.indexedDb':'ការផ្ទុក៖ IndexedDB',
    'gc.telegram':'Telegram','gc.sendTelegram':'ផ្ញើទៅ Telegram','gc.period':'រយៈពេលសង្ខេប','gc.slot':'ពេលវេលាផ្ញើ','gc.allSlots':'គ្រប់ពេល','gc.reportLanguage':'ភាសាសង្ខេប','gc.bilingual':'ចិន + អង់គ្លេស','gc.chinese':'中文','gc.english':'English','gc.khmer':'ខ្មែរ',
    'gc.summary':'សង្ខេប','gc.review':'ពិនិត្យ','gc.approval':'Approval','gc.quickActions':'សកម្មភាពរហ័ស',
    'gc.directHint':'ប្រើប៊ូតុងខាងលើដើម្បីធ្វើសមកាលកម្ម នាំចូល និងផ្ញើ ដោយមិនចាំបាច់បញ្ចូល URL/token/chat ID',
    'gc.sentTelegram':'បានផ្ញើ Telegram','gc.noApproval':'គ្មានទិន្នន័យកំពុងរង់ចាំពិនិត្យ/អនុម័ត',
    'gc.pendingApproval':'កំពុងរង់ចាំពិនិត្យ/អនុម័ត','gc.mode':'ប្រភេទសារ','gc.dataType':'ប្រភេទទិន្នន័យ','gc.refDate':'កាលបរិច្ឆេទយោង',
    'gc.cloudReady':'បានកំណត់ Cloud','gc.targetGroup':'ក្រុមគោលដៅ','gc.defaultGroup':'ក្រុម AC GASCHECK',
    'gc.preview':'មើលជាមុន','gc.send':'ផ្ញើ','gc.periodMode':'របៀបរយៈពេល','gc.periodValue':'រយៈពេល',
    'gc.telegramTitle':'ផ្ញើទៅ Telegram','gc.importTitle':'នាំចូលទិន្នន័យឆ្លាតវៃ','gc.noPeriodData':'គ្មានទិន្នន័យក្នុងរយៈពេលនេះ',
    'gc.bilingualKm':'ចិន / អង់គ្លេស / ខ្មែរ','gc.selectScope':'ជ្រើសទិន្នន័យ','gc.menuLanguage':'ភាសាចំណុចប្រទាក់'
  }
};

const I18 = GC.i18n = {
  lang: localStorage.getItem('gc_lang') || 'zh',
  dict: JSON.parse(JSON.stringify(BASE_DICT)),

  /** 模組自行擴充字典：GC.i18n.extend({zh:{...},en:{...},km:{...}}) */
  extend(d) {
    ['zh', 'en', 'km'].forEach(l => {
      if (d && d[l]) Object.assign(I18.dict[l], d[l]);
    });
    return I18;
  },
  t(key, fallback) {
    const d = I18.dict[I18.lang] || I18.dict.zh;
    if (d[key] != null) return d[key];
    if (I18.dict.zh[key] != null) return I18.dict.zh[key];
    return fallback != null ? fallback : key;
  },
  set(lang) {
    if (!I18.dict[lang]) return;
    I18.lang = lang;
    localStorage.setItem('gc_lang', lang);
    I18.apply();
    document.documentElement.lang = lang === 'zh' ? 'zh-TW' : (lang === 'km' ? 'km' : 'en');
    window.dispatchEvent(new CustomEvent('gc:langchange', { detail: { lang } }));
  },
  /** 套用到所有 [data-i] / [data-i-ph] / [data-i-title] */
  apply(root) {
    root = root || document;
    root.querySelectorAll('[data-i]').forEach(el => {
      const v = I18.t(el.getAttribute('data-i'), null);
      if (v != null) el.textContent = v;
    });
    root.querySelectorAll('[data-i-ph]').forEach(el => {
      const v = I18.t(el.getAttribute('data-i-ph'), null);
      if (v != null) el.placeholder = v;
    });
    root.querySelectorAll('[data-i-title]').forEach(el => {
      const v = I18.t(el.getAttribute('data-i-title'), null);
      if (v != null) el.title = v;
    });
  },
  /** 建立三語切換列 */
  mountSwitcher(container) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    el.innerHTML =
      '<div class="gc-lang">' +
      ['zh:中', 'en:EN', 'km:ខ្មែរ'].map(x => {
        const [k, label] = x.split(':');
        return `<button type="button" class="gc-lang-btn${I18.lang === k ? ' on' : ''}" data-lang="${k}">${label}</button>`;
      }).join('') + '</div>';
    el.querySelectorAll('.gc-lang-btn').forEach(b => {
      b.onclick = () => {
        I18.set(b.dataset.lang);
        el.querySelectorAll('.gc-lang-btn').forEach(x => x.classList.toggle('on', x === b));
      };
    });
  }
};
GC.t = (k, f) => I18.t(k, f);

/* 各舊模組本來都有自己的語言按鈕。共用列不再重複建立第二組按鈕，
   但會在使用者點擊舊模組按鈕時同步核心的三語文字。 */
(function hookLegacyLanguageButtons(){
  const selector = '.lang-btn, .lb, .lbtn, .lang-switch button, .lang-toggle button';
  document.addEventListener('click', e => {
    const b = e.target && e.target.closest ? e.target.closest(selector) : null;
    if (!b) return;
    const raw = String(b.dataset.lang || b.textContent || '').trim().toLowerCase();
    const lang = raw === 'en' || raw === 'english' ? 'en' :
      (raw === 'km' || raw.indexOf('ខ្មែរ') >= 0 || raw.indexOf('ក') >= 0 ? 'km' :
        (raw === 'zh' || raw.indexOf('中') >= 0 || raw.indexOf('中文') >= 0 ? 'zh' : ''));
    if (lang) setTimeout(() => { if (I18.lang !== lang) I18.set(lang); }, 0);
  }, true);
})();

/* ═══════════════════════════════════════════════════════════
   2. CLOUD — 安全合併，永不被少量資料覆蓋
   ═══════════════════════════════════════════════════════════ */
const CLOUD = GC.cloud = {
  gasUrl: DEFAULT_GAS_URL,
  setUrl(u) { CLOUD.gasUrl = u || DEFAULT_GAS_URL; },

  /**
   * 核心：合併兩份陣列，絕不遺失本地資料
   * 規則：
   *  1. 以 idKey 為主鍵做聯集（union），不是取代
   *  2. 兩邊都有 → 比 updatedAt，新的贏；沒有 updatedAt 就保留本地
   *  3. 只有本地有 → 一定保留（這就是防「被少的蓋掉」）
   *  4. 只有雲端有 → 加入
   * @returns {{list:Array, stat:{added:number,updated:number,kept:number,total:number}}}
   */
  merge(localArr, cloudArr, idKey, tsKey) {
    idKey = idKey || 'id';
    tsKey = tsKey || 'updatedAt';
    const L = Array.isArray(localArr) ? localArr : [];
    const C = Array.isArray(cloudArr) ? cloudArr : [];
    const map = new Map();
    const stat = { added: 0, updated: 0, kept: 0, total: 0 };

    // 先放本地（本地優先權最高，永不消失）
    L.forEach(r => {
      const k = r && r[idKey] != null ? String(r[idKey]) : U.uid('loc');
      map.set(k, r);
    });

    C.forEach(r => {
      if (!r) return;
      const k = r[idKey] != null ? String(r[idKey]) : null;
      if (k == null) { map.set(U.uid('cld'), r); stat.added++; return; }
      if (!map.has(k)) { map.set(k, r); stat.added++; return; }
      const cur = map.get(k);
      const tL = cur && cur[tsKey] ? String(cur[tsKey]) : '';
      const tC = r[tsKey] ? String(r[tsKey]) : '';
      // 雲端較新才覆蓋；平手或無時間戳 → 保留本地
      if (tC && (!tL || tC > tL)) { map.set(k, r); stat.updated++; }
      else stat.kept++;
    });

    const list = Array.from(map.values());
    stat.total = list.length;
    return { list, stat };
  },

  /** POST 到 GAS（依慣例用 text/plain） */
  async post(payload) {
    if (!CLOUD.gasUrl) throw new Error('GAS URL not set');
    const r = await fetch(CLOUD.gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const txt = await r.text();
    try { return JSON.parse(txt); } catch (e) { return { ok: false, error: txt.slice(0, 200) }; }
  },

  async get(params) {
    if (!CLOUD.gasUrl) throw new Error('GAS URL not set');
    const qs = new URLSearchParams(params || {}).toString();
    const r = await fetch(CLOUD.gasUrl + (qs ? '?' + qs : ''));
    const txt = await r.text();
    try { return JSON.parse(txt); } catch (e) { return { ok: false, error: txt.slice(0, 200) }; }
  },

  /**
   * 上傳（先下載合併再上傳，避免覆蓋別人剛存的）
   * @param {string} tool 工具識別，如 'gc_cleaning'
   * @param {Array}  localList 本地清單
   * @param {object} opt {idKey,tsKey,extra}
   */
  async legacyUpload(tool, localList, opt) {
    opt = opt || {};
    const toCloud = typeof opt.toCloud === 'function' ? opt.toCloud : (r => r);
    const fromCloud = typeof opt.fromCloud === 'function' ? opt.fromCloud : (r => r);
    const localCloudList = (localList || []).map(toCloud);
    let toSend = localCloudList;
    // 先拉雲端合併 → 保證不覆蓋他人資料
    try {
      const d = await CLOUD.get({ action: 'pull', tool });
      const cloudList = (d && d.data && d.data.list) || (d && d.list) || [];
      if (cloudList.length) {
        toSend = CLOUD.merge(localCloudList, cloudList, opt.idKey, opt.tsKey).list;
      }
    } catch (e) { /* 拉不到就直接送本地，不阻擋 */ }

    const extra = typeof opt.extra === 'function' ? (opt.extra() || {}) : (opt.extra || {});
    const res = await CLOUD.post(Object.assign({
      type: 'save', tool, updatedAt: U.now(), list: toSend
    }, extra));
    return { res, list: toSend.map(fromCloud) };
  },

  /** 下載 + 安全合併（回傳合併後清單，不直接覆蓋） */
  async legacyDownload(tool, localList, opt) {
    opt = opt || {};
    const d = await CLOUD.get({ action: 'pull', tool });
    const rawCloudList = (d && d.data && d.data.list) || (d && d.list) || [];
    const cloudList = (rawCloudList || []).map(typeof opt.fromCloud === 'function' ? opt.fromCloud : (r => r));
    if (!cloudList.length) return { list: localList, stat: null, empty: true, response: (d && d.data) || d };
    const m = CLOUD.merge(localList, cloudList, opt.idKey, opt.tsKey);
    return { list: m.list, stat: m.stat, empty: false, response: (d && d.data) || d };
  },

  /**
   * HRA Pay v3.3 同款智慧增量同步。新版 GAS 可用 manifest/bucket 時只傳有變動的月份；
   * 若網頁先更新、GAS 尚未重部署，會自動退回舊式安全合併，不會中斷現場作業。
   */
  async upload(tool, localList, opt) {
    try { return await SMART.upload(tool, localList, opt || {}); }
    catch (e) {
      if (e && e.smartUnsupported) return CLOUD.legacyUpload(tool, localList, opt || {});
      throw e;
    }
  },

  async download(tool, localList, opt) {
    try { return await SMART.download(tool, localList, opt || {}); }
    catch (e) {
      if (e && e.smartUnsupported) return CLOUD.legacyDownload(tool, localList, opt || {});
      throw e;
    }
  },

  /**
   * 即時上傳單張照片到 Drive，回傳連結（可選用：存檔前先轉換大照片）
   * @returns {Promise<string>} Drive 連結，失敗回原 dataUrl
   */
  async uploadPhoto(dataUrl, tool, recId, idx) {
    if (typeof dataUrl !== 'string' || dataUrl.indexOf('data:image') !== 0) return dataUrl;
    try {
      const r = await CLOUD.post({ action: 'uploadPhoto', dataUrl, tool, recId, idx: idx || 0 });
      return (r && r.ok && (r.url || (r.data && r.data.url))) || dataUrl;
    } catch (e) { return dataUrl; }
  },

  /** 批次：把一組照片裡的 base64 換成 Drive 連結 */
  async uploadPhotos(photos, tool, recId) {
    if (!Array.isArray(photos)) return photos;
    const out = [];
    for (let i = 0; i < photos.length; i++) out.push(await CLOUD.uploadPhoto(photos[i], tool, recId, i));
    return out;
  },

  /** Telegram 通知（HTML 模式 + escape） */
  async notify(text) {
    return CLOUD.post({ type: 'notify', parse_mode: 'HTML', text });
  }
};

/* ═══════════════════════════════════════════════════════════
   2.5 SMART SYNC — HRA Pay v3.3 manifest / month bucket model
   · 先讀小型 manifest，比對後只上下載變動 bucket
   · 雲端獨有歷史永遠保留；手機短資料不會覆蓋完整雲端
   · 照片先轉 Drive 連結，避免重傳 base64 與 Sheet 配額
   · sync state / pending marker 都是小設定，可留 localStorage
   ═══════════════════════════════════════════════════════════ */
const SMART = GC.smartSync = (() => {
  const VERSION = '1.0';
  const STATE_PREFIX = 'ac_gc_smart_sync_v1_';
  const DATE_FIELDS = ['_syncPeriod','period','periodKey','date','d','recordDate','reportDate','purchase_date','issue_date','datetime','return_date','ts','yearMonth','month'];

  function text(v) { return String(v == null ? '' : v); }
  function stable(v) {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (typeof v === 'object') return '{' + Object.keys(v).sort().filter(function (k) {
      return !/^_smart/.test(k) && !/^(updatedAt|createdAt|savedAt|modifiedAt|timestamp|cloudUpdatedAt|lastCloudUpdatedAt)$/.test(k);
    }).map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
    return JSON.stringify(text(v));
  }
  function fnv(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }
  async function hash(str) {
    try {
      if (global.crypto && global.crypto.subtle && global.TextEncoder) {
        const b = await global.crypto.subtle.digest('SHA-256', new global.TextEncoder().encode(str));
        return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 24);
      }
    } catch (e) {}
    return fnv(str) + '_' + str.length.toString(36);
  }
  function normDate(v, row) {
    if (v instanceof Date && !isNaN(v)) return U.ymd(v);
    const s = text(v).trim();
    let m = s.match(/(20\d{2})[-\/.](\d{1,2})(?:[-\/.](\d{1,2}))?/);
    if (m) return m[1] + '-' + String(+m[2]).padStart(2, '0') + (m[3] ? '-' + String(+m[3]).padStart(2, '0') : '');
    m = s.match(/(\d{1,2})[-\/.](\d{1,2})[-\/.](20\d{2})/);
    if (m) return m[3] + '-' + String(+m[2]).padStart(2, '0') + '-' + String(+m[1]).padStart(2, '0');
    if (row && /^20\d{2}$/.test(text(row.year)) && Number(row.month) >= 1 && Number(row.month) <= 12) {
      return text(row.year) + '-' + String(Number(row.month)).padStart(2, '0');
    }
    return '';
  }
  function recordDate(row, opt) {
    const fields = [];
    if (opt && opt.dateField) fields.push(opt.dateField);
    DATE_FIELDS.forEach(k => { if (!fields.includes(k)) fields.push(k); });
    for (let i = 0; i < fields.length; i++) {
      const d = normDate(row && row[fields[i]], row);
      if (d) return d;
    }
    return '';
  }
  function semanticKey(row, opt) {
    if (!row || typeof row !== 'object') return stable(row);
    const keys = [opt && opt.idKey, '_syncId', '_k', 'id', 'uuid', 'recordId', 'code'].filter(Boolean);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (row[k] !== undefined && row[k] !== null && row[k] !== '') return k + ':' + text(row[k]);
    }
    const d = recordDate(row, opt), parts = [];
    ['type','kind','module','sourceType','zone','z','locId','name','supplier'].forEach(function (k) {
      if (row[k] !== undefined && row[k] !== null && row[k] !== '') parts.push(k + '=' + text(row[k]));
    });
    if (d) parts.unshift('date=' + d);
    return parts.length ? parts.join('|') : stable(row);
  }
  function bucketKey(row, opt) {
    if (row && row._syncBucket) return text(row._syncBucket);
    const d = recordDate(row, opt);
    if (d) return 'm:' + d.slice(0, 7);
    return 'h:' + ('0' + (parseInt(fnv(semanticKey(row, opt)), 16) % 32).toString(16)).slice(-2);
  }
  function stamp(x, opt) {
    const fields = [opt && opt.tsKey, 'updatedAt','savedAt','modifiedAt','createdAt','timestamp'].filter(Boolean);
    for (let i = 0; i < fields.length; i++) {
      const v = x && x[fields[i]];
      if (v) { const n = new Date(v).getTime(); if (!isNaN(n)) return n; }
    }
    return 0;
  }
  function mergeRows(a, b, opt) {
    const map = new Map(), order = [];
    (a || []).concat(b || []).forEach(function (row) {
      const key = semanticKey(row, opt);
      if (!map.has(key)) { order.push(key); map.set(key, row); return; }
      const old = map.get(key), ta = stamp(old, opt), tb = stamp(row, opt);
      if (tb > ta || (tb === ta && stable(row).length > stable(old).length)) map.set(key, Object.assign({}, old, row));
      else map.set(key, Object.assign({}, row, old));
    });
    return order.map(k => map.get(k));
  }
  function sortRows(rows, opt) {
    return (rows || []).slice().sort(function (a, b) {
      const ka = semanticKey(a, opt), kb = semanticKey(b, opt);
      return ka < kb ? -1 : ka > kb ? 1 : stable(a) < stable(b) ? -1 : 1;
    });
  }
  async function buildBuckets(records, opt) {
    const groups = {}, out = {};
    (records || []).forEach(function (r) { const k = bucketKey(r, opt); (groups[k] || (groups[k] = [])).push(r); });
    await Promise.all(Object.keys(groups).sort().map(async function (k) {
      const rows = sortRows(groups[k], opt);
      out[k] = { key:k, records:rows, count:rows.length, hash:await hash(stable(rows)) };
    }));
    return out;
  }
  function readState(tool) { try { return JSON.parse(localStorage.getItem(STATE_PREFIX + tool) || 'null'); } catch (e) { return null; } }
  function writeState(tool, value) { try { localStorage.setItem(STATE_PREFIX + tool, JSON.stringify(value)); } catch (e) {} }
  function dataOf(j) { return j && j.data !== undefined ? j.data : j; }
  function unsupported(message) { const e = new Error(message || 'Smart sync endpoint unavailable'); e.smartUnsupported = true; return e; }
  async function manifest(tool) {
    const d = dataOf(await CLOUD.get({ action:'smartManifest', tool:tool }));
    if (!d || typeof d.exists !== 'boolean') throw unsupported();
    return d;
  }
  function monthsOf(records, opt) {
    const m = new Set();
    (records || []).forEach(function (r) { const d = recordDate(r, opt); if (d) m.add(d.slice(0, 7)); });
    return Array.from(m).sort();
  }
  async function preparePhotos(records, tool, opt) {
    const field = opt.photoField || 'photos';
    return Promise.all((records || []).map(async function (row) {
      const photos = U.asArray(row && row[field]);
      if (!photos.some(p => typeof p === 'string' && p.indexOf('data:image/') === 0)) return row;
      const copy = Object.assign({}, row);
      copy[field] = await CLOUD.uploadPhotos(photos, tool, row && row[opt.idKey || 'id']);
      return copy;
    }));
  }
  async function legacyPull(tool, opt) {
    const d = await CLOUD.get({ action:'pull', tool:tool });
    const raw = (d && d.data && d.data.list) || (d && d.list) || [];
    return { records:Array.isArray(raw) ? raw : [], meta:dataOf(d) || {} };
  }
  async function pushPrepared(tool, records, opt, remote, migrated) {
    const local = await buildBuckets(records, opt);
    const last = readState(tool) || {}, lastH = migrated ? {} : (last.hashes || {});
    const remoteH = migrated ? {} : (remote.hashes || {}), changed = [], remoteChanged = [], conflicts = [];
    const keys = new Set(Object.keys(local).concat(Object.keys(remoteH)));
    keys.forEach(function (k) {
      const lh = local[k] && local[k].hash || '', rh = remoteH[k] || '', base = lastH[k] || '';
      if (lh && rh && lh === rh) return;
      if (!base) {
        if (lh && !rh) changed.push(k);
        else if (!lh && rh) remoteChanged.push(k);
        else if (lh && rh && lh !== rh) conflicts.push(k);
        return;
      }
      const lc = lh !== base, rc = rh !== base;
      if (lc && !rc && lh) changed.push(k);
      else if (!lc && rc) remoteChanged.push(k);
      else if (lc && rc && lh !== rh) conflicts.push(k);
    });
    if (!migrated && (remoteChanged.length || conflicts.length)) {
      return { ok:false, needsPull:true, remoteChanged:remoteChanged, conflicts:conflicts };
    }
    const uploadId = 'gc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    let uploaded = 0;
    for (let i = 0; i < changed.length; i++) {
      const b = local[changed[i]];
      const r = await CLOUD.post({ action:'smartBucket', tool:tool, uploadId:uploadId, bucket:b.key, hash:b.hash, count:b.count, records:b.records });
      if (!r || r.ok === false) throw new Error((r && r.error) || 'Smart bucket upload failed');
      uploaded += b.count;
    }
    const hashes = {}, counts = {};
    Object.keys(local).forEach(function (k) { hashes[k] = local[k].hash; counts[k] = local[k].count; });
    Object.keys(remoteH).forEach(function (k) { if (!hashes[k]) { hashes[k] = remoteH[k]; counts[k] = Number((remote.counts || {})[k]) || 0; } });
    const meta = Object.assign({}, typeof opt.extra === 'function' ? (opt.extra() || {}) : (opt.extra || {}), {
      periods: monthsOf(records, opt), _smartMetaHash: await hash(stable(typeof opt.extra === 'function' ? (opt.extra() || {}) : (opt.extra || {})))
    });
    const metaChanged = migrated || changed.length || meta._smartMetaHash !== (remote.metaHash || '');
    if (!metaChanged) {
      writeState(tool, { hashes:remoteH, counts:remote.counts || {}, metaHash:remote.metaHash || '', updatedAt:U.now() });
      return { ok:true, skipped:true, uploaded:0, unchanged:records.length, changedBuckets:0, records:records };
    }
    const commit = await CLOUD.post({ action:'smartCommit', tool:tool, uploadId:uploadId, hashes:hashes, counts:counts,
      recordCount:Object.keys(counts).reduce((n, k) => n + (Number(counts[k]) || 0), 0), meta:meta,
      reportPeriod:meta.reportPeriod, reportRef:meta.reportRef, reportMonth:meta.reportMonth,
      reportScope:meta.reportScope, reportSlot:meta.reportSlot, reportLanguage:meta.reportLanguage });
    if (!commit || commit.ok === false) throw new Error((commit && commit.error) || 'Smart commit failed');
    const ts = (dataOf(commit) && (dataOf(commit).timestamp || dataOf(commit).updatedAt)) || U.now();
    writeState(tool, { hashes:hashes, counts:counts, metaHash:meta._smartMetaHash, updatedAt:ts });
    return { ok:true, uploaded:uploaded, unchanged:Math.max(0, records.length - uploaded), changedBuckets:changed.length, migrated:!!migrated, records:records, response:commit };
  }
  async function upload(tool, localList, opt) {
    opt = opt || {};
    const toCloud = typeof opt.toCloud === 'function' ? opt.toCloud : (r => r);
    const fromCloud = typeof opt.fromCloud === 'function' ? opt.fromCloud : (r => r);
    let records = (localList || []).map(toCloud);
    records = await preparePhotos(records, tool, opt);
    let remote = await manifest(tool), migrated = false;
    if (!remote.exists && remote.legacy) {
      const old = await legacyPull(tool, opt);
      records = mergeRows(records, old.records, opt);
      if (typeof opt.onRemote === 'function') opt.onRemote(old.meta || {});
      migrated = true;
    }
    let result = await pushPrepared(tool, records, opt, remote, migrated);
    if (result.needsPull) {
      const pulled = await download(tool, records, Object.assign({}, opt, { _cloudInput:true }));
      const mergedCloud = (pulled.list || []).map(toCloud);
      remote = await manifest(tool);
      result = await pushPrepared(tool, mergedCloud, opt, remote, false);
      records = mergedCloud;
    }
    result.list = records.map(fromCloud);
    result.res = Object.assign({ ok:true, smart:true }, dataOf(result.response) || {}, result);
    return result;
  }
  async function download(tool, localList, opt) {
    opt = opt || {};
    const toCloud = typeof opt.toCloud === 'function' ? opt.toCloud : (r => r);
    const fromCloud = typeof opt.fromCloud === 'function' ? opt.fromCloud : (r => r);
    let localRows = opt._cloudInput ? (localList || []) : (localList || []).map(toCloud);
    const remote = await manifest(tool);
    if (!remote.exists && remote.legacy) {
      const old = await legacyPull(tool, opt);
      const merged = mergeRows(localRows, old.records, opt);
      const migrated = await pushPrepared(tool, merged, opt, remote, true);
      return { list:merged.map(fromCloud), stat:{added:old.records.length,updated:0,kept:localRows.length,total:merged.length}, empty:false,
        response:Object.assign({smart:true,migrated:true},old.meta||{}), downloaded:old.records.length, uploaded:migrated.uploaded || 0 };
    }
    if (!remote.exists) return { list:(localRows || []).map(fromCloud), stat:null, empty:true, response:remote, downloaded:0 };
    const local = await buildBuckets(localRows, opt), out = {}, remoteH = remote.hashes || {};
    let downloaded = 0, unchanged = 0, pending = 0;
    const keys = Array.from(new Set(Object.keys(remoteH).concat(Object.keys(local)))).sort();
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i], lb = local[k], rh = remoteH[k] || '';
      if (lb && rh && lb.hash === rh) { out[k] = lb.records; unchanged += lb.count; continue; }
      if (lb && !rh) { out[k] = lb.records; pending += lb.count; continue; }
      if (!rh) continue;
      const bd = dataOf(await CLOUD.get({ action:'smartBucket', tool:tool, bucket:k })) || {};
      const rows = Array.isArray(bd.records) ? bd.records : [];
      downloaded += rows.length;
      out[k] = lb ? mergeRows(lb.records, rows, opt) : rows;
    }
    const merged = sortRows(Object.keys(out).reduce((a, k) => a.concat(out[k] || []), []), opt);
    writeState(tool, { hashes:remoteH, counts:remote.counts || {}, metaHash:remote.metaHash || '', updatedAt:U.now() });
    return { list:merged.map(fromCloud), stat:{added:downloaded,updated:0,kept:unchanged,total:merged.length}, empty:false,
      response:Object.assign({smart:true}, remote.meta || {}, {data:Object.assign({list:merged}, remote.meta || {})}), downloaded:downloaded,
      unchanged:unchanged, pendingUpload:pending };
  }
  return { version:VERSION, upload, download, buildBuckets, mergeRows, semanticKey, bucketKey, stable, hash, readState };
})();

/* ═══════════════════════════════════════════════════════════
   3. PHOTO — 拍照 / 選檔 / 壓縮 / 縮圖
   ═══════════════════════════════════════════════════════════ */
const PHOTO = GC.photo = {
  MAX_W: 1024,
  QUALITY: 0.72,

  /** File → 壓縮後 base64 dataURL */
  compress(file, maxW, quality) {
    maxW = maxW || PHOTO.MAX_W;
    quality = quality || PHOTO.QUALITY;
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('not an image'));
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('read fail'));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('decode fail'));
        img.onload = () => {
          let w = img.width, h = img.height;
          if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(cv.toDataURL('image/jpeg', quality));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  },

  /**
   * 掛載照片欄位
   * @param {string|Element} mountEl 容器
   * @param {object} opt {photos:[], max:4, onChange(photos)}
   */
  mount(mountEl, opt) {
    const el = typeof mountEl === 'string' ? document.querySelector(mountEl) : mountEl;
    if (!el) return null;
    opt = opt || {};
    let photos = U.asArray(opt.photos).slice();
    const max = opt.max || 4;
    const id = U.uid('ph');

    function render() {
      el.innerHTML =
        `<div class="gc-photo-wrap">
           <div class="gc-photo-list">
             ${photos.map((p, i) => `
               <div class="gc-photo-item">
                 <img src="${p}" alt="photo ${i + 1}" data-idx="${i}" class="gc-photo-thumb">
                 <button type="button" class="gc-photo-del" data-del="${i}" title="${U.escapeHtml(I18.t('gc.removePhoto'))}">✕</button>
               </div>`).join('')}
             ${photos.length < max ? `
               <label class="gc-photo-add" for="${id}">
                 <span class="gc-photo-add-ic">📷</span>
                 <span class="gc-photo-add-tx">${U.escapeHtml(I18.t('gc.addPhoto'))}</span>
               </label>` : ''}
           </div>
           <input type="file" id="${id}" accept="image/*" capture="environment" multiple hidden>
         </div>`;

      const input = el.querySelector('#' + id);
      if (input) input.onchange = async e => {
        const files = Array.from(e.target.files || []);
        for (const f of files) {
          if (photos.length >= max) break;
          try { photos.push(await PHOTO.compress(f)); }
          catch (err) { console.warn('photo', err); }
        }
        e.target.value = '';
        render(); if (opt.onChange) opt.onChange(photos);
      };
      el.querySelectorAll('[data-del]').forEach(b => {
        b.onclick = () => {
          photos.splice(+b.dataset.del, 1);
          render(); if (opt.onChange) opt.onChange(photos);
        };
      });
      el.querySelectorAll('.gc-photo-thumb').forEach(im => {
        im.onclick = () => PHOTO.lightbox(photos, +im.dataset.idx);
      });
    }
    render();
    const rerenderOnLanguage = function () { render(); };
    global.addEventListener('gc:langchange', rerenderOnLanguage);
    return {
      get: () => photos.slice(),
      set: arr => { photos = (arr || []).slice(); render(); },
      clear: () => { photos = []; render(); },
      destroy: () => { global.removeEventListener('gc:langchange', rerenderOnLanguage); }
    };
  },

  /** 全螢幕看圖 */
  lightbox(photos, idx) {
    idx = idx || 0;
    const bg = document.createElement('div');
    bg.className = 'gc-lightbox';
    function draw() {
      bg.innerHTML =
        `<button class="gc-lb-close" type="button">✕</button>
         ${photos.length > 1 ? '<button class="gc-lb-prev" type="button">‹</button>' : ''}
         <img src="${photos[idx]}" alt="photo">
         ${photos.length > 1 ? '<button class="gc-lb-next" type="button">›</button>' : ''}
         <div class="gc-lb-count">${idx + 1} / ${photos.length}</div>`;
      bg.querySelector('.gc-lb-close').onclick = () => bg.remove();
      const p = bg.querySelector('.gc-lb-prev'), n = bg.querySelector('.gc-lb-next');
      if (p) p.onclick = e => { e.stopPropagation(); idx = (idx - 1 + photos.length) % photos.length; draw(); };
      if (n) n.onclick = e => { e.stopPropagation(); idx = (idx + 1) % photos.length; draw(); };
    }
    draw();
    bg.onclick = e => { if (e.target === bg) bg.remove(); };
    document.body.appendChild(bg);
  },

  /** 表格用小縮圖 */
  cell(photos) {
    photos = U.asArray(photos);
    if (!photos || !photos.length) return `<span class="gc-dim">—</span>`;
    return `<span class="gc-photo-cell" data-photos='${U.escapeHtml(JSON.stringify(photos))}'>📷 ${photos.length}</span>`;
  }
};
// 表格縮圖點擊（事件委派，window scope 安全）
document.addEventListener('click', e => {
  const c = e.target.closest && e.target.closest('.gc-photo-cell');
  if (!c) return;
  try { PHOTO.lightbox(JSON.parse(c.dataset.photos), 0); } catch (err) {}
});

/* ═══════════════════════════════════════════════════════════
   4. WEATHER — 天氣狀態（temperature 模組用）
   ═══════════════════════════════════════════════════════════ */
GC.weather = {
  OPTIONS: [
    { key: 'sunny',     icon: '☀️', i: 'gc.sunny'     },
    { key: 'cloudy',    icon: '⛅', i: 'gc.cloudy'    },
    { key: 'rain',      icon: '🌧️', i: 'gc.rain'      },
    { key: 'heavyRain', icon: '⛈️', i: 'gc.heavyRain' },
    { key: 'storm',     icon: '🌩️', i: 'gc.storm'     },
    { key: 'hot',       icon: '🔥', i: 'gc.hot'       },
    { key: 'humid',     icon: '💧', i: 'gc.humid'     }
  ],
  label(key) {
    const o = GC.weather.OPTIONS.find(x => x.key === key);
    return o ? o.icon + ' ' + I18.t(o.i) : '—';
  },
  icon(key) {
    const o = GC.weather.OPTIONS.find(x => x.key === key);
    return o ? o.icon : '';
  },
  /** 建立天氣選擇器（chip 樣式） */
  mount(mountEl, opt) {
    const el = typeof mountEl === 'string' ? document.querySelector(mountEl) : mountEl;
    if (!el) return null;
    opt = opt || {};
    let val = opt.value || '';
    function render() {
      el.innerHTML = '<div class="gc-weather">' +
        GC.weather.OPTIONS.map(o =>
          `<button type="button" class="gc-wx-btn${val === o.key ? ' on' : ''}" data-wx="${o.key}">
             <span class="gc-wx-ic">${o.icon}</span>
             <span class="gc-wx-tx">${U.escapeHtml(I18.t(o.i))}</span>
           </button>`).join('') + '</div>';
      el.querySelectorAll('[data-wx]').forEach(b => {
        b.onclick = () => {
          val = (val === b.dataset.wx) ? '' : b.dataset.wx;
          render(); if (opt.onChange) opt.onChange(val);
        };
      });
    }
    render();
    window.addEventListener('gc:langchange', render);
    return { get: () => val, set: v => { val = v || ''; render(); } };
  }
};

/* ═══════════════════════════════════════════════════════════
   5. PERIOD — 日 / 週 / 月 / 年 篩選
   ═══════════════════════════════════════════════════════════ */
const PERIOD = GC.period = {
  /** 取得期間起訖（本地時間） */
  range(mode, ref) {
    const d = ref ? new Date(ref) : new Date();
    const y = d.getFullYear(), m = d.getMonth(), dd = d.getDate();
    let from, to;
    switch (mode) {
      case 'day':   from = new Date(y, m, dd);       to = new Date(y, m, dd + 1); break;
      case 'week': {
        const off = (d.getDay() + 6) % 7;            // 週一為起始
        from = new Date(y, m, dd - off);             to = new Date(y, m, dd - off + 7); break;
      }
      case 'month': from = new Date(y, m, 1);        to = new Date(y, m + 1, 1); break;
      case 'year':  from = new Date(y, 0, 1);        to = new Date(y + 1, 0, 1); break;
      default:      return null;                     // 'all'
    }
    return { from, to, fromYmd: U.ymd(from), toYmd: U.ymd(new Date(to - 86400000)) };
  },

  /** 篩選陣列 */
  filter(list, mode, dateField, ref) {
    if (!Array.isArray(list)) return [];
    if (!mode || mode === 'all') return list.slice();
    const r = PERIOD.range(mode, ref);
    if (!r) return list.slice();
    const f = dateField || 'date';
    return list.filter(x => {
      const raw = x && x[f];
      if (!raw) return false;
      const t = new Date(raw);
      if (isNaN(t)) return false;
      return t >= r.from && t < r.to;
    });
  },

  /** 建立日/週/月/年切換列 */
  mount(mountEl, opt) {
    const el = typeof mountEl === 'string' ? document.querySelector(mountEl) : mountEl;
    if (!el) return null;
    opt = opt || {};
    let mode = opt.value || 'month';
    const modes = opt.modes || ['day', 'week', 'month', 'year', 'all'];
    // 期間按鈕採用 HRA Pay／Temperature 的直覺標籤：日、週、月、年、全部。
    // 基準日期與前後按鈕另行控制，避免「今日／本週」和基準日期混在一起。
    const LB = { day: 'gc.day', week: 'gc.week', month: 'gc.month', year: 'gc.year', all: 'gc.all' };
    function render() {
      el.innerHTML = '<div class="gc-period">' +
        modes.map(m =>
          `<button type="button" class="gc-pd-btn${mode === m ? ' on' : ''}" data-pd="${m}">${U.escapeHtml(I18.t(LB[m]))}</button>`
        ).join('') + '</div>';
      el.querySelectorAll('[data-pd]').forEach(b => {
        b.onclick = () => { mode = b.dataset.pd; render(); if (opt.onChange) opt.onChange(mode); };
      });
    }
    render();
    window.addEventListener('gc:langchange', render);
    return { get: () => mode, set: v => { mode = v; render(); } };
  }
};

/* ═══════════════════════════════════════════════════════════
   6. SMART IMPORT — Excel / CSV 拖放 + 欄位模糊對應
   ═══════════════════════════════════════════════════════════ */
const IMPORT = GC.import = {
  /** 標題模糊比對：去空白/符號/大小寫 */
  norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[\s_\-/()（）：:.]/g, '').trim();
  },

  /**
   * 依 schema 自動對應欄位
   * @param {Array} headers 原始標題列
   * @param {Object} schema {field:[候選名1,候選名2,...]}
   * @returns {Object} {field: colIndex}
   */
  autoMap(headers, schema) {
    const H = headers.map(IMPORT.norm);
    const out = {};
    Object.keys(schema).forEach(field => {
      const cands = schema[field].map(IMPORT.norm);
      let idx = -1;
      // 完全相等優先
      for (let i = 0; i < H.length && idx < 0; i++)
        if (cands.includes(H[i])) idx = i;
      // 再退而求其次：包含
      for (let i = 0; i < H.length && idx < 0; i++)
        if (cands.some(c => c && (H[i].includes(c) || c.includes(H[i])))) idx = i;
      out[field] = idx;
    });
    return out;
  },

  /** 解析檔案 → {headers, rows}；有 schema 時會跨工作表找最佳標題列。 */
  parse(file, schema) {
    return new Promise((resolve, reject) => {
      if (typeof XLSX === 'undefined') return reject(new Error('SheetJS (XLSX) not loaded'));
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('read fail'));
      fr.onload = e => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array', cellDates: false, raw: true });
          const fields = schema && typeof schema === 'object' ? Object.keys(schema) : [];
          let best = null;
          wb.SheetNames.forEach(sheetName => {
            const ws = wb.Sheets[sheetName];
            const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
            const nonEmpty = aoa.filter(r => r.some(c => String(c).trim() !== ''));
            if (!nonEmpty.length) return;
            if (!fields.length) {
              if (!best) best = { score: 0, headers: nonEmpty[0], rows: nonEmpty.slice(1), sheetName };
              return;
            }
            const limit = Math.min(nonEmpty.length, 40);
            for (let ri = 0; ri < limit; ri++) {
              const headers = nonEmpty[ri].map(x => String(x == null ? '' : x));
              const map = IMPORT.autoMap(headers, schema);
              const matched = Object.keys(map).filter(k => map[k] >= 0).length;
              if (matched && (!best || matched > best.score)) {
                best = { score: matched, headers, rows: nonEmpty.slice(ri + 1), sheetName };
              }
            }
          });
          if (!best) return reject(new Error('empty file or no matching headers'));
          resolve({ headers: best.headers, rows: best.rows, sheetName: best.sheetName });
        } catch (err) { reject(err); }
      };
      fr.readAsArrayBuffer(file);
    });
  },

  /**
   * 掛載智慧匯入框
   * @param {string|Element} mountEl
   * @param {object} opt {schema, onData(objects, meta), accept}
   */
  mount(mountEl, opt) {
    const el = typeof mountEl === 'string' ? document.querySelector(mountEl) : mountEl;
    if (!el) return null;
    opt = opt || {};
    const id = U.uid('imp');
    const accept = opt.accept || '.xlsx,.xls,.xlsb,.csv';

    el.innerHTML =
      `<div class="gc-import" id="${id}_dz">
         <div class="gc-import-ic">📊</div>
         <div class="gc-import-t" data-i="gc.smartImport">${U.escapeHtml(I18.t('gc.smartImport'))}</div>
         <div class="gc-import-d" data-i="gc.dropHere">${U.escapeHtml(I18.t('gc.dropHere'))}</div>
         <div class="gc-import-h" data-i="gc.supportFmt">${U.escapeHtml(I18.t('gc.supportFmt'))}</div>
         <input type="file" id="${id}" accept="${accept}"${opt.multiple === false ? '' : ' multiple'} hidden>
       </div>
       <div class="gc-import-status" id="${id}_st"></div>`;

    const dz = el.querySelector('#' + id + '_dz');
    const input = el.querySelector('#' + id);
    const st = el.querySelector('#' + id + '_st');

    function status(msg, cls) {
      st.className = 'gc-import-status' + (cls ? ' ' + cls : '');
      st.textContent = msg || '';
    }

    async function handle(files) {
      const list = Array.isArray(files) ? files.filter(Boolean) : (files ? [files] : []);
      if (!list.length) return;
      status(I18.t('gc.importing') + ' 0/' + list.length, 'busy');
      const allObjects = [];
      const metas = [];
      const errors = [];
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        try {
          const schema = opt.schema || {};
          const parsed = typeof opt.parse === 'function'
            ? await opt.parse(file, schema)
            : await IMPORT.parse(file, schema);
          const headers = parsed.headers || [];
          const sheetName = parsed.sheetName || '';
          const map = parsed.map || IMPORT.autoMap(headers, schema);
          const objects = Array.isArray(parsed.objects) ? parsed.objects : (parsed.rows || []).map(r => {
            const o = {};
            Object.keys(map).forEach(f => { o[f] = map[f] >= 0 ? r[map[f]] : ''; });
            o._raw = r;
            return o;
          }).filter(o => Object.keys(schema).some(f => String(o[f]).trim() !== ''));
          allObjects.push(...objects);
          metas.push(Object.assign({}, parsed, { headers, map, sheetName, fileName: file.name, objectCount: objects.length }));
          status(I18.t('gc.importing') + ' ' + (i + 1) + '/' + list.length + ' · ' + file.name, 'busy');
        } catch (err) {
          errors.push(file.name + ': ' + (err && err.message ? err.message : err));
          status(I18.t('gc.importing') + ' ' + (i + 1) + '/' + list.length + ' · ' + file.name, 'busy');
        }
      }
      if (!allObjects.length && errors.length) {
        status('❌ ' + I18.t('gc.importFail') + ': ' + errors.join(' | '), 'err');
        return;
      }
      const fileNames = metas.map(m => m.fileName).join(', ');
      const warnings = [];
      metas.forEach(function (m) {
        const list = m && m.summary && Array.isArray(m.summary.warnings) ? m.summary.warnings : [];
        list.forEach(function (w) { if (w && !warnings.includes(String(w))) warnings.push(String(w)); });
      });
      status('✅ ' + allObjects.length + ' ' + I18.t('gc.imported') +
        (metas.length > 1 ? ' · ' + metas.length + ' files' : '') +
        (errors.length ? ' · ' + errors.length + ' failed' : '') +
        (warnings.length ? ' · ⚠️ ' + warnings.join(' | ') : ''), (errors.length || warnings.length) ? 'warning' : 'ok');
      if (opt.onData) {
        const first = metas[0] || {};
        opt.onData(allObjects, Object.assign({}, first, {
          fileName: fileNames,
          files: metas,
          fileCount: metas.length,
          errors: errors
        }));
      }
    }

    dz.onclick = () => input.click();
    input.onchange = e => { handle(Array.from(e.target.files || [])); e.target.value = ''; };
    ['dragenter', 'dragover'].forEach(ev =>
      dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev =>
      dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', e => {
      const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      if (files.length) handle(files);
    });

    return { status, reset: () => status('') };
  }
};

/* ═══════════════════════════════════════════════════════════
   7. DASHBOARD — 統計卡 + 迷你長條圖
   ═══════════════════════════════════════════════════════════ */
GC.dash = {
  /**
   * @param {string|Element} mountEl
   * @param {object} cfg {cards:[{label,value,sub,color}], bars:{title,data:[{label,value}]}}
   */
  render(mountEl, cfg) {
    const el = typeof mountEl === 'string' ? document.querySelector(mountEl) : mountEl;
    if (!el) return;
    cfg = cfg || {};
    const cards = cfg.cards || [];
    let html = '';

    if (cards.length) {
      html += '<div class="gc-dash-cards">' + cards.map(c =>
        `<div class="gc-dash-card"${c.color ? ` style="--gc-c:${c.color}"` : ''}>
           <div class="gc-dash-v">${U.escapeHtml(c.value)}</div>
           <div class="gc-dash-l">${U.escapeHtml(c.label)}</div>
           ${c.sub ? `<div class="gc-dash-s">${U.escapeHtml(c.sub)}</div>` : ''}
         </div>`).join('') + '</div>';
    }

    if (cfg.bars && cfg.bars.data && cfg.bars.data.length) {
      const data = cfg.bars.data;
      const max = Math.max(...data.map(d => Number(d.value) || 0), 1);
      html += `<div class="gc-dash-bars">
        ${cfg.bars.title ? `<div class="gc-dash-bt">${U.escapeHtml(cfg.bars.title)}</div>` : ''}
        ${data.map(d => {
          const pct = Math.round((Number(d.value) || 0) / max * 100);
          return `<div class="gc-bar-row">
            <div class="gc-bar-l">${U.escapeHtml(d.label)}</div>
            <div class="gc-bar-track"><div class="gc-bar-fill" style="width:${pct}%${d.color ? `;background:${d.color}` : ''}"></div></div>
            <div class="gc-bar-v">${U.escapeHtml(d.value)}</div>
          </div>`;
        }).join('')}
      </div>`;
    }

    el.innerHTML = html || `<div class="gc-empty">${U.escapeHtml(I18.t('gc.noData'))}</div>`;
  },

  /** 依期間彙總，回傳給 bars 用的資料 */
  groupBy(list, keyFn, valFn) {
    const m = new Map();
    (list || []).forEach(r => {
      const k = keyFn(r); if (k == null || k === '') return;
      m.set(k, (m.get(k) || 0) + (valFn ? (Number(valFn(r)) || 0) : 1));
    });
    return Array.from(m, ([label, value]) => ({ label, value }))
                .sort((a, b) => b.value - a.value);
  }
};

/* ═══════════════════════════════════════════════════════════
   8. TOAST
   ═══════════════════════════════════════════════════════════ */
GC.toast = function (msg, type) {
  let box = document.getElementById('gc-toast-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'gc-toast-box'; box.className = 'gc-toast-box';
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = 'gc-toast' + (type ? ' ' + type : '');
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 2800);
};

/* ═══════════════════════════════════════════════════════════
   9. STYLES — 自動注入（淺色背景，符合現有視覺）
   ═══════════════════════════════════════════════════════════ */
const CSS = `
.gc-lang{display:inline-flex;gap:2px;background:#EEF1F6;border-radius:8px;padding:3px}
.gc-lang-btn{border:0;background:transparent;padding:5px 11px;border-radius:6px;font:600 12px/1 inherit;color:#5A6478;cursor:pointer;transition:.15s}
.gc-lang-btn.on{background:#fff;color:#1A3E78;box-shadow:0 1px 3px rgba(0,0,0,.1)}
.gc-lang-btn:hover:not(.on){color:#1A3E78}

.gc-period{display:inline-flex;gap:5px;flex-wrap:wrap}
.gc-pd-btn{border:1px solid #D8DCE6;background:#fff;padding:6px 13px;border-radius:20px;font:500 12px/1 inherit;color:#4A5472;cursor:pointer;transition:.15s}
.gc-pd-btn:hover{border-color:#1A3E78;color:#1A3E78}
.gc-pd-btn.on{background:#1A3E78;border-color:#1A3E78;color:#fff}

.gc-photo-list{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.gc-photo-item{position:relative;width:66px;height:66px;border-radius:8px;overflow:hidden;border:1px solid #D8DCE6}
.gc-photo-thumb{width:100%;height:100%;object-fit:cover;cursor:zoom-in;display:block}
.gc-photo-del{position:absolute;top:2px;right:2px;width:19px;height:19px;border:0;border-radius:50%;background:rgba(0,0,0,.62);color:#fff;font-size:11px;line-height:1;cursor:pointer;padding:0}
.gc-photo-del:hover{background:#B91C1C}
.gc-photo-add{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;width:66px;height:66px;border:1.5px dashed #C4CAD8;border-radius:8px;cursor:pointer;color:#8892A8;transition:.15s;background:#FAFBFC}
.gc-photo-add:hover{border-color:#1A3E78;color:#1A3E78;background:#F0F4FB}
.gc-photo-add-ic{font-size:19px;line-height:1}
.gc-photo-add-tx{font-size:9px;text-align:center;line-height:1.1}
.gc-photo-cell{cursor:pointer;color:#1755C4;font-size:12px;font-weight:600;white-space:nowrap}
.gc-photo-cell:hover{text-decoration:underline}
.gc-dim{color:#A8B0C0}

.gc-lightbox{position:fixed;inset:0;background:rgba(15,20,32,.9);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px}
.gc-lightbox img{max-width:92vw;max-height:86vh;border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,.5)}
.gc-lb-close,.gc-lb-prev,.gc-lb-next{position:absolute;border:0;background:rgba(255,255,255,.14);color:#fff;cursor:pointer;border-radius:50%;display:flex;align-items:center;justify-content:center;transition:.15s}
.gc-lb-close{top:18px;right:18px;width:38px;height:38px;font-size:17px}
.gc-lb-prev,.gc-lb-next{top:50%;transform:translateY(-50%);width:44px;height:44px;font-size:26px}
.gc-lb-prev{left:18px}.gc-lb-next{right:18px}
.gc-lb-close:hover,.gc-lb-prev:hover,.gc-lb-next:hover{background:rgba(255,255,255,.3)}
.gc-lb-count{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);color:#fff;font-size:12px;background:rgba(0,0,0,.45);padding:5px 14px;border-radius:20px}

.gc-weather{display:flex;gap:6px;flex-wrap:wrap}
.gc-wx-btn{display:flex;flex-direction:column;align-items:center;gap:3px;min-width:56px;padding:8px 9px;border:1px solid #D8DCE6;border-radius:9px;background:#fff;cursor:pointer;transition:.15s;font:inherit}
.gc-wx-btn:hover{border-color:#1A3E78;background:#F0F4FB}
.gc-wx-btn.on{border-color:#1A3E78;background:#1A3E78;color:#fff;box-shadow:0 2px 8px rgba(26,62,120,.25)}
.gc-wx-ic{font-size:19px;line-height:1}
.gc-wx-tx{font-size:10px;line-height:1.15;text-align:center}

.gc-import{border:2px dashed #C4CAD8;border-radius:11px;padding:22px 18px;text-align:center;cursor:pointer;transition:.18s;background:#FAFBFC}
.gc-import:hover,.gc-import.over{border-color:#1A3E78;background:#EBF0FA}
.gc-import.over{transform:scale(1.01)}
.gc-import-ic{font-size:29px;line-height:1;margin-bottom:7px}
.gc-import-t{font-weight:700;font-size:14px;color:#1A2035;margin-bottom:3px}
.gc-import-d{font-size:12px;color:#5A6478}
.gc-import-h{font-size:11px;color:#8892A8;margin-top:5px}
.gc-import-status{margin-top:9px;font-size:12px;min-height:17px}
.gc-import-status.ok{color:#16653A;font-weight:600}
.gc-import-status.err{color:#B91C1C;font-weight:600}
.gc-import-status.warning{color:#7D4E00;font-weight:600}
.gc-import-status.busy{color:#7D4E00}

.gc-dash-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:11px;margin-bottom:14px}
.gc-dash-card{--gc-c:#1A3E78;background:#fff;border:1px solid #E2E6EF;border-left:3px solid var(--gc-c);border-radius:9px;padding:13px 15px}
.gc-dash-v{font-size:25px;font-weight:700;line-height:1;color:var(--gc-c);font-variant-numeric:tabular-nums}
.gc-dash-l{font-size:11px;color:#5A6478;margin-top:5px;letter-spacing:.3px}
.gc-dash-s{font-size:10px;color:#8892A8;margin-top:2px}
.gc-dash-bars{background:#fff;border:1px solid #E2E6EF;border-radius:9px;padding:14px 16px}
.gc-dash-bt{font-size:12px;font-weight:700;color:#1A2035;margin-bottom:11px}
.gc-bar-row{display:grid;grid-template-columns:96px 1fr 46px;gap:9px;align-items:center;margin-bottom:7px}
.gc-bar-l{font-size:11px;color:#4A5472;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gc-bar-track{height:15px;background:#EEF1F6;border-radius:4px;overflow:hidden}
.gc-bar-fill{height:100%;background:#1A3E78;border-radius:4px;transition:width .4s ease}
.gc-bar-v{font-size:11px;font-weight:700;color:#1A2035;text-align:right;font-variant-numeric:tabular-nums}
.gc-empty{text-align:center;padding:26px;color:#8892A8;font-size:13px}

.gc-toast-box{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:10000;display:flex;flex-direction:column;gap:7px;align-items:center;pointer-events:none}
.gc-toast{background:#1A2035;color:#fff;padding:10px 19px;border-radius:8px;font-size:13px;box-shadow:0 4px 18px rgba(0,0,0,.24);animation:gcIn .25s ease;max-width:88vw}
.gc-toast.success{background:#16653A}.gc-toast.error{background:#B91C1C}.gc-toast.warning{background:#7D4E00}
.gc-toast.out{opacity:0;transform:translateY(8px);transition:.3s}
@keyframes gcIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}

.gc-cloud-btns{display:inline-flex;gap:7px}
.gc-cloud-btn{display:inline-flex;align-items:center;gap:5px;padding:7px 13px;border:1px solid #D8DCE6;background:#fff;border-radius:7px;font:600 12px/1 inherit;color:#1A3E78;cursor:pointer;transition:.15s}
.gc-cloud-btn:hover{background:#EBF0FA;border-color:#1A3E78}
.gc-cloud-btn:disabled{opacity:.45;cursor:not-allowed}

.gc-action-strip{display:flex;align-items:center;gap:7px;flex-wrap:nowrap;overflow-x:auto;overflow-y:visible;white-space:nowrap;scrollbar-width:none;padding:10px 12px;margin-bottom:10px;background:#F7F9FC;border:1px solid #D8DCE6;border-radius:12px;box-shadow:0 3px 12px rgba(15,20,32,.08)}
.gc-action-strip::-webkit-scrollbar{display:none}
.gc-action-strip>*{flex-shrink:0}
.gc-action-heading{font-size:12px;font-weight:800;color:#1A3E78;white-space:nowrap;margin-right:2px}
.gc-action-label{font-size:11px;font-weight:700;color:#5A6478;white-space:nowrap;margin-left:4px}
.gc-scope-select,.gc-ref-date{height:34px;padding:0 8px;border:1px solid #C9D3E3;border-radius:8px;background:#fff;color:#1A3E78;font:700 11px/1 inherit;flex:0 0 auto}
.gc-slot-select,.gc-lang-select{height:34px;padding:0 8px;border:1px solid #C9D3E3;border-radius:8px;background:#fff;color:#1A3E78;font:700 11px/1 inherit;flex:0 0 auto;max-width:150px}
.gc-ref-nav{height:34px;min-width:30px;padding:0 7px;border:1px solid #C9D3E3;border-radius:8px;background:#fff;color:#1A3E78;font:700 12px/1 inherit;cursor:pointer;flex:0 0 auto}
.gc-action-btn{display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border:1px solid #C9D3E3;background:#fff;border-radius:8px;font:700 12px/1 inherit;color:#1A3E78;cursor:pointer;white-space:nowrap;transition:.15s}
.gc-action-btn:hover{background:#EBF0FA;border-color:#1A3E78}
.gc-action-btn:disabled{opacity:.5;cursor:not-allowed}
.gc-tg-btn{color:#0876A8;border-color:#B8DDEC}
.gc-import-btn{color:#7D4E00;border-color:#F1D49A;background:#FFFDF5}
.gc-send-btn{color:#16653A;border-color:#BCE7CB;background:#F4FFF7}
.gc-action-strip #gcTopCloud{display:inline-flex}
.gc-action-strip .gc-cloud-btn{padding:7px 10px}
.gc-action-strip .gc-period{gap:4px}
.gc-action-strip .gc-pd-btn{padding:7px 10px;border-radius:8px;font-size:11px}
.gc-mode{display:inline-flex;gap:4px;flex-wrap:wrap}
.gc-mode-btn{display:inline-flex;align-items:center;gap:4px;padding:7px 9px;border:1px solid #D8DCE6;background:#fff;border-radius:8px;font:600 11px/1 inherit;color:#5A6478;cursor:pointer;white-space:nowrap}
.gc-mode-btn.on{background:#1A3E78;color:#fff;border-color:#1A3E78}
.gc-action-status{font-size:11px;color:#16653A;min-width:60px;white-space:nowrap}
.gc-cloud-info{padding:10px 11px;background:#EEF3FF;border-left:3px solid #4E6FFF;border-radius:7px;color:#4A5472;font-size:11px;line-height:1.45}
.gc-import-modal{display:none;position:fixed;inset:0;z-index:10001;align-items:center;justify-content:center;padding:18px;background:rgba(15,20,32,.48)}
.gc-import-modal.open{display:flex}
.gc-import-dialog{width:min(560px,94vw);max-height:90vh;overflow:auto;background:#fff;border-radius:14px;box-shadow:0 18px 55px rgba(0,0,0,.3);padding:0}
.gc-import-head{display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-bottom:1px solid #EEF1F6;color:#1A3E78}
.gc-import-close{border:0;background:transparent;color:#8892A8;font-size:18px;cursor:pointer;padding:2px 5px}
.gc-import-dialog #gcImport{padding:15px}

@media(max-width:640px){
  .gc-bar-row{grid-template-columns:74px 1fr 38px}
  .gc-dash-cards{grid-template-columns:repeat(auto-fit,minmax(108px,1fr))}
}
`;

function injectCSS() {
  if (document.getElementById('gc-core-css')) return;
  const s = document.createElement('style');
  s.id = 'gc-core-css'; s.textContent = CSS;
  document.head.appendChild(s);
}
if (document.head) injectCSS();
else document.addEventListener('DOMContentLoaded', injectCSS);

/* ═══════════════════════════════════════════════════════════
   10. 雲端按鈕組（一行掛好上傳/下載）
   ═══════════════════════════════════════════════════════════ */
GC.mountCloudButtons = function (mountEl, opt) {
  const el = typeof mountEl === 'string' ? document.querySelector(mountEl) : mountEl;
  if (!el) return null;
  opt = opt || {};
  el.innerHTML =
    `<div class="gc-cloud-btns">
       <button type="button" class="gc-cloud-btn" data-gc-up title="${U.escapeHtml(I18.t('gc.upload'))}" aria-label="${U.escapeHtml(I18.t('gc.upload'))}"><span class="gc-btn-ico">☁️↑</span><span class="gc-btn-label" data-i="gc.upload">${U.escapeHtml(I18.t('gc.upload'))}</span></button>
       <button type="button" class="gc-cloud-btn" data-gc-down title="${U.escapeHtml(I18.t('gc.download'))}" aria-label="${U.escapeHtml(I18.t('gc.download'))}"><span class="gc-btn-ico">☁️↓</span><span class="gc-btn-label" data-i="gc.download">${U.escapeHtml(I18.t('gc.download'))}</span></button>
     </div>`;
  const up = el.querySelector('[data-gc-up]'), down = el.querySelector('[data-gc-down]');

  function busy(yes) {
    up.disabled = !!yes;
    down.disabled = !!yes;
    el.setAttribute('aria-busy', yes ? 'true' : 'false');
  }
  function state(kind, text) {
    if (typeof opt.onState === 'function') opt.onState(kind, text);
  }
  const pendingKey = 'ac_gc_auto_sync_v1_' + String(opt.tool || 'tool');
  let running = null, retryTimer = 0;
  function markPending(reason) {
    try { localStorage.setItem(pendingKey, JSON.stringify({ts:U.now(), reason:reason || 'auto'})); } catch (e) {}
  }
  function clearPending() { try { localStorage.removeItem(pendingKey); } catch (e) {} }
  function hasPending() { try { return !!localStorage.getItem(pendingKey); } catch (e) { return false; } }

  async function runUpload(runOpt) {
    runOpt = runOpt || {};
    if (running) return running;
    busy(true);
    state('busy', runOpt.auto ? I18.t('gc.autoSyncing') : I18.t('gc.sync'));
    running = (async function () {
      try {
        const local = opt.getList ? opt.getList() : [];
        const result = await CLOUD.upload(opt.tool, local, {
          idKey:opt.idKey, tsKey:opt.tsKey, dateField:opt.dateField, photoField:opt.photoField,
          extra:opt.extra, toCloud:opt.toCloud, fromCloud:opt.fromCloud, onRemote:opt.onRemote
        });
        const res = result && result.res, list = result && result.list || local;
        if (res && res.ok === false) throw new Error(res.error || I18.t('gc.upFail'));
        if (opt.setList) opt.setList(list);
        clearPending();
        const uploaded = Number(result && result.uploaded) || 0;
        const label = result && result.skipped ? I18.t('gc.cloudCurrent') : I18.t('gc.uploaded') + ' · ' + uploaded + ' ' + I18.t('gc.changedRows');
        state('ok', label);
        if (!runOpt.silent) GC.toast('☁ ' + label, 'success');
        if (opt.onDone) opt.onDone(list, result);
        return Object.assign({ok:true}, result || {});
      } catch (e) {
        markPending(runOpt.reason || 'retry');
        const msg = runOpt.auto ? I18.t('gc.cloudPending') : I18.t('gc.upFail') + ': ' + e.message;
        state(runOpt.auto ? 'warning' : 'error', msg);
        if (!runOpt.silent) GC.toast('❌ ' + msg, 'error');
        return {ok:false,error:e};
      } finally {
        busy(false); running = null;
      }
    })();
    return running;
  }

  async function runDownload(runOpt) {
    runOpt = runOpt || {};
    busy(true);
    state('busy', I18.t('gc.sync'));
    try {
      const local = opt.getList ? opt.getList() : [];
      const r = await CLOUD.download(opt.tool, local, {
        idKey:opt.idKey, tsKey:opt.tsKey, dateField:opt.dateField, photoField:opt.photoField,
        extra:opt.extra, toCloud:opt.toCloud, fromCloud:opt.fromCloud
      });
      if (r.empty) {
        if (!runOpt.silent) GC.toast('⚠ ' + I18.t('gc.noCloud'), 'warning');
        state('warning', I18.t('gc.noCloud'));
      }
      else {
        if (opt.onRemote) opt.onRemote(r.response || {});
        if (opt.setList) opt.setList(r.list);
        const changed = Number(r.downloaded != null ? r.downloaded : (r.stat && r.stat.added)) || 0;
        if (!runOpt.silent) GC.toast('⬇ ' + I18.t('gc.downloaded') + ' · ' + changed + ' ' + I18.t('gc.changedRows'), 'success');
        state('ok', I18.t('gc.downloaded') + ' · ' + changed + ' ' + I18.t('gc.changedRows'));
        if (opt.onDone) opt.onDone(r.list, r);
      }
      return Object.assign({ok:true}, r || {});
    } catch (e) {
      const msg = I18.t('gc.downFail') + ': ' + e.message;
      if (!runOpt.silent) GC.toast('❌ ' + msg, 'error');
      state('error', msg);
      return {ok:false,error:e};
    } finally {
      busy(false);
    }
  }

  function scheduleAuto(reason) {
    markPending(reason || 'telegram');
    state('busy', I18.t('gc.autoSyncing'));
    clearTimeout(retryTimer);
    retryTimer = setTimeout(function () { runUpload({silent:true,auto:true,reason:reason || 'telegram'}); }, 20);
  }
  up.onclick = function () { runUpload({silent:false,auto:false,reason:'manual'}); };
  down.onclick = function () { runDownload({silent:false}); };
  global.addEventListener('online', function () { if (hasPending()) scheduleAuto('online'); });
  if (hasPending()) setTimeout(function () { scheduleAuto('resume'); }, 350);
  return { upload:runUpload, download:runDownload, scheduleAuto:scheduleAuto, hasPending:hasPending };
};

/* ═══════════════════════════════════════════════════════════
   10.5 TELEGRAM — 直接摘要／審查／Approval
   Telegram token 留在 GAS，瀏覽器只呼叫固定 Web App URL。
   ═══════════════════════════════════════════════════════════ */
GC.telegram = {
  text(zh, en, km, lang) {
    lang = lang || 'bi';
    if (lang === 'zh') return zh;
    if (lang === 'en') return en;
    if (lang === 'km') return km || en;
    return zh + ' / ' + en;
  },
  slotText(item, lang) {
    if (typeof item === 'string') return item;
    return GC.telegram.text(item.zh || item.value, item.en || item.zh || item.value, item.km || item.en || item.zh || item.value, lang || 'bi');
  },
  filter(list, cfg, period, ref, scope, slot) {
    cfg = cfg || {};
    let view = PERIOD.filter(Array.isArray(list) ? list : [], period || 'month', cfg.dateField || 'date', ref);
    const scopes = (Array.isArray(scope) ? scope : [scope]).map(function (v) { return v == null ? '' : String(v); }).filter(Boolean);
    const slots = (Array.isArray(slot) ? slot : [slot]).map(function (v) { return v == null ? '' : String(v); }).filter(Boolean);
    if (cfg.scopeField && scopes.length && !scopes.includes('all')) {
      view = view.filter(r => scopes.includes(String(r && r[cfg.scopeField] || '')));
    }
    if (slots.length && !slots.includes('all') && typeof cfg.telegramSlotFilter === 'function') {
      view = view.filter(r => slots.some(function (value) { return cfg.telegramSlotFilter(r, value); }));
    } else if (slots.length && !slots.includes('all') && cfg.telegramSlotField) {
      view = view.filter(r => slots.includes(String(r && r[cfg.telegramSlotField] || '')));
    }
    return view;
  },
  pending(record) {
    if (!record) return false;
    const vals = [record.status, record.approvalStatus, record.reviewStatus,
      record.approval, record.approved, record.review];
    return vals.some(v => v === false || /pending|待審|待核|待批|review|approval|審查|核可|未完成/i.test(String(v || '')));
  },
  buildText(cfg, period, mode, ref, scope, slot, lang) {
    cfg = cfg || {};
    const slotItems = typeof cfg.telegramSlots === 'function' ? (cfg.telegramSlots() || []) : (cfg.telegramSlots || []);
    const label = (key, zhFallback, enFallback, kmFallback) => {
      const dict = I18.dict || {};
      const zh = dict.zh && dict.zh[key] != null ? dict.zh[key] : zhFallback;
      const en = dict.en && dict.en[key] != null ? dict.en[key] : (enFallback || zhFallback);
      const km = dict.km && dict.km[key] != null ? dict.km[key] : (kmFallback || en);
      return GC.telegram.text(zh, en, km, lang || I18.lang);
    };
    const all = typeof cfg.read === 'function' ? (cfg.read() || []) : [];
    const list = Array.isArray(all) ? all : [];
    let view = GC.telegram.filter(list, cfg, period || 'month', ref, scope, slot);
    const pending = view.filter(GC.telegram.pending);
    const periodLabels = {
      day: label('gc.today', '今日', 'Today', 'ថ្ងៃនេះ'),
      week: label('gc.thisWeek', '本週', 'This Week', 'សប្ដាហ៍នេះ'),
      month: label('gc.thisMonth', '本月', 'This Month', 'ខែនេះ'),
      year: label('gc.thisYear', '今年', 'This Year', 'ឆ្នាំនេះ'),
      all: label('gc.all', '全部', 'All', 'ទាំងអស់')
    };
    const modeLabels = {
      summary: label('gc.summary', '摘要', 'Summary', 'សង្ខេប'),
      review: label('gc.review', '審查', 'Review', 'ពិនិត្យ'),
      approval: label('gc.approval', '核可', 'Approval', 'អនុម័ត')
    };
    const titleMap = {
      asset: ['VRT 資產', 'VRT Asset', 'VRT ទ្រព្យសម្បត្តិ'],
      dormitory: ['VRT 宿舍', 'VRT Dormitory', 'VRT អន្តេវាសិកដ្ឋាន'],
      keymovement: ['VRT 鑰匙管理', 'VRT Key Management', 'VRT គ្រប់គ្រងសោ']
    }[cfg.tool];
    const title = U.escapeHtml(titleMap ? GC.telegram.text(titleMap[0], titleMap[1], titleMap[2], lang || I18.lang) : (cfg.title || cfg.tool || 'AC GASCHECK'));
    const lines = [
      '♻️ <b>' + title + '</b>',
      '📅 ' + U.escapeHtml(periodLabels[period] || period || I18.t('gc.thisMonth')),
      (slot && !(Array.isArray(slot) ? slot.includes('all') : slot === 'all') ? '⏱️ ' + U.escapeHtml(label('gc.slot', '發送時段', 'Send time slot', 'ពេលវេលាផ្ញើ')) + ': ' + U.escapeHtml((Array.isArray(slot) ? slot : [slot]).map(function (value) { const found=slotItems.find(x => (typeof x === 'string' ? x : x.value) === value); return found ? GC.telegram.slotText(found, lang) : value; }).join(', ')) : ''),
      '📊 ' + U.escapeHtml(label('gc.records', '記錄', 'Records', 'កំណត់ត្រា')) + ': <b>' + view.length + '</b> / ' +
        U.escapeHtml(label('gc.total', '總計', 'Total', 'សរុប')) + ': ' + list.length,
      '🧾 ' + U.escapeHtml(label('gc.mode', '訊息類型', 'Message type', 'ប្រភេទសារ')) + ': ' + U.escapeHtml(modeLabels[mode] || modeLabels.summary)
    ];
    const photoCount = cfg.photoField ? view.filter(r => U.asArray(r && r[cfg.photoField]).length).length : 0;
    const weatherCount = cfg.weatherField ? view.filter(r => r && r[cfg.weatherField]).length : 0;
    lines.push('━━━━━━━━━━━━━━━━', '📊 <b>' + label('gc.dashboard', '儀表板', 'Dashboard', 'ផ្ទាំងគ្រប់គ្រង') + '</b>');
    lines.push('• ' + label('gc.records', '記錄', 'Records', 'កំណត់ត្រា') + ': <b>' + view.length + '</b> | ' + label('gc.photo', '照片', 'Photos', 'រូបថត') + ': ' + photoCount + (cfg.weather ? ' | ' + label('gc.weather', '天氣', 'Weather', 'អាកាសធាតុ') + ': ' + weatherCount : ''));
    if (cfg.groupField) {
      const groups = GC.dash.groupBy(view, r => r && r[cfg.groupField]).slice(0, 8);
      groups.forEach(g => lines.push('• ' + U.escapeHtml(g.label) + ': ' + g.value));
    }
    if (mode === 'review' || mode === 'approval') {
      lines.push('━━━━━━━━━━━━━━━━');
      lines.push('⏳ ' + U.escapeHtml(label('gc.pendingApproval', '待審查／待核可', 'Pending review / approval', 'កំពុងរង់ចាំពិនិត្យ/អនុម័ត')) + ': <b>' + pending.length + '</b>');
      if (!pending.length) lines.push('✅ ' + U.escapeHtml(label('gc.noApproval', '沒有待審查／待核可資料', 'No pending review/approval records', 'គ្មានទិន្នន័យកំពុងរង់ចាំពិនិត្យ/អនុម័ត')));
    }
    lines.push('━━━━━━━━━━━━━━━━', '⏰ ' + U.ymdhms());
    return lines.join('\n');
  },
  async send(text, photos, buttons, chatId, tool, meta) {
    if (!text) throw new Error('No Telegram text');
    const res = await CLOUD.post(Object.assign({
      action: 'telegram', text: text,
      photos: Array.isArray(photos) ? photos.slice(0, 5) : [],
      buttons: Array.isArray(buttons) ? buttons : [],
      chatId: chatId || DEFAULT_CHAT_ID,
      tool: tool || ''
    }, meta || {}));
    if (!res || res.ok === false) throw new Error((res && res.error) || 'Telegram request failed');
    return res;
  }
};


/* ═══════════════════════════════════════════════════════════
   11. ATTACH — 通用掛載面板（不動模組內部程式碼）
   ═══════════════════════════════════════════════════════════ */
GC.attach = function (cfg) {
  cfg = cfg || {};
  if (!cfg.__storageReady && STORAGE && STORAGE.ready) {
    const next = Object.assign({}, cfg, { __storageReady: true });
    STORAGE.ready.then(function () { GC.attach(next); });
    return { refresh: function () {}, getPeriod: function () { return 'month'; } };
  }

  const C = Object.assign({
    dateField: 'date', idField: 'id', groupField: null, scopeField: null,
    weather: false, photo: false, weatherField: 'weather', photoField: 'photos',
    importSchema: null, importParser: null, importAccept: null, telegramScopes: null, telegramSlots: null,
    telegramScopeMultiple: false, telegramSlotMultiple: false, telegramScopeLabel: null,
    telegramSlotFilter: null, telegramSlotField: null, telegramGroups: null,
    telegramDefaultLanguage: 'bi', telegramDefaultSlot: 'all', hideLegacyTools: true
  }, cfg || {});
  if (!C.scopeField && C.groupField) C.scopeField = C.groupField;

  CLOUD.setUrl(DEFAULT_GAS_URL);
  const oldInstance = document.querySelector('.gc-head-tools[data-gc-tool="' + C.tool + '"]');
  if (oldInstance) {
    const oldShell = oldInstance.closest('.gc-unified-shell');
    (oldShell || oldInstance).remove();
  }
  document.querySelectorAll('.gc-common-modal[data-gc-tool="' + C.tool + '"]').forEach(function (x) { x.remove(); });

  const anchorMap = {
    asset: '.topbar', cleaning: '.topbar', dormitory: '.topbar',
    ehs: '.topbar', keymovement: '.topbar',
    temperature: '.hd', waterdrum: '.header'
  };
  const anchor = document.querySelector(C.headerMount || anchorMap[C.tool] || '.topbar, .hd, .header');
  const shell = document.createElement('div');
  shell.className = 'gc-unified-shell';
  shell.dataset.gcTool = C.tool || '';
  const tools = document.createElement('div');
  tools.className = 'gc-head-tools';
  tools.dataset.gcTool = C.tool || '';
  tools.innerHTML = [
    '<span class="gc-toolbar-title">☁️ <span data-i="gc.quickActions">' + U.escapeHtml(I18.t('gc.quickActions')) + '</span></span>',
    '<span class="gc-cloud-state"><i></i><span class="gc-state-label" data-i="gc.cloudReady">' + U.escapeHtml(I18.t('gc.cloudReady')) + '</span></span>',
    '<span class="gc-head-cloud"></span>',
    '<button type="button" class="gc-head-btn gc-head-tg" data-gc-open-tg title="' + U.escapeHtml(I18.t('gc.telegramTitle')) + '"><span class="gc-btn-ico">✈️</span><span class="gc-btn-label" data-i="gc.telegram">' + U.escapeHtml(I18.t('gc.telegram')) + '</span></button>',
    C.importSchema ? '<button type="button" class="gc-head-btn gc-head-import" data-gc-open-import title="' + U.escapeHtml(I18.t('gc.importTitle')) + '"><span class="gc-btn-ico">📥</span><span class="gc-btn-label" data-i="gc.smartImport">' + U.escapeHtml(I18.t('gc.smartImport')) + '</span></button>' : '',
    '<button type="button" class="gc-head-btn gc-head-export" data-gc-export title="' + U.escapeHtml(I18.t('gc.export')) + '"><span class="gc-btn-ico">💾</span><span class="gc-btn-label" data-i="gc.export">' + U.escapeHtml(I18.t('gc.export')) + '</span></button>',
    '<span class="gc-head-langs" aria-label="' + U.escapeHtml(I18.t('gc.menuLanguage')) + '">',
      '<button type="button" data-gc-ui-lang="zh">中</button>',
      '<button type="button" data-gc-ui-lang="en">EN</button>',
      '<button type="button" data-gc-ui-lang="km">ខ្មែរ</button>',
    '</span>'
  ].join('');
  shell.appendChild(tools);
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(shell, anchor.nextSibling);
  else document.body.insertBefore(shell, document.body.firstChild);

  /* 舊語言列、雲端列、匯入頁與連線設定全部收起；業務頁、記錄按鈕及照片發送保留。 */
  const hide = function (el) { if (el && !el.closest('.gc-head-tools')) el.classList.add('gc-legacy-hidden'); };
  const hideBlock = function (el) {
    if (!el) return;
    const block = el.closest('.card, .sec, .section, .panel, .pnl, .tab-content') || el.parentElement;
    hide(block || el);
  };
  if (C.hideLegacyTools !== false) {
    ['.lang-sw', '.lgp', '.lang-grp', '.lang-toggle', '.lsw', '.lang-switch', '#cloud-badge']
      .forEach(function (sel) { document.querySelectorAll(sel).forEach(hide); });
    if (C.tool === 'keymovement') document.querySelectorAll('.topbar .lang-btn').forEach(hide);
    ['#gas-panel', '#gas-panel-card', '#tab-import', '#tab-tg', '#nav-import', '#nav-telegram',
      '#tab-telegram', '#pnl-import', '#pnl-tg', '#pnl-telegram', '#panel-import',
      '#panel-telegram', '#section-import'].forEach(function (sel) {
        document.querySelectorAll(sel).forEach(hide);
      });
    document.querySelectorAll('[onclick*="switchTab(\'import\')"], [onclick*="switchTab(\'tg\')"], [onclick*="switchTab(\'telegram\')"]')
      .forEach(hide);
    ['#cfg-gas', '#cfg-token', '#cfg-chat', '#tg-tok', '#tg-chat', '#tg-token', '#tg-period', '#gas-url', '#i-ie']
      .forEach(function (sel) { document.querySelectorAll(sel).forEach(hideBlock); });
    document.querySelectorAll('[onclick*="openImport"], [onclick*="uploadCloud"], [onclick*="downloadCloud"], [onclick*="cloud.push"], [onclick*="cloud.pull"], [onclick*="syncUp"], [onclick*="syncDown"], [onclick*="saveToGAS"], [onclick*="loadFromGAS"]')
      .forEach(hide);
  }

  let period = 'month';
  let periodRef = U.ymd(new Date());
  let mode = 'summary';
  let scope = C.telegramScopeMultiple ? ['all'] : 'all';
  let slot = C.telegramSlotMultiple ? [C.telegramDefaultSlot || 'all'] : (C.telegramDefaultSlot || 'all');
  let lang = C.telegramDefaultLanguage || 'bi';
  let previewToken = 0;
  let currentPacket = null;

  function reportActivityMeta() {
    const ref = periodRef || U.ymd(new Date());
    return {
      reportPeriod: period,
      reportRef: ref,
      reportMonth: String(ref).slice(0, 7),
      reportMode: mode,
      reportScope: Array.isArray(scope) ? scope.join(',') : scope,
      reportSlot: Array.isArray(slot) ? slot.join(',') : slot,
      reportLanguage: lang
    };
  }

  function cloudExtra() {
    const base = typeof C.extra === 'function' ? (C.extra() || {}) : (C.extra || {});
    return Object.assign({}, base, reportActivityMeta());
  }

  function setCloudState(kind, message) {
    const state = tools.querySelector('.gc-cloud-state');
    const label = state && state.querySelector('.gc-state-label');
    if (!state || !label) return;
    state.classList.remove('ok', 'busy', 'warning', 'error');
    if (kind) state.classList.add(kind);
    label.removeAttribute('data-i');
    label.textContent = message || I18.t('gc.cloudReady');
    state.title = label.textContent;
  }

  const cloudOpt = {
    tool: C.tool, idKey: C.idField, tsKey: 'updatedAt', dateField:C.dateField, photoField:C.photoField, extra: cloudExtra,
    toCloud: C.toCloud, fromCloud: C.fromCloud,
    getList: function () { return C.read() || []; },
    setList: function (list) { C.write(list); },
    onState: setCloudState,
    onRemote: function (d) { if (C.onRemote) C.onRemote(d || {}); },
    onDone: function () {
      refreshPeriodOptions();
      if (C.onSync) C.onSync();
      const state = tools.querySelector('.gc-cloud-state');
      if (state) state.classList.add('ok');
    }
  };
  const cloudControl = GC.mountCloudButtons(tools.querySelector('.gc-head-cloud'), cloudOpt);

  function exportLocalData() {
    const list = C.read() || [];
    if (!list.length) {
      GC.toast('⚠ ' + I18.t('gc.noData'), 'warning');
      return;
    }
    const safeRows = list.map(function (row) {
      const out = {};
      Object.keys(row || {}).forEach(function (key) {
        const value = row[key];
        out[key] = value && typeof value === 'object' ? JSON.stringify(value) : value;
      });
      return out;
    });
    const base = 'AC_GASCHECK_' + String(C.tool || 'data') + '_' + U.ymd(new Date());
    try {
      if (global.XLSX && global.XLSX.utils && global.XLSX.writeFile) {
        const wb = global.XLSX.utils.book_new();
        const ws = global.XLSX.utils.json_to_sheet(safeRows);
        global.XLSX.utils.book_append_sheet(wb, ws, String(C.tool || 'Data').slice(0, 31));
        global.XLSX.writeFile(wb, base + '.xlsx');
      } else {
        const blob = new Blob([JSON.stringify({tool:C.tool, exportedAt:U.ymdhms(), records:list}, null, 2)], {type:'application/json'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = base + '.json';
        document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 600);
      }
      GC.toast('💾 ' + I18.t('gc.export') + ' · ' + list.length, 'success');
    } catch (e) {
      GC.toast('❌ ' + I18.t('gc.export') + ': ' + e.message, 'error');
    }
  }
  const exportButton = tools.querySelector('[data-gc-export]');
  if (exportButton) exportButton.onclick = exportLocalData;

  const tgModal = document.createElement('div');
  tgModal.className = 'gc-common-modal';
  tgModal.dataset.gcTool = C.tool || '';
  tgModal.innerHTML = [
    '<div class="gc-modal-card gc-tg-modal" role="dialog" aria-modal="true">',
      '<div class="gc-modal-head"><strong>✈️ <span data-i="gc.telegramTitle">' + U.escapeHtml(I18.t('gc.telegramTitle')) + '</span></strong><button type="button" data-gc-close>×</button></div>',
      '<div class="gc-modal-body">',
        '<label class="gc-field gc-field-wide"><span data-i="gc.mode">' + U.escapeHtml(I18.t('gc.mode')) + '</span><span class="gc-seg">',
          '<button type="button" class="on" data-gc-mode="summary">📄 <span data-i="gc.summary">' + U.escapeHtml(I18.t('gc.summary')) + '</span></button>',
          '<button type="button" data-gc-mode="review">🔎 <span data-i="gc.review">' + U.escapeHtml(I18.t('gc.review')) + '</span></button>',
          '<button type="button" data-gc-mode="approval">✅ <span data-i="gc.approval">' + U.escapeHtml(I18.t('gc.approval')) + '</span></button>',
        '</span></label>',
        '<label class="gc-field"><span data-gc-scope-label>' + U.escapeHtml(I18.t('gc.selectScope')) + '</span><select data-gc-scope></select><span class="gc-multi-picks" data-gc-scope-picks hidden></span></label>',
        '<label class="gc-field"><span data-i="gc.periodMode">' + U.escapeHtml(I18.t('gc.periodMode')) + '</span><select data-gc-period></select></label>',
        '<label class="gc-field"><span data-i="gc.periodValue">' + U.escapeHtml(I18.t('gc.periodValue')) + '</span><select data-gc-ref></select></label>',
        '<label class="gc-field gc-slot-field"><span data-i="gc.slot">' + U.escapeHtml(I18.t('gc.slot')) + '</span><select data-gc-slot></select><span class="gc-multi-picks" data-gc-slot-picks hidden></span></label>',
        '<label class="gc-field"><span data-i="gc.reportLanguage">' + U.escapeHtml(I18.t('gc.reportLanguage')) + '</span><select data-gc-lang></select></label>',
        '<label class="gc-field"><span data-i="gc.targetGroup">' + U.escapeHtml(I18.t('gc.targetGroup')) + '</span><select data-gc-group></select></label>',
        '<div class="gc-field gc-field-wide"><span data-i="gc.preview">' + U.escapeHtml(I18.t('gc.preview')) + '</span><div class="gc-preview" data-gc-preview></div></div>',
      '</div>',
      '<div class="gc-modal-foot"><span data-gc-send-state></span><button type="button" class="gc-cancel" data-gc-close data-i="gc.cancel">' + U.escapeHtml(I18.t('gc.cancel')) + '</button><button type="button" class="gc-primary" data-gc-send>✈️ <span data-i="gc.send">' + U.escapeHtml(I18.t('gc.send')) + '</span></button></div>',
    '</div>'
  ].join('');
  document.body.appendChild(tgModal);

  let importModal = null;
  if (C.importSchema) {
    importModal = document.createElement('div');
    importModal.className = 'gc-common-modal';
    importModal.dataset.gcTool = C.tool || '';
    importModal.innerHTML = [
      '<div class="gc-modal-card gc-import-dialog" role="dialog" aria-modal="true">',
        '<div class="gc-modal-head"><strong>📥 <span data-i="gc.importTitle">' + U.escapeHtml(I18.t('gc.importTitle')) + '</span></strong><button type="button" data-gc-close>×</button></div>',
        '<div class="gc-import-hint" data-i="gc.directHint">' + U.escapeHtml(I18.t('gc.directHint')) + '</div>',
        '<div class="gc-import-mount"></div>',
      '</div>'
    ].join('');
    document.body.appendChild(importModal);
    GC.import.mount(importModal.querySelector('.gc-import-mount'), {
      schema: C.importSchema,
      parse: C.importParser,
      accept: C.importAccept || '.xlsx,.xls,.xlsb,.csv',
      onData: function (rows, meta) {
        const cur = C.read() || [];
        rows.forEach(function (r) {
          r[C.idField] = r[C.idField] || U.uid('imp');
          r.updatedAt = U.now();
          delete r._raw;
        });
        const merged = typeof C.mergeImport === 'function' ? C.mergeImport(cur, rows) : cur.concat(rows);
        C.write(merged);
        refreshPeriodOptions();
        GC.toast('✅ ' + rows.length + ' ' + I18.t('gc.imported') + ' — ' + (meta.fileName || ''), 'success');
        if (C.onImport) C.onImport(rows);
      }
    });
  }

  const scopeSelect = tgModal.querySelector('[data-gc-scope]');
  const scopeLabel = tgModal.querySelector('[data-gc-scope-label]');
  const scopePicks = tgModal.querySelector('[data-gc-scope-picks]');
  const periodSelect = tgModal.querySelector('[data-gc-period]');
  const refSelect = tgModal.querySelector('[data-gc-ref]');
  const slotSelect = tgModal.querySelector('[data-gc-slot]');
  const slotPicks = tgModal.querySelector('[data-gc-slot-picks]');
  const langSelect = tgModal.querySelector('[data-gc-lang]');
  const groupSelect = tgModal.querySelector('[data-gc-group]');
  const preview = tgModal.querySelector('[data-gc-preview]');
  const sendState = tgModal.querySelector('[data-gc-send-state]');
  const sendButton = tgModal.querySelector('[data-gc-send]');

  function option(value, label) {
    return '<option value="' + U.escapeHtml(value) + '">' + U.escapeHtml(label) + '</option>';
  }
  function itemValue(item) { return typeof item === 'string' ? item : item.value; }
  function itemLabel(item, useLang) {
    if (typeof item === 'string') return item;
    const l = useLang || I18.lang;
    return item[l] || item.en || item.zh || item.km || item.value;
  }
  function selectionArray(value) {
    const out = (Array.isArray(value) ? value : [value]).map(function (v) { return v == null ? '' : String(v); }).filter(Boolean);
    return out.length ? out : ['all'];
  }
  function toggleSelection(current, value) {
    value = String(value || 'all');
    let next = selectionArray(current);
    if (value === 'all') return ['all'];
    next = next.filter(function (x) { return x !== 'all'; });
    if (next.includes(value)) next = next.filter(function (x) { return x !== value; });
    else next.push(value);
    return next.length ? next : ['all'];
  }
  function renderPicks(mount, items, selected) {
    const values = selectionArray(selected);
    mount.innerHTML = items.map(function (item) {
      const value = String(itemValue(item));
      return '<button type="button" data-value="' + U.escapeHtml(value) + '" class="' + (values.includes(value) ? 'on' : '') + '">' + U.escapeHtml(itemLabel(item, lang === 'bi' ? I18.lang : lang)) + '</button>';
    }).join('');
  }
  function scopeItems() {
    if (typeof C.telegramScopes === 'function') {
      const dynamic = C.telegramScopes();
      if (Array.isArray(dynamic) && dynamic.length) return dynamic;
    }
    if (Array.isArray(C.telegramScopes) && C.telegramScopes.length) return C.telegramScopes;
    const field = C.scopeField || C.groupField;
    const seen = new Set();
    (C.read() || []).forEach(function (r) {
      const v = String(r && r[field] != null ? r[field] : '').trim();
      if (v) seen.add(v);
    });
    return [{ value: 'all', zh: '全部', en: 'All', km: 'ទាំងអស់' }]
      .concat(Array.from(seen).sort().map(function (v) { return { value: v, zh: v, en: v, km: v }; }));
  }
  function renderScopeLabel() {
    scopeLabel.textContent = C.telegramScopeLabel ? itemLabel(C.telegramScopeLabel, I18.lang) : I18.t('gc.selectScope');
  }
  function renderScope() {
    const items = scopeItems();
    if (C.telegramScopeMultiple) {
      scopeSelect.hidden = true;
      scopePicks.hidden = false;
      const valid = new Set(items.map(function (x) { return String(itemValue(x)); }));
      scope = selectionArray(scope).filter(function (x) { return valid.has(x); });
      if (!scope.length) scope = ['all'];
      renderPicks(scopePicks, items, scope);
      return;
    }
    scopeSelect.hidden = false;
    scopePicks.hidden = true;
    scopeSelect.innerHTML = items.map(function (x) { return option(itemValue(x), itemLabel(x)); }).join('');
    if (!items.some(function (x) { return String(itemValue(x)) === String(scope); })) scope = itemValue(items[0]) || 'all';
    scopeSelect.value = scope;
  }
  function renderPeriods() {
    const keys = { day: 'gc.day', week: 'gc.week', month: 'gc.month', year: 'gc.year', all: 'gc.all' };
    periodSelect.innerHTML = ['day', 'week', 'month', 'year', 'all']
      .map(function (x) { return option(x, I18.t(keys[x])); }).join('');
    periodSelect.value = period;
  }
  function renderSlots() {
    const dynamicSlots = typeof C.telegramSlots === 'function' ? C.telegramSlots() : C.telegramSlots;
    const items = Array.isArray(dynamicSlots) && dynamicSlots.length
      ? dynamicSlots
      : [{ value: 'all', zh: '全部時段', en: 'All slots', km: 'គ្រប់ពេល' }];
    if (C.telegramSlotMultiple) {
      slotSelect.hidden = true;
      slotPicks.hidden = false;
      const valid = new Set(items.map(function (x) { return String(itemValue(x)); }));
      slot = selectionArray(slot).filter(function (x) { return valid.has(x); });
      if (!slot.length) slot = ['all'];
      renderPicks(slotPicks, items, slot);
      tgModal.querySelector('.gc-slot-field').classList.toggle('gc-field-muted', !dynamicSlots);
      return;
    }
    slotSelect.hidden = false;
    slotPicks.hidden = true;
    slotSelect.innerHTML = items.map(function (x) { return option(itemValue(x), itemLabel(x, lang === 'bi' ? I18.lang : lang)); }).join('');
    if (!items.some(function (x) { return String(itemValue(x)) === String(slot); })) slot = itemValue(items[0]) || 'all';
    slotSelect.value = slot;
    tgModal.querySelector('.gc-slot-field').classList.toggle('gc-field-muted', !dynamicSlots);
  }
  function renderLanguages() {
    langSelect.innerHTML = [
      option('bi', I18.t('gc.bilingual')), option('zh', I18.t('gc.chinese')),
      option('en', I18.t('gc.english')), option('km', I18.t('gc.khmer'))
    ].join('');
    langSelect.value = lang;
  }
  function renderGroups() {
    const items = Array.isArray(C.telegramGroups) && C.telegramGroups.length
      ? C.telegramGroups
      : [{ value: C.chatId || DEFAULT_CHAT_ID, zh: I18.t('gc.defaultGroup'), en: I18.t('gc.defaultGroup'), km: I18.t('gc.defaultGroup') }];
    groupSelect.innerHTML = items.map(function (x) { return option(itemValue(x), itemLabel(x)); }).join('');
  }
  function dateFromRecord(raw) {
    if (raw == null || raw === '') return null;
    const s = String(raw);
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T00:00:00' : raw);
    return isNaN(d) ? null : d;
  }
  function periodReference(d, p) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (p === 'week') x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    if (p === 'month') x.setDate(1);
    if (p === 'year') { x.setMonth(0); x.setDate(1); }
    return U.ymd(x);
  }
  function refLabel(ref, p) {
    const d = new Date(ref + 'T00:00:00');
    if (p === 'year') return String(d.getFullYear());
    if (p === 'month') return ref.slice(0, 7);
    if (p === 'week') {
      const end = new Date(d); end.setDate(end.getDate() + 6);
      return d.getFullYear() + '-W' + String(U.weekNo(d)).padStart(2, '0') + ' (' + ref.slice(5) + '–' + U.ymd(end).slice(5) + ')';
    }
    if (p === 'all') return I18.t('gc.all');
    return ref;
  }
  function refreshPeriodOptions() {
    const refs = new Set();
    (C.read() || []).forEach(function (r) {
      const d = dateFromRecord(r && r[C.dateField]);
      if (d) refs.add(periodReference(d, period));
    });
    if (period === 'all') refs.add(U.ymd(new Date()));
    if (!refs.size) refs.add(periodReference(new Date(), period));
    const values = Array.from(refs).sort().reverse();
    if (!values.includes(periodRef)) periodRef = values[0];
    refSelect.innerHTML = values.map(function (x) { return option(x, refLabel(x, period)); }).join('');
    refSelect.value = periodRef;
    refSelect.disabled = period === 'all';
  }
  function collectPhotos() {
    const list = GC.telegram.filter(C.read() || [], C, period, periodRef, scope, slot);
    const out = [];
    list.forEach(function (r) {
      U.asArray(r && r[C.photoField]).forEach(function (p) {
        if (typeof p === 'string' && p.indexOf('data:image/') === 0 && out.length < 5) out.push(p);
      });
    });
    return out;
  }
  async function buildPacket() {
    const custom = typeof C.telegramBuilder === 'function'
      ? await C.telegramBuilder({ period: period, mode: mode, ref: periodRef, scope: scope, slot: slot, lang: lang, cfg: C })
      : null;
    const built = custom == null ? GC.telegram.buildText(C, period, mode, periodRef, scope, slot, lang) : custom;
    const packet = typeof built === 'string' ? { text: built } : (built || {});
    if (!Array.isArray(packet.photos) || !packet.photos.length) packet.photos = collectPhotos();
    const dashUrl = C.dashboardUrl || DASHBOARD_BASE_URL + (DASHBOARD_PATHS[C.tool] || 'ac_gascheck_portal_v1.html');
    if (!packet.buttons) packet.buttons = [[{ text: '📊 Open Dashboard / 開啟平台', url: dashUrl }]];
    return packet;
  }
  async function updatePreview() {
    const token = ++previewToken;
    currentPacket = null;
    preview.classList.add('busy');
    try {
      const packet = await buildPacket();
      if (token !== previewToken) return;
      currentPacket = packet;
      preview.innerHTML = String(packet.text || '').replace(/\n/g, '<br>');
      if (packet.photos && packet.photos.length) {
        const photoLabel = lang === 'en' ? 'Photos' : (lang === 'km' ? 'រូបថត' : (lang === 'zh' ? '照片' : I18.t('gc.photo')));
        preview.innerHTML += '<div class="gc-preview-photo">📷 ' + packet.photos.length + ' ' + U.escapeHtml(photoLabel) + '</div>';
      }
    } catch (e) {
      if (token === previewToken) {
        currentPacket = null;
        preview.textContent = '❌ ' + e.message;
      }
    }
    if (token === previewToken) preview.classList.remove('busy');
  }
  function refreshModal() {
    renderScope();
    renderPeriods();
    renderSlots();
    renderLanguages();
    renderGroups();
    refreshPeriodOptions();
    I18.apply(tgModal);
    renderScopeLabel();
    updatePreview();
  }
  function setModalOpen(modal, yes) {
    if (!modal) return;
    modal.classList.toggle('open', !!yes);
    document.body.classList.toggle('gc-modal-open', !!document.querySelector('.gc-common-modal.open'));
  }
  function openTelegram() {
    refreshModal();
    sendState.textContent = '';
    setModalOpen(tgModal, true);
  }
  async function sendCurrentTelegram() {
    sendButton.disabled = true;
    sendState.textContent = I18.t('gc.sync');
    try {
      const packet = await buildPacket();
      await GC.telegram.send(
        packet.text, packet.photos, packet.buttons,
        groupSelect.value || DEFAULT_CHAT_ID, C.tool, reportActivityMeta()
      );
      sendState.textContent = '✓ ' + I18.t('gc.sentTelegram');
      GC.toast('✈️ ' + I18.t('gc.sentTelegram'), 'success');
      if (cloudControl && (mode === 'summary' || mode === 'approval')) cloudControl.scheduleAuto('telegram_' + mode);
      setTimeout(function () { setModalOpen(tgModal, false); }, 450);
    } catch (e) {
      sendState.textContent = '✕ ' + e.message;
      GC.toast('❌ ' + e.message, 'error');
    }
    sendButton.disabled = false;
  }

  tgModal.querySelectorAll('[data-gc-close]').forEach(function (b) { b.onclick = function () { setModalOpen(tgModal, false); }; });
  tgModal.addEventListener('click', function (e) { if (e.target === tgModal) setModalOpen(tgModal, false); });
  tgModal.querySelectorAll('[data-gc-mode]').forEach(function (b) {
    b.onclick = function () {
      mode = b.dataset.gcMode || 'summary';
      tgModal.querySelectorAll('[data-gc-mode]').forEach(function (x) { x.classList.toggle('on', x === b); });
      updatePreview();
    };
  });
  scopeSelect.onchange = function () { scope = scopeSelect.value || 'all'; updatePreview(); };
  scopePicks.onclick = function (e) {
    const b = e.target.closest('button[data-value]');
    if (!b) return;
    scope = toggleSelection(scope, b.dataset.value);
    renderScope(); updatePreview();
  };
  periodSelect.onchange = function () { period = periodSelect.value || 'month'; refreshPeriodOptions(); updatePreview(); };
  refSelect.onchange = function () { periodRef = refSelect.value || U.ymd(new Date()); updatePreview(); };
  slotSelect.onchange = function () { slot = slotSelect.value || 'all'; updatePreview(); };
  slotPicks.onclick = function (e) {
    const b = e.target.closest('button[data-value]');
    if (!b) return;
    slot = toggleSelection(slot, b.dataset.value);
    renderSlots(); updatePreview();
  };
  langSelect.onchange = function () { lang = langSelect.value || 'bi'; renderScope(); renderSlots(); updatePreview(); };
  groupSelect.onchange = updatePreview;
  sendButton.onclick = sendCurrentTelegram;
  tools.querySelector('[data-gc-open-tg]').onclick = openTelegram;

  if (importModal) {
    importModal.querySelectorAll('[data-gc-close]').forEach(function (b) { b.onclick = function () { setModalOpen(importModal, false); }; });
    importModal.addEventListener('click', function (e) { if (e.target === importModal) setModalOpen(importModal, false); });
    tools.querySelector('[data-gc-open-import]').onclick = function () { I18.apply(importModal); setModalOpen(importModal, true); };
  }

  let applyingModuleLanguage = false;
  function renderHeaderLanguage() {
    tools.querySelectorAll('[data-gc-ui-lang]').forEach(function (b) {
      b.classList.toggle('on', b.dataset.gcUiLang === I18.lang);
    });
    I18.apply(tools);
    const up = tools.querySelector('[data-gc-up]');
    const down = tools.querySelector('[data-gc-down]');
    const tg = tools.querySelector('[data-gc-open-tg]');
    const imp = tools.querySelector('[data-gc-open-import]');
    const exp = tools.querySelector('[data-gc-export]');
    if (up) { up.title = I18.t('gc.upload'); up.setAttribute('aria-label', up.title); }
    if (down) { down.title = I18.t('gc.download'); down.setAttribute('aria-label', down.title); }
    if (tg) tg.title = I18.t('gc.telegramTitle');
    if (imp) imp.title = I18.t('gc.importTitle');
    if (exp) exp.title = I18.t('gc.export');
  }
  function applyModuleLanguage(l) {
    if (applyingModuleLanguage || !['zh', 'en', 'km'].includes(l)) return;
    applyingModuleLanguage = true;
    try {
      if (I18.lang !== l) I18.set(l);
      if (typeof global.setLang === 'function') global.setLang(l);
      else if (global.i18n && typeof global.i18n.set === 'function') global.i18n.set(l);
    } catch (e) { console.warn('[AC GASCHECK] language:', e); }
    applyingModuleLanguage = false;
    renderHeaderLanguage();
    if (tgModal.classList.contains('open')) refreshModal();
  }
  tools.querySelectorAll('[data-gc-ui-lang]').forEach(function (b) {
    b.onclick = function () { applyModuleLanguage(b.dataset.gcUiLang); };
  });
  window.addEventListener('gc:langchange', function () {
    renderHeaderLanguage();
    if (tgModal.classList.contains('open')) refreshModal();
    if (importModal && importModal.classList.contains('open')) I18.apply(importModal);
  });

  applyModuleLanguage(I18.lang);
  refreshPeriodOptions();
  return {
    refresh: refreshPeriodOptions,
    getPeriod: function () { return period; },
    sendTelegram: openTelegram,
    openImport: function () { if (importModal) setModalOpen(importModal, true); }
  };
};

GC.attachLegacy = function (cfg) {
  /* cfg = {
       tool, title, lsKey,
       read()  -> Array   讀取記錄陣列
       write(list)        寫回記錄陣列
       dateField, idField,
       groupField          儀表板長條圖分組欄位
       importSchema        智慧匯入欄位對應
       importParser(file,schema) -> Promise<{objects,headers,...}>（可自訂跨分頁解析）
       telegramScopes      [{value,zh,en,km}]（Telegram 資料類型選擇）
       telegramSlots       [{value,zh,en,km}]（Telegram 發送時段選擇）
       telegramSlotFilter(record, value) 依記錄內時間欄位篩選
       telegramLanguage    true 時顯示摘要語言選擇（bi/zh/en/km）
       scopeField          Telegram／統計分組篩選欄位
       periodRef           true 時顯示基準日期
       weather:  bool      是否顯示天氣統計
       photo:    bool      是否顯示照片統計
       gasUrl,
       telegramBuilder({ period, mode, ref, scope, slot, lang, cfg }) -> string|{text,photos}  (optional module-specific report)
     } */
  cfg = cfg || {};
  if (!cfg.__storageReady && STORAGE && STORAGE.ready) {
    const next = Object.assign({}, cfg, { __storageReady: true });
    STORAGE.ready.then(() => GC.attach(next));
    return { refresh: () => {}, getPeriod: () => 'month' };
  }
  const C = Object.assign({
    dateField: 'date', idField: 'id', groupField: null,
    weather: false, photo: false, importSchema: null, importParser: null,
    telegramScopes: null, scopeField: null, telegramSlots: null, telegramSlotFilter: null, telegramLanguage: false, telegramDefaultLanguage: 'bi', telegramDefaultSlot: 'all', periodRef: false,
    weatherField: 'weather',   // 各模組欄位名可能不同（如 temperature 用 'wx'）
    photoField:   'photos'
  }, cfg || {});

  // 固定使用已確認可用的 Web App 入口；模組內舊的 gasUrl 只保留相容性，不再要求使用者手動設定。
  CLOUD.setUrl(DEFAULT_GAS_URL);

  /* ── 面板 DOM：Portal 只有一個共用操作入口 ──
     共用列統一負責雲端、Telegram、期間、訊息類型；面板只保留
     Dashboard 和一個智慧匯入拖放區，避免同一頁重複渲染同一組功能。 */
  const bar = document.createElement('div');
  bar.className = 'gc-tools-card';
  bar.innerHTML = `
    <div class="gc-action-strip" id="gcActionStrip">
      <span class="gc-action-heading">☁️ <span data-i="gc.quickActions">${U.escapeHtml(I18.t('gc.quickActions'))}</span></span>
      <div id="gcTopCloud"></div>
      <button type="button" class="gc-action-btn gc-tg-btn" data-gc-send>✈️ <span data-i="gc.telegram">${U.escapeHtml(I18.t('gc.telegram'))}</span></button>
      ${C.importSchema ? `<button type="button" class="gc-action-btn gc-import-btn" data-gc-import>📥 <span data-i="gc.smartImport">${U.escapeHtml(I18.t('gc.smartImport'))}</span></button>` : ''}
      ${C.telegramScopes ? `<span class="gc-action-label" data-i="gc.dataType">${U.escapeHtml(I18.t('gc.dataType'))}</span><select class="gc-scope-select" data-gc-scope aria-label="${U.escapeHtml(I18.t('gc.dataType'))}"></select>` : ''}
      ${C.telegramSlots ? `<span class="gc-action-label" data-i="gc.slot">${U.escapeHtml(I18.t('gc.slot'))}</span><select class="gc-slot-select" data-gc-slot aria-label="${U.escapeHtml(I18.t('gc.slot'))}"></select>` : ''}
      <span class="gc-action-label" data-i="gc.period">${U.escapeHtml(I18.t('gc.period'))}</span>
      <div id="gcQuickPeriod"></div>
      ${C.periodRef ? `<span class="gc-action-label" data-i="gc.refDate">${U.escapeHtml(I18.t('gc.refDate'))}</span><button type="button" class="gc-ref-nav" data-gc-ref-prev aria-label="Previous date">◀</button><input class="gc-ref-date" data-gc-ref type="date" aria-label="${U.escapeHtml(I18.t('gc.refDate'))}"><button type="button" class="gc-ref-nav" data-gc-ref-next aria-label="Next date">▶</button>` : ''}
      <span class="gc-action-label" data-i="gc.mode">${U.escapeHtml(I18.t('gc.mode'))}</span>
      <div class="gc-mode" id="gcQuickMode">
        <button type="button" class="gc-mode-btn on" data-gc-mode="summary">📄 <span data-i="gc.summary">${U.escapeHtml(I18.t('gc.summary'))}</span></button>
        <button type="button" class="gc-mode-btn" data-gc-mode="review">🔎 <span data-i="gc.review">${U.escapeHtml(I18.t('gc.review'))}</span></button>
        <button type="button" class="gc-mode-btn" data-gc-mode="approval">✅ <span data-i="gc.approval">${U.escapeHtml(I18.t('gc.approval'))}</span></button>
      </div>
      ${C.telegramLanguage ? `<span class="gc-action-label" data-i="gc.reportLanguage">${U.escapeHtml(I18.t('gc.reportLanguage'))}</span><select class="gc-lang-select" data-gc-lang aria-label="${U.escapeHtml(I18.t('gc.reportLanguage'))}"><option value="bi">${U.escapeHtml(I18.t('gc.bilingual'))}</option><option value="zh">${U.escapeHtml(I18.t('gc.chinese'))}</option><option value="en">${U.escapeHtml(I18.t('gc.english'))}</option><option value="km">${U.escapeHtml(I18.t('gc.khmer'))}</option></select>` : ''}
      <span class="gc-action-status" id="gcTelegramState" aria-live="polite"></span>
    </div>
    <div class="gc-panel" id="gcPanel">
      <div class="gc-panel-head">
        <span class="gc-panel-title">📊 <span data-i="gc.dashboard">${U.escapeHtml(I18.t('gc.dashboard'))}</span></span>
        <span class="gc-storage-badge" data-i="gc.indexedDb">${U.escapeHtml(I18.t('gc.indexedDb'))}</span>
      </div>
      <div class="gc-panel-body">
        <div class="gc-sec">
          <div id="gcDash"></div>
        </div>
        ${C.importSchema ? `<div class="gc-sec gc-import-sec">
          <div class="gc-sec-t">📥 <span data-i="gc.smartImport">${U.escapeHtml(I18.t('gc.smartImport'))}</span></div>
          <div class="gc-cloud-info" data-i="gc.directHint">${U.escapeHtml(I18.t('gc.directHint'))}</div>
          <div id="gcImport"></div>
        </div>` : ''}
      </div>
    </div>
  `;
  const contentMount = document.querySelector('.main, .content, .page, .wrap') || document.body;
  if (contentMount.firstChild) contentMount.insertBefore(bar, contentMount.firstChild);
  else contentMount.appendChild(bar);

  /* 舊模組的連線／雲端／Telegram 區塊只保留一份功能入口。
     只隱藏重複操作區，不刪除業務設定、記錄表或歷史資料。 */
  if (C.hideLegacyTools !== false) {
    const hide = el => { if (el) el.classList.add('gc-legacy-hidden'); };
    const hideBlock = el => {
      if (!el) return;
      const block = el.closest('.card, .sec, .section, .panel, .pnl, .tab-content, .pane') || el.parentElement;
      hide(block || el);
    };
    ['#gas-panel', '#gas-panel-card', '#tab-import', '#tab-tg', '#nav-import', '#nav-telegram', '#tab-telegram', '#pnl-import', '#pnl-tg', '#pnl-telegram', '#panel-import', '#panel-telegram', '#section-import']
      .forEach(sel => document.querySelectorAll(sel).forEach(hide));
    document.querySelectorAll('[onclick*="switchTab(\'import\')"], [onclick*="switchTab(\'tg\')"], [onclick*="switchTab(\'telegram\')"]')
      .forEach(hide);
    ['#cfg-gas', '#cfg-token', '#cfg-chat', '#tg-tok', '#tg-chat', '#tg-token', '#tg-period']
      .forEach(sel => document.querySelectorAll(sel).forEach(hideBlock));
    document.querySelectorAll('[onclick*="openImport"], [onclick*="uploadCloud"], [onclick*="downloadCloud"], [onclick*="cloud.push"], [onclick*="cloud.pull"], [onclick*="syncUp"], [onclick*="syncDown"], [onclick*="saveToGAS"], [onclick*="loadFromGAS"], [onclick*="sendTg"], [onclick*="sendTG"], [onclick*="saveTg"], [onclick*="sendToTelegram"], [onclick*="sendAnalyticsTelegram"], [onclick*="previewTelegramMessage"]')
      .forEach(hide);
  }

  /* ── 元件掛載 ── */
  let period = 'month';
  let mode = 'summary';
  let periodRef = C.periodRef ? U.ymd(new Date()) : null;
  let scope = 'all';
  let slot = C.telegramDefaultSlot || 'all';
  let lang = C.telegramDefaultLanguage || 'bi';
  const scopeSelect = bar.querySelector('[data-gc-scope]');
  const slotSelect = bar.querySelector('[data-gc-slot]');
  const langSelect = bar.querySelector('[data-gc-lang]');
  const refInput = bar.querySelector('[data-gc-ref]');
  const refPrev = bar.querySelector('[data-gc-ref-prev]');
  const refNext = bar.querySelector('[data-gc-ref-next]');
  const scopeLabel = item => typeof item === 'string' ? item : (item[I18.lang] || item.zh || item.en || item.value || '');
  function renderScope() {
    if (!scopeSelect || !Array.isArray(C.telegramScopes)) return;
    scopeSelect.innerHTML = C.telegramScopes.map(item => `<option value="${U.escapeHtml(item.value)}">${U.escapeHtml(scopeLabel(item))}</option>`).join('');
    scopeSelect.value = scope;
  }
  function renderSlot() {
    if (!slotSelect || !Array.isArray(C.telegramSlots)) return;
    slotSelect.innerHTML = C.telegramSlots.map(item => `<option value="${U.escapeHtml(typeof item === 'string' ? item : item.value)}">${U.escapeHtml(GC.telegram.slotText(item, lang))}</option>`).join('');
    slotSelect.value = slot;
  }
  function renderLanguage() {
    if (!langSelect) return;
    langSelect.innerHTML = '<option value="bi">' + U.escapeHtml(I18.t('gc.bilingual')) + '</option><option value="zh">' + U.escapeHtml(I18.t('gc.chinese')) + '</option><option value="en">' + U.escapeHtml(I18.t('gc.english')) + '</option><option value="km">' + U.escapeHtml(I18.t('gc.khmer')) + '</option>';
    langSelect.value = lang;
  }
  if (slotSelect) slotSelect.onchange = () => { slot = slotSelect.value || 'all'; refresh(); };
  if (langSelect) { langSelect.onchange = () => { lang = langSelect.value || 'bi'; renderSlot(); refresh(); }; }
  renderScope();
  renderLanguage();
  renderSlot();
  if (refInput) {
    refInput.value = periodRef || '';
    refInput.onchange = () => { periodRef = refInput.value || U.ymd(new Date()); refresh(); };
  }
  function moveReference(delta) {
    const d = new Date((periodRef || U.ymd(new Date())) + 'T00:00:00');
    if (period === 'week') d.setDate(d.getDate() + delta * 7);
    else if (period === 'month') d.setMonth(d.getMonth() + delta);
    else if (period === 'year') d.setFullYear(d.getFullYear() + delta);
    else d.setDate(d.getDate() + delta);
    periodRef = U.ymd(d);
    if (refInput) refInput.value = periodRef;
    refresh();
  }
  if (refPrev) refPrev.onclick = () => moveReference(-1);
  if (refNext) refNext.onclick = () => moveReference(1);
  if (scopeSelect) scopeSelect.onchange = () => { scope = scopeSelect.value || 'all'; refresh(); };
  const quickPeriod = GC.period.mount('#gcQuickPeriod', {
    value: period,
    onChange: m => { period = m; refresh(); }
  });
  bar.querySelectorAll('[data-gc-mode]').forEach(btn => {
    btn.onclick = () => {
      mode = btn.dataset.gcMode || 'summary';
      bar.querySelectorAll('[data-gc-mode]').forEach(x => x.classList.toggle('on', x === btn));
    };
  });

  const cloudOpt = {
    tool: C.tool, idKey: C.idField, tsKey: 'updatedAt', dateField:C.dateField, photoField:C.photoField, extra:C.extra,
    toCloud: C.toCloud,
    fromCloud: C.fromCloud,
    getList: () => C.read() || [],
    setList: list => C.write(list),
    onRemote: d => { if (C.onRemote) C.onRemote(d || {}); },
    onDone: () => { refresh(); if (C.onSync) C.onSync(); }
  };
  // 雲端按鈕固定放在頁面頂部快捷列，避免跑到頁面底部或被浮動圖示遮住。
  const cloudControl = GC.mountCloudButtons('#gcTopCloud', cloudOpt);

  const sendTelegram = bar.querySelector('[data-gc-send]');
  const telegramState = bar.querySelector('#gcTelegramState');
  async function sendCurrentTelegram() {
    if (sendTelegram) sendTelegram.disabled = true;
    if (telegramState) telegramState.textContent = I18.t('gc.sync');
    try {
      const customText = typeof C.telegramBuilder === 'function'
        ? await C.telegramBuilder({ period, mode, ref: periodRef, scope, slot, lang, cfg: C })
        : null;
      const built = customText == null ? GC.telegram.buildText(C, period, mode, periodRef, scope, slot, lang) : customText;
      const packet = typeof built === 'string' ? { text: built, photos: [] } : (built || { text: '', photos: [] });
      const dashUrl = C.dashboardUrl || DASHBOARD_BASE_URL + (DASHBOARD_PATHS[C.tool] || 'ac_gascheck_portal_v1.html');
      const buttons = packet.buttons || [[{text:'📊 Open Dashboard / 開啟平台',url:dashUrl}]];
      await GC.telegram.send(packet.text, packet.photos, buttons);
      if (typeof C.onTelegramSent === 'function') {
        await C.onTelegramSent({ period, mode, ref:periodRef, scope, slot, lang, packet });
      }
      if (telegramState) telegramState.textContent = '✓ ' + I18.t('gc.sentTelegram');
      GC.toast('✈️ ' + I18.t('gc.sentTelegram'), 'success');
      if (cloudControl && (mode === 'summary' || mode === 'approval')) cloudControl.scheduleAuto('telegram_' + mode);
    } catch (e) {
      if (telegramState) telegramState.textContent = '✕ ' + e.message;
      GC.toast('❌ ' + I18.t('gc.upFail') + ': ' + e.message, 'error');
    }
    if (sendTelegram) sendTelegram.disabled = false;
  }
  if (sendTelegram) sendTelegram.onclick = sendCurrentTelegram;

  if (C.importSchema) {
    const importMount = bar.querySelector('#gcImport');
    const openImport = () => {
      const sec = bar.querySelector('.gc-import-sec');
      if (sec) { sec.scrollIntoView({ behavior: 'smooth', block: 'center' }); sec.classList.add('gc-import-focus'); setTimeout(() => sec.classList.remove('gc-import-focus'), 900); }
    };
    const importButton = bar.querySelector('[data-gc-import]');
    if (importButton) importButton.onclick = openImport;
    GC.import.mount(importMount, {
      schema: C.importSchema,
      parse: C.importParser,
      onData: (rows, meta) => {
        const cur = C.read() || [];
        rows.forEach(r => {
          r[C.idField] = r[C.idField] || U.uid('imp');
          r.updatedAt = U.now();
          delete r._raw;
        });
        const merged = typeof C.mergeImport === 'function' ? C.mergeImport(cur, rows) : cur.concat(rows);
        C.write(merged);
        refresh();
        GC.toast(`✅ ${rows.length} ${I18.t('gc.imported')} — ${meta.fileName}`, 'success');
        if (C.onImport) C.onImport(rows);
      }
    });
  }

  /* ── 重新整理儀表板 ── */
  function refresh() {
    const all  = C.read() || [];
    let view = GC.telegram.filter(all, C, period, periodRef, scope, slot);
    const cards = [
      { label: I18.t('gc.records'), value: view.length, color: '#1A3E78' },
      { label: I18.t('gc.total'),   value: all.length, sub: I18.t('gc.all'), color: '#5A6478' }
    ];
    if (C.photo)
      cards.push({ label: I18.t('gc.photo'),
        value: view.filter(r => { const p = U.asArray(r[C.photoField]); return p && p.length; }).length,
        color: '#16653A' });
    if (C.weather)
      cards.push({ label: I18.t('gc.weather'),
        value: view.filter(r => r[C.weatherField]).length, color: '#7D4E00' });

    const bars = C.groupField
      ? { title: C.groupLabel || C.groupField,
          data: GC.dash.groupBy(view, r => r[C.groupField]).slice(0, 7) }
      : null;

    GC.dash.render('#gcDash', { cards, bars });

    const note = bar.querySelector('#gcCloudNote');
    if (note) note.textContent =
      `${I18.t('gc.total')}: ${all.length} ｜ tool=${C.tool}`;
    I18.apply(bar);
  }

  /* ── 分頁內工具列：面板保持可見，避免智慧匯入／雲端按鈕被藏起來 ── */
  const panel = bar.querySelector('#gcPanel');
  if (panel) panel.classList.add('open');
  window.addEventListener('gc:langchange', () => { renderScope(); renderLanguage(); renderSlot(); refresh(); });

  refresh();
  return { refresh, getPeriod: () => period, sendTelegram: sendCurrentTelegram };
};

/* ── 面板樣式 ── */
const BAR_CSS = `
.gc-tools-card{display:block;width:100%;max-width:none;margin:0 0 16px;font-family:inherit;scroll-margin-top:12px}
.gc-legacy-hidden{display:none!important}
.gc-unified-shell{position:relative;z-index:35;width:100%;border-bottom:1px solid #DCE6EF;background:linear-gradient(90deg,#F8FBFD 0%,#FFFFFF 50%,#F2FAF8 100%);box-shadow:0 3px 12px rgba(22,52,80,.08);font-family:inherit}
.gc-head-tools{width:100%;max-width:1600px;min-width:0;margin:0 auto;padding:8px 14px;display:flex;align-items:center;justify-content:flex-start;gap:7px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;font-family:inherit}
.gc-head-tools::-webkit-scrollbar{display:none}
.gc-toolbar-title{display:inline-flex;align-items:center;gap:5px;color:#183B66;font:800 12px/1 inherit;white-space:nowrap;margin-right:2px}
.gc-cloud-state{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:0 10px;border:1px solid #C9D6E4;border-radius:18px;color:#4D6078;background:#fff;font:600 11px/1.1 inherit;white-space:nowrap}
.gc-cloud-state i{display:block;width:7px;height:7px;border-radius:50%;background:#8BA0B8}
.gc-cloud-state.ok i{background:#2DD879;box-shadow:0 0 0 3px rgba(45,216,121,.14)}
.gc-cloud-state.busy i{background:#E9A21B;box-shadow:0 0 0 3px rgba(233,162,27,.15);animation:gcPulse 1s ease-in-out infinite}
.gc-cloud-state.warning i{background:#E9A21B}.gc-cloud-state.error i{background:#D8424A;box-shadow:0 0 0 3px rgba(216,66,74,.13)}
@keyframes gcPulse{50%{opacity:.35;transform:scale(.75)}}
.gc-head-tools .gc-cloud-btns{gap:5px}
.gc-head-tools .gc-cloud-btn,.gc-head-btn{height:38px;min-width:40px;padding:0 11px;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid #B9D9EA;border-radius:9px;background:#EDF8FC;color:#126B91;font:800 12px/1 inherit;cursor:pointer;white-space:nowrap;box-shadow:none;transition:.16s}
.gc-head-tools .gc-cloud-btn:hover{background:#DDF2FA;border-color:#65B5D6}
.gc-head-btn:hover{transform:translateY(-1px);filter:brightness(.98)}
.gc-btn-ico{font-size:15px;line-height:1}.gc-btn-label{white-space:nowrap}
.gc-head-import{background:#FFF8E8;border-color:#EBCB83;color:#865C08}
.gc-head-tg{background:#EEF3FF;border-color:#B8C8F0;color:#3156A5}
.gc-head-export{background:#F7F8FA;border-color:#D5DCE5;color:#48586C}
.gc-head-langs{height:36px;display:inline-flex;align-items:stretch;border:1px solid #CBD5E1;border-radius:8px;overflow:hidden;background:#fff}
.gc-head-langs{margin-left:auto;flex:0 0 auto}
.gc-head-langs button{min-width:38px;padding:0 8px;border:0;border-right:1px solid #CBD5E1;background:#fff;color:#334155;font:700 11px/1 inherit;cursor:pointer}
.gc-head-langs button:last-child{border-right:0}
.gc-head-langs button.on{background:#17B981;color:#fff}
.gc-modal-open{overflow:hidden!important}
.gc-common-modal{display:none;position:fixed;inset:0;z-index:2147483000;padding:22px;background:rgba(8,18,35,.62);backdrop-filter:blur(3px);align-items:center;justify-content:center;font-family:inherit;color:#1E2A3B}
.gc-common-modal.open{display:flex}
.gc-modal-card{width:min(760px,96vw);max-height:92vh;display:flex;flex-direction:column;background:#fff;border:1px solid #D8E0EB;border-radius:20px;box-shadow:0 28px 80px rgba(3,14,31,.34);overflow:hidden;animation:gcModalIn .16s ease-out}
@keyframes gcModalIn{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}
.gc-modal-head{display:flex;align-items:center;gap:10px;padding:17px 22px;border-bottom:1px solid #E6EAF0}
.gc-modal-head strong{flex:1;font-size:17px;color:#172238}
.gc-modal-head button{width:36px;height:36px;border:0;border-radius:9px;background:transparent;color:#718096;font-size:27px;line-height:1;cursor:pointer}
.gc-modal-head button:hover{background:#F1F5F9;color:#1E293B}
.gc-modal-body{display:grid;grid-template-columns:1fr 1fr;gap:14px 16px;padding:20px 22px;overflow:auto}
.gc-field{display:flex;flex-direction:column;gap:7px;min-width:0;color:#63718A;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}
.gc-field-wide{grid-column:1/-1}
.gc-field select{width:100%;height:46px;padding:0 13px;border:1px solid #C9D5E5;border-radius:10px;background:#fff;color:#233149;font:500 14px/1 inherit;text-transform:none;outline:none}
.gc-field select:focus{border-color:#1685B7;box-shadow:0 0 0 3px rgba(22,133,183,.12)}
.gc-field-muted{opacity:.62}
.gc-multi-picks{display:flex;flex-wrap:wrap;gap:7px;padding:8px;border:1px solid #C9D5E5;border-radius:10px;background:#F8FAFD;text-transform:none}
.gc-multi-picks[hidden]{display:none}
.gc-multi-picks button{min-height:38px;padding:8px 12px;border:1px solid #C9D5E5;border-radius:999px;background:#fff;color:#40506A;font:700 12px/1.15 inherit;cursor:pointer}
.gc-multi-picks button.on{border-color:#1685B7;background:#0876A8;color:#fff;box-shadow:0 2px 7px rgba(8,118,168,.22)}
.gc-seg{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:4px;background:#E9EEF5;border-radius:11px}
.gc-seg button{height:42px;border:0;border-radius:8px;background:transparent;color:#3F4E66;font:700 13px/1 inherit;cursor:pointer}
.gc-seg button.on{background:#fff;color:#0876A8;box-shadow:0 1px 4px rgba(15,35,60,.16)}
.gc-preview{min-height:150px;max-height:260px;overflow:auto;padding:15px;border:1px solid #D9E2EF;border-radius:11px;background:#F3F7FC;color:#33445E;font:500 12px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:0;text-transform:none;word-break:break-word}
.gc-preview.busy{opacity:.55}
.gc-preview-photo{margin-top:9px;padding-top:8px;border-top:1px dashed #BAC7D8;color:#16714A;font-weight:800}
.gc-modal-foot{display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:14px 22px;border-top:1px solid #E6EAF0;background:#FAFBFD}
.gc-modal-foot [data-gc-send-state]{flex:1;color:#177245;font-size:12px;font-weight:700}
.gc-modal-foot button{height:43px;padding:0 20px;border-radius:10px;font:800 13px/1 inherit;cursor:pointer}
.gc-cancel{border:1px solid #CBD5E1;background:#fff;color:#334155}
.gc-primary{border:1px solid #0876A8;background:#0876A8;color:#fff}
.gc-primary:disabled{opacity:.5;cursor:wait}
.gc-import-dialog{width:min(680px,96vw)}
.gc-import-hint{margin:18px 20px 0;padding:12px 14px;border-left:4px solid #4E6FFF;border-radius:8px;background:#EEF3FF;color:#4A5872;font-size:12px;line-height:1.5}
.gc-import-mount{padding:18px 20px 22px;overflow:auto}
.gc-import-dialog .gc-import{min-height:220px}
.gc-panel{position:static;width:100%;background:#fff;border:1px solid #D8DCE6;border-radius:13px;box-shadow:0 4px 18px rgba(15,20,32,.1);display:flex;max-height:none;overflow:visible;flex-direction:column}
.gc-panel.open{display:flex}
.gc-panel-head{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:11px 14px;border-bottom:1px solid #EEF1F6;background:#F7F8FA;border-radius:13px 13px 0 0}
.gc-panel-title{font-weight:700;font-size:13px;color:#1A3E78;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gc-storage-badge{font-size:10px;color:#16653A;background:#E8F7EE;border:1px solid #BCE7CB;border-radius:12px;padding:3px 8px;white-space:nowrap}
.gc-panel-body{display:grid;grid-template-columns:minmax(320px,1fr) minmax(380px,1.15fr);gap:14px;padding:14px;overflow:visible}
.gc-sec{min-width:0;margin:0}
.gc-sec:last-child{margin-bottom:0}
.gc-import-sec{min-width:0}
.gc-import-focus{outline:3px solid rgba(78,111,255,.25);outline-offset:3px;border-radius:9px;transition:outline .2s}
.gc-sec-t{font-size:11px;font-weight:700;color:#5A6478;text-transform:uppercase;letter-spacing:.7px;margin-bottom:9px}
.gc-note{font-size:10px;color:#8892A8;margin-top:7px}
@media(max-width:1050px){.gc-panel-body{grid-template-columns:1fr 1fr}.gc-import-sec{grid-column:auto}}
@media(max-width:560px){
  .gc-head-tools{gap:5px;padding:7px 8px;overflow-x:auto}
  .gc-toolbar-title,.gc-state-label,.gc-btn-label{display:none!important}
  .gc-cloud-state{min-width:30px;width:30px;padding:0;justify-content:center}
  .gc-head-tools .gc-cloud-btn,.gc-head-btn{width:38px;min-width:38px;padding:0}
  .gc-head-langs{margin-left:auto}
  .gc-head-langs button{min-width:34px;padding:0 5px}
  .gc-common-modal{padding:8px;align-items:flex-end}
  .gc-modal-card{width:100%;max-height:94vh;border-radius:18px 18px 0 0}
  .gc-modal-head{padding:14px 16px}
  .gc-modal-body{grid-template-columns:1fr;padding:15px 16px;gap:12px}
  .gc-field-wide{grid-column:auto}
  .gc-modal-foot{padding:12px 16px}
  .gc-preview{min-height:120px;max-height:210px}
  .gc-action-strip{align-items:center;flex-wrap:nowrap;overflow-x:auto;overflow-y:visible;white-space:nowrap;padding:8px 9px}
  .gc-action-heading,.gc-action-label{width:auto;margin-left:0}
  .gc-action-strip #gcTopCloud,.gc-action-strip .gc-cloud-btns,.gc-action-strip .gc-period,.gc-mode{width:auto;flex:0 0 auto}
  .gc-action-strip .gc-cloud-btn,.gc-action-strip .gc-pd-btn,.gc-mode-btn,.gc-action-btn{flex:0 0 auto;justify-content:center;min-height:38px;touch-action:manipulation}
  .gc-mode{flex-wrap:wrap}
  .gc-panel-body{grid-template-columns:1fr}
  .gc-sec:last-child{grid-column:auto}
  .gc-storage-badge{order:3}
}
`;
(function(){
  function inj(){ if(document.getElementById('gc-bar-css'))return;
    const s=document.createElement('style'); s.id='gc-bar-css'; s.textContent=BAR_CSS; document.head.appendChild(s); }
  if(document.head) inj(); else document.addEventListener('DOMContentLoaded', inj);
})();

/* ── 匯出 ── */
GC.version = '2.6-water-key-asset';
global.GC = GC;
global.GASCheckCore = GC;

})(window);
