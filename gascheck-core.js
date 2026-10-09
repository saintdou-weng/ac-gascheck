/* ═══════════════════════════════════════════════════════════════
   AC GASCheck — Shared Core  v3.16-key-water-daily-monthly
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

/* ── 日期／時間解析（SheetJS raw:true 序號、Date、各種文字格式）──
   GC.parseDate(v) → 'YYYY-MM-DD'（無效回 ''）
   GC.parseTime(v) → 'HH:MM'（無效回 ''）
   D/M/YYYY 預設「日在前」；只有第二段 >12 時才視為 M/D/YYYY。 */
const DATE_MONTHS = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12,
  january:1,february:2,march:3,april:4,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
function pad2(n) { return String(n).padStart(2, '0'); }
function validYmd(y, m, d, minYear) {
  y = Number(y); m = Number(m); d = Number(d);
  if (!(y >= (minYear || 1900) && y <= 2999 && m >= 1 && m <= 12 && d >= 1)) return '';
  if (d > new Date(y, m, 0).getDate()) return '';
  return y + '-' + pad2(m) + '-' + pad2(d);
}
function excelSerialDate(n) {
  n = Number(n);
  if (!isFinite(n) || n < 1 || n > 2958465) return '';
  const days = Math.floor(n + 1e-7);
  // Excel 1900 系統：以本地 1899-12-30 為第 0 天，避免 UTC 位移造成「早一天」。
  const d = new Date(1899, 11, 30 + days);
  return validYmd(d.getFullYear(), d.getMonth() + 1, d.getDate(), 1950);
}
function isDateObj(v) { return v instanceof Date || Object.prototype.toString.call(v) === '[object Date]'; }
function parseDateValue(v) {
  if (v == null || v === '' || typeof v === 'boolean') return '';
  if (isDateObj(v)) return isNaN(v.getTime()) ? '' : U.ymd(v);
  if (typeof v === 'number') {
    if (!isFinite(v)) return '';
    if (Number.isInteger(v) && v >= 19000101 && v <= 29991231) return validYmd(Math.floor(v / 10000), Math.floor(v / 100) % 100, v % 100);
    return excelSerialDate(v);
  }
  let s = String(v).trim();
  if (!s) return '';
  if (/^\d+(\.\d+)?$/.test(s)) return parseDateValue(Number(s));
  // ISO 含時區（例如 JSON 化的 Date）→ 轉本地日期
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const d = new Date(s); return isNaN(d) ? '' : U.ymd(d);
  }
  s = s.replace(/[\u200b\u00a0]/g, ' ');
  let m = s.match(/^(\d{4})\s*[-\/.年]\s*(\d{1,2})\s*[-\/.月]\s*(\d{1,2})\s*日?(?:$|[T\s,])/);
  if (m) return validYmd(m[1], m[2], m[3]);
  m = s.match(/^(\d{1,2})\s*[-\/.]\s*(\d{1,2})\s*[-\/.]\s*(\d{4}|\d{2})(?:$|[T\s,])/);
  if (m) {
    const a = +m[1], b = +m[2], y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (a > 12 && b <= 12) return validYmd(y, b, a);      // D/M/YYYY
    if (b > 12 && a <= 12) return validYmd(y, a, b);      // M/D/YYYY（只有日 >12 才能判定）
    if (a <= 12 && b <= 12) return validYmd(y, b, a);     // 預設日在前
    return '';
  }
  m = s.match(/^(\d{1,2})[\s\-\/.]*([A-Za-z]{3,9})\.?[\s\-\/.,]*(\d{4}|\d{2})\b/);
  if (m && DATE_MONTHS[m[2].toLowerCase()]) return validYmd(m[3].length === 2 ? 2000 + +m[3] : m[3], DATE_MONTHS[m[2].toLowerCase()], m[1]);
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/);
  if (m && DATE_MONTHS[m[1].toLowerCase()]) return validYmd(m[3], DATE_MONTHS[m[1].toLowerCase()], m[2]);
  return '';
}
function parseTimeValue(v) {
  if (v == null || v === '' || typeof v === 'boolean') return '';
  if (isDateObj(v)) return isNaN(v.getTime()) ? '' : pad2(v.getHours()) + ':' + pad2(v.getMinutes());
  if (typeof v === 'number') {
    if (!isFinite(v) || v < 0) return '';
    if (Number.isInteger(v)) {
      if (v === 0) return '00:00';
      if (v >= 100 && v <= 2359 && v % 100 < 60) return pad2(Math.floor(v / 100)) + ':' + pad2(v % 100); // 0830 → 08:30
      return ''; // 純日期序號沒有時間
    }
    const frac = v - Math.floor(v);
    const mins = Math.round(frac * 1440) % 1440;
    return pad2(Math.floor(mins / 60)) + ':' + pad2(mins % 60);
  }
  let s = String(v).trim();
  if (!s) return '';
  if (/^\d+\.\d+$/.test(s) || /^0$/.test(s)) return parseTimeValue(Number(s));
  if (/^\d{3,4}$/.test(s)) return parseTimeValue(Number(s));
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const d = new Date(s); return isNaN(d) ? '' : pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  s = s.replace(/^\d{4}\s*[-\/.年]\s*\d{1,2}\s*[-\/.月]\s*\d{1,2}\s*日?[T\s,]*/, '')
       .replace(/^\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4}[T\s,]*/, '').trim();
  const m = s.match(/^(上午|下午|晚上|中午|早上|凌晨)?\s*(\d{1,2})(?:\s*[:：h]\s*(\d{2})|\.(\d{2})(?!\d))?(?:\s*:\s*(\d{2}))?(?:\.\d+)?\s*(a\.?m\.?|p\.?m\.?)?/i);
  if (!m) return '';
  const minutes = m[3] != null ? m[3] : m[4];
  const ap = m[6] ? m[6].toLowerCase().replace(/\./g, '') : '';
  const zhAp = m[1] || '';
  if (minutes == null && !ap && !zhAp) return '';
  let h = Number(m[2]), mi = Number(minutes || 0);
  if (ap || /下午|晚上/.test(zhAp)) {
    if (h > 12) return '';
    if ((ap === 'pm' || /下午|晚上/.test(zhAp)) && h < 12) h += 12;
    if ((ap === 'am' || /凌晨|上午|早上/.test(zhAp)) && h === 12) h = 0;
  }
  if (h > 23 || mi > 59) return '';
  return pad2(h) + ':' + pad2(mi);
}
U.parseDate = parseDateValue;
U.parseTime = parseTimeValue;
GC.parseDate = parseDateValue;
GC.parseTime = parseTimeValue;

/* fetch 加逾時（預設 40 秒）；逾時會丟出 timeout 錯誤，讓同步狀態不會卡在「同步中」。 */
/* 讀取 90 秒；寫入等候伺服器完成（GAS 單次最長 6 分鐘，這裡 330 秒）。
   寫入逾時後伺服器其實仍在處理，若立刻重送只會排隊搶鎖、越來越慢（2026-09-30 實際發生）。 */
const FETCH_TIMEOUT_MS = 90000, WRITE_TIMEOUT_MS = 330000;
function fetchWithTimeout(url, init, ms) {
  ms = Number(ms) > 0 ? Number(ms) : FETCH_TIMEOUT_MS;
  const f = global.fetch || (typeof fetch === 'function' ? fetch : null);
  if (!f) return Promise.reject(new Error('fetch unavailable'));
  let ctrl = null, timer = 0;
  try { if (typeof AbortController === 'function') ctrl = new AbortController(); } catch (e) { ctrl = null; }
  const opts = Object.assign({}, init || {});
  if (ctrl) opts.signal = ctrl.signal;
  const timeoutError = () => { const e = new Error(GC.L ? GC.L('雲端回應逾時，請稍後再試', 'Cloud request timed out; please retry', 'Cloud មិនឆ្លើយតបទាន់ពេល សូមព្យាយាមម្ដងទៀត') : 'Cloud request timed out'); e.timeout = true; e.code = 'TIMEOUT'; return e; };
  return new Promise(function (resolve, reject) {
    timer = setTimeout(function () { try { if (ctrl) ctrl.abort(); } catch (e) {} reject(timeoutError()); }, ms);
    Promise.resolve().then(function () { return f.call(global, url, opts); }).then(function (r) { clearTimeout(timer); resolve(r); }, function (err) {
      clearTimeout(timer);
      reject(err && err.name === 'AbortError' ? timeoutError() : err);
    });
  });
}
GC.fetch = fetchWithTimeout;

/* ═══════════════════════════════════════════════════════════
   0.5 STORAGE — 業務資料放 IndexedDB；localStorage 只留小設定
   IndexedDB 是瀏覽器內建資料庫，容量通常遠大於 localStorage。
   為了不破壞既有模組，攔截指定業務 key 的 get/set/removeItem；模組仍可用
   原本同步寫法，實際內容會存到 IndexedDB。第一次開啟會自動搬移舊資料。
   ═══════════════════════════════════════════════════════════ */
const STORAGE = GC.storage = (() => {
  const DB_NAME = 'ac_gascheck_data_v1', STORE = 'kv';
  const DATA_KEY_RE = /^(?:vrt_a7|vrt_c7|vrt_p7|vrt_photos|vrt_asset_tombstones|vrt_asset_audit|vrt_asset_authority_v1|vrt_th_z|vrt_th_r|vrt_keys|vrt_key_master|vrt_key_tombstones|vrt_waste_v3|vrt_ehs_cfg_v1|vrt_dorm_hub_v2|vrt_dorm_cfg_v2|vrt_clean_hub_v2|vrt_dorm_draft|wdr_data|wdr_\d{4}_\d{2}|wdr_cfg_\d{4}_\d{2}|wdr_headcount_\d{4}_\d{2}|wdr_default_cfg|wdr_default_fac_price|wdr_default_sta_price|wdr_default_inspector|wdr_exchange_rate|wdr_last_saved|wdr_tg_config|ac_waterdrum_backup|ac_gascheck_tg_chat|ac_gascheck_tg_token|tg_chat|tg_token|ac_gc_photo_links_v1)$/;
  const FALLBACK_LIST_KEY = 'ac_gc_idb_fallback_keys_v1';
  const PING_KEY = 'ac_gc_storage_ping_v1';
  const SYNC_STATE_PREFIX = 'ac_gc_smart_sync_v1_';
  /* 主要業務 key → 模組；整包清除時一併清掉該模組的雲端同步基準（A2）。 */
  const KEY_TOOL = {vrt_a7:'asset',vrt_keys:'keymovement',vrt_waste_v3:'ehs',vrt_dorm_hub_v2:'dormitory',vrt_clean_hub_v2:'cleaning',vrt_th_r:'temperature'};
  const TAB_ID = 'tab_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const LOAD_AT = Date.now();
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
  const pendingByKey = new Map();   // key → 尚未寫完的次數
  const inflight = new Set();
  let remoteSeq = 0, refreshedSeq = 0, lastError = null, fallbackMode = false, channel = null;

  const isDataKey = key => DATA_KEY_RE.test(String(key || ''));
  function nativeGet(key) {
    try {
      if (native && native.get && global.localStorage) return native.get.call(global.localStorage, key);
      return global.localStorage ? global.localStorage.getItem(key) : null;
    } catch (e) { return null; }
  }
  function nativeSetStrict(key, value) {
    if (native && native.set && global.localStorage) return native.set.call(global.localStorage, key, value);
    if (global.localStorage) return global.localStorage.setItem(key, value);
    throw new Error('localStorage unavailable');
  }
  function nativeSet(key, value) { try { nativeSetStrict(key, value); return true; } catch (e) { return false; } }
  function nativeRemove(key) {
    try {
      if (native && native.remove && global.localStorage) native.remove.call(global.localStorage, key);
      else if (global.localStorage) global.localStorage.removeItem(key);
    } catch (e) {}
  }
  const localKeys = () => {
    const out = [];
    if (!global.localStorage) return out;
    try {
      const n = native && native.length && native.length.get ? native.length.get.call(global.localStorage) : global.localStorage.length;
      for (let i = 0; i < n; i++) {
        const k = native ? native.key.call(global.localStorage, i) : global.localStorage.key(i);
        if (k) out.push(k);
      }
    } catch (e) {}
    return out;
  };
  function emit(name, detail) {
    try {
      if (typeof global.dispatchEvent === 'function' && typeof CustomEvent === 'function') global.dispatchEvent(new CustomEvent(name, { detail: detail }));
    } catch (e) {}
  }
  function notify(msg, type) {
    try {
      const show = function () { if (GC.toast) GC.toast(msg, type || 'error', { persist: true }); };
      if (global.document && global.document.body) show();
      else if (global.document && global.document.addEventListener) global.document.addEventListener('DOMContentLoaded', show);
    } catch (e) {}
  }
  function tx(zh, en, km) { return GC.L ? GC.L(zh, en, km) : en; }
  function fallbackKeys() { try { const a = JSON.parse(nativeGet(FALLBACK_LIST_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function markFallbackKey(key, yes) {
    const list = fallbackKeys().filter(k => k !== key);
    if (yes) list.push(key);
    if (list.length) nativeSet(FALLBACK_LIST_KEY, JSON.stringify(list)); else nativeRemove(FALLBACK_LIST_KEY);
  }
  /** 清除雲端同步基準；tool 省略 = 全部模組。 */
  function clearSyncState(tool) {
    if (tool) { nativeRemove(SYNC_STATE_PREFIX + tool); return; }
    localKeys().filter(k => k.indexOf(SYNC_STATE_PREFIX) === 0).forEach(nativeRemove);
  }
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
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
  const readAll = async () => {
    const t = db.transaction(STORE, 'readonly');
    return request(t.objectStore(STORE).getAll());
  };
  const getOne = key => {
    if (!db) return Promise.resolve(null);
    const t = db.transaction(STORE, 'readonly');
    return request(t.objectStore(STORE).get(String(key)));
  };
  const put = (key, value) => {
    if (!db) return Promise.reject(new Error('IndexedDB not ready'));
    return new Promise((resolve, reject) => {
      let t;
      try {
        t = db.transaction(STORE, 'readwrite');
        t.objectStore(STORE).put({ key: String(key), value: String(value) });
      } catch (e) { reject(e); return; }
      t.oncomplete = () => resolve(true);
      t.onerror = () => reject(t.error || new Error('IndexedDB write failed'));
      t.onabort = () => reject(t.error || new Error('IndexedDB write aborted'));
    });
  };
  const remove = key => {
    if (!db) return Promise.resolve(true);
    return new Promise((resolve, reject) => {
      let t;
      try {
        t = db.transaction(STORE, 'readwrite');
        t.objectStore(STORE).delete(String(key));
      } catch (e) { reject(e); return; }
      t.oncomplete = () => resolve(true);
      t.onerror = () => reject(t.error || new Error('IndexedDB delete failed'));
      t.onabort = () => reject(t.error || new Error('IndexedDB delete aborted'));
    });
  };

  /* 多分頁：寫入完成後廣播 key；其他分頁從 IndexedDB 重讀，避免舊分頁用過期
     記憶體快取把別人剛存的資料蓋掉（A1）。沒有 BroadcastChannel 時改用 storage 事件。 */
  function announce(key) {
    const msg = { tab: TAB_ID, key: String(key), at: Date.now() };
    if (channel) { try { channel.postMessage(msg); return; } catch (e) {} }
    nativeSet(PING_KEY, JSON.stringify(msg));
  }
  async function reloadKey(key) {
    let ok = false;
    try { ok = await ready; } catch (e) { ok = false; }
    if (!ok || !db || pendingByKey.get(key)) return;
    let row = null;
    try { row = await getOne(key); } catch (e) { return; }
    if (pendingByKey.get(key)) return;   // 本分頁較新的寫入稍後會覆蓋並廣播
    const before = cache.get(key);
    if (row && row.value != null) cache.set(key, String(row.value)); else cache.delete(key);
    if (before !== cache.get(key)) emit('gc:storagechange', { key: key, keys: [key], remote: true });
  }
  function onRemoteMessage(msg) {
    if (!msg || msg.tab === TAB_ID || !isDataKey(msg.key)) return;
    remoteSeq++;
    reloadKey(String(msg.key));
  }
  try {
    if (enabled && typeof BroadcastChannel === 'function') {
      channel = new BroadcastChannel('ac_gascheck_storage_v1');
      channel.onmessage = e => onRemoteMessage(e && e.data);
    }
  } catch (e) { channel = null; }
  try {
    if (enabled && typeof global.addEventListener === 'function') {
      global.addEventListener('storage', function (e) {
        if (!e || !e.key) return;
        if (e.key === PING_KEY && e.newValue) { try { onRemoteMessage(JSON.parse(e.newValue)); } catch (err) {} return; }
        // IndexedDB 無法使用時資料直接在 localStorage：同步其他分頁的變更到快取。
        if (fallbackMode && isDataKey(e.key)) {
          remoteSeq++;
          if (e.newValue == null) cache.delete(e.key); else cache.set(e.key, e.newValue);
          emit('gc:storagechange', { key: e.key, keys: [e.key], remote: true });
        }
      });
    }
  } catch (e) {}

  function requestPersist() {
    try {
      const s = global.navigator && global.navigator.storage;
      if (!s || typeof s.persist !== 'function') return Promise.resolve(false);
      return Promise.resolve(typeof s.persisted === 'function' ? s.persisted() : false)
        .then(p => p || s.persist()).catch(() => false);
    } catch (e) { return Promise.resolve(false); }
  }
  function estimate() {
    try {
      const s = global.navigator && global.navigator.storage;
      if (!s || typeof s.estimate !== 'function') return Promise.resolve(null);
      return s.estimate().then(r => {
        const usage = Number(r && r.usage) || 0, quota = Number(r && r.quota) || 0;
        return { usage, quota, ratio: quota ? usage / quota : 0 };
      }).catch(() => null);
    } catch (e) { return Promise.resolve(null); }
  }

  const ready = (async () => {
    if (!enabled) return false;
    db = await openDb();
    try { db.onversionchange = () => { try { db.close(); } catch (e) {} }; } catch (e) {}
    const rows = await readAll();
    (rows || []).forEach(row => {
      if (row && row.key != null) cache.set(String(row.key), String(row.value == null ? '' : row.value));
    });
    // 舊版本資料只有在成功寫入 IndexedDB 後才移除，避免搬移中斷造成遺失。
    // 上次 IndexedDB 寫入失敗而改存 localStorage 的 key（較新）優先搬回。
    const newer = new Set(fallbackKeys());
    for (const key of localKeys()) {
      if (!isDataKey(key)) continue;
      const raw = nativeGet(key);
      if (raw != null && (!cache.has(key) || newer.has(key))) {
        await put(key, raw);
        cache.set(key, raw);
      }
      if (cache.has(key)) nativeRemove(key);
    }
    if (newer.size) nativeRemove(FALLBACK_LIST_KEY);
    requestPersist();
    estimate().then(r => {
      if (r && r.quota && r.ratio > 0.85) notify(tx('⚠ 手機儲存空間快滿（' + Math.round(r.ratio * 100) + '%），請匯出備份並清出空間',
        '⚠ Phone storage is almost full (' + Math.round(r.ratio * 100) + '%); export a backup and free up space',
        '⚠ ទំហំផ្ទុកទូរស័ព្ទជិតពេញ (' + Math.round(r.ratio * 100) + '%) សូមនាំចេញការបម្រុងទុក ហើយសម្អាតទំហំ'), 'warning');
    });
    return true;
  })().catch(err => {
    console.warn('[AC GASCHECK] IndexedDB unavailable; localStorage fallback:', err && err.message);
    db = null;
    fallbackMode = true;
    /* 本機資料庫讀不到時，手機上的資料看起來是空的；舊同步基準若保留，
       會被誤判成「本機刪除」而清空雲端（A2）。因此一律清除同步基準。 */
    clearSyncState();
    if (enabled) notify(tx('⚠ 手機資料庫無法開啟，目前只使用暫存空間。請勿清除瀏覽器資料，重新開啟瀏覽器後再試。',
      '⚠ The phone database could not be opened; using temporary storage only. Do not clear browser data; reopen the browser and try again.',
      '⚠ មិនអាចបើកមូលដ្ឋានទិន្នន័យទូរស័ព្ទបាន កំពុងប្រើកន្លែងផ្ទុកបណ្ដោះអាសន្ន។ កុំលុបទិន្នន័យកម្មវិធីរុករក ហើយបើកម្ដងទៀត។'), 'error');
    return false;
  });

  function track(key, p) {
    pendingByKey.set(key, (pendingByKey.get(key) || 0) + 1);
    const done = p.then(v => v, () => false).then(v => {
      const n = (pendingByKey.get(key) || 1) - 1;
      if (n > 0) pendingByKey.set(key, n); else pendingByKey.delete(key);
      inflight.delete(done);
      return v;
    });
    inflight.add(done);
    return done;
  }
  function writeFailed(key, value, err, op) {
    let kept = false;
    if (op === 'set' && db) {
      kept = nativeSet(key, value);
      if (kept) markFallbackKey(key, true);
    }
    lastError = { key: key, op: op, error: err, message: String(err && err.message || err || ''), at: Date.now(), keptInLocalStorage: kept };
    console.error('[AC GASCHECK] storage write failed:', key, err);
    emit('gc:storageerror', lastError);
    notify(kept
      ? tx('❌ 手機資料庫寫入失敗，只暫存到備用空間。請立刻匯出備份並清出手機空間。', '❌ Phone database write failed; only a temporary backup copy was kept. Export a backup and free up space now.', '❌ ការសរសេរទៅមូលដ្ឋានទិន្នន័យទូរស័ព្ទបរាជ័យ បានរក្សាទុកតែច្បាប់បម្រុងបណ្ដោះអាសន្ន។ សូមនាំចេញការបម្រុងទុក ហើយសម្អាតទំហំឥឡូវនេះ។')
      : tx('❌ 手機儲存失敗，剛才的資料沒有保存！請先匯出備份、清出空間後再存一次。', '❌ Saving on this phone failed; the last change was NOT kept! Export a backup, free up space and save again.', '❌ ការរក្សាទុកលើទូរស័ព្ទបរាជ័យ ការផ្លាស់ប្ដូរចុងក្រោយមិនត្រូវបានរក្សាទុកទេ! សូមនាំចេញការបម្រុងទុក សម្អាតទំហំ ហើយរក្សាទុកម្ដងទៀត។'),
      'error');
    // 主資料庫沒有寫入成功一律回 false（即使暫存副本成功），讓模組不要顯示「已儲存」。
    return false;
  }

  function getSync(key) {
    key = String(key || '');
    if (cache.has(key)) return cache.get(key);
    return nativeGet(key);
  }
  /** 寫入業務資料；回傳 Promise<boolean>（false = 沒有存成功，已顯示紅色常駐提示）。 */
  function setSync(key, value) {
    key = String(key || ''); value = String(value == null ? '' : value);
    if (!isDataKey(key) || !enabled) {
      try { nativeSetStrict(key, value); return Promise.resolve(true); }
      catch (e) { if (isDataKey(key)) return Promise.resolve(writeFailed(key, value, e, 'set-native')); throw e; }
    }
    cache.set(key, value);
    const p = ready.then(ok => {
      if (ok && db) return put(key, value).then(() => { markFallbackIfNeeded(key); announce(key); return true; });
      nativeSetStrict(key, value); announce(key); return true;
    }).catch(err => writeFailed(key, value, err, 'set'));
    return track(key, p);
  }
  function markFallbackIfNeeded(key) {
    // 先前失敗改存 localStorage 的 key 現在成功寫回 IndexedDB → 移除暫存副本
    if (fallbackKeys().indexOf(key) >= 0) { markFallbackKey(key, false); nativeRemove(key); }
  }
  function removeSync(key) {
    key = String(key || '');
    if (KEY_TOOL[key]) clearSyncState(KEY_TOOL[key]);
    if (!isDataKey(key) || !enabled) { nativeRemove(key); return Promise.resolve(true); }
    cache.delete(key);
    const p = ready.then(ok => {
      if (ok && db) return remove(key).then(() => { nativeRemove(key); announce(key); return true; });
      nativeRemove(key); announce(key); return true;
    }).catch(err => writeFailed(key, null, err, 'remove'));
    return track(key, p);
  }
  function keys(prefix) {
    const out = new Set(cache.keys());
    localKeys().forEach(k => { if (isDataKey(k)) out.add(k); });
    return Array.from(out).filter(k => !prefix || k.indexOf(prefix) === 0).sort();
  }
  /** 等待所有尚未完成的寫入；全部成功回 true（清除資料後 reload 前請先 await）。 */
  function flush() {
    return Promise.all(Array.from(inflight)).then(list => list.every(v => v !== false));
  }
  /** 從 IndexedDB 重新讀取快取（其他分頁寫入後）；opt.ifStale 時只在收到變更通知後才讀。 */
  async function refresh(opt) {
    let ok = false;
    try { ok = await ready; } catch (e) { ok = false; }
    if (!ok || !db) return false;
    if (opt && opt.ifStale && refreshedSeq === remoteSeq) return false;
    const seqAt = remoteSeq;
    let rows;
    try { rows = await readAll(); } catch (e) { return false; }
    const seen = new Set(), changed = [];
    (rows || []).forEach(row => {
      if (!row || row.key == null) return;
      const k = String(row.key), v = String(row.value == null ? '' : row.value);
      seen.add(k);
      if (pendingByKey.get(k)) return;
      if (cache.get(k) !== v) { cache.set(k, v); changed.push(k); }
    });
    Array.from(cache.keys()).forEach(k => {
      if (!seen.has(k) && !pendingByKey.get(k) && isDataKey(k)) { cache.delete(k); changed.push(k); }
    });
    refreshedSeq = seqAt;
    if (changed.length) emit('gc:storagechange', { key: changed[0], keys: changed, remote: true });
    return changed.length > 0;
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
  return {
    ready, isDataKey, getSync, setSync, removeSync, keys,
    get: getSync, set: setSync, remove: removeSync,
    flush, refresh, estimate, persist: requestPersist, clearSyncState,
    tabId: TAB_ID, loadedAt: LOAD_AT,
    get lastError() { return lastError; },
    get fallback() { return fallbackMode; },
    get remoteChanges() { return remoteSeq; }
  };
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
  /* AC HRA Attendance stores one snapshot array in
     AC_HRA_Attendance/snapshot/database.  Every date contains department rows
     plus one `isGrand` row; counting rows or dates therefore produces values
     such as 1 or 31 instead of the actual 400+ attendance. */
  function attendanceSnapshot(rows, start, end) {
    const daily = {};
    function visit(v, depth) {
      if (depth > 10 || v == null) return;
      if (Array.isArray(v)) { v.forEach(x => visit(x, depth + 1)); return; }
      if (typeof v !== 'object') return;
      const d = dateOf(v);
      const label = [v.dept,v.department,v.sect,v.section,v.line,v.label,v.name].join(' ');
      const explicit = +(v.headcount || v.attendanceCount || v.totalAttendance || 0);
      const isGrand = v.isGrand === true || /(?:總人數|grand\s*total|total\s*headcount|សរុប)/i.test(label);
      if (d && d >= start && d <= end && (isGrand || explicit >= 20)) {
        const attendance = +(v.att || v.actualAttendance || v.present || 0);
        const workforce = (+v.m || 0) + (+v.f || 0);
        const count = Math.round(attendance >= 20 ? attendance : (explicit >= 20 ? explicit : workforce));
        if (count >= 20 && count <= 20000) daily[d] = Math.max(daily[d] || 0, count);
      }
      Object.keys(v).forEach(k => visit(v[k], depth + 1));
    }
    visit(rows, 0);
    const personDays = Object.values(daily).reduce((a,b) => a + (+b || 0), 0);
    const days = Object.keys(daily).length;
    const averageDaily = days ? Math.round(personDays / days) : 0;
    return {daily,personDays,days,averageDaily,headcount:averageDaily,available:averageDaily >= 20};
  }
  function periodOf(row) {
    const raw = row && (row.periodKey || row.period || row.key || row.snapshotDate || row.label || row.date);
    const m = String(raw || '').match(/(20\d{2})[-\/.](0?[1-9]|1[0-2])/);
    return m ? m[1] + '-' + String(+m[2]).padStart(2,'0') : '';
  }
  function peopleCount(rows) {
    if (!Array.isArray(rows) || rows.length < 20) return 0;
    const ids = new Set();
    rows.forEach(function (row, i) {
      if (!row || typeof row !== 'object' || !isPresent(row)) return;
      const id = String(value(row, ID_KEYS) || row.name || row.employeeName || row.nameLat || row.nameKh || '').trim();
      if (id) ids.add(id); else ids.add('__row_' + i);
    });
    return ids.size;
  }
  /* HRA Pay / Employee HR stores monthly workforce snapshots rather than one
     dated row per employee.  Treat those snapshots as headcount sources so a
     month with 31 calendar rows can never be mistaken for 31 employees. */
  function workforce(rows, start, end) {
    const candidates = [];
    function add(period, count, source) {
      count = Math.round(+count || 0);
      if (count >= 20 && count <= 20000) candidates.push({period:period || '', count, source});
    }
    function visit(v, inheritedPeriod, depth) {
      if (depth > 8 || v == null) return;
      if (Array.isArray(v)) { v.forEach(x => visit(x, inheritedPeriod, depth + 1)); return; }
      if (typeof v !== 'object') return;
      const period = periodOf(v) || inheritedPeriod || '';
      add(period, v.headcount || (v.totals && v.totals.count), 'explicit');
      const pools = ['rows','payrollRecords','mergedRecords','advanceRecords','employees','staff','roster'];
      let usedPool = false;
      pools.forEach(function (key) {
        if (!Array.isArray(v[key])) return;
        const n = peopleCount(v[key]);
        if (n) { add(period, n, key); usedPool = true; }
      });
      Object.keys(v).forEach(function (key) {
        if (pools.includes(key) && usedPool) return;
        visit(v[key], period, depth + 1);
      });
    }
    visit(rows, '', 0);
    if (!candidates.length) return {headcount:0, period:'', source:'none'};
    const target = String(end || start || '').slice(0,7);
    const exact = candidates.filter(x => x.period === target);
    const prior = candidates.filter(x => x.period && x.period <= target).sort((a,b) => b.period.localeCompare(a.period));
    const pool = exact.length ? exact : (prior.length ? prior.filter(x => x.period === prior[0].period) : candidates);
    const best = pool.sort((a,b) => b.count - a.count)[0];
    return {headcount:best.count, period:best.period, source:best.source};
  }
  function repeatedDaily(headcount, start, end) {
    const daily = {}, cursor = new Date(start + 'T00:00:00'), last = new Date(end + 'T00:00:00');
    while (!isNaN(cursor) && cursor <= last) {
      daily[U.ymd(cursor)] = headcount;
      cursor.setDate(cursor.getDate() + 1);
    }
    return daily;
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
  function readStoreKey(db, storeName, key) {
    return new Promise(resolve => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result == null ? null : req.result);
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }
  async function knownAttendanceSnapshot() {
    if (!global.indexedDB) return [];
    const db = await new Promise(resolve => {
      try {
        const req = global.indexedDB.open('AC_HRA_Attendance');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch (e) { resolve(null); }
    });
    if (!db) return [];
    let value = null;
    if (Array.from(db.objectStoreNames || []).includes('snapshot')) value = await readStoreKey(db, 'snapshot', 'database');
    if ((!Array.isArray(value) || !value.length) && Array.from(db.objectStoreNames || []).includes('records')) value = await readStore(db, 'records');
    try { db.close(); } catch (e) {}
    return Array.isArray(value) ? value : [];
  }
  async function indexedValues() {
    if (!global.indexedDB) return [];
    const known = await knownAttendanceSnapshot();
    if (typeof global.indexedDB.databases !== 'function') return known.length ? [known] : [];
    let infos = [];
    try { infos = await global.indexedDB.databases(); } catch (e) { return []; }
    const names = (infos || []).map(x => x && x.name).filter(n => n && n !== 'ac_gascheck_data_v1' && /(attendance|hra|staff|employee|pay)/i.test(n));
    const out = known.length ? [known] : [];
    for (const name of names) {
      const db = await new Promise(resolve => {
        try { const req = global.indexedDB.open(name); req.onsuccess=()=>resolve(req.result); req.onerror=()=>resolve(null); } catch(e) { resolve(null); }
      });
      if (!db) continue;
      for (const storeName of Array.from(db.objectStoreNames || [])) {
        if (!/(attendance|roster|staff|employee|record|data|period|snapshot|batch|payroll)/i.test(storeName)) continue;
        if (name === 'AC_HRA_Attendance' && storeName === 'snapshot' && known.length) continue;
        out.push(await readStore(db, storeName));
      }
      try { db.close(); } catch (e) {}
    }
    return out;
  }
  function configuredUrl() {
    const keys = ['ac_attendance_gas_url','attendance_gas_url','ac_hra_gas_url','hra_gas_url','ac_hra_pay_gas_url','hrpay_gas_url'];
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
        const res = await fetchWithTimeout(url + '?' + new URLSearchParams(Object.assign({_t:Date.now()}, params)), {}, 20000);
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
    const exactLocal = attendanceSnapshot(local, start, end);
    if (exactLocal.available) return Object.assign({source:'hra-attendance'}, exactLocal);
    const remote = await remoteValues(start, end);
    if (remote[0] && remote[0].__daily) {
      const daily = remote[0].__daily, selected = {};
      Object.keys(daily).forEach(d => { if (d >= start && d <= end) selected[d] = +daily[d] || 0; });
      const personDays=Object.values(selected).reduce((a,b)=>a+b,0),days=Object.keys(selected).length,averageDaily=days?Math.round(personDays/days):0;
      return {source:'attendance-gas',daily:selected,headcount:averageDaily,averageDaily,personDays,days,available:averageDaily >= 20};
    }
    const exactRemote = attendanceSnapshot(remote, start, end);
    if (exactRemote.available) return Object.assign({source:'attendance-gas-snapshot'}, exactRemote);
    /* Do not substitute payroll/workforce snapshots or count calendar rows.
       Water consumption must use the Attendance module's dated grand rows;
       if that source is unavailable the UI hides attendance and L/person. */
    return {source:'none',daily:{},headcount:0,averageDaily:0,personDays:0,days:0,available:false};
  }
  return { headcount, summarize, workforce, attendanceSnapshot };
})();

/* ═══════════════════════════════════════════════════════════
   1. I18N — 繁中 / English / ខ្មែរ
   ═══════════════════════════════════════════════════════════ */
const BASE_DICT = {
  zh: {
    'gc.upload':'上傳雲端','gc.download':'下載雲端','gc.sync':'同步中…',
    'gc.uploaded':'已上傳雲端','gc.downloaded':'已下載並合併','gc.cloudCurrent':'雲端已是最新',
    'gc.autoSyncing':'☁ 同步中…','gc.cloudPending':'☁ 待同步','gc.cloudOffline':'☁ 離線待傳','gc.cloudRetry':'⚠ 雲端待重試','gc.cloudSynced':'✅ 雲端已同步','gc.cloudChecked':'☁ 已檢查','gc.changedRows':'筆變更',
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
    'gc.summary':'摘要','gc.review':'審查','gc.approval':'核可','gc.quickActions':'快速操作',
    'gc.directHint':'上方按鈕可直接同步、匯入與發送，不需填網址／Token／Chat ID',
    'gc.sentTelegram':'Telegram 已發送','gc.noApproval':'沒有待審查／待核可資料',
    'gc.pendingApproval':'待審查／待核可','gc.mode':'訊息類型','gc.dataType':'資料類型','gc.refDate':'基準日期',
    'gc.cloudReady':'雲端已設定','gc.targetGroup':'目標群組','gc.defaultGroup':'AC GASCHECK 群組',
    'gc.preview':'預覽','gc.send':'發送','gc.periodMode':'期間模式','gc.periodValue':'期間',
    'gc.telegramTitle':'發送到 Telegram','gc.importTitle':'智慧匯入資料','gc.noPeriodData':'此期間沒有資料',
    'gc.sender':'發送人','gc.senderPlaceholder':'請輸入發送人姓名','gc.senderRequired':'請先確認發送人姓名',
    'gc.confirmSender':'確認由 {name} 發送這份摘要？',
    'gc.bilingualKm':'中／英／柬三語','gc.selectScope':'選擇資料','gc.menuLanguage':'介面語言',
    'gc.stLocal':'📱 只存手機','gc.stCloud':'☁ 已上雲','gc.stOffline':'⚠ 離線','gc.stSyncing':'⏳ 同步中','gc.stError':'⚠ 未上雲','gc.stChecking':'☁ 檢查中',
    'gc.photoPending':'{n} 張照片暫未上傳，已保留在手機，稍後自動重試','gc.photoReadFail':'照片讀取失敗',
    'gc.shrinkConfirm':'這次上傳會讓雲端少掉 {n} 筆記錄（雲端共 {total} 筆）。\n確定要刪除雲端上的這些資料嗎？\n按「取消」會保留雲端資料並下載回手機。',
    'gc.shrinkKept':'偵測到大量刪除（{n} 筆），已保留雲端資料並還原到手機',
    'gc.dupSkipped':'筆重複已略過','gc.badDate':'筆日期無法辨識','gc.filesFailed':'個檔案失敗','gc.files':'個檔案',
    'gc.tapToClose':'點一下關閉','gc.openDashboard':'開啟平台','gc.mainPortal':'總平台',
    'gc.sendingTelegram':'正在發送 Telegram…','gc.noDelivery':'Telegram 未回傳送達確認','gc.nonJson':'雲端回傳格式錯誤',
    'gc.dayTooLong':'單日內容過長，請選擇較少區域','gc.pageFailed':'第 {i}/{n} 頁未完成','gc.uploadBeforeSendFail':'雲端上傳未完成，尚未發送',
    'gc.guardBusy':'處理中，請稍候…'
  },
  en: {
    'gc.upload':'Upload','gc.download':'Download','gc.sync':'Syncing…',
    'gc.uploaded':'Uploaded to cloud','gc.downloaded':'Downloaded & merged','gc.cloudCurrent':'Cloud already current',
    'gc.autoSyncing':'☁ Syncing…','gc.cloudPending':'☁ Pending sync','gc.cloudOffline':'☁ Offline · pending','gc.cloudRetry':'⚠ Cloud retry pending','gc.cloudSynced':'✅ Cloud synced','gc.cloudChecked':'☁ Checked','gc.changedRows':'changed',
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
    'gc.telegram':'Telegram','gc.sendTelegram':'Send to Telegram','gc.period':'Summary period','gc.slot':'Send time slot','gc.allSlots':'All slots','gc.reportLanguage':'Report language','gc.bilingual':'Chinese + English','gc.chinese':'Chinese','gc.english':'English','gc.khmer':'Khmer',
    'gc.summary':'Summary','gc.review':'Review','gc.approval':'Approval','gc.quickActions':'Quick actions',
    'gc.directHint':'Use the buttons above to sync, import and send; no URL/token/chat ID entry is needed',
    'gc.sentTelegram':'Telegram sent','gc.noApproval':'No pending review/approval records',
    'gc.pendingApproval':'Pending review/approval','gc.mode':'Message type','gc.dataType':'Data type','gc.refDate':'As of',
    'gc.cloudReady':'Cloud configured','gc.targetGroup':'Target group','gc.defaultGroup':'AC GASCHECK Group',
    'gc.preview':'Preview','gc.send':'Send','gc.periodMode':'Period mode','gc.periodValue':'Period',
    'gc.telegramTitle':'Send to Telegram','gc.importTitle':'Smart Import Data','gc.noPeriodData':'No data in this period',
    'gc.sender':'Sent by','gc.senderPlaceholder':'Enter sender name','gc.senderRequired':'Confirm the sender name first',
    'gc.confirmSender':'Send this report as {name}?',
    'gc.bilingualKm':'Chinese / English / Khmer','gc.selectScope':'Select data','gc.menuLanguage':'Interface language',
    'gc.stLocal':'📱 Phone only','gc.stCloud':'☁ In cloud','gc.stOffline':'⚠ Offline','gc.stSyncing':'⏳ Syncing','gc.stError':'⚠ Not in cloud','gc.stChecking':'☁ Checking',
    'gc.photoPending':'{n} photo(s) not uploaded yet; kept on this phone and will retry automatically','gc.photoReadFail':'Photo could not be read',
    'gc.shrinkConfirm':'This upload would remove {n} of {total} records from the cloud.\nDelete them from the cloud?\nCancel keeps the cloud data and restores it to this phone.',
    'gc.shrinkKept':'Large deletion detected ({n} records); cloud data kept and restored to this phone',
    'gc.dupSkipped':'duplicates skipped','gc.badDate':'rows with unreadable dates','gc.filesFailed':'file(s) failed','gc.files':'files',
    'gc.tapToClose':'Tap to close','gc.openDashboard':'Open Dashboard','gc.mainPortal':'Main Portal',
    'gc.sendingTelegram':'Sending to Telegram…','gc.noDelivery':'No delivery confirmation from Telegram','gc.nonJson':'Cloud returned an invalid response',
    'gc.dayTooLong':'One day is too long for a message; select fewer zones','gc.pageFailed':'Page {i}/{n} not sent','gc.uploadBeforeSendFail':'Cloud upload failed; report not sent',
    'gc.guardBusy':'Working, please wait…'
  },
  km: {
    'gc.upload':'ផ្ទុកឡើង','gc.download':'ទាញយក','gc.sync':'កំពុងធ្វើសមកាលកម្ម…',
    'gc.uploaded':'បានផ្ទុកឡើងលើ Cloud','gc.downloaded':'បានទាញយក និងបញ្ចូលគ្នា','gc.cloudCurrent':'Cloud ទាន់សម័យរួចហើយ',
    'gc.autoSyncing':'☁ កំពុងធ្វើសមកាលកម្ម…','gc.cloudPending':'☁ រង់ចាំសមកាលកម្ម','gc.cloudOffline':'☁ អុហ្វឡាញ · រង់ចាំផ្ញើ','gc.cloudRetry':'⚠ រង់ចាំសាកល្បង Cloud ម្ដងទៀត','gc.cloudSynced':'✅ Cloud បានសមកាលកម្ម','gc.cloudChecked':'☁ បានពិនិត្យ','gc.changedRows':'បានផ្លាស់ប្ដូរ',
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
    'gc.telegram':'Telegram','gc.sendTelegram':'ផ្ញើទៅ Telegram','gc.period':'រយៈពេលសង្ខេប','gc.slot':'ពេលវេលាផ្ញើ','gc.allSlots':'គ្រប់ពេល','gc.reportLanguage':'ភាសាសង្ខេប','gc.bilingual':'ចិន + អង់គ្លេស','gc.chinese':'ភាសាចិន','gc.english':'អង់គ្លេស','gc.khmer':'ខ្មែរ',
    'gc.summary':'សង្ខេប','gc.review':'ពិនិត្យ','gc.approval':'អនុម័ត','gc.quickActions':'សកម្មភាពរហ័ស',
    'gc.directHint':'ប្រើប៊ូតុងខាងលើដើម្បីធ្វើសមកាលកម្ម នាំចូល និងផ្ញើ ដោយមិនចាំបាច់បញ្ចូល URL/token/chat ID',
    'gc.sentTelegram':'បានផ្ញើ Telegram','gc.noApproval':'គ្មានទិន្នន័យកំពុងរង់ចាំពិនិត្យ/អនុម័ត',
    'gc.pendingApproval':'កំពុងរង់ចាំពិនិត្យ/អនុម័ត','gc.mode':'ប្រភេទសារ','gc.dataType':'ប្រភេទទិន្នន័យ','gc.refDate':'កាលបរិច្ឆេទយោង',
    'gc.cloudReady':'បានកំណត់ Cloud','gc.targetGroup':'ក្រុមគោលដៅ','gc.defaultGroup':'ក្រុម AC GASCHECK',
    'gc.preview':'មើលជាមុន','gc.send':'ផ្ញើ','gc.periodMode':'របៀបរយៈពេល','gc.periodValue':'រយៈពេល',
    'gc.telegramTitle':'ផ្ញើទៅ Telegram','gc.importTitle':'នាំចូលទិន្នន័យឆ្លាតវៃ','gc.noPeriodData':'គ្មានទិន្នន័យក្នុងរយៈពេលនេះ',
    'gc.sender':'អ្នកផ្ញើ','gc.senderPlaceholder':'បញ្ចូលឈ្មោះអ្នកផ្ញើ','gc.senderRequired':'សូមបញ្ជាក់ឈ្មោះអ្នកផ្ញើជាមុន',
    'gc.confirmSender':'បញ្ជាក់ថាផ្ញើរបាយការណ៍នេះដោយ {name}?',
    'gc.bilingualKm':'ចិន / អង់គ្លេស / ខ្មែរ','gc.selectScope':'ជ្រើសទិន្នន័យ','gc.menuLanguage':'ភាសាចំណុចប្រទាក់',
    'gc.stLocal':'📱 នៅលើទូរស័ព្ទប៉ុណ្ណោះ','gc.stCloud':'☁ នៅលើ Cloud','gc.stOffline':'⚠ គ្មានអ៊ីនធឺណិត','gc.stSyncing':'⏳ កំពុងធ្វើសមកាលកម្ម','gc.stError':'⚠ មិនទាន់នៅលើ Cloud','gc.stChecking':'☁ កំពុងពិនិត្យ',
    'gc.photoPending':'រូបថត {n} មិនទាន់ផ្ទុកឡើង បានរក្សាទុកលើទូរស័ព្ទ ហើយនឹងព្យាយាមម្ដងទៀតដោយស្វ័យប្រវត្តិ','gc.photoReadFail':'មិនអាចអានរូបថតបាន',
    'gc.shrinkConfirm':'ការផ្ទុកឡើងនេះនឹងលុបកំណត់ត្រា {n} ក្នុងចំណោម {total} ពី Cloud។\nតើចង់លុបពី Cloud មែនទេ?\nចុច «បោះបង់» ដើម្បីរក្សាទិន្នន័យ Cloud និងស្ដារមកទូរស័ព្ទវិញ។',
    'gc.shrinkKept':'រកឃើញការលុបច្រើន ({n} កំណត់ត្រា) បានរក្សាទិន្នន័យ Cloud ហើយស្ដារមកទូរស័ព្ទវិញ',
    'gc.dupSkipped':'ស្ទួនត្រូវបានរំលង','gc.badDate':'ជួរដែលកាលបរិច្ឆេទមិនអាចអានបាន','gc.filesFailed':'ឯកសារបរាជ័យ','gc.files':'ឯកសារ',
    'gc.tapToClose':'ចុចដើម្បីបិទ','gc.openDashboard':'បើកផ្ទាំងគ្រប់គ្រង','gc.mainPortal':'វិបផតថលមេ',
    'gc.sendingTelegram':'កំពុងផ្ញើទៅ Telegram…','gc.noDelivery':'Telegram មិនបានបញ្ជាក់ការផ្ញើ','gc.nonJson':'Cloud ឆ្លើយតបមិនត្រឹមត្រូវ',
    'gc.dayTooLong':'ទិន្នន័យមួយថ្ងៃវែងពេក សូមជ្រើសតំបន់តិចជាងនេះ','gc.pageFailed':'ទំព័រ {i}/{n} មិនទាន់ផ្ញើ','gc.uploadBeforeSendFail':'ការផ្ទុកឡើង Cloud បរាជ័យ មិនទាន់ផ្ញើរបាយការណ៍',
    'gc.guardBusy':'កំពុងដំណើរការ សូមរង់ចាំ…'
  }
};

const I18 = GC.i18n = {
  lang: (function () { try { const l = localStorage.getItem('gc_lang'); return l === 'en' || l === 'km' || l === 'zh' ? l : 'zh'; } catch (e) { return 'zh'; } })(),
  dict: JSON.parse(JSON.stringify(BASE_DICT)),

  /** 模組自行擴充字典：GC.i18n.extend({zh:{...},en:{...},km:{...}}) */
  extend(d) {
    ['zh', 'en', 'km'].forEach(l => {
      if (d && d[l]) Object.assign(I18.dict[l], d[l]);
    });
    return I18;
  },
  /** 退回順序：km→en→fallback→key；en→fallback→key；zh→en→fallback→key。
      en/km 模式絕不退回中文。 */
  t(key, fallback) {
    const lang = I18.dict[I18.lang] ? I18.lang : 'zh';
    const own = I18.dict[lang] || {};
    if (own[key] != null) return own[key];
    if (lang !== 'en' && I18.dict.en && I18.dict.en[key] != null) return I18.dict.en[key];
    return fallback != null ? fallback : key;
  },
  /** 取字串並替換 {name} 參數 */
  f(key, params, fallback) {
    let out = String(I18.t(key, fallback));
    Object.keys(params || {}).forEach(k => { out = out.split('{' + k + '}').join(String(params[k])); });
    return out;
  },
  /** 英文／高棉文介面：把後端回傳的「中文 / English」雙語訊息只留非中文部分（單一段落或全中文則原樣）。 */
  mono(msg) {
    const text = String(msg == null ? '' : msg);
    if (I18.lang === 'zh') return text;
    const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;
    if (!CJK.test(text)) return text;
    const parts = text.split(/\s+\/\s+/);
    if (parts.length < 2) return text;
    const kept = [];
    parts.forEach(function (p) {
      if (!CJK.test(p)) { kept.push(p); return; }
      const i = p.search(CJK), head = p.slice(0, i).replace(/[\s:：，,;-]+$/, '');
      if (head && /[A-Za-z\u1780-\u17ff]{2,}/.test(head)) kept.push(head);
    });
    return kept.length ? kept.join(' — ') : text;
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
GC.tf = (k, params, f) => I18.f(k, params, f);
/* 單一語言輸出：GC.L('中文','English','ខ្មែរ') 或 GC.L({zh,en,km})；km 缺值退回英文，en/km 模式絕不回中文。 */
GC.L = function (zh, en, km) {
  if (zh && typeof zh === 'object') { km = zh.km; en = zh.en; zh = zh.zh; }
  const l = I18.lang;
  if (l === 'en') return en != null && en !== '' ? String(en) : String(km || zh || '');
  if (l === 'km') return km != null && km !== '' ? String(km) : String(en != null && en !== '' ? en : (zh || ''));
  return String(zh != null && zh !== '' ? zh : (en || km || ''));
};

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
GC.dormVersionWinner = function(a,b){
  if(!a||!b||a._deleted||b._deleted||!(a.approvalGeneration||b.approvalGeneration))return null;
  const approved=r=>r.status==='已核可'||/^approved$/i.test(String(r.status||''));
  const settled=r=>approved(r)?2:(r.status==='已退件'||/^rejected$/i.test(String(r.status||''))?1:0);
  const complete=r=>(r.approvalDeliveryPending===false||r.approvalDeliveryPending==='false'?2:0)+(r.approvalSyncPending===false||r.approvalSyncPending==='false'?1:0);
  const delta=Number(approved(a))-Number(approved(b))||Number(a.approvalGeneration||0)-Number(b.approvalGeneration||0)||settled(a)-settled(b)||complete(a)-complete(b);
  return delta>0?a:delta<0?b:null;
};

/** 每個送往 GAS 的請求都帶 lang（介面語言），後端錯誤訊息才會是單一語言。
 *  dormSubmit 的 data（JSON 字串或物件）內也放一份。 */
GC.withLang = function (payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const lang = (typeof I18 !== 'undefined' && I18.lang) || 'zh';
  const out = Object.assign({}, payload);
  if (out.lang == null || out.lang === '') out.lang = lang;
  if (out.action === 'dormSubmit' || out.type === 'dormSubmit') {
    if (typeof out.data === 'string') {
      try { const d = JSON.parse(out.data); if (d && typeof d === 'object' && !d.lang) { d.lang = out.lang; out.data = JSON.stringify(d); } } catch (e) {}
    } else if (out.data && typeof out.data === 'object' && !out.data.lang) out.data = Object.assign({}, out.data, { lang: out.lang });
  }
  return out;
};

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
      const preferred=GC.dormVersionWinner(cur,r);
      if(preferred){map.set(k,preferred);if(preferred===r)stat.updated++;else stat.kept++;return;}
      const tL = cur && cur[tsKey] ? String(cur[tsKey]) : '';
      const tC = r[tsKey] ? String(r[tsKey]) : '';
      // 雲端較新才覆蓋；平手或無時間戳 → 保留本地。
      // 刪除記號（_deleted 墓碑）與一般記錄同時間時，刪除優先，避免被復活。
      const tieDelete = tC && tC === tL && !!r._deleted && !(cur && cur._deleted);
      if (tC && (!tL || tC > tL || tieDelete)) { map.set(k, r); stat.updated++; }
      else stat.kept++;
    });

    const list = Array.from(map.values());
    stat.total = list.length;
    return { list, stat };
  },

  /** POST 到 GAS（依慣例用 text/plain）；opt.timeout 毫秒，預設 40 秒。 */
  async post(payload, opt) {
    if (!CLOUD.gasUrl) throw new Error('GAS URL not set');
    // 後端回傳的錯誤／提示訊息依介面語言（單一語言）；呼叫端已指定 lang 則沿用。
    payload = GC.withLang(payload);
    const r = await fetchWithTimeout(CLOUD.gasUrl, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }, (opt && opt.timeout) || WRITE_TIMEOUT_MS);
    const txt = await r.text();
    let data;
    try { data = JSON.parse(txt); } catch (e) { throw new Error(I18.t('gc.nonJson') + ': ' + String(txt || '').slice(0, 120)); }
    if (!r.ok || (data && data.ok === false)) throw new Error((data && data.error) || ('HTTP ' + r.status));
    return data;
  },

  async get(params, opt) {
    if (!CLOUD.gasUrl) throw new Error('GAS URL not set');
    const query = Object.assign({}, GC.withLang(params || {}), { _t:Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8) });
    const qs = new URLSearchParams(query).toString();
    const r = await fetchWithTimeout(CLOUD.gasUrl + (qs ? '?' + qs : ''), { cache:'no-store' }, opt && opt.timeout);
    const txt = await r.text();
    let data;
    try { data = JSON.parse(txt); } catch (e) { throw new Error(I18.t('gc.nonJson') + ': ' + String(txt || '').slice(0, 120)); }
    if (!r.ok || (data && data.ok === false)) throw new Error((data && data.error) || ('HTTP ' + r.status));
    return data;
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

    /* 照片一律先轉 Drive 連結；上傳失敗的照片不放進雲端資料（不送 base64），
       手機上保留原照片，下次同步再重試。 */
    toSend = SMART.pruneTombstones(toSend, opt);
    const prepared = await SMART.preparePhotosDetailed(toSend, tool, opt);
    toSend = prepared.records;
    const extra = typeof opt.extra === 'function' ? (opt.extra() || {}) : (opt.extra || {});
    const res = await CLOUD.post(Object.assign({
      type: 'save', tool, updatedAt: U.now(), list: toSend
    }, extra));
    return { res, list: toSend.map(r => prepared.localMap.get(r) || r).map(fromCloud), photoFailures: prepared.failures };
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
   * HRA Portal AutoSync 同款智慧增量同步。新版 GAS 可用 manifest/bucket 時只傳有變動的月份；
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
   * 上傳單張照片到 Drive（最多同時 3 張、失敗自動重試 3 次、同一張照片記住連結不重傳）。
   * 成功回 Drive 連結；失敗丟出錯誤。
   */
  async uploadPhotoStrict(dataUrl, tool, recId, idx) {
    if (typeof dataUrl !== 'string' || dataUrl.indexOf('data:image') !== 0) return dataUrl;
    return PHOTO_UPLOAD.upload(dataUrl, tool, recId, idx);
  },
  /** 相容舊呼叫：成功回 Drive 連結，失敗回原 dataUrl（呼叫端不可把 dataUrl 送進雲端資料）。 */
  async uploadPhoto(dataUrl, tool, recId, idx) {
    if (typeof dataUrl !== 'string' || dataUrl.indexOf('data:image') !== 0) return dataUrl;
    try { return await CLOUD.uploadPhotoStrict(dataUrl, tool, recId, idx); }
    catch (e) { return dataUrl; }
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
   2.35 SYNC KEYS — 模組同步的業務鍵（cloudKey）唯一來源
   模組（cleaning / dormitory / temperature）與 Portal「Push All」共用同一組函式，
   同一筆資料在兩邊算出相同的鍵 → 不會重複上傳或合併出兩筆。
   ═══════════════════════════════════════════════════════════ */
GC.syncKeys = (function () {
  function arr(v) {
    if (Array.isArray(v)) return v.slice();
    if (v === undefined || v === null || v === '') return [];
    if (typeof v === 'string') {
      const s = v.trim(); if (!s) return [];
      if (/^(?:data:image\/|https?:\/\/)/i.test(s)) return [s];
      if (s.charAt(0) === '[') { try { const a = JSON.parse(s); if (Array.isArray(a)) return a; } catch (e) {} }
      return s.split(/[|,;，；\s]+/).map(x => x.trim()).filter(Boolean);
    }
    return [v];
  }
  function cleanDate(v) { const m = String(v || '').match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/); return m ? m[1] + '-' + String(+m[2]).padStart(2, '0') + '-' + String(+m[3]).padStart(2, '0') : String(v || '').slice(0, 10); }
  function cleanSlots(v) { return Array.from(new Set(arr(v).map(x => String(x || '').trim()).filter(Boolean))).sort(); }
  function cleaning(r) {
    if (!r || typeof r !== 'object') return '';
    const date = cleanDate(r.date), loc = String(r.locId || r.locationId || r.location || '').trim(), slots = cleanSlots(r.slots || r.slot || r.checkTime);
    if (date && loc && slots.length) return 'clean:' + date + '|' + loc + '|' + slots.join(',');
    return r.id ? 'id:' + String(r.id) : '';
  }
  function dormitory(record) {
    record = record || {};
    const key = [record.type, record.idNo, record.roomNo, record.date].map(v => String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, ' ')).join('|');
    // 沒有任何業務欄位（例如去重留下的墓碑）→ 用 id，避免彼此被合併成一筆。
    if (key === '|||') return record.id ? 'id:' + String(record.id) : '';
    return key;
  }
  function tempZoneId(value, definitions) {
    const token = v => String(v || '').normalize('NFKC').toLowerCase().replace(/inside|area/g, '').replace(/factory/g, 'building').replace(/[\s_\-\/().（）]+/g, '');
    const aliases = {za:'za',buildinga:'za',buildingaworkshop:'za',aworkshop:'za','a廠車間':'za','a厂车间':'za',zb:'zb',buildingb:'zb',buildingbworkshop:'zb',bworkshop:'zb','b廠車間':'zb','b厂车间':'zb',zc:'zc',buildingbwh:'zc',buildingbwarehouse:'zc',bwarehouse:'zc','b廠倉庫':'zc','b厂仓库':'zc',zbuildingafinishingwh:'z_buildingafinishingwh',zbuildingafinishingwarehouse:'z_buildingafinishingwh',buildingafinishingwh:'z_buildingafinishingwh',buildingafinishingwarehouse:'z_buildingafinishingwh',afinishingwh:'z_buildingafinishingwh',oldfinishing:'z_buildingafinishingwh','a廠後整倉':'z_buildingafinishingwh','a廠成品倉':'z_buildingafinishingwh'};
    Object.assign(aliases, {zd:'z_buildingafinishingwh',finishingwarehouse:'z_buildingafinishingwh',finishingwh:'z_buildingafinishingwh',zfinishingwarehouse:'z_buildingafinishingwh',zfinishingwh:'z_buildingafinishingwh','a廠倉庫':'z_buildingafinishingwh','a厂仓库':'z_buildingafinishingwh'});
    const direct = v => { const k = token(v); return aliases[k] || (/^z?buildingafinishing(?:wh|warehouse)\d+$/.test(k) ? 'z_buildingafinishingwh' : ''); };
    const def = (Array.isArray(definitions) ? definitions : []).find(z => z && (String(z.id) === String(value) || (Array.isArray(z.aliasIds) && z.aliasIds.map(String).includes(String(value)))));
    return (def && [def.en, def.zh, def.id].map(direct).find(Boolean)) || direct(value) || '';
  }
  function tempZones() { try { const raw = global.localStorage && global.localStorage.getItem('vrt_th_z'); const d = raw ? JSON.parse(raw) : null; return Array.isArray(d) ? d : []; } catch (e) { return []; } }
  function temperature(r, definitions) {
    if (!r || typeof r !== 'object') return '';
    const d = String(r.d !== undefined ? r.d : (r.date || '')).slice(0, 10);
    const p = String(r.p !== undefined ? r.p : (r.period || '')).toLowerCase();
    const rawZone = String(r.z !== undefined ? r.z : (r.zoneId || r.zone || ''));
    const z = tempZoneId(rawZone, definitions || tempZones()) || rawZone;
    if (d && p && z) return 'slot:' + d + '|' + p + '|' + z;
    return r.id ? 'id:' + String(r.id) : '';
  }
  return { cleaning: cleaning, dormitory: dormitory, temperature: temperature, tempZoneId: tempZoneId, cleaningDate: cleanDate, cleaningSlots: cleanSlots, array: arr };
})();

/* ═══════════════════════════════════════════════════════════
   2.4 CAPABILITIES — 後端能力偵測（GET ?action=ping 的 capabilities）
   每個瀏覽器分頁工作階段只問一次（sessionStorage 快取）；問不到 → 維持「未啟用」，
   頁面照舊只發通知，不會顯示假的核可狀態。結果：GC.approvalTools={ehs,asset}，
   並觸發 window 'gc:capabilities' 事件讓頁面重畫。
   ═══════════════════════════════════════════════════════════ */
GC.approvalTools = { ehs: false, asset: false };
GC.capabilities = (function () {
  const KEY = 'gc_caps_v1';
  let list = null, promise = null;
  function apply(caps, source) {
    list = Array.isArray(caps) ? caps.map(String) : [];
    GC.approvalTools = { ehs: list.indexOf('ehs-approval') >= 0, asset: list.indexOf('asset-approval') >= 0 };
    try { global.dispatchEvent(new CustomEvent('gc:capabilities', { detail: { capabilities: list.slice(), approvalTools: Object.assign({}, GC.approvalTools), source: source || '' } })); } catch (e) {}
    return list.slice();
  }
  function cached() {
    try {
      const raw = global.sessionStorage && global.sessionStorage.getItem(KEY);
      const d = raw ? JSON.parse(raw) : null;
      if (d && d.url === CLOUD.gasUrl && Array.isArray(d.caps)) return d.caps;
    } catch (e) {}
    return null;
  }
  function load(force) {
    if (!force && promise) return promise;
    if (!force) { const c = cached(); if (c) { promise = Promise.resolve(apply(c, 'cache')); return promise; } }
    promise = CLOUD.get({ action: 'ping' }, { timeout: 20000 }).then(function (d) {
      const caps = d && (Array.isArray(d.capabilities) ? d.capabilities : (d.data && Array.isArray(d.data.capabilities) ? d.data.capabilities : null));
      if (!caps) throw new Error('No capabilities');
      try { global.sessionStorage && global.sessionStorage.setItem(KEY, JSON.stringify({ url: CLOUD.gasUrl, caps: caps, at: Date.now() })); } catch (e) {}
      return apply(caps, 'ping');
    }).catch(function () {
      // 離線或舊後端：保持未啟用；下次呼叫 load() 會再試。
      promise = null;
      return list ? list.slice() : [];
    });
    return promise;
  }
  return {
    load: load,
    ready: function () { return promise || load(); },
    list: function () { return list ? list.slice() : []; },
    has: function (name) { return !!list && list.indexOf(String(name)) >= 0; },
    set: function (caps) { return apply(caps, 'manual'); },
    clear: function () { list = null; promise = null; try { global.sessionStorage && global.sessionStorage.removeItem(KEY); } catch (e) {} GC.approvalTools = { ehs: false, asset: false }; }
  };
})();
(function () {
  const c = (function () { try { const raw = global.sessionStorage && global.sessionStorage.getItem('gc_caps_v1'); const d = raw ? JSON.parse(raw) : null; return d && d.url === CLOUD.gasUrl && Array.isArray(d.caps) ? d.caps : null; } catch (e) { return null; } })();
  if (c) GC.capabilities.load(); // 同步套用快取（頁面腳本載入時即可讀到 GC.approvalTools）
  if (typeof global.fetch === 'function') setTimeout(function () { GC.capabilities.load(); }, 0);
})();

/* 照片上傳佇列：同時最多 3 張、每張最多試 3 次；成功的連結依照片指紋記在
   IndexedDB（ac_gc_photo_links_v1），同步中途失敗、下次重試時不會重複上傳到 Drive。 */
const PHOTO_UPLOAD = GC.photoUpload = (() => {
  const LINKS_KEY = 'ac_gc_photo_links_v1';
  const MAX_PARALLEL = 3, ATTEMPTS = 3, KEEP_DAYS = 180, MAX_LINKS = 4000;
  let active = 0, links = null, saveTimer = 0, maxSeen = 0;
  const queue = [];
  function load() {
    if (links) return links;
    try { links = JSON.parse(STORAGE.getSync(LINKS_KEY) || '{}') || {}; } catch (e) { links = {}; }
    if (typeof links !== 'object' || Array.isArray(links)) links = {};
    return links;
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        const cutoff = Date.now() - KEEP_DAYS * 86400000;
        const entries = Object.keys(links || {}).map(k => [k, links[k]]).filter(e => e[1] && e[1].u && (e[1].t || 0) >= cutoff)
          .sort((a, b) => (b[1].t || 0) - (a[1].t || 0)).slice(0, MAX_LINKS);
        links = {}; entries.forEach(e => { links[e[0]] = e[1]; });
        STORAGE.setSync(LINKS_KEY, JSON.stringify(links));
      } catch (e) {}
    }, 250);
  }
  try {
    if (typeof global.addEventListener === 'function') global.addEventListener('gc:storagechange', function (e) {
      const keys = (e && e.detail && e.detail.keys) || [];
      if (keys.indexOf(LINKS_KEY) >= 0) links = null;
    });
  } catch (e) {}
  function pump() {
    while (active < MAX_PARALLEL && queue.length) {
      const job = queue.shift();
      active++; maxSeen = Math.max(maxSeen, active);
      Promise.resolve().then(job.run).then(job.resolve, job.reject).then(function () { active--; pump(); });
    }
  }
  function enqueue(run) { return new Promise(function (resolve, reject) { queue.push({ run, resolve, reject }); pump(); }); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function upload(dataUrl, tool, recId, idx) {
    const fp = await SMART.hash(dataUrl);
    const known = load()[fp];
    if (known && /^https?:\/\//i.test(String(known.u || ''))) return known.u;
    return enqueue(async function () {
      const again = load()[fp];
      if (again && /^https?:\/\//i.test(String(again.u || ''))) return again.u;
      let last = null;
      for (let i = 0; i < ATTEMPTS; i++) {
        try {
          const r = await CLOUD.post({ action: 'uploadPhoto', dataUrl, tool, recId, idx: idx || 0, photoKey: fp }, { timeout: WRITE_TIMEOUT_MS });
          const url = r && r.ok && (r.url || (r.data && r.data.url));
          if (/^https?:\/\//i.test(String(url || ''))) {
            load()[fp] = { u: String(url), t: Date.now() };
            save();
            return String(url);
          }
          last = new Error((r && r.error) || 'No Drive link returned');
        } catch (e) { last = e; if (e && e.timeout) break; }
        if (i + 1 < ATTEMPTS) await sleep((/busy|鎖|忙/i.test(String(last && last.message || '')) ? 8000 : 600) * Math.pow(2, i));
      }
      throw last || new Error('Photo upload failed');
    });
  }
  return { upload, get active() { return active; }, get maxParallelSeen() { return maxSeen; }, MAX_PARALLEL };
})();

/* ═══════════════════════════════════════════════════════════
   2.5 SMART SYNC — HRA Portal AutoSync manifest / month bucket model
   · 先讀小型 manifest，比對後只上下載變動 bucket
   · 雲端獨有歷史永遠保留；手機短資料不會覆蓋完整雲端
   · 照片先轉 Drive 連結，避免重傳 base64 與 Sheet 配額
   · sync state / pending marker 都是小設定，可留 localStorage
   ═══════════════════════════════════════════════════════════ */
const SMART = GC.smartSync = (() => {
  const VERSION = '1.1-hra-portal-autosync';
  const STATE_PREFIX = 'ac_gc_smart_sync_v1_';
  const DATE_FIELDS = ['_syncPeriod','period','periodKey','date','d','recordDate','reportDate','purchase_date','issue_date','datetime','return_date','ts','yearMonth','month'];

  function text(v) { return String(v == null ? '' : v); }
  function stable(v) {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (typeof v === 'object') return '{' + Object.keys(v).sort().filter(function (k) {
      return !/^_smart/.test(k) && !/^(synced|_localPending|updatedAt|createdAt|savedAt|modifiedAt|timestamp|cloudUpdatedAt|lastCloudUpdatedAt)$/.test(k);
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
    if (opt && typeof opt.keyFn === 'function') {
      const custom = opt.keyFn(row);
      if (custom !== undefined && custom !== null && custom !== '') return 'business:' + text(custom);
    }
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
  function isDeleted(r) { return !!(r && (r._deleted === true || r._deleted === 'true' || r._deleted === 1)); }
  /* 合併同一筆（同 semanticKey）：updatedAt 新的贏；同時間時「刪除記號」優先，
     避免已刪除的記錄被另一台手機的舊資料復活（A3）。 */
  function mergeRows(a, b, opt) {
    const map = new Map(), order = [];
    (a || []).concat(b || []).forEach(function (row) {
      const key = semanticKey(row, opt);
      if (!map.has(key)) { order.push(key); map.set(key, row); return; }
      const old = map.get(key), ta = stamp(old, opt), tb = stamp(row, opt);
      const preferred=GC.dormVersionWinner(old,row);
      if(preferred){map.set(key,preferred);return;}
      let winner;
      if (tb > ta) winner = row;
      else if (tb < ta) winner = old;
      else if (isDeleted(row) !== isDeleted(old)) winner = isDeleted(row) ? row : old;
      else winner = stable(row).length > stable(old).length ? row : old;
      const loser = winner === row ? old : row;
      const merged = Object.assign({}, loser, winner);
      if (!isDeleted(winner)) { delete merged._deleted; delete merged.deletedAt; }
      map.set(key, merged);
    });
    return order.map(k => map.get(k));
  }
  /* 墓碑保留天數：預設 90 天，之後才從同步資料中移除。 */
  function tombTime(r, opt) {
    const d = r && r.deletedAt ? new Date(r.deletedAt).getTime() : NaN;
    return isNaN(d) ? stamp(r, opt) : d;
  }
  function pruneTombstonesDetailed(records, opt) {
    const days = Math.max(90, Number(opt && opt.tombstoneDays) || 90);
    const cutoff = Date.now() - days * 86400000;
    const kept = [], pruned = [];
    (records || []).forEach(function (r) {
      if (isDeleted(r)) { const t = tombTime(r, opt); if (t && t < cutoff) { pruned.push(r); return; } }
      kept.push(r);
    });
    return { records: kept, pruned: pruned };
  }
  function pruneTombstones(records, opt) { return pruneTombstonesDetailed(records, opt).records; }
  function sortRows(rows, opt) {
    return (rows || []).slice().sort(function (a, b) {
      const ka = semanticKey(a, opt), kb = semanticKey(b, opt);
      return ka < kb ? -1 : ka > kb ? 1 : stable(a) < stable(b) ? -1 : 1;
    });
  }
  async function buildBuckets(records, opt) {
    const groups = {}, out = {};
    (records || []).forEach(function (r) { const k = bucketKey(r, opt); (groups[k] || (groups[k] = [])).push(r); });
    const keys = Object.keys(groups).sort();
    const built = await Promise.all(keys.map(async function (k) {
      const rows = sortRows(groups[k], opt);
      return { key:k, records:rows, count:rows.length, hash:await hash(stable(rows)) };
    }));
    built.forEach(function (b) { out[b.key] = b; }); // 固定順序（不受非同步完成先後影響）
    return out;
  }
  /* 同步基準（上次同步後的 bucket hash）存在 localStorage，所有分頁共用。
     只有「本分頁寫的」或「本分頁開啟前就存在」的基準才可信；其他分頁在本分頁
     開啟後才寫入的基準，代表本分頁的資料可能是舊的 → 不使用基準，改走安全合併（A1）。
     本機完全沒有資料時也不使用基準，絕不把雲端當成要刪除（A2）。 */
  const TAB_ID = (STORAGE && STORAGE.tabId) || ('tab_' + Date.now().toString(36));
  const LOADED_AT = (STORAGE && STORAGE.loadedAt) || Date.now();
  function readState(tool) { try { return JSON.parse(localStorage.getItem(STATE_PREFIX + tool) || 'null'); } catch (e) { return null; } }
  function writeState(tool, value) {
    try { localStorage.setItem(STATE_PREFIX + tool, JSON.stringify(Object.assign({}, value, { tab: TAB_ID, at: Date.now() }))); } catch (e) {}
  }
  function clearState(tool) {
    try {
      if (tool) localStorage.removeItem(STATE_PREFIX + tool);
      else if (STORAGE && STORAGE.clearSyncState) STORAGE.clearSyncState();
    } catch (e) {}
  }
  function baseState(tool, records) {
    if (!records || !records.length) return {};
    const s = readState(tool);
    if (!s || typeof s !== 'object') return {};
    if (s.tab === TAB_ID) return s;
    if (!s.at || Number(s.at) <= LOADED_AT) return s;
    return {};
  }
  /* 伺服器與前端 hash 演算法不同時（伺服器改過內容、合併過），下載後記下「雲端 hash ↔ 手機 hash」
     對照（state.alias）；比較時把雲端 hash 換成手機的等值 hash，避免下一次同步又重傳（churn）。 */
  function aliasOf(state) { return (state && state.alias && typeof state.alias === 'object') ? state.alias : {}; }
  function toLocalSpace(h, k, alias) { const a = alias[k]; return a && h && a.r === h ? a.l : h; }
  function translateHashes(map, alias) { const out = {}; Object.keys(map || {}).forEach(function (k) { out[k] = toLocalSpace(map[k], k, alias); }); return out; }
  function dataOf(j) { return j && j.data !== undefined ? j.data : j; }
  function unsupported(message) { const e = new Error(message || 'Smart sync endpoint unavailable'); e.smartUnsupported = true; return e; }
  function isUnsupportedMessage(message) {
    return /unsupported\s+smart|unknown\s+action.*smart|smart(manifest|bucket|commit).*(unsupported|not found|not implemented)|unknown\s+(tool|module)/i.test(String(message || ''));
  }
  function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  async function retryNetwork(work, attempts) {
    let last;
    const total = Math.max(1, Number(attempts) || 3);
    for (let i = 0; i < total; i++) {
      try { return await work(i); }
      catch (e) {
        last = e;
        if (e && e.smartUnsupported) throw e;
        if (e && e.timeout) throw e;   // 伺服器可能仍在處理：不重送，交給下一輪同步（有退避）
        if (i + 1 < total) await wait((/busy|鎖|忙/i.test(String(e && e.message || '')) ? 8000 : 300) * Math.pow(2, i));
      }
    }
    throw last || new Error('Cloud sync failed');
  }
  async function manifest(tool) {
    const d = dataOf(await retryNetwork(async function () {
      try { return await CLOUD.get({ action:'smartManifest', tool:tool }); }
      catch (e) { if (isUnsupportedMessage(e && e.message)) throw unsupported(e.message); throw e; }
    }, 3));
    if (!d || typeof d.exists !== 'boolean') throw unsupported();
    return d;
  }
  function monthsOf(records, opt) {
    const m = new Set();
    (records || []).forEach(function (r) { const d = recordDate(r, opt); if (d) m.add(d.slice(0, 7)); });
    return Array.from(m).sort();
  }
  function photoFieldsOf(tool, opt) {
    const base = [(opt && opt.photoField) || 'photos'].concat(Array.isArray(opt && opt.photoFields) ? opt.photoFields : []);
    if (tool === 'waterdrum') base.push('fPhotos', 'sPhotos');
    return Array.from(new Set(base.filter(Boolean)));
  }
  /* 照片先轉 Drive 連結（同時最多 3 張、自動重試、記住已上傳連結）。
     單張失敗：雲端資料不放這張（絕不送 base64 進 bucket），手機保留原照片，
     其他照片與整個模組照常同步；下次同步自動重試（A5/A14）。 */
  async function preparePhotosDetailed(records, tool, opt) {
    opt = opt || {};
    const fields = photoFieldsOf(tool, opt);
    /* Cleaning 等批次記錄可能共用同一張照片。一次同步內以 dataURL 為鍵共用
       上傳 Promise，避免同一張照片因多地點／多時段而重複寫入 Drive。 */
    const uploaded = new Map();
    const failures = [], localMap = new Map();
    function isData(p) { return typeof p === 'string' && p.indexOf('data:image/') === 0; }
    function one(photo, recId, idx) {
      if (!uploaded.has(photo)) {
        uploaded.set(photo, CLOUD.uploadPhotoStrict(photo, tool, recId, idx).then(
          function (url) { return /^https?:\/\//i.test(String(url || '')) ? { url: String(url) } : { error: new Error('No Drive link') }; },
          function (err) { return { error: err }; }));
      }
      return uploaded.get(photo);
    }
    const out = await Promise.all((records || []).map(async function (row) {
      let cloud = row, local = row, failed = false;
      for (const photoField of fields) {
        const raw = row && row[photoField];
        if (raw == null || raw === '') continue;
        const photos = tool === 'waterdrum' ? PHOTO.list(raw) : U.asArray(raw);
        if (!photos.some(isData)) continue;
        const recId = row && row[opt.idKey || 'id'];
        const results = await Promise.all(photos.map(function (photo, idx) { return isData(photo) ? one(photo, recId, idx) : Promise.resolve({ value: photo }); }));
        if (cloud === row) cloud = Object.assign({}, row);
        if (local === row) local = Object.assign({}, row);
        cloud[photoField] = []; local[photoField] = [];
        results.forEach(function (r, idx) {
          if (r.url) { cloud[photoField].push(r.url); local[photoField].push(r.url); }
          else if (r.error) { failed = true; local[photoField].push(photos[idx]); failures.push({ id: recId, field: photoField, index: idx, error: String(r.error && r.error.message || r.error) }); }
          else { cloud[photoField].push(r.value); local[photoField].push(r.value); }
        });
      }
      if (failed) localMap.set(cloud, local);
      return cloud;
    }));
    return { records: out, localMap: localMap, failures: failures };
  }
  /** 相容舊 API：回傳可上雲的記錄（失敗照片不含 base64）。 */
  async function preparePhotos(records, tool, opt) {
    return (await preparePhotosDetailed(records, tool, opt || {})).records;
  }
  async function legacyPull(tool, opt) {
    const d = await CLOUD.get({ action:'pull', tool:tool });
    const raw = (d && d.data && d.data.list) || (d && d.list) || [];
    return { records:Array.isArray(raw) ? raw : [], meta:dataOf(d) || {} };
  }
  /* 同步 meta 只放模組的業務設定（清潔人員、地點、區域…），不放報表期間／發送
     選項；否則每次切換期間都會多一次 commit，Portal 與模組互相覆蓋（A17）。 */
  function businessMeta(opt) {
    const raw = typeof opt.extra === 'function' ? (opt.extra() || {}) : (opt.extra || {});
    const out = {};
    Object.keys(raw || {}).forEach(function (k) {
      if (/^report[A-Z_]/.test(k) || /^(messageKey|updateExisting|dedupePhotos|photoDedupeKey)$/.test(k)) return;
      out[k] = raw[k];
    });
    return out;
  }
  function isBigShrink(removed, total) {
    return removed >= 3 && (removed >= 20 || removed >= Math.max(1, total) * 0.2);
  }
  async function pushPrepared(tool, records, opt, remote, migrated) {
    const local = await buildBuckets(records, opt);
    const last = migrated ? {} : baseState(tool, records), alias = migrated ? {} : aliasOf(last), lastH = translateHashes(last.hashes || {}, alias);
    const realRemoteH = migrated ? {} : (remote.hashes || {}), remoteH = translateHashes(realRemoteH, alias), remoteC = migrated ? {} : (remote.counts || {});
    const changed = [], deleted = [], remoteChanged = [], conflicts = [];
    const localEmpty = !(records || []).length;
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
      // localEmpty 時 baseState() 已回傳空基準，不會走到這裡（空手機絕不刪雲端）。
      if (opt.allowDeletes && !lh && rh && base && rh === base) { deleted.push(k); return; }
      const lc = lh !== base, rc = rh !== base;
      if (lc && !rc && lh) changed.push(k);
      else if (!lc && rc) remoteChanged.push(k);
      else if (lc && rc && lh !== rh) conflicts.push(k);
    });
    if (!migrated && (remoteChanged.length || conflicts.length)) {
      return { ok:false, needsPull:true, remoteChanged:remoteChanged, conflicts:conflicts };
    }
    /* 大量減少保護：這次上傳會讓雲端少很多筆（例如清空手機後又新增 1 筆），
       必須使用者確認；不確認 → 保留雲端並合併回手機（A2）。 */
    if (!migrated && !opt._shrinkApproved) {
      const pruned = opt._prunedByBucket || {};
      const shrinkBuckets = [];
      let removed = 0;
      deleted.forEach(function (k) { const n = Math.max(0, (Number(remoteC[k]) || 0) - (pruned[k] || 0)); if (n) { removed += n; shrinkBuckets.push(k); } });
      changed.forEach(function (k) {
        if (!remoteH[k]) return;
        const n = (Number(remoteC[k]) || 0) - local[k].count - (pruned[k] || 0);
        if (n > 0) { removed += n; shrinkBuckets.push(k); }
      });
      const total = Object.keys(remoteC).reduce(function (n, k) { return n + (Number(remoteC[k]) || 0); }, 0);
      if (shrinkBuckets.length && isBigShrink(removed, total)) {
        let approved = false;
        if (typeof opt.confirmShrink === 'function') {
          try { approved = !!(await opt.confirmShrink({ tool: tool, removed: removed, total: total, buckets: shrinkBuckets.slice() })); } catch (e) { approved = false; }
        }
        if (!approved) {
          return { ok:false, needsPull:true, remoteChanged:[], conflicts:[], forceMerge:shrinkBuckets, shrinkBlocked:{ removed: removed, total: total, buckets: shrinkBuckets } };
        }
      }
    }
    const uploadId = 'gc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    let uploaded = 0;
    /* 伺服器改動過內容（去重、還原核可欄位…）的 bucket：commit 後立刻重新下載，
       手機才會與雲端一致，下次同步不會把舊內容再傳上去（altered:true）。 */
    const altered = [], localHashOf = {};
    for (let i = 0; i < changed.length; i++) {
      const b = local[changed[i]];
      localHashOf[b.key] = b.hash;
      const r = await retryNetwork(function () {
        return CLOUD.post({ action:'smartBucket', tool:tool, uploadId:uploadId, bucket:b.key, hash:b.hash, count:b.count, records:b.records }, { timeout: WRITE_TIMEOUT_MS });
      }, 3);
      if (!r || r.ok === false) throw new Error((r && r.error) || 'Smart bucket upload failed');
      const saved=dataOf(r)||{};
      if (saved.altered === true) altered.push(b.key);
      if (saved.hash) b.hash=String(saved.hash);
      if (saved.count!==undefined) b.count=Math.max(0,Number(saved.count)||0);
      uploaded += b.count;
    }
    const hashes = {}, counts = {};
    // 沒上傳的 bucket 送「雲端原本的 hash」（伺服器以此判斷未變動）；上傳的送這次的 hash。
    Object.keys(local).forEach(function (k) { hashes[k] = changed.indexOf(k) < 0 && realRemoteH[k] ? realRemoteH[k] : local[k].hash; counts[k] = changed.indexOf(k) < 0 && realRemoteH[k] ? (Number(remoteC[k]) || local[k].count) : local[k].count; });
    Object.keys(realRemoteH).forEach(function (k) { if (!hashes[k] && deleted.indexOf(k) < 0) { hashes[k] = realRemoteH[k]; counts[k] = Number((remote.counts || {})[k]) || 0; } });
    const nextAlias = {};
    Object.keys(alias).forEach(function (k) { if (changed.indexOf(k) < 0 && deleted.indexOf(k) < 0 && realRemoteH[k] && alias[k].r === realRemoteH[k]) nextAlias[k] = alias[k]; });
    const business = businessMeta(opt);
    const meta = Object.assign({}, business, {
      periods: monthsOf(records, opt), _smartMetaHash: await hash(stable(business))
    });
    const metaChanged = migrated || changed.length || deleted.length || meta._smartMetaHash !== (remote.metaHash || '');
    if (!metaChanged) {
      writeState(tool, { hashes:realRemoteH, counts:remote.counts || {}, metaHash:remote.metaHash || '', alias:nextAlias, updatedAt:U.now() });
      return { ok:true, skipped:true, uploaded:0, unchanged:records.length, changedBuckets:0, records:records };
    }
    /* compare-and-swap：baseHashes＝規劃這次上傳時讀到的雲端 hash。commit 時雲端 bucket
       已被別台改過 → 伺服器合併（mergedBuckets）或保留別台版本（keptBuckets），並回 needsPull。 */
    const baseHashes = Object.assign({}, realRemoteH);
    const commit = await retryNetwork(function () { return CLOUD.post({ action:'smartCommit', tool:tool, uploadId:uploadId, hashes:hashes, counts:counts, baseHashes:baseHashes,
      recordCount:Object.keys(counts).reduce((n, k) => n + (Number(counts[k]) || 0), 0), meta:meta }, { timeout: WRITE_TIMEOUT_MS }); }, 3);
    if (!commit || commit.ok === false) throw new Error((commit && commit.error) || 'Smart commit failed');
    const cd = dataOf(commit) || {};
    const ts = (cd.timestamp || cd.updatedAt) || U.now();
    const refetch = [];
    const addRefetch = function (k) { if (k && refetch.indexOf(k) < 0) refetch.push(k); };
    altered.forEach(addRefetch);
    if (cd.needsPull === true || cd.conflict === true) {
      (Array.isArray(cd.mergedBuckets) ? cd.mergedBuckets : []).forEach(addRefetch);
      (Array.isArray(cd.keptBuckets) ? cd.keptBuckets : []).forEach(addRefetch);
    }
    /* 需要重新下載的 bucket：基準設成「手機這份」的 hash（或移除），
       下載時會看成「只有雲端變了」→ 直接採用雲端（已含本機的修改），不會回滾別台。 */
    const stateHashes = Object.assign({}, hashes), stateCounts = Object.assign({}, counts);
    refetch.forEach(function (k) {
      delete nextAlias[k];
      if (local[k]) stateHashes[k] = localHashOf[k] || local[k].hash || stateHashes[k];
      else { delete stateHashes[k]; delete stateCounts[k]; }
    });
    writeState(tool, { hashes:stateHashes, counts:stateCounts, metaHash:meta._smartMetaHash, alias:nextAlias, updatedAt:ts });
    return { ok:true, uploaded:uploaded, unchanged:Math.max(0, records.length - uploaded), changedBuckets:changed.length, removedBuckets:deleted.length, migrated:!!migrated, records:records, response:commit,
      refetch:refetch, alteredBuckets:altered, conflict:!!(cd.needsPull || cd.conflict) };
  }
  function prunedByBucket(rows, opt) {
    const out = {};
    (rows || []).forEach(function (r) { const k = bucketKey(r, opt); out[k] = (out[k] || 0) + 1; });
    return out;
  }
  async function upload(tool, localList, opt) {
    opt = opt || {};
    const toCloud = typeof opt.toCloud === 'function' ? opt.toCloud : (r => r);
    const fromCloud = typeof opt.fromCloud === 'function' ? opt.fromCloud : (r => r);
    const pr = pruneTombstonesDetailed((localList || []).map(toCloud), opt);
    let records = pr.records;
    const pushOpt = Object.assign({}, opt, { _prunedByBucket: prunedByBucket(pr.pruned, opt) });
    let remote = await manifest(tool), migrated = false;
    if (!remote.exists && remote.legacy) {
      const old = await legacyPull(tool, opt);
      records = mergeRows(records, old.records, opt);
      if (typeof opt.onRemote === 'function') opt.onRemote(old.meta || {});
      migrated = true;
    }
    const localMap = new Map();
    let photoFailures = [];
    let prepared = await preparePhotosDetailed(records, tool, opt);
    prepared.localMap.forEach(function (v, k) { localMap.set(k, v); });
    photoFailures = prepared.failures;
    records = prepared.records;
    let result = await pushPrepared(tool, records, pushOpt, remote, migrated);
    let shrinkBlocked = null;
    if (result.needsPull) {
      shrinkBlocked = result.shrinkBlocked || null;
      const pulled = await download(tool, records, Object.assign({}, opt, { _cloudInput:true, _forceMerge:result.forceMerge || [] }));
      prepared = await preparePhotosDetailed(pruneTombstones((pulled.list || []).map(toCloud), opt), tool, opt);
      prepared.localMap.forEach(function (v, k) { localMap.set(k, v); });
      photoFailures = prepared.failures;
      const mergedCloud = prepared.records;
      remote = await manifest(tool);
      /* 已與雲端合併（雲端資料都在）→ 不再做大量減少檢查，避免卡住。 */
      result = await pushPrepared(tool, mergedCloud, Object.assign({}, pushOpt, { _shrinkApproved: !!shrinkBlocked }), remote, false);
      records = mergedCloud;
    }
    if (result.ok && Array.isArray(result.refetch) && result.refetch.length) {
      /* commit 後雲端與手機不同（別台同時提交、或伺服器改過內容）→ 立刻下載那些 bucket。 */
      const localRows = records.map(function (r) { return localMap.get(r) || r; });
      const pulled = await download(tool, localRows, Object.assign({}, opt, { _cloudInput:true }));
      result.list = pulled.list;
      result.refetched = result.refetch.slice();
      result.photoFailures = photoFailures;
      if (shrinkBlocked) result.shrinkBlocked = shrinkBlocked;
      result.res = Object.assign({ ok:true, smart:true }, dataOf(result.response) || {}, result);
      return result;
    }
    result.list = records.map(function (r) { return localMap.get(r) || r; }).map(fromCloud);
    result.photoFailures = photoFailures;
    if (shrinkBlocked) result.shrinkBlocked = shrinkBlocked;
    result.res = Object.assign({ ok:true, smart:true }, dataOf(result.response) || {}, result);
    return result;
  }
  async function download(tool, localList, opt) {
    opt = opt || {};
    const toCloud = typeof opt.toCloud === 'function' ? opt.toCloud : (r => r);
    const fromCloud = typeof opt.fromCloud === 'function' ? opt.fromCloud : (r => r);
    let localRows = pruneTombstones(opt._cloudInput ? (localList || []) : (localList || []).map(toCloud), opt);
    const remote = await manifest(tool);
    if (!remote.exists && remote.legacy) {
      const old = await legacyPull(tool, opt);
      const merged = mergeRows(localRows, old.records, opt);
      const migrated = await pushPrepared(tool, merged, opt, remote, true);
      return { list:merged.map(fromCloud), stat:{added:old.records.length,updated:0,kept:localRows.length,total:merged.length}, empty:false,
        response:Object.assign({smart:true,migrated:true},old.meta||{}), downloaded:old.records.length, uploaded:migrated.uploaded || 0 };
    }
    if (!remote.exists) return { list:(localRows || []).map(fromCloud), stat:null, empty:true, response:remote, downloaded:0 };
    const force = new Set(Array.isArray(opt._forceMerge) ? opt._forceMerge : []);
    const local = await buildBuckets(localRows, opt), out = {}, realRemoteH = remote.hashes || {}, last = baseState(tool, localRows), alias = aliasOf(last);
    const remoteH = translateHashes(realRemoteH, alias), lastH = translateHashes(last.hashes || {}, alias), nextAlias = {};
    Object.keys(alias).forEach(function (k) { if (realRemoteH[k] && alias[k].r === realRemoteH[k]) nextAlias[k] = alias[k]; });
    let downloaded = 0, unchanged = 0, pending = 0, removed = 0;
    const conflicts = [];
    const keys = Array.from(new Set(Object.keys(remoteH).concat(Object.keys(local)))).sort();
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i], lb = local[k], rh = remoteH[k] || '', base = lastH[k] || '';
      if (lb && rh && lb.hash === rh) { out[k] = lb.records; unchanged += lb.count; continue; }
      if (lb && !rh) {
        if (base && lb.hash === base) { removed += lb.count; continue; }
        out[k] = lb.records; pending += lb.count; continue;
      }
      if (!rh) continue;
      const firstDivergence = !!(lb && !base && lb.hash !== rh);
      const localChanged = !!(lb && base && lb.hash !== base);
      const remoteChanged = !!(rh && base && rh !== base);
      if (firstDivergence) conflicts.push(k);
      if (lb && localChanged && !remoteChanged && !force.has(k)) { out[k] = lb.records; pending += lb.count; continue; }
      if (lb && localChanged && remoteChanged && lb.hash !== rh) conflicts.push(k);
      const bd = dataOf(await retryNetwork(function () { return CLOUD.get({ action:'smartBucket', tool:tool, bucket:k }); }, 3)) || {};
      const rows = Array.isArray(bd.records) ? bd.records : [];
      downloaded += rows.length;
      const mergedHere = lb && (firstDivergence || force.has(k) || (localChanged && remoteChanged && lb.hash !== rh));
      out[k] = mergedHere ? mergeRows(lb.records, rows, opt) : rows;
      delete nextAlias[k];
      if (!mergedHere) {
        // 整包採用雲端版本：記下「雲端 hash ↔ 手機計算的 hash」
        const lh = await hash(stable(sortRows(rows, opt)));
        if (lh && lh !== realRemoteH[k]) nextAlias[k] = { r: realRemoteH[k], l: lh };
      }
    }
    const merged = sortRows(Object.keys(out).reduce((a, k) => a.concat(out[k] || []), []), opt);
    writeState(tool, { hashes:realRemoteH, counts:remote.counts || {}, metaHash:remote.metaHash || '', alias:nextAlias, updatedAt:U.now() });
    return { list:merged.map(fromCloud), stat:{added:downloaded,updated:0,kept:unchanged,total:merged.length}, empty:false,
      response:Object.assign({smart:true}, remote.meta || {}, {data:Object.assign({list:merged}, remote.meta || {})}), downloaded:downloaded,
      unchanged:unchanged, pendingUpload:pending, removed:removed, conflicts:conflicts };
  }
  return { version:VERSION, upload, download, buildBuckets, mergeRows, semanticKey, bucketKey, stable, hash, readState, retryNetwork, preparePhotos,
    preparePhotosDetailed, pruneTombstones, isDeleted, clearState, baseState };
})();

/* ═══════════════════════════════════════════════════════════
   2.6 DATA — 刪除墓碑（tombstone）共用工具
   刪除一筆 = 保留 {id, _deleted:true, updatedAt, deletedAt, 關鍵欄位}，
   一起存檔並同步；畫面、統計、匯出、Telegram 一律用 GC.data.live(rows)。
   墓碑至少保留 90 天，之後同步時自動清除。
   ═══════════════════════════════════════════════════════════ */
GC.data = {
  TOMBSTONE_DAYS: 90,
  isDeleted(r) { return SMART.isDeleted(r); },
  /** 只留有效記錄（去掉 _deleted 墓碑） */
  live(rows) { return (Array.isArray(rows) ? rows : []).filter(r => r && !SMART.isDeleted(r)); },
  /** 只取墓碑 */
  tombstones(rows) { return (Array.isArray(rows) ? rows : []).filter(r => SMART.isDeleted(r)); },
  /**
   * 由一筆記錄產生墓碑。保留 id 與所有「小」欄位（日期、地點、時段…，讓各模組的
   * 同步鍵仍然對得上），去掉照片、base64、大型物件。opt: {idKey, reason, by, keep:[欄位]}
   */
  tomb(row, opt) {
    opt = opt || {};
    const idKey = opt.idKey || 'id';
    const now = U.now();
    const out = {};
    const keep = Array.isArray(opt.keep) ? opt.keep : null;
    Object.keys(row || {}).forEach(k => {
      const v = row[k];
      if (keep && keep.indexOf(k) < 0 && k !== idKey) return;
      if (/photo|image|img|attachment|base64/i.test(k)) return;
      if (typeof v === 'string') { if (v.length > 300 || v.indexOf('data:') === 0) return; out[k] = v; return; }
      if (typeof v === 'number' || typeof v === 'boolean' || v == null) { out[k] = v; return; }
      if (Array.isArray(v) && v.length <= 20 && v.every(x => x == null || typeof x === 'number' || (typeof x === 'string' && x.length <= 60 && x.indexOf('data:') !== 0))) out[k] = v.slice();
    });
    if (row && row[idKey] != null) out[idKey] = row[idKey];
    out._deleted = true;
    out.deletedAt = now;
    out.updatedAt = now;
    if (opt.reason) out.deleteReason = String(opt.reason);
    if (opt.by) out.deletedBy = String(opt.by);
    return out;
  },
  /** 在清單中把符合的記錄換成墓碑；match 可為 id 或 function(row)。回傳新清單。 */
  remove(list, match, opt) {
    opt = opt || {};
    const idKey = opt.idKey || 'id';
    const test = typeof match === 'function' ? match : (r => r && String(r[idKey]) === String(match));
    return (Array.isArray(list) ? list : []).map(r => (r && !SMART.isDeleted(r) && test(r)) ? GC.data.tomb(r, opt) : r);
  },
  /** 移除超過保留天數（預設 90 天）的墓碑 */
  prune(rows, days) { return SMART.pruneTombstones(rows, { tombstoneDays: days }); },
  /** 兩份清單合併：同一筆 updatedAt 新的贏；同時間刪除優先。opt 同同步設定 {idKey, keyFn, dateField} */
  merge(a, b, opt) { return SMART.mergeRows(a, b, Object.assign({ idKey: 'id', tsKey: 'updatedAt' }, opt || {})); }
};

/* ═══════════════════════════════════════════════════════════
   3. PHOTO — 拍照 / 選檔 / 壓縮 / 縮圖
   ═══════════════════════════════════════════════════════════ */
const PHOTO = GC.photo = {
  /* 全平台統一：長邊最多 1024px、JPEG 品質 0.7（約 150–400KB）。 */
  MAX_W: 1024,
  MAX_EDGE: 1024,
  QUALITY: 0.7,
  _cells: new Map(),

  value(photo) {
    if (photo && typeof photo === 'object') return String(photo.url || photo.src || photo.dataUrl || photo.link || '');
    return typeof photo === 'string' ? photo : '';
  },

  /** Google Drive view links often cannot be hot-linked reliably on mobile.
      Render through Drive's thumbnail endpoint while retaining the original
      stored URL for cloud sync and Telegram. */
  src(photo) {
    const raw = PHOTO.value(photo).trim();
    if (!raw) return '';
    let m = raw.match(/[?&]id=([A-Za-z0-9_-]+)/);
    if (!m) m = raw.match(/\/file\/d\/([A-Za-z0-9_-]+)/);
    return m ? 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(m[1]) + '&sz=w1600' : raw;
  },

  list(photos) {
    return U.asArray(photos).map(PHOTO.value).filter(Boolean);
  },

  /**
   * 壓縮照片 → JPEG dataURL（長邊 ≤ 1024px、品質 0.7）。
   * input 可為 File / Blob / 'data:image/...' 字串；第二參數可為最大長邊數字或 {maxEdge, quality}。
   */
  compress(file, maxW, quality) {
    if (maxW && typeof maxW === 'object') { quality = maxW.quality; maxW = maxW.maxEdge || maxW.maxW; }
    const maxEdge = Number(maxW) > 0 ? Number(maxW) : PHOTO.MAX_EDGE;
    quality = Number(quality) > 0 && Number(quality) <= 1 ? Number(quality) : PHOTO.QUALITY;
    function draw(src, resolve, reject) {
      const img = new Image();
      img.onerror = () => reject(new Error('decode fail'));
      img.onload = () => {
        try {
          let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
          if (!w || !h) return reject(new Error('decode fail'));
          const scale = Math.min(1, maxEdge / Math.max(w, h));
          w = Math.max(1, Math.round(w * scale)); h = Math.max(1, Math.round(h * scale));
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          const ctx = cv.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);   // PNG 透明底轉 JPEG 不變黑
          ctx.drawImage(img, 0, 0, w, h);
          resolve(cv.toDataURL('image/jpeg', quality));
        } catch (e) { reject(e); }
      };
      img.src = src;
    }
    return new Promise((resolve, reject) => {
      if (typeof file === 'string') {
        if (file.indexOf('data:image/') !== 0) return reject(new Error('not an image'));
        return draw(file, resolve, reject);
      }
      if (!file || !/^image\//.test(file.type || '')) return reject(new Error('not an image'));
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('read fail'));
      fr.onload = () => draw(fr.result, resolve, reject);
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
    let photos = PHOTO.list(opt.photos).slice();
    const max = opt.max || 4;
    let busy=false;
    const id = U.uid('ph');
    const cameraId = U.uid('phcam');

    function render() {
      el.innerHTML =
        `<div class="gc-photo-wrap">
           <div class="gc-photo-list">
             ${photos.map((p, i) => `
               <div class="gc-photo-item">
                 <img src="${U.escapeHtml(PHOTO.src(p))}" alt="photo ${i + 1}" data-idx="${i}" class="gc-photo-thumb">
                 <button type="button" class="gc-photo-del" data-del="${i}" title="${U.escapeHtml(I18.t('gc.removePhoto'))}">✕</button>
               </div>`).join('')}
             ${photos.length < max ? `
               <div class="gc-photo-actions">
                 <label class="gc-photo-add" for="${id}">
                   <span class="gc-photo-add-ic">📁</span>
                   <span class="gc-photo-add-tx">${U.escapeHtml(I18.t('gc.chooseFile'))}</span>
                 </label>
                 <label class="gc-photo-camera" for="${cameraId}">
                   <span class="gc-photo-add-ic">📷</span>
                   <span class="gc-photo-add-tx">${U.escapeHtml(I18.t('gc.takePhoto'))}</span>
                 </label>
               </div>` : ''}
           </div>
           <input type="file" id="${id}" accept="image/*" multiple hidden>
           <input type="file" id="${cameraId}" accept="image/*" capture="environment" hidden>
         </div>`;

      const processInput = async input => {
        if (!input) return;
        const files = Array.from(input.files || []);
        if (!files.length || busy) return;
        busy=true;if(opt.onBusy)opt.onBusy(true);
        let changed = false;
        for (const f of files) {
          if (photos.length >= max) break;
          try { photos.push(await PHOTO.compress(f)); changed = true; }
          catch (err) { console.warn('photo', err);GC.toast('⚠ ' + I18.t('gc.photoReadFail'),'error'); }
        }
        input.value = '';
        render();
        busy=false;if(opt.onBusy)opt.onBusy(false);
        if (changed && opt.onChange) opt.onChange(photos);
      };
      const input = el.querySelector('#' + id);
      const camera = el.querySelector('#' + cameraId);
      if (input) input.onchange = () => processInput(input);
      if (camera) camera.onchange = () => processInput(camera);
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
      isBusy: () => busy,
      get: () => photos.slice(),
      set: arr => { photos = PHOTO.list(arr).slice(); render(); },
      clear: () => { photos = []; render(); },
      destroy: () => { global.removeEventListener('gc:langchange', rerenderOnLanguage); }
    };
  },

  /** 全螢幕看圖 */
  lightbox(photos, idx) {
    photos = PHOTO.list(photos);
    if (!photos.length) return;
    idx = idx || 0;
    const bg = document.createElement('div');
    bg.className = 'gc-lightbox';
    function draw() {
      bg.innerHTML =
        `<button class="gc-lb-close" type="button">✕</button>
         ${photos.length > 1 ? '<button class="gc-lb-prev" type="button">‹</button>' : ''}
         <img src="${U.escapeHtml(PHOTO.src(photos[idx]))}" alt="photo">
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
    photos = PHOTO.list(photos);
    if (!photos || !photos.length) return `<span class="gc-dim">—</span>`;
    const key = U.uid('phc');
    PHOTO._cells.set(key, photos.slice());
    if (PHOTO._cells.size > 1200) Array.from(PHOTO._cells.keys()).slice(0, 300).forEach(k => PHOTO._cells.delete(k));
    return `<button type="button" class="gc-photo-cell" data-photo-key="${key}">📷 ${photos.length}</button>`;
  }
};
// 表格縮圖點擊（事件委派，window scope 安全）
document.addEventListener('click', e => {
  const c = e.target.closest && e.target.closest('.gc-photo-cell');
  if (!c) return;
  const photos = PHOTO._cells.get(c.dataset.photoKey) || [];
  if (photos.length) PHOTO.lightbox(photos, 0);
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
    const d = ref ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(ref)) ? String(ref)+'T00:00:00' : ref) : new Date();
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
    if (!mode || mode === 'all') return list.filter(x => !(x && x._deleted));
    const r = PERIOD.range(mode, ref);
    if (!r) return list.slice();
    const f = dateField || 'date';
    return list.filter(x => {
      if (x && x._deleted) return false;
      const raw = x && x[f];
      if (!raw) return false;
      const t = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(raw)) ? String(raw)+'T00:00:00' : raw);
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
      const cands = schema[field].map(IMPORT.norm).filter(Boolean);
      let idx = -1;
      // 完全相等優先
      for (let i = 0; i < H.length && idx < 0; i++)
        if (H[i] && cands.includes(H[i])) idx = i;
      // 再退而求其次：包含
      // 空白標題不可參與包含比對；任何字串都包含空字串，舊邏輯會把
      // 月報中的日期、門檻與備註誤配到第一個空白欄位。
      for (let i = 0; i < H.length && idx < 0; i++) {
        if (!H[i]) continue;
        if (cands.some(c => H[i].length >= 2 && c.length >= 2 && (H[i].includes(c) || c.includes(H[i])))) idx = i;
      }
      out[field] = idx;
    });
    return out;
  },

  /** 依欄位名稱判斷日期／時間欄（schema 欄位名）。 */
  dateTimeFields(schema, opt) {
    opt = opt || {};
    const fields = Object.keys(schema || {});
    const dates = new Set((opt.dateFields || []).filter(Boolean));
    const times = new Set((opt.timeFields || []).filter(Boolean));
    fields.forEach(f => {
      if (opt.dateFields || opt.timeFields) return;
      if (/(^|_)(date|day|d)$|date|日期/i.test(f) && !/update|created/i.test(f)) dates.add(f);
      else if (/(^|_)time$|time(_in|_out)?$|時間/i.test(f)) times.add(f);
    });
    return { dates: Array.from(dates), times: Array.from(times) };
  },
  /**
   * SheetJS raw:true 讀到的 Excel 序號（46268 / 0.354）轉成 'YYYY-MM-DD' / 'HH:MM'（A8）。
   * 無法辨識的日期保留原值並回報 badDates 數。
   */
  convertRows(objects, schema, opt) {
    const ft = IMPORT.dateTimeFields(schema, opt);
    let badDates = 0;
    (objects || []).forEach(o => {
      if (!o) return;
      ft.dates.forEach(f => {
        const v = o[f];
        if (v == null || v === '') return;
        const d = parseDateValue(v);
        if (d) o[f] = d; else { badDates++; o[f] = String(v).trim(); }
      });
      ft.times.forEach(f => {
        const v = o[f];
        if (v == null || v === '') return;
        const t = parseTimeValue(v);
        o[f] = t || String(v).trim();
      });
    });
    return { badDates, dateFields: ft.dates, timeFields: ft.times };
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
              // 多欄 schema 至少命中兩個真實標題，避免報表標題或備註中偶然
              // 出現一個關鍵字便把其後所有列當成業務資料。
              const minimum = fields.length > 1 ? 2 : 1;
              if (matched >= minimum && (!best || matched > best.score)) {
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
      let badDateTotal = 0;
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
          /* 沒有自訂解析器的模組（宿舍、鑰匙）由核心統一把 Excel 日期／時間序號轉好。 */
          const conv = (!Array.isArray(parsed.objects) && opt.convertDates !== false && typeof opt.parse !== 'function')
            ? IMPORT.convertRows(objects, schema, { dateFields: opt.dateFields, timeFields: opt.timeFields }) : { badDates: 0 };
          badDateTotal += conv.badDates || 0;
          allObjects.push(...objects);
          metas.push(Object.assign({}, parsed, { headers, map, sheetName, fileName: file.name, objectCount: objects.length, badDates: conv.badDates || 0 }));
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
      if (badDateTotal) warnings.push(badDateTotal + ' ' + I18.t('gc.badDate'));
      const statusText = () => '✅ ' + allObjects.length + ' ' + I18.t('gc.imported') +
        (metas.length > 1 ? ' · ' + metas.length + ' ' + I18.t('gc.files') : '') +
        (errors.length ? ' · ' + errors.length + ' ' + I18.t('gc.filesFailed') : '') +
        (warnings.length ? ' · ⚠️ ' + warnings.join(' | ') : '');
      status(statusText(), (errors.length || warnings.length) ? 'warning' : 'ok');
      if (opt.onData) {
        const first = metas[0] || {};
        let extra = null;
        try {
          extra = opt.onData(allObjects, Object.assign({}, first, {
            fileName: fileNames,
            files: metas,
            fileCount: metas.length,
            errors: errors,
            badDates: badDateTotal
          }));
        } catch (err) {
          status('❌ ' + I18.t('gc.importFail') + ': ' + (err && err.message ? err.message : err), 'err');
          return;
        }
        if (extra && typeof extra === 'object' && extra.skipped) {
          warnings.push(extra.skipped + ' ' + I18.t('gc.dupSkipped'));
          status(statusText(), 'warning');
        }
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
      if (r && r._deleted) return;
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
/* GC.toast(msg, type, opt)
   · 顯示在畫面頂端，不擋住底部儲存按鈕
   · type='error' 預設常駐，點一下才關閉；其他類型自動消失
   · opt = {persist, ms, action:{label, fn}}，也可直接傳 {label, fn} 當作動作按鈕 */
GC.toast = function (msg, type, opt) {
  try {
    if (!global.document || !document.body) { console.log('[toast]', msg); return null; }
    if (opt && typeof opt.fn === 'function' && !opt.action) opt = { action: opt };
    opt = opt || {};
    const persist = opt.persist != null ? !!opt.persist : type === 'error';
    let box = document.getElementById('gc-toast-box');
    if (!box) {
      box = document.createElement('div');
      box.id = 'gc-toast-box'; box.className = 'gc-toast-box';
      box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }
    const text = I18.mono(msg);
    // 同一則常駐訊息不重複堆疊
    const same = Array.from(box.children).find(el => el.__gcText === text && el.__gcPersist);
    if (same) { same.classList.remove('gc-flash'); void same.offsetWidth; same.classList.add('gc-flash'); return { el: same, close: same.__gcClose }; }
    const t = document.createElement('div');
    t.className = 'gc-toast' + (type ? ' ' + type : '') + (persist ? ' persist' : '');
    t.setAttribute('role', type === 'error' ? 'alert' : 'status');
    t.__gcText = text; t.__gcPersist = persist;
    const body = document.createElement('span');
    body.className = 'gc-toast-msg';
    body.textContent = text;
    t.appendChild(body);
    let closed = false;
    const close = function () {
      if (closed) return; closed = true;
      t.classList.add('out');
      setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
    };
    t.__gcClose = close;
    if (opt.action && typeof opt.action.fn === 'function') {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'gc-toast-act';
      b.textContent = String(opt.action.label || I18.t('gc.confirm'));
      b.onclick = function (e) { e.stopPropagation(); close(); try { opt.action.fn(); } catch (err) { console.error(err); } };
      t.appendChild(b);
    }
    if (persist) {
      const x = document.createElement('span');
      x.className = 'gc-toast-x'; x.textContent = '✕';
      x.setAttribute('aria-label', I18.t('gc.tapToClose'));
      t.title = I18.t('gc.tapToClose');
      t.appendChild(x);
    }
    t.onclick = close;
    box.appendChild(t);
    // 最多同時 5 則；先移除會自動消失的舊訊息
    const items = Array.from(box.children);
    if (items.length > 5) {
      const victim = items.find(el => !el.__gcPersist) || items[0];
      if (victim && victim.__gcClose) victim.__gcClose(); else if (victim && victim.parentNode) victim.parentNode.removeChild(victim);
    }
    if (!persist) setTimeout(close, Number(opt.ms) > 0 ? Number(opt.ms) : (type === 'warning' ? 5000 : 2800));
    return { el: t, close: close };
  } catch (e) { try { console.warn('[toast]', msg); } catch (x) {} return null; }
};

/* GC.guard(key, asyncFn) — 同一個 key（字串或按鈕元素）執行中時，再按不會重跑，
   直接回傳同一個 Promise；key 是按鈕時自動 disabled，完成後恢復。 */
const GUARD_RUNS = new Map();
GC.guard = function (key, fn, opt) {
  if (typeof key === 'function' && typeof fn !== 'function') { opt = fn; fn = key; }
  opt = opt || {};
  if (GUARD_RUNS.has(key)) { const cur = GUARD_RUNS.get(key); return cur.promise || Promise.resolve(); }
  const entry = { promise: null };
  GUARD_RUNS.set(key, entry);   // 先佔位：fn 內同步再次觸發也會被擋下
  const btn = key && key.nodeType === 1 ? key : (opt.button && opt.button.nodeType === 1 ? opt.button : null);
  let prev = false;
  if (btn) { prev = !!btn.disabled; btn.disabled = true; btn.setAttribute('aria-busy', 'true'); if (btn.classList) btn.classList.add('gc-busy'); }
  entry.promise = new Promise(function (resolve, reject) {
    let result;
    try { result = fn(); } catch (e) { reject(e); return; }
    Promise.resolve(result).then(resolve, reject);
  }).finally(function () {
    GUARD_RUNS.delete(key);
    if (btn) { btn.disabled = prev; btn.removeAttribute('aria-busy'); if (btn.classList) btn.classList.remove('gc-busy'); }
  });
  return entry.promise;
};
GC.guard.busy = function (key) { return GUARD_RUNS.has(key); };
/** 包成 onclick 用：GC.guard.wrap('save', saveFn) */
GC.guard.wrap = function (key, fn) { return function () { const a = arguments, c = this; return GC.guard(key, function () { return fn.apply(c, a); }); }; };

/* ═══════════════════════════════════════════════════════════
   9. STYLES — 自動注入（淺色背景，符合現有視覺）
   ═══════════════════════════════════════════════════════════ */
const CSS = `
.gc-lang{display:inline-flex;gap:2px;background:#EEF1F6;border-radius:8px;padding:3px}
.gc-lang-btn{border:0;background:transparent;min-height:44px;min-width:44px;padding:5px 11px;border-radius:6px;font:600 13px/1 inherit;color:#5A6478;cursor:pointer;transition:.15s}
.gc-lang-btn.on{background:#fff;color:#1A3E78;box-shadow:0 1px 3px rgba(0,0,0,.1)}
.gc-lang-btn:hover:not(.on){color:#1A3E78}

.gc-period{display:inline-flex;gap:5px;flex-wrap:wrap}
.gc-pd-btn{border:1px solid #D8DCE6;background:#fff;padding:6px 13px;border-radius:20px;font:500 12px/1 inherit;color:#4A5472;cursor:pointer;transition:.15s}
.gc-pd-btn:hover{border-color:#1A3E78;color:#1A3E78}
.gc-pd-btn.on{background:#1A3E78;border-color:#1A3E78;color:#fff}

.gc-photo-list{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.gc-photo-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.gc-photo-item{position:relative;width:66px;height:66px;border-radius:8px;overflow:hidden;border:1px solid #D8DCE6}
.gc-photo-thumb{width:100%;height:100%;object-fit:cover;cursor:zoom-in;display:block}
.gc-photo-del{position:absolute;top:2px;right:2px;width:19px;height:19px;border:0;border-radius:50%;background:rgba(0,0,0,.62);color:#fff;font-size:11px;line-height:1;cursor:pointer;padding:0}
.gc-photo-del:hover{background:#B91C1C}
.gc-photo-add{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;width:66px;height:66px;border:1.5px dashed #C4CAD8;border-radius:8px;cursor:pointer;color:#8892A8;transition:.15s;background:#FAFBFC}
.gc-photo-add:hover{border-color:#1A3E78;color:#1A3E78;background:#F0F4FB}
.gc-photo-camera{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;width:66px;height:66px;border:1.5px solid #A9C2E3;border-radius:8px;cursor:pointer;color:#1755C4;transition:.15s;background:#F3F8FF}
.gc-photo-camera:hover{border-color:#1A3E78;color:#1A3E78;background:#E7F0FF}
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

.gc-toast-box{position:fixed;top:calc(env(safe-area-inset-top,0px) + 10px);left:50%;transform:translateX(-50%);z-index:2147483600;display:flex;flex-direction:column;gap:7px;align-items:stretch;width:min(560px,calc(100vw - 24px));pointer-events:none}
.gc-toast{display:flex;align-items:center;gap:10px;background:#1A2035;color:#fff;padding:11px 14px;border-radius:10px;font-size:14px;line-height:1.4;box-shadow:0 6px 22px rgba(0,0,0,.28);animation:gcIn .25s ease;pointer-events:auto;cursor:pointer;word-break:break-word}
.gc-toast-msg{flex:1;min-width:0;white-space:pre-line}
.gc-toast.success{background:#16653A}.gc-toast.error{background:#B91C1C}.gc-toast.warning{background:#7D4E00}
.gc-toast.persist{border:2px solid rgba(255,255,255,.55)}
.gc-toast-x{flex:0 0 auto;font-size:16px;opacity:.85;padding:0 2px}
.gc-toast-act{flex:0 0 auto;min-height:36px;padding:0 12px;border:1px solid rgba(255,255,255,.7);border-radius:8px;background:rgba(255,255,255,.14);color:#fff;font:700 13px/1 inherit;cursor:pointer}
.gc-toast.gc-flash{animation:gcFlash .5s ease}
.gc-toast.out{opacity:0;transform:translateY(-8px);transition:.3s}
.gc-preview blockquote,.gc-tg-modal blockquote{margin:4px 0;padding:4px 8px;border-left:3px solid #e17076;background:rgba(26,32,53,.06);border-radius:4px}
.gc-fx{position:fixed;inset:0;z-index:2147483601;display:flex;align-items:center;justify-content:center;pointer-events:none;background:rgba(26,32,53,.18);animation:gcIn .18s ease-out}
.gc-fx.out{opacity:0;transition:opacity .45s}
.gc-fx-card{background:#fff;border-radius:18px;padding:22px 30px;box-shadow:0 12px 40px rgba(0,0,0,.25);text-align:center;min-width:200px;position:relative;overflow:hidden}
.gc-fx-card b{display:block;margin-top:8px;font-size:15px;color:#1A2035}
.gc-fx-plane{font-size:30px;animation:gcFxFly 1.1s ease-in forwards}
.gc-fx-check{width:54px;height:54px;margin:-36px auto 0;border-radius:50%;background:#16a34a;color:#fff;font:700 32px/54px system-ui;transform:scale(0);animation:gcFxPop .45s .55s cubic-bezier(.2,1.6,.4,1) forwards}
@keyframes gcFxFly{0%{transform:translate(-60px,20px) rotate(0)}60%{transform:translate(40px,-30px) rotate(-8deg);opacity:1}100%{transform:translate(140px,-90px) rotate(-15deg);opacity:0}}
@keyframes gcFxPop{to{transform:scale(1)}}
@media (prefers-reduced-motion:reduce){.gc-fx-plane,.gc-fx-check{animation:none;transform:none}}
@keyframes gcIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}
@keyframes gcFlash{50%{transform:scale(1.03)}}
.gc-busy{opacity:.6;cursor:progress!important}

.gc-cloud-btns{display:inline-flex;gap:7px}
.gc-cloud-btn{display:inline-flex;align-items:center;gap:5px;min-height:44px;padding:7px 13px;border:1px solid #D8DCE6;background:#fff;border-radius:7px;font:600 13px/1 inherit;color:#1A3E78;cursor:pointer;transition:.15s}
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
.gc-action-btn{display:inline-flex;align-items:center;gap:5px;min-height:44px;padding:7px 12px;border:1px solid #C9D3E3;background:#fff;border-radius:8px;font:700 12px/1 inherit;color:#1A3E78;cursor:pointer;white-space:nowrap;transition:.15s}
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
  /* text 可為字串或函式（切換語言時重新產生）。 */
  function state(kind, text) {
    if (typeof opt.onState === 'function') opt.onState(kind, typeof text === 'function' ? text() : text, typeof text === 'function' ? text : null);
  }
  const pendingKey = 'ac_gc_auto_sync_v1_' + String(opt.tool || 'tool');
  let running = null, reconcileRunning = null, retryTimer = 0, reconcileTimer = 0, queued = false, retryCount = 0, photoRetryCount = 0;
  function readPending() {
    try { return JSON.parse(localStorage.getItem(pendingKey) || 'null'); } catch (e) { return null; }
  }
  function markPending(reason) {
    const marker = { ts:U.now(), reason:reason || 'auto', token:Date.now().toString(36) + Math.random().toString(36).slice(2, 8) };
    try { localStorage.setItem(pendingKey, JSON.stringify(marker)); } catch (e) {}
    return marker;
  }
  function clearPending(token) {
    try {
      const current = readPending();
      if (!token || !current || current.token === token) localStorage.removeItem(pendingKey);
    } catch (e) {}
  }
  function hasPending() { try { return !!localStorage.getItem(pendingKey); } catch (e) { return false; } }
  function hhmm() { try { return new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',hour12:false}); } catch (e) { return ''; } }
  function isOnline() { try { return !(global.navigator && global.navigator.onLine === false); } catch (e) { return true; } }
  function reasonDelay(reason, requested) {
    const r=String(reason||'').toLowerCase();
    let d=(requested==null?900:Number(requested)); if(!isFinite(d)||d<0)d=900;
    /* HRA PAY v3.9.5 同款：重要提交幾乎立即開始，普通新增/修改/刪除採 debounce。 */
    if(/^(smart_import|import|telegram|telegram_|telegram-|combined_daily_summary|approval|review|restore|file_change|file-change|file_delete|file-delete)/.test(r)) return Math.min(d,60);
    if(/^(batch_save|batch-save|batch_delete|batch-delete)/.test(r)) return Math.min(d,250);
    return d;
  }

  /* 大量減少雲端資料：手動上傳時跳出確認；自動同步一律不刪、改為保留雲端並合併回手機。 */
  function confirmShrinkFor(runOpt) {
    return function (info) {
      if (runOpt.confirmShrink === true) return true;
      if (runOpt.auto || runOpt.silent || typeof global.confirm !== 'function') return false;
      try { return !!global.confirm(I18.f('gc.shrinkConfirm', { n: info.removed, total: info.total })); } catch (e) { return false; }
    };
  }
  async function runUpload(runOpt) {
    runOpt = runOpt || {};
    if (running) return running;
    busy(true);
    state('busy', () => I18.t('gc.autoSyncing'));
    const startMarker = readPending();
    queued = false;
    running = (async function () {
      try {
        // 其他分頁剛寫入時，先從 IndexedDB 重讀，避免用過期快取上傳（A1）。
        if (STORAGE && STORAGE.refresh) { try { await STORAGE.refresh({ ifStale: true }); } catch (e) {} }
        if (typeof opt.beforeSync === 'function') await opt.beforeSync({direction:'upload',reason:runOpt.reason||''});
        const local = opt.getList ? opt.getList() : [];
        const result = await CLOUD.upload(opt.tool, local, {
          idKey:opt.idKey, tsKey:opt.tsKey, dateField:opt.dateField, photoField:opt.photoField, photoFields:opt.photoFields, keyFn:opt.keyFn,
          extra:opt.extra, toCloud:opt.toCloud, fromCloud:opt.fromCloud, onRemote:opt.onRemote,
          allowDeletes:opt.allowDeletes !== false, confirmShrink:confirmShrinkFor(runOpt), tombstoneDays:opt.tombstoneDays
        });
        const res = result && result.res, uploadedList = result && result.list || local;
        if (res && res.ok === false) throw new Error(res.error || I18.t('gc.upFail'));
        /* 上傳期間使用者可能又新增／修改／刪除。不可用開始時的快照寫回，
           否則第一輪完成會吃掉後來的操作。只把照片 Drive 連結等轉換套回
           未變動列；新變更保留給 queued_change 下一輪。 */
        const latest = opt.getList ? (opt.getList() || []) : uploadedList;
        const keyOf = row => SMART.semanticKey(row, {idKey:opt.idKey,dateField:opt.dateField,tsKey:opt.tsKey,keyFn:opt.keyFn});
        const startMap = new Map((local || []).map(row => [keyOf(row), row]));
        const latestMap = new Map((latest || []).map(row => [keyOf(row), row]));
        const finalMap = new Map(), order = [];
        (uploadedList || []).forEach(function (row) {
          const key = keyOf(row);
          if (startMap.has(key) && !latestMap.has(key)) return; // 同步途中已刪除
          order.push(key); finalMap.set(key, row);
        });
        (latest || []).forEach(function (row) {
          const key = keyOf(row), before = startMap.get(key);
          if (!finalMap.has(key)) { order.push(key); finalMap.set(key, row); return; }
          if (!before || SMART.stable(row) !== SMART.stable(before)) finalMap.set(key, row);
        });
        const seen = new Set();
        const list = order.filter(function (key) { if (seen.has(key)) return false; seen.add(key); return true; }).map(key => finalMap.get(key));
        if (opt.setList) opt.setList(list);
        if (startMarker && startMarker.token) clearPending(startMarker.token);
        retryCount = 0;
        const uploaded = Number(result && result.uploaded) || 0;
        const label = result && result.skipped ? I18.t('gc.cloudCurrent') : I18.t('gc.uploaded') + ' · ' + uploaded + ' ' + I18.t('gc.changedRows');
        const passive=/^(startup|startup_reconcile|pending_resume|reconcile|resume|pageshow|network_restored)$/i.test(String(runOpt.reason||''));
        const at = hhmm();
        const checkedOnly = passive && !startMarker && result && result.skipped && !(local||[]).length;
        const photoFailures = (result && result.photoFailures) || [];
        if (result && result.shrinkBlocked) {
          GC.toast('⚠ ' + I18.f('gc.shrinkKept', { n: result.shrinkBlocked.removed }), 'warning', { persist: true });
        }
        if (photoFailures.length) {
          /* 照片沒上傳成功：記錄與其他照片已上雲，這幾張留在手機，稍後自動重試。 */
          markPending('photo_retry');
          state('local', () => I18.f('gc.photoPending', { n: photoFailures.length }));
          GC.toast('⚠ ' + I18.f('gc.photoPending', { n: photoFailures.length }), 'warning');
          clearTimeout(retryTimer);
          /* 照片重試逐步拉長（1、2、5、10、15 分鐘），避免每分鐘打一次雲端。 */
          photoRetryCount += 1;
          retryTimer = setTimeout(function () { if (hasPending()) runUpload({silent:true,auto:true,reason:'retry'}); }, [60000,120000,300000,600000,900000][Math.min(photoRetryCount - 1, 4)]);
        } else {
          photoRetryCount = 0;
          state('ok', () => (checkedOnly ? I18.t('gc.cloudChecked') : I18.t('gc.cloudSynced')) + (at ? ' ' + at : ''));
        }
        if (!runOpt.silent) GC.toast('☁ ' + label, 'success');
        if (opt.onDone) opt.onDone(list, result);
        return Object.assign({ok:true}, result || {});
      } catch (e) {
        markPending(runOpt.reason || 'retry');
        retryCount += 1;
        const errMsg = String(e && e.message || e || '');
        const msgFn = () => runOpt.auto ? (isOnline()?I18.t('gc.cloudRetry'):I18.t('gc.cloudOffline')) : I18.t('gc.upFail') + ': ' + errMsg;
        state(runOpt.auto ? (isOnline() ? 'local' : 'offline') : 'error', msgFn);
        if (!runOpt.silent) GC.toast('❌ ' + msgFn(), 'error');
        if (runOpt.auto && global.navigator && global.navigator.onLine !== false) {
          clearTimeout(retryTimer);
          retryTimer = setTimeout(function () {
            if (hasPending()) runUpload({silent:true,auto:true,reason:'retry'});
          }, (e && e.timeout) || /busy|鎖|忙/i.test(errMsg)
            ? Math.min(600000, 120000 * Math.pow(2, Math.min(retryCount - 1, 2)))   // 雲端忙／逾時：2、4、8 分鐘
            : Math.min(60000, 5000 * Math.pow(2, Math.min(retryCount - 1, 3))));
        }
        return {ok:false,error:e};
      } finally {
        const rerun = queued;
        busy(false); running = null;
        if (rerun) {
          queued = false;
          clearTimeout(retryTimer);
          retryTimer = setTimeout(function () { runUpload({silent:true,auto:true,reason:'queued_change'}); }, 30);
        }
      }
    })();
    return running;
  }

  async function runDownload(runOpt) {
    runOpt = runOpt || {};
    busy(true);
    state('busy', () => I18.t('gc.sync'));
    try {
      if (STORAGE && STORAGE.refresh) { try { await STORAGE.refresh({ ifStale: true }); } catch (e) {} }
      if (typeof opt.beforeSync === 'function') await opt.beforeSync({direction:'download',reason:runOpt.reason||''});
      const local = opt.getList ? opt.getList() : [];
      const r = await CLOUD.download(opt.tool, local, {
        idKey:opt.idKey, tsKey:opt.tsKey, dateField:opt.dateField, photoField:opt.photoField,
        extra:opt.extra, toCloud:opt.toCloud, fromCloud:opt.fromCloud, onRemote:opt.onRemote, keyFn:opt.keyFn,
        allowDeletes:opt.allowDeletes !== false, tombstoneDays:opt.tombstoneDays
      });
      if (r.empty) {
        if (!runOpt.silent) GC.toast('⚠ ' + I18.t('gc.noCloud'), 'warning');
        state(hasPending() || (local || []).length ? 'local' : 'warning', () => I18.t('gc.noCloud'));
      }
      else {
        if (opt.onRemote) opt.onRemote(r.response || {});
        /* HRA Portal 同款：下載途中若使用者又新增、修改或刪除，不可用下載開始時
           的快照蓋回去。只把「下載期間真的改動」的本機列再合回結果。 */
        const latest = opt.getList ? (opt.getList() || []) : local;
        const keyOpt = {idKey:opt.idKey,dateField:opt.dateField,tsKey:opt.tsKey,keyFn:opt.keyFn};
        const keyOf = row => SMART.semanticKey(row, keyOpt);
        const startMap = new Map((local || []).map(row => [keyOf(row), row]));
        const latestMap = new Map((latest || []).map(row => [keyOf(row), row]));
        const resultMap = new Map(), order = [];
        (r.list || []).forEach(function (row) { const key=keyOf(row); if(!resultMap.has(key))order.push(key); resultMap.set(key,row); });
        startMap.forEach(function (_row, key) { if (!latestMap.has(key)) resultMap.delete(key); });
        latestMap.forEach(function (row, key) {
          const before=startMap.get(key);
          if (before && SMART.stable(row) === SMART.stable(before)) return;
          if (!resultMap.has(key)) order.push(key);
          const cloudRow=resultMap.get(key);
          resultMap.set(key, cloudRow ? SMART.mergeRows([cloudRow],[row],keyOpt)[0] : row);
        });
        const seen=new Set(), safeList=order.filter(function(key){if(seen.has(key)||!resultMap.has(key))return false;seen.add(key);return true;}).map(key=>resultMap.get(key));
        r.list=safeList;
        if (opt.setList) opt.setList(safeList);
        const changed = Number(r.downloaded != null ? r.downloaded : (r.stat && r.stat.added)) || 0;
        if (!runOpt.silent) GC.toast('⬇ ' + I18.t('gc.downloaded') + ' · ' + changed + ' ' + I18.t('gc.changedRows'), 'success');
        const pendingLocal = Number(r.pendingUpload) > 0 || hasPending();
        state(pendingLocal ? 'local' : 'ok', () => I18.t('gc.downloaded') + ' · ' + changed + ' ' + I18.t('gc.changedRows'));
        if (opt.onDone) opt.onDone(r.list, r);
      }
      return Object.assign({ok:true}, r || {});
    } catch (e) {
      const errMsg = String(e && e.message || e || '');
      const msgFn = () => I18.t('gc.downFail') + ': ' + errMsg;
      if (!runOpt.silent) GC.toast('❌ ' + msgFn(), 'error');
      // 背景自動檢查失敗：資料仍安全在手機上 → 顯示「只存手機」，手動操作失敗才顯示紅色。
      state(!isOnline() ? 'offline' : (runOpt.auto ? 'local' : 'error'), msgFn);
      return {ok:false,error:e};
    } finally {
      busy(false);
    }
  }

  function scheduleAuto(reason, delay) {
    reason=reason || 'record_change';
    markPending(reason);
    if (!isOnline()) { state('offline', () => I18.t('gc.cloudOffline')); return null; }
    state('local', () => I18.t('gc.cloudPending'));
    if (running) { queued = true; return running; }
    clearTimeout(retryTimer);
    const wait=reasonDelay(reason,delay);
    retryTimer = setTimeout(function () { runUpload({silent:true,auto:true,reason:reason}); }, wait);
    return null;
  }
  function runReconcile(reason) {
    if (reconcileRunning) return reconcileRunning;
    if (global.navigator && global.navigator.onLine === false) {
      if (hasPending()) state('offline', () => I18.t('gc.cloudOffline'));
      return Promise.resolve({ok:false,offline:true});
    }
    reconcileRunning = (async function () {
      const pulled = await runDownload({silent:true,auto:true,reason:reason || 'reconcile'});
      if (!pulled || pulled.ok === false) return pulled;
      return runUpload({silent:true,auto:true,reason:reason || 'reconcile'});
    })().finally(function () { reconcileRunning = null; });
    return reconcileRunning;
  }
  function scheduleReconcile(reason, delay) {
    clearTimeout(reconcileTimer);
    reconcileTimer=setTimeout(function(){ runReconcile(reason || 'resume'); }, Math.max(0, Number(delay) || 0));
  }
  up.onclick = function () { runUpload({silent:false,auto:false,reason:'manual'}); };
  global.addEventListener('offline', function () { state('offline', () => I18.t(hasPending() ? 'gc.cloudOffline' : 'gc.stOffline')); });
  down.onclick = function () { runDownload({silent:false}); };
  global.addEventListener('online', function () { scheduleReconcile('network_restored', 120); });
  if (global.document && global.document.addEventListener) {
    global.document.addEventListener('visibilitychange', function () {
      if (!global.document.hidden && (!global.navigator || global.navigator.onLine !== false)) scheduleReconcile('resume', 150);
    });
  }
  global.addEventListener('pageshow', function () { scheduleReconcile('pageshow', 150); });
  if (opt.autoReconcile !== false) scheduleReconcile(hasPending() ? 'pending_resume' : 'startup', 450);
  else if (hasPending()) setTimeout(function () { scheduleAuto('resume'); }, 350);
  return { upload:runUpload, download:runDownload, reconcile:runReconcile, scheduleAuto:scheduleAuto, scheduleReconcile:scheduleReconcile, hasPending:hasPending, tool:opt.tool };
};

/* 模組內舊按鈕／儲存流程只排入背景同步，不再各自整包等待上傳。
   共用工具列仍保留可等待結果的手動 upload/download。 */
GC.sync = (() => {
  const controls = new Map();
  return {
    register(tool, control) { if (tool && control) controls.set(String(tool), control); return control; },
    schedule(tool, reason, delay) { const c = controls.get(String(tool || '')); return c ? c.scheduleAuto(reason || 'record_change', delay) : null; },
    upload(tool, opt) { const c = controls.get(String(tool || '')); return c ? c.upload(opt || {}) : Promise.resolve({ok:false,unmounted:true}); },
    download(tool, opt) { const c = controls.get(String(tool || '')); return c ? c.download(opt || {}) : Promise.resolve({ok:false,unmounted:true}); },
    reconcile(tool, reason) { const c=controls.get(String(tool||'')); return c&&c.reconcile ? c.reconcile(reason||'manual_reconcile') : Promise.resolve({ok:false,unmounted:true}); },
    hasPending(tool) { const c = controls.get(String(tool || '')); return !!(c && c.hasPending()); },
    /** 本機資料整包清除後呼叫：清掉該模組的同步基準，下次同步只會從雲端合併回來、不會刪雲端。 */
    resetState(tool) { SMART.clearState(tool ? String(tool) : ''); return true; }
  };
})();

/* ═══════════════════════════════════════════════════════════
   10.5 TELEGRAM — 直接摘要／審查／Approval
   Telegram token 留在 GAS，瀏覽器只呼叫固定 Web App URL。
   ═══════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════
   10b. GC.TG — Telegram 精簡卡片格式（2026-10-03）
   手機一眼看懂：不用空白補齊的表格（Telegram 引用區塊不是等寬字，一定對不齊），
   改成「狀態燈 → 彩色進度條 → 重點數字 → 需要注意的 → 正常只算數量」。
   lang: 'zh' | 'en' | 'km' | 'bi'（bi = 中/英 並列，只合併標籤，數字與名字只出現一次）
   ═══════════════════════════════════════════════════════════ */
GC.TG = (function () {
  const esc = s => U.escapeHtml(String(s == null ? '' : s));
  function lbl(lang, zh, en, km) {
    lang = lang || 'bi';
    if (lang === 'zh') return zh;
    if (lang === 'en') return en;
    if (lang === 'km') return km || en;
    return zh === en ? zh : zh + '/' + en;
  }
  function d(v) { v = String(v || ''); return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(5, 10) : v; }
  function time(v) { const m = String(v == null ? '' : v).match(/(\d{1,2}):(\d{2})/); return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : ''; }
  function mins(v) { const m = String(v == null ? '' : v).match(/(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : null; }
  function dur(n) { n = Math.round(+n || 0); if (n <= 0) return ''; const h = Math.floor(n / 60), m = n % 60; return h ? h + 'h' + (m ? ('0' + m).slice(-2) : '') : m + 'm'; }
  function ranges(dates) {
    const list = Array.from(new Set((dates || []).map(String).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)))).sort(), out = [];
    let i = 0;
    while (i < list.length) {
      let j = i;
      while (j + 1 < list.length && (Date.parse(list[j + 1]) - Date.parse(list[j])) === 86400000) j++;
      out.push(j > i ? d(list[i]) + '~' + (list[i].slice(0, 7) === list[j].slice(0, 7) ? list[j].slice(8) : d(list[j])) : d(list[i]));
      i = j + 1;
    }
    return out.join(', ');
  }
  function head(icon, title, period, sub) { return icon + ' <b>' + title + '</b>' + (period ? '\n📅 ' + esc(period) : '') + (sub ? '\n' + sub : '') + '\n━━━━━━━━━━━━'; }
  function verdict(level, text) { return (level === 'bad' ? '🔴' : level === 'warn' ? '🟠' : '🟢') + ' <b>' + String(text == null ? '' : text) + '</b>'; }
  function bar(value, total, width) {
    width = width || 10; total = Number(total) || 0; value = Number(value) || 0;
    if (total <= 0) return '';
    const r = Math.max(0, Math.min(1, value / total)), n = Math.round(r * width), block = r >= 0.9 ? '🟩' : r >= 0.7 ? '🟨' : '🟥';
    let out = ''; for (let i = 0; i < width; i++) out += i < n ? block : '⬜';
    return out + ' ' + Math.round(r * 100) + '%';
  }
  function kpis(items, n) {
    n = n || 3; const rows = []; let cur = [];
    (items || []).filter(Boolean).forEach(x => { cur.push(x[0] + ' ' + x[1] + ' <b>' + x[2] + '</b>'); if (cur.length >= n) { rows.push(cur.join('  ·  ')); cur = []; } });
    if (cur.length) rows.push(cur.join('  ·  '));
    return rows.join('\n');
  }
  function sec(icon, title) { return '\n\n<b>' + icon + ' ' + title + '</b>'; }
  function fold(lines) { lines = (lines || []).filter(x => x != null && x !== ''); return lines.length ? '\n<blockquote expandable>' + lines.join('\n') + '</blockquote>' : ''; }
  function chunk(title, lines, budget) {
    budget = budget || 3000; const pages = []; let cur = [], size = 0;
    (lines || []).forEach(ln => { const len = String(ln).length + 1; if (cur.length && size + len > budget) { pages.push(title + '\n' + cur.join('\n')); cur = []; size = 0; } cur.push(ln); size += len; });
    if (cur.length) pages.push(title + '\n' + cur.join('\n'));
    return pages;
  }
  /* 多頁：每頁前面加【1/3】，給 GC.telegram.send 的 pages 用 */
  function number(pages) { return pages.length > 1 ? pages.map((p, i) => '【' + (i + 1) + '/' + pages.length + '】\n' + p) : pages; }
  return { lbl, esc, d, time, mins, dur, ranges, head, verdict, bar, kpis, sec, fold, chunk, number };
})();

/* 送出成功動畫（只在網頁上） */
GC.sentFx = function (text) {
  try {
    const fx = document.createElement('div');
    fx.className = 'gc-fx';
    fx.innerHTML = '<div class="gc-fx-card"><div class="gc-fx-plane">✈️</div><div class="gc-fx-check">✓</div><b>' + U.escapeHtml(String(text || '')) + '</b></div>';
    document.body.appendChild(fx);
    setTimeout(() => fx.classList.add('out'), 1500);
    setTimeout(() => { if (fx.parentNode) fx.parentNode.removeChild(fx); }, 2000);
  } catch (e) {}
};

GC.telegram = {
  text(zh, en, km, lang) {
    lang = lang || 'bi';
    if (lang === 'zh') return zh;
    if (lang === 'en') return en;
    if (lang === 'km') return km || en;
    return zh + ' / ' + en;
  },
  /** Telegram 按鈕文字依報表語言：'dashboard' | 'portal'；lang='bi' 時中英並列。 */
  buttonText(kind, lang) {
    const key = kind === 'portal' ? 'gc.mainPortal' : 'gc.openDashboard';
    const icon = kind === 'portal' ? '🏠 ' : '📊 ';
    lang = lang || I18.lang;
    const pick = l => (BASE_DICT[l] && BASE_DICT[l][key]) || BASE_DICT.en[key];
    if (lang === 'bi') return icon + pick('en') + ' / ' + pick('zh');
    return icon + pick(BASE_DICT[lang] ? lang : 'en');
  },
  slotText(item, lang) {
    if (typeof item === 'string') return item;
    return GC.telegram.text(item.zh || item.value, item.en || item.zh || item.value, item.km || item.en || item.zh || item.value, lang || 'bi');
  },
  filter(list, cfg, period, ref, scope, slot) {
    cfg = cfg || {};
    let view = PERIOD.filter(Array.isArray(list) ? list : [], period || 'month', cfg.dateField || 'date', ref).filter(r => r && !r._deleted);
    if (typeof cfg.telegramRecordFilter === 'function') view = view.filter(r => cfg.telegramRecordFilter(r, scope, slot));
    const scopes = (Array.isArray(scope) ? scope : [scope]).map(function (v) { return v == null ? '' : String(v); }).filter(Boolean);
    const slots = (Array.isArray(slot) ? slot : [slot]).map(function (v) { return v == null ? '' : String(v); }).filter(Boolean);
    if (typeof cfg.telegramScopeFilter === 'function') view=view.filter(r=>cfg.telegramScopeFilter(r,scope));
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
      keymovement: ['VRT 鑰匙管理', 'VRT Key Management', 'VRT គ្រប់គ្រងសោ'],
      cleaning: ['VRT 清潔', 'VRT Cleaning', 'VRT អនាម័យ'],
      ehs: ['VRT EHS 回收／廢料', 'VRT EHS Recycle / Waste', 'VRT EHS កែច្នៃ / កាកសំណល់'],
      temperature: ['VRT 溫濕度', 'VRT Temperature & Humidity', 'VRT សីតុណ្ហភាព និងសំណើម'],
      waterdrum: ['VRT 飲用水', 'VRT Drinking Water', 'VRT ទឹកផឹក']
    }[cfg.tool];
    const title = U.escapeHtml(titleMap ? GC.telegram.text(titleMap[0], titleMap[1], titleMap[2], lang || I18.lang) : (cfg.title || cfg.tool || 'AC GASCHECK'));
    const lines = [
      '♻️ <b>' + title + '</b>',
      '📅 ' + U.escapeHtml(periodLabels[period] || period || I18.t('gc.thisMonth')),
      (slot && !(Array.isArray(slot) ? slot.includes('all') : slot === 'all') ? '⏱️ ' + U.escapeHtml(label('gc.slot', '發送時段', 'Send time slot', 'ពេលវេលាផ្ញើ')) + ': ' + U.escapeHtml((Array.isArray(slot) ? slot : [slot]).map(function (value) { const found=slotItems.find(x => (typeof x === 'string' ? x : x.value) === value); return found ? GC.telegram.slotText(found, lang) : value; }).join(', ')) : ''),
      '📊 ' + U.escapeHtml(label('gc.records', '記錄', 'Records', 'កំណត់ត្រា')) + ': <b>' + view.length + '</b> / ' +
        U.escapeHtml(label('gc.total', '總計', 'Total', 'សរុប')) + ': ' + GC.data.live(list).length,
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
  // Each page is independently valid HTML. Never truncate a daily row.
  paginateRows(header, columns, rows, footer, maxRows) {
    header=String(header||'');footer=String(footer||'');maxRows=maxRows||12;
    const render=chunk=>header+'\n<blockquote><b>'+U.escapeHtml(columns)+'</b>\n'+chunk.map(U.escapeHtml).join('\n')+'</blockquote>'+(footer?'\n'+footer:'');
    const chunks=[];let chunk=[];
    (rows||[]).forEach(row=>{
      row=String(row);
      if(chunk.length&&(chunk.length>=maxRows||render(chunk.concat(row)).length>3450)){chunks.push(chunk);chunk=[];}
      if(render([row]).length>3450)throw new Error(I18.t('gc.dayTooLong'));
      chunk.push(row);
    });
    if(chunk.length||!chunks.length)chunks.push(chunk);
    return chunks.map((part,i)=>'['+(i+1)+'/'+chunks.length+']\n'+render(part));
  },
  // Keep all text, Unicode characters, entities and HTML formatting when a
  // legacy builder produces a message longer than Telegram accepts.
  paginateHtml(value, limit) {
    const source = String(value || ''), max = limit || 3500;
    if (source.length <= max) return [source];
    const pages = [], stack = [];
    let page = '', hasText = false;
    const closing = () => stack.slice().reverse().map(t => '</' + t.name + '>').join('');
    const fits = s => page.length + s.length + closing().length <= max;
    function flush() {
      if (!hasText) return;
      pages.push(page + closing());
      page = stack.map(t => t.open).join('');
      hasText = false;
    }
    function appendText(s) {
      if (!fits(s)) flush();
      if (fits(s)) { page += s; hasText = true; return; }
      // Preserve an entity or surrogate pair even when a single line is huge.
      const units = s.match(/&(?:#\d+|#x[\da-f]+|[a-z]+);|[\s\S]/giu) || [];
      units.forEach(unit => {
        if (!fits(unit)) flush();
        if (!fits(unit)) throw new Error('Telegram formatting is too long');
        page += unit; hasText = true;
      });
    }
    const tokens = source.match(/<\/?[a-z][^>]*>|[^<]+|</gi) || [];
    tokens.forEach(token => {
      const tag = token.match(/^<(\/)?([a-z][\w-]*)(?:\s[^>]*)?>$/i);
      if (!tag) {
        (token.match(/[^\n]*\n|[^\n]+$/g) || []).forEach(appendText);
        return;
      }
      const name = tag[2].toLowerCase();
      if (tag[1]) {
        if (!stack.length || stack[stack.length - 1].name !== name) throw new Error('Invalid Telegram report HTML');
        page += token; stack.pop();
      } else {
        const cost = token + '</' + name + '>';
        if (!fits(cost)) flush();
        if (!fits(cost)) throw new Error('Telegram formatting is too long');
        page += token; stack.push({ name, open: token });
      }
    });
    if (stack.length) throw new Error('Invalid Telegram report HTML');
    flush();
    return pages.map((p, i) => '[' + (i + 1) + '/' + pages.length + ']\n' + p);
  },
  async send(text, photos, buttons, chatId, tool, meta) {
    if (!Array.isArray(text) && String(text || '').length > 3900) text = GC.telegram.paginateHtml(text);
    if(Array.isArray(text)){
      if(!text.length||text.some(page=>!String(page).trim()||String(page).length>3900))throw new Error('Invalid Telegram report pages');
      const base=Object.assign({},meta||{}),key=String(base.messageKey||[tool,base.reportPeriod,base.reportRef,base.reportMode,base.reportScope,base.reportSlot,base.reportLanguage].join('|'));
      const receipts=[];
      for(let i=0;i<text.length;i++){
        const pageMeta=Object.assign({},base,{updateExisting:true,messageKey:key+'|page'+(i+1),dedupePhotos:true,photoDedupeKey:key});
        // The last confirmed page alone records report completion and carries photos/actions.
        if(i<text.length-1)Object.keys(pageMeta).filter(k=>/^report/.test(k)).forEach(k=>delete pageMeta[k]);
        try{
          const result=await GC.telegram.send(text[i],i===text.length-1?photos:[],i===text.length-1?buttons:[],chatId,tool,pageMeta);
          receipts.push(result.messageId);
        }catch(err){
          const pageMsg=I18.f('gc.pageFailed',{i:i+1,n:text.length});
          // 中文介面附英文對照（方便回報）；英文／高棉文只顯示單一語言。
          throw new Error(pageMsg+': '+(I18.mono?I18.mono(err.message):err.message));
        }
        if(i<text.length-1)await new Promise(resolve=>setTimeout(resolve,1100));
      }
      return {ok:true,messageId:receipts[receipts.length-1],messageIds:receipts,pagesSent:receipts.length,totalPages:text.length};
    }
    if (!text) throw new Error('No Telegram text');
    const dashboardUrl = DASHBOARD_BASE_URL + (DASHBOARD_PATHS[tool] || 'ac_gascheck_portal_v1.html');
    const portalUrl = DASHBOARD_BASE_URL + 'ac_gascheck_portal_v1.html';
    const finalButtons = Array.isArray(buttons) ? buttons.map(row => {
      if (!Array.isArray(row)) return row;
      return row.map(btn => {
        if (!btn || typeof btn !== 'object') return btn;
        const next = Object.assign({}, btn);
        // Normalize native Telegram callback_data to the GAS bridge's
        // portable `data` field while retaining the native field too.
        if (next.callback_data && !next.data) next.data = next.callback_data;
        if (next.data && !next.callback_data) next.callback_data = next.data;
        return next;
      });
    }).filter(Boolean) : [];
    const buttonLang = (meta && meta.reportLanguage) || I18.lang;
    const hasDashboard = finalButtons.some(row => Array.isArray(row) && row.some(btn => btn && btn.url === dashboardUrl));
    if (!hasDashboard) {
      if (buttonLang === 'bi') finalButtons.push([{ text: '📊 Open Dashboard / 開啟平台', url: dashboardUrl }]);
      else finalButtons.push([{ text: GC.telegram.buttonText('dashboard', buttonLang), url: dashboardUrl }]);
    }
    const hasPortal = finalButtons.some(row => Array.isArray(row) && row.some(btn => btn && btn.url === portalUrl));
    if (!hasPortal) {
      if (buttonLang === 'bi') finalButtons.push([{ text: '🏠 Main Portal / 總平台', url: portalUrl }]);
      else finalButtons.push([{ text: GC.telegram.buttonText('portal', buttonLang), url: portalUrl }]);
    }
    const res = await CLOUD.post(Object.assign({
      action: 'telegram', text: text,
      photos: PHOTO.list(photos).slice(0, 5),
      buttons: finalButtons,
      chatId: chatId || DEFAULT_CHAT_ID,
      tool: tool || ''
    }, meta || {}));
    if (!res || res.ok !== true) throw new Error((res && res.error) || 'Telegram request failed');
    // 只有 Telegram API 回傳 message_id（或確認原訊息未變）才算真正送達。
    // 避免舊後端／中介層只回 ok:true，畫面顯示成功但群組實際沒有訊息。
    const confirmedMessage = res.notModified === true || (res.messageId !== undefined && res.messageId !== null && String(res.messageId) !== '');
    if (!confirmedMessage) throw new Error(I18.t('gc.noDelivery'));
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
    importSchema: null, importParser: null, importAccept: null, cloudKey: null, telegramScopes: null, telegramSlots: null,
    telegramScopeMultiple: false, telegramSlotMultiple: false, telegramScopeLabel: null,
    telegramSlotFilter: null, telegramSlotField: null, telegramGroups: null,
    telegramDefaultLanguage: null, telegramDefaultSlot: 'all', hideLegacyTools: true,
    telegramSender: false, telegramSenderStorageKey: null, telegramRequireSender: false,
    telegramConfirmSender: false, telegramRequireData: false, telegramValidator: null,
    telegramAutoUpload: false, telegramSameDayUpdate: false, telegramPhotoDedupe: false,
    cloudAutoReconcile: true, cloudAllowDeletes: true
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
    '<span class="gc-cloud-state" role="status" aria-live="polite"><i></i><span class="gc-state-short">' + U.escapeHtml(I18.t('gc.stChecking')) + '</span><span class="gc-state-label gc-state-detail"></span></span>',
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
    /* 只隱藏舊連線設定的小區塊；不可因一個 Token 欄位把整張 Settings 卡片藏掉。 */
    const block = el.closest('.tg-config, .gas-config, .cloud-config, .connection-config, .form-group') || el.parentElement;
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
    /* 舊的整批摘要／分析摘要入口與共用 Telegram 視窗功能重複，收起它們。
       Cleaning、Dormitory 等 rec.sendTelegramRecord()/insp.sendTg() 單筆或照片
       發送不在此列，仍保留在業務記錄旁。 */
    document.querySelectorAll('[onclick="sendTG()"], [onclick="sendToTelegram()"], [onclick="sendAnalyticsTelegram()"], [onclick="previewTelegramMessage()"]')
      .forEach(hide);
  }

  let period = 'month';
  let periodAnchor = U.ymd(new Date());
  let periodRef = '';
  let mode = 'summary';
  let scope = C.telegramScopeMultiple ? ['all'] : 'all';
  let slot = C.telegramSlotMultiple ? [C.telegramDefaultSlot || 'all'] : (C.telegramDefaultSlot || 'all');
  /* 摘要語言預設＝介面語言（中文→中文、English→English、ខ្មែរ→ខ្មែរ，單一語言）；
     需要中英雙語可在視窗內選。使用者在視窗內手動改過就不再自動跟隨。 */
  const uiReportLanguage = () => C.telegramDefaultLanguage || I18.lang;
  let lang = uiReportLanguage();
  let langTouched = false;
  /* 沒有真正核可流程的模組不顯示「核可」選項（只有模組明確設定 telegramModes 才顯示）。 */
  const telegramModes = Array.isArray(C.telegramModes) && C.telegramModes.length ? C.telegramModes : ['summary', 'review'];
  const senderStorageKey = C.telegramSenderStorageKey || ('ac_gc_sender_' + String(C.tool || 'tool'));
  let sender = '';
  try { sender = String(localStorage.getItem(senderStorageKey) || '').trim(); } catch (e) {}
  let previewToken = 0;
  let currentPacket = null;

  function reportActivityMeta() {
    const ref = periodRef || U.ymd(new Date());
    const scopeKey = Array.isArray(scope) ? scope.join(',') : scope;
    const meta = {
      reportPeriod: period,
      reportRef: ref,
      reportMonth: String(ref).slice(0, 7),
      reportMode: mode,
      reportScope: scopeKey,
      reportSlot: Array.isArray(slot) ? slot.join(',') : slot,
      reportLanguage: lang,
      reportSender: sender
    };
    /* Temperature / Cleaning 的日報只保留同一天一則 Telegram 主訊息。
       上午先送；下午或同日再次送出時，GAS 會依 messageKey 編輯原訊息。 */
    if (C.telegramSameDayUpdate && period === 'day') {
      meta.updateExisting = true;
      meta.messageKey = String(C.tool || 'module') + '|' + String(ref).slice(0, 10);
      /* 2026-10-06：同一天不同資料範圍（例如 EHS 回收 vs 廢料）各自一則，不互相覆蓋 */
      if (scopeKey && scopeKey !== 'all') meta.messageKey += '|' + scopeKey;
    }
    /* 照片去重由 GAS 保存已送內容指紋；同一報告範圍再次發送時只傳新照片。 */
    if (C.telegramPhotoDedupe) {
      meta.dedupePhotos = true;
      meta.photoDedupeKey = meta.messageKey || [String(C.tool || 'module'), period, ref, scopeKey || 'all'].join('|');
    }
    return meta;
  }

  /* 雲端同步 meta 只放業務設定；報表期間／發送選項不進同步（A17）。 */
  function cloudExtra() {
    const base = typeof C.extra === 'function' ? (C.extra() || {}) : (C.extra || {});
    return Object.assign({}, base);
  }

  /* 雲端狀態：文字＋顏色（📱 只存手機／☁ 已上雲／⚠ 離線…），不再只有一個小圓點。 */
  let cloudStateKind = '', cloudStateRender = null, cloudStateText = '';
  function shortCloudLabel(kind) {
    const online = !(global.navigator && global.navigator.onLine === false);
    if (kind === 'ok') return I18.t('gc.stCloud');
    if (kind === 'busy') return I18.t('gc.stSyncing');
    if (kind === 'offline' || !online) return I18.t('gc.stOffline');
    if (kind === 'error') return I18.t('gc.stError');
    if (kind === 'local' || kind === 'warning') return I18.t('gc.stLocal');
    return I18.t('gc.stChecking');
  }
  function setCloudState(kind, message, render) {
    const state = tools.querySelector('.gc-cloud-state');
    const label = state && state.querySelector('.gc-state-label');
    const short = state && state.querySelector('.gc-state-short');
    if (!state || !label) return;
    cloudStateKind = kind || ''; cloudStateRender = typeof render === 'function' ? render : null; cloudStateText = message || '';
    state.classList.remove('ok', 'busy', 'warning', 'error', 'local', 'offline');
    if (kind) state.classList.add(kind);
    const shortText = shortCloudLabel(kind);
    if (short) short.textContent = shortText;
    label.removeAttribute('data-i');
    const detail = kind === 'busy' ? '' : String(message || '');
    // 詳細說明與短標籤相同時不重複顯示
    label.textContent = detail && detail.replace(/^[^\w\u0080-\uffff]+/, '') !== shortText.replace(/^[^\w\u0080-\uffff]+/, '') ? detail : '';
    state.title = [shortText, detail].filter(Boolean).join(' · ');
    state.dataset.state = kind || '';
  }
  function rerenderCloudState() {
    if (!cloudStateKind) { const short = tools.querySelector('.gc-state-short'); if (short) short.textContent = shortCloudLabel(''); return; }
    setCloudState(cloudStateKind, cloudStateRender ? cloudStateRender() : cloudStateText, cloudStateRender);
  }

  const cloudOpt = {
    tool: C.tool, idKey: C.idField, tsKey: 'updatedAt', dateField:C.dateField, photoField:C.photoField, photoFields:C.photoFields, keyFn:C.cloudKey, extra: cloudExtra,
    autoReconcile:C.cloudAutoReconcile !== false, allowDeletes:C.cloudAllowDeletes !== false, tombstoneDays:C.tombstoneDays,
    toCloud: C.toCloud, fromCloud: C.fromCloud,
    beforeSync:C.beforeCloudSync,
    getList: function () { return (C.cloudRead || C.read)() || []; },
    setList: function (list) { (C.cloudWrite || C.write)(list); },
    onState: setCloudState,
    onRemote: function (d) { if (C.onRemote) C.onRemote(d || {}); },
    onDone: function (list, result) {
      refreshPeriodOptions();
      if (C.onSync) C.onSync(list, result);
    }
  };
  const cloudControl = GC.sync.register(C.tool, GC.mountCloudButtons(tools.querySelector('.gc-head-cloud'), cloudOpt));
  if (!cloudStateKind && cloudControl) {
    if (global.navigator && global.navigator.onLine === false) setCloudState('offline', I18.t(cloudControl.hasPending() ? 'gc.cloudOffline' : 'gc.stOffline'), () => I18.t(cloudControl.hasPending() ? 'gc.cloudOffline' : 'gc.stOffline'));
    else if (cloudControl.hasPending()) setCloudState('local', I18.t('gc.cloudPending'), () => I18.t('gc.cloudPending'));
  }

  /* 匯出：不含已刪除記錄（C12）；欄位可由模組指定 exportColumns（A16）：
       [{key, label:{zh,en,km} 或 zh/en/km, value(row, lang)}]，標題與內容依目前語言。
       未指定時列出所有非內部欄位；照片輸出連結（base64 不輸出），陣列以逗號分隔。 */
  function exportColumnList(rows) {
    const cols = typeof C.exportColumns === 'function' ? C.exportColumns(I18.lang) : C.exportColumns;
    if (Array.isArray(cols) && cols.length) return cols.map(c => typeof c === 'string' ? { key: c } : c).filter(c => c && (c.key || typeof c.value === 'function'));
    const seen = [], skip = /^(_|\$)|^(synced|approvalToken|approvalMessageId|chatId|token|photoKey|photoDedupeKey|messageKey)$/i;
    rows.forEach(r => Object.keys(r || {}).forEach(k => { if (!skip.test(k) && seen.indexOf(k) < 0) seen.push(k); }));
    return seen.map(k => ({ key: k }));
  }
  function exportHeader(col) {
    const lbl = col.label != null ? col.label : ((col.zh || col.en || col.km) ? { zh: col.zh, en: col.en, km: col.km } : (C.fieldLabels && C.fieldLabels[col.key]));
    if (lbl && typeof lbl === 'object') return GC.L(lbl);
    if (lbl != null && lbl !== '') return String(lbl);
    return String(col.key || '');
  }
  function exportCell(v, key, row) {
    if (typeof C.exportValue === 'function') {
      const custom = C.exportValue(key, v, row, I18.lang);
      if (custom !== undefined) v = custom;
    }
    const photoWord = I18.t('gc.photo');
    const one = x => {
      if (x == null) return '';
      if (typeof x === 'string') return x.indexOf('data:') === 0 ? '[' + photoWord + ']' : x;
      if (typeof x === 'number' || typeof x === 'boolean') return String(x);
      if (typeof x === 'object') {
        const u = PHOTO.value(x);
        if (u) return u.indexOf('data:') === 0 ? '[' + photoWord + ']' : u;
        if (x.name || x.label || x.value) return String(x.name || x.label || x.value);
        try { return JSON.stringify(x); } catch (e) { return ''; }
      }
      return String(x);
    };
    let out;
    if (v == null) out = '';
    else if (Array.isArray(v)) out = v.map(one).filter(x => x !== '').join(/photo/i.test(String(key || '')) ? '\n' : ', ');
    else if (typeof v === 'object') out = one(v);
    else if (typeof v === 'string') out = one(v);
    else return v;
    return out.length > 32000 ? out.slice(0, 32000) + '…' : out;
  }
  function exportLocalData() {
    const list = GC.data.live(C.read() || []);
    if (!list.length) {
      GC.toast('⚠ ' + I18.t('gc.noData'), 'warning');
      return;
    }
    const cols = exportColumnList(list);
    const headers = cols.map(exportHeader);
    const safeRows = list.map(function (row) {
      return cols.map(function (col) {
        const raw = typeof col.value === 'function' ? col.value(row, I18.lang) : (row || {})[col.key];
        return exportCell(raw, col.key, row);
      });
    });
    const base = 'AC_GASCHECK_' + String(C.tool || 'data') + '_' + U.ymd(new Date());
    try {
      if (global.XLSX && global.XLSX.utils && global.XLSX.writeFile) {
        const wb = global.XLSX.utils.book_new();
        const ws = global.XLSX.utils.aoa_to_sheet([headers].concat(safeRows));
        global.XLSX.utils.book_append_sheet(wb, ws, String(C.exportSheetName || C.tool || 'Data').slice(0, 31));
        global.XLSX.writeFile(wb, base + '.xlsx');
      } else {
        const blob = new Blob([JSON.stringify({tool:C.tool, exportedAt:U.ymdhms(), columns:headers, records:list}, null, 2)], {type:'application/json'});
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
  /* 模組有自己的在地化匯出（欄位標題／狀態值依語言、不含已刪除）→ 💾 直接用它；
     否則用通用匯出（exportColumns 或非內部欄位）。 */
  if (exportButton) exportButton.onclick = function () {
    if (typeof C.exportHandler === 'function') {
      try { return C.exportHandler(); }
      catch (e) { GC.toast('❌ ' + I18.t('gc.export') + ': ' + (e && e.message || e), 'error'); return; }
    }
    return exportLocalData();
  };

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
        C.telegramSender ? '<label class="gc-field"><span data-i="gc.sender">' + U.escapeHtml(I18.t('gc.sender')) + '</span><input type="text" data-gc-sender autocomplete="name" placeholder="' + U.escapeHtml(I18.t('gc.senderPlaceholder')) + '"></label>' : '',
        '<label class="gc-field"><span data-i="gc.targetGroup">' + U.escapeHtml(I18.t('gc.targetGroup')) + '</span><select data-gc-group></select></label>',
        '<div class="gc-field gc-field-wide"><span data-i="gc.preview">' + U.escapeHtml(I18.t('gc.preview')) + '</span><div class="gc-preview" data-gc-preview></div></div>',
      '</div>',
      '<div class="gc-modal-foot"><span data-gc-send-state></span><button type="button" class="gc-cancel" data-gc-close data-i="gc.cancel">' + U.escapeHtml(I18.t('gc.cancel')) + '</button><button type="button" class="gc-primary" data-gc-send>✈️ <span data-i="gc.send">' + U.escapeHtml(I18.t('gc.send')) + '</span></button></div>',
    '</div>'
  ].join('');
  document.body.appendChild(tgModal);
  tgModal.querySelectorAll('[data-gc-mode]').forEach(function (b) { const off = !telegramModes.includes(b.dataset.gcMode); b.hidden = off; b.style.display = off ? 'none' : ''; });

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
    /* 沒有自訂 mergeImport 的模組：重複匯入同一檔案不會重複新增（A8）。
       有 importKey（或 keymovement 預設 key_no+日期+時間）→ 相同鍵更新原記錄；
       否則所有欄位完全相同才視為重複並略過。 */
    const defaultImportKey = C.tool === 'keymovement' ? ['key_no', C.dateField || 'issue_date', 'issue_time'] : null;
    function importIdentity(r, keyed) {
      const key = C.importKey || defaultImportKey;
      if (keyed && typeof key === 'function') return String(key(r) || '');
      const fields = keyed && Array.isArray(key) ? key : Object.keys(C.importSchema || {});
      return fields.map(f => String(r && r[f] != null ? r[f] : '').trim().toLowerCase()).join('|');
    }
    function mergeImportDefault(cur, rows) {
      const keyed = !!(C.importKey || defaultImportKey);
      const out = cur.slice(), index = new Map();
      out.forEach((r, i) => { if (r && !r._deleted) { const id = importIdentity(r, keyed); if (id.replace(/\|/g, '')) index.set(id, i); } });
      let added = 0, updated = 0, skipped = 0;
      rows.forEach(r => {
        const id = importIdentity(r, keyed);
        if (!id.replace(/\|/g, '') || !index.has(id)) { out.push(r); if (id.replace(/\|/g, '')) index.set(id, out.length - 1); added++; return; }
        const i = index.get(id), old = out[i];
        const next = Object.assign({}, old);
        let changed = false;
        Object.keys(C.importSchema || {}).forEach(f => {
          if (r[f] != null && r[f] !== '' && String(r[f]) !== String(old[f] == null ? '' : old[f])) { next[f] = r[f]; changed = true; }
        });
        if (keyed && changed) { next.updatedAt = r.updatedAt || U.now(); out[i] = next; updated++; }
        else skipped++;
      });
      return { list: out, added, updated, skipped };
    }
    GC.import.mount(importModal.querySelector('.gc-import-mount'), {
      schema: C.importSchema,
      parse: C.importParser,
      dateFields: C.importDateFields, timeFields: C.importTimeFields,
      accept: C.importAccept || '.xlsx,.xls,.xlsb,.csv',
      onData: function (rows, meta) {
        const cur = C.read() || [];
        rows.forEach(function (r) {
          r[C.idField] = r[C.idField] || U.uid('imp');
          r.updatedAt = U.now();
          delete r._raw;
        });
        let merged, stats = null;
        if (typeof C.mergeImport === 'function') merged = C.mergeImport(cur, rows);
        else { stats = mergeImportDefault(cur, rows); merged = stats.list; }
        C.write(merged);
        refreshPeriodOptions();
        const count = stats ? stats.added + stats.updated : rows.length;
        GC.toast('✅ ' + count + ' ' + I18.t('gc.imported') + (stats && stats.skipped ? ' · ' + stats.skipped + ' ' + I18.t('gc.dupSkipped') : '') + ' — ' + (meta.fileName || ''), stats && stats.skipped ? 'warning' : 'success');
        if (C.onImport) C.onImport(rows);
        if (cloudControl && !C.onImport) cloudControl.scheduleAuto('smart_import');
        return stats ? { skipped: stats.skipped, updated: stats.updated, added: stats.added } : null;
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
  const senderInput = tgModal.querySelector('[data-gc-sender]');
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
    const allowed = C.telegramPeriodsByMode && C.telegramPeriodsByMode[mode] || ['day', 'week', 'month', 'year', 'all'];
    if (!allowed.includes(period)) { period = allowed[0]; periodRef = ''; }
    periodSelect.innerHTML = allowed
      .map(function (x) { return option(x, I18.t(keys[x])); }).join('');
    periodSelect.value = period;
  }
  function renderSlots() {
    const dynamicSlots = typeof C.telegramSlots === 'function' ? C.telegramSlots({period, mode}) : C.telegramSlots;
    const available = Array.isArray(dynamicSlots) && dynamicSlots.length
      ? dynamicSlots
      : [{ value: 'all', zh: '全部時段', en: 'All slots', km: 'គ្រប់ពេល' }];
    const allowed = C.telegramSlotsByPeriod && C.telegramSlotsByPeriod[period];
    const items = allowed ? available.filter(x => allowed.includes(itemValue(x))) : available;
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
  function refreshPeriodOptions(choose) {
    const refs = new Set();
    GC.telegram.filter(C.read() || [], C, 'all', null, scope, slot).forEach(function (r) {
      const d = dateFromRecord(r && r[C.dateField]);
      if (d) refs.add(periodReference(d, period));
    });
    const anchor = periodReference(dateFromRecord(periodAnchor) || new Date(), period);
    if (!periodRef || choose === true) {
      // Changing Month to Week keeps the real reference day, not the latest
      // pre-created calendar row. Never automatically choose a future period.
      const past = Array.from(refs).sort().reverse().find(x => x <= anchor);
      periodRef = refs.has(anchor) ? anchor : (past || anchor);
    }
    // Explicit selections stay stable during sync or scope/slot changes.
    // Empty selections remain visible with a validation message.
    refs.add(periodRef);
    if (period === 'all') { refs.clear(); refs.add(periodRef); }
    const values = Array.from(refs).sort().reverse();
    refSelect.innerHTML = values.map(function (x) { return option(x, refLabel(x, period)); }).join('');
    refSelect.value = periodRef;
    refSelect.disabled = telegramSending || period === 'all';
  }
  function telegramSelectionContext() {
    return {
      records: GC.telegram.filter(C.read() || [], C, period, periodRef, scope, slot),
      period:period, mode:mode, ref:periodRef, scope:scope, slot:slot,
      lang:lang, sender:sender, cfg:C
    };
  }
  function telegramValidationError() {
    const ctx = telegramSelectionContext();
    if (C.telegramRequireData && !ctx.records.length) return I18.t('gc.noPeriodData');
    if (C.telegramRequireSender && !String(sender || '').trim()) return I18.t('gc.senderRequired');
    if (typeof C.telegramValidator === 'function') {
      const result = C.telegramValidator(ctx);
      if (typeof result === 'string') return result;
      if (result === false) return I18.t('gc.noPeriodData');
      if (result && result.ok === false) return result.message || result.error || I18.t('gc.noPeriodData');
    }
    return '';
  }
  function collectPhotos() {
    const list = GC.telegram.filter(C.read() || [], C, period, periodRef, scope, slot);
    const out = [];
    list.forEach(function (r) {
      PHOTO.list(r && r[C.photoField]).forEach(function (p) {
        if (/^(data:image\/|https?:\/\/)/i.test(p) && !out.includes(p) && out.length < 5) out.push(p);
      });
    });
    return out;
  }
  async function buildPacket() {
    const custom = typeof C.telegramBuilder === 'function'
      ? await C.telegramBuilder({ period: period, mode: mode, ref: periodRef, scope: scope, slot: slot, lang: lang, sender:sender, cfg: C })
      : null;
    const built = custom == null ? GC.telegram.buildText(C, period, mode, periodRef, scope, slot, lang) : custom;
    const packet = typeof built === 'string' ? { text: built } : (built || {});
    /* 建構器明確回傳 photos:[]（例如全部打勾）就不附照片；沒指定才用預設收集 */
    if (!Array.isArray(packet.photos)) packet.photos = collectPhotos();
    const dashUrl = C.dashboardUrl || DASHBOARD_BASE_URL + (DASHBOARD_PATHS[C.tool] || 'ac_gascheck_portal_v1.html');
    if (!packet.buttons) packet.buttons = [[{ text: GC.telegram.buttonText('dashboard', lang), url: dashUrl }]];
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
      const validationError = telegramValidationError();
      if(packet.notice)preview.insertAdjacentHTML('afterbegin','<div class="gc-preview-photo">⚠ '+U.escapeHtml(packet.notice)+'</div>');
      sendButton.disabled = telegramSending || !!validationError;
      sendState.textContent = validationError ? '⚠ ' + validationError : '';
    } catch (e) {
      if (token === previewToken) {
        currentPacket = null;
        preview.textContent = '❌ ' + e.message;
        sendButton.disabled = true;
        sendState.textContent = '✕ ' + e.message;
      }
    }
    if (token === previewToken) preview.classList.remove('busy');
  }
  function refreshModal() {
    if (telegramSending) return;
    if (!langTouched) lang = uiReportLanguage();
    if (!telegramModes.includes(mode)) mode = telegramModes[0] || 'summary';
    tgModal.querySelectorAll('[data-gc-mode]').forEach(b=>{b.hidden=!telegramModes.includes(b.dataset.gcMode);b.style.display=b.hidden?'none':'';b.classList.toggle('on',b.dataset.gcMode===mode);});
    const seg = tgModal.querySelector('.gc-seg');
    if (seg) seg.style.gridTemplateColumns = 'repeat(' + Math.max(1, telegramModes.length) + ',1fr)';
    renderScope();
    renderPeriods();
    renderSlots();
    renderLanguages();
    renderGroups();
    refreshPeriodOptions();
    if (senderInput) {
      try { sender = String(localStorage.getItem(senderStorageKey) || sender || '').trim(); } catch (e) {}
      senderInput.value = sender;
      senderInput.placeholder = I18.t('gc.senderPlaceholder');
    }
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
    if (telegramSending) { setModalOpen(tgModal, true); return; }
    refreshModal();
    sendState.textContent = '';
    setModalOpen(tgModal, true);
  }
  let telegramSending=false;
  async function sendCurrentTelegram() {
    if(telegramSending)return;
    const validationError = telegramValidationError();
    if (validationError) {
      sendState.textContent = '⚠ ' + validationError;
      GC.toast('⚠ ' + validationError, 'warning');
      if (C.telegramRequireSender && !sender && senderInput) senderInput.focus();
      return;
    }
    if (C.telegramConfirmSender) {
      const question = I18.t('gc.confirmSender').replace('{name}', sender);
      if (!global.confirm(question)) return;
    }
    telegramSending=true;
    const lockedControls=Array.from(tgModal.querySelectorAll('input,select,button')).filter(el=>!el.hasAttribute('data-gc-close')).map(el=>({el,disabled:el.disabled}));lockedControls.forEach(x=>x.el.disabled=true);
    sendButton.disabled = true;
    sendState.textContent = '☁ ' + I18.t('gc.upload') + '…';
    try {
      /* 需要即時保存的模組先等雲端確認，再送 Telegram。群組只要看得到
         訊息，Dashboard／History 就已能從雲端下載到同一批資料。 */
      if (cloudControl && C.telegramAutoUpload) {
        const uploaded = await cloudControl.upload({silent:true,auto:false,reason:'telegram_preflight'});
        if (!uploaded || uploaded.ok === false) {
          const why = (uploaded && uploaded.error && (uploaded.error.message || String(uploaded.error))) || I18.t('gc.upFail');
          // 中文介面保留英文對照（方便回報問題）；英文／高棉文介面只顯示單一語言。
          const head = I18.lang === 'zh' ? I18.t('gc.uploadBeforeSendFail') + ' / ' + BASE_DICT.en['gc.uploadBeforeSendFail'] : I18.t('gc.uploadBeforeSendFail');
          throw new Error(head + ': ' + why);
        }
        /* 記錄已上雲但有照片仍留在手機：不送出缺照片的報告，保留重試（A5）。 */
        const pendingPhotos = (uploaded.photoFailures || []).length;
        if (pendingPhotos) {
          const headP = I18.lang === 'zh' ? I18.t('gc.uploadBeforeSendFail') + ' / ' + BASE_DICT.en['gc.uploadBeforeSendFail'] : I18.t('gc.uploadBeforeSendFail');
          throw new Error(headP + ': ' + I18.f('gc.photoPending', { n: pendingPhotos }));
        }
      }
      const afterUploadError = telegramValidationError();
      if (afterUploadError) throw new Error(afterUploadError);
      const packet = await buildPacket();
      sendState.textContent = I18.t('gc.sendingTelegram');
      await GC.telegram.send(
        packet.pages || packet.text, packet.photos, packet.buttons,
        groupSelect.value || DEFAULT_CHAT_ID, C.tool, reportActivityMeta()
      );
      /* 先記錄實際發送人／審查／核可狀態，再排入自動上傳；否則雲端可能
         只收到 Telegram 發送前的舊資料。 */
      if (typeof C.onTelegramSent === 'function') {
        await C.onTelegramSent({ period:period, mode:mode, ref:periodRef, scope:scope, slot:slot, lang:lang, sender:sender, packet:packet, cfg:C });
      }
      if (C.telegramSender && sender) {
        try { localStorage.setItem(senderStorageKey, sender); } catch (e) {}
      }
      sendState.textContent = '✓ ' + I18.t('gc.sentTelegram');
      GC.toast('✈️ ' + I18.t('gc.sentTelegram'), 'success');
      GC.sentFx(I18.t('gc.sentTelegram'));
      if (cloudControl && (C.telegramAutoUpload || mode === 'summary' || mode === 'review' || mode === 'approval')) cloudControl.scheduleAuto('telegram_' + mode);
      setTimeout(function () { setModalOpen(tgModal, false); }, 450);
    } catch (e) {
      sendState.textContent = '✕ ' + I18.mono(e.message);
      GC.toast('❌ ' + e.message, 'error');
    }
    telegramSending=false;lockedControls.forEach(x=>x.el.disabled=x.disabled);sendButton.disabled = !!telegramValidationError();
  }

  tgModal.querySelectorAll('[data-gc-close]').forEach(function (b) { b.onclick = function () { setModalOpen(tgModal, false); }; });
  tgModal.addEventListener('click', function (e) { if (e.target === tgModal) setModalOpen(tgModal, false); });
  tgModal.querySelectorAll('[data-gc-mode]').forEach(function (b) {
    b.onclick = function () {
      mode = b.dataset.gcMode || 'summary';
      tgModal.querySelectorAll('[data-gc-mode]').forEach(function (x) { x.classList.toggle('on', x === b); });
      renderPeriods(); renderSlots(); refreshPeriodOptions();
      updatePreview();
    };
  });
  scopeSelect.onchange = function () { scope = scopeSelect.value || 'all'; refreshPeriodOptions(); updatePreview(); };
  scopePicks.onclick = function (e) {
    const b = e.target.closest('button[data-value]');
    if (!b) return;
    scope = toggleSelection(scope, b.dataset.value);
    renderScope(); refreshPeriodOptions(); updatePreview();
  };
  periodSelect.onchange = function () { period = periodSelect.value || 'month'; renderSlots(); refreshPeriodOptions(true); updatePreview(); };
  refSelect.onchange = function () { periodRef = refSelect.value || U.ymd(new Date()); periodAnchor = periodRef; updatePreview(); };
  slotSelect.onchange = function () { slot = slotSelect.value || 'all'; refreshPeriodOptions(); updatePreview(); };
  slotPicks.onclick = function (e) {
    const b = e.target.closest('button[data-value]');
    if (!b) return;
    slot = toggleSelection(slot, b.dataset.value);
    renderSlots(); refreshPeriodOptions(); updatePreview();
  };
  langSelect.onchange = function () { lang = langSelect.value || uiReportLanguage(); langTouched = true; renderScope(); renderSlots(); updatePreview(); };
  if (senderInput) senderInput.oninput = function () { sender = senderInput.value.trim(); updatePreview(); };
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
    rerenderCloudState();
    if (!langTouched) lang = uiReportLanguage();
    if (tgModal.classList.contains('open')) refreshModal();
    if (importModal && importModal.classList.contains('open')) I18.apply(importModal);
  });
  /* 其他分頁改了本機資料：更新期間選單，並通知模組重新載入（C.onStorageChange）。 */
  window.addEventListener('gc:storagechange', function (e) {
    try {
      refreshPeriodOptions();
      if (typeof C.onStorageChange === 'function') C.onStorageChange(e && e.detail || {});
    } catch (err) { console.warn('[AC GASCHECK] storage change:', err); }
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
    telegramScopes: null, scopeField: null, telegramSlots: null, telegramSlotFilter: null, telegramLanguage: false, telegramDefaultLanguage: null, telegramDefaultSlot: 'all', periodRef: false,
    weatherField: 'weather',   // 各模組欄位名可能不同（如 temperature 用 'wx'）
    photoField:   'photos',
    cloudAutoReconcile:true, cloudAllowDeletes:true
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
        ${Array.isArray(C.telegramModes) && C.telegramModes.includes('approval') ? `<button type="button" class="gc-mode-btn" data-gc-mode="approval">✅ <span data-i="gc.approval">${U.escapeHtml(I18.t('gc.approval'))}</span></button>` : ''}
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
  let lang = C.telegramDefaultLanguage || I18.lang;
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
  if (langSelect) { langSelect.onchange = () => { lang = langSelect.value || I18.lang; renderSlot(); refresh(); }; }
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
    tool: C.tool, idKey: C.idField, tsKey: 'updatedAt', dateField:C.dateField, photoField:C.photoField, photoFields:C.photoFields, extra:C.extra, keyFn:C.cloudKey,
    autoReconcile:C.cloudAutoReconcile !== false, allowDeletes:C.cloudAllowDeletes !== false,
    toCloud: C.toCloud,
    fromCloud: C.fromCloud,
    beforeSync:C.beforeCloudSync,
    getList: () => C.read() || [],
    setList: list => C.write(list),
    onRemote: d => { if (C.onRemote) C.onRemote(d || {}); },
    onDone: () => { refresh(); if (C.onSync) C.onSync(); }
  };
  // 雲端按鈕固定放在頁面頂部快捷列，避免跑到頁面底部或被浮動圖示遮住。
  const cloudControl = GC.sync.register(C.tool, GC.mountCloudButtons('#gcTopCloud', cloudOpt));

  const sendTelegram = bar.querySelector('[data-gc-send]');
  const telegramState = bar.querySelector('#gcTelegramState');
  async function sendCurrentTelegram() {
    if (sendTelegram) sendTelegram.disabled = true;
    if (telegramState) telegramState.textContent = I18.t('gc.sync');
    try {
      const customText = typeof C.telegramBuilder === 'function'
        ? await C.telegramBuilder({ period, mode, ref: periodRef, scope, slot, lang, cfg: C })
        : null;
      /* 2026-10-03：這條快捷路徑也要先上雲再發群組（與視窗送出同一規則） */
      if (cloudControl && C.telegramAutoUpload) {
        const uploaded = await cloudControl.upload({silent:true,auto:false,reason:'telegram_preflight'});
        if (!uploaded || uploaded.ok === false) throw new Error(I18.t('gc.uploadBeforeSendFail') + ': ' + ((uploaded && uploaded.error && (uploaded.error.message || String(uploaded.error))) || I18.t('gc.upFail')));
        if ((uploaded.photoFailures || []).length) throw new Error(I18.t('gc.uploadBeforeSendFail') + ': ' + I18.f('gc.photoPending', { n: uploaded.photoFailures.length }));
      }
      const built = customText == null ? GC.telegram.buildText(C, period, mode, periodRef, scope, slot, lang) : customText;
      const packet = typeof built === 'string' ? { text: built, photos: [] } : (built || { text: '', photos: [] });
      const dashUrl = C.dashboardUrl || DASHBOARD_BASE_URL + (DASHBOARD_PATHS[C.tool] || 'ac_gascheck_portal_v1.html');
      const buttons = packet.buttons || [[{text:GC.telegram.buttonText('dashboard', lang),url:dashUrl}]];
      await GC.telegram.send(packet.pages || packet.text, packet.photos, buttons, null, C.tool, {reportPeriod:period,reportRef:periodRef||U.ymd(new Date()),reportMode:mode,reportScope:scope,reportSlot:slot,reportLanguage:lang});
      if (typeof C.onTelegramSent === 'function') {
        await C.onTelegramSent({ period, mode, ref:periodRef, scope, slot, lang, packet });
      }
      if (telegramState) telegramState.textContent = '✓ ' + I18.t('gc.sentTelegram');
      GC.toast('✈️ ' + I18.t('gc.sentTelegram'), 'success');
      GC.sentFx(I18.t('gc.sentTelegram'));
      if (cloudControl && (mode === 'summary' || mode === 'review' || mode === 'approval')) cloudControl.scheduleAuto('telegram_' + mode);
    } catch (e) {
      if (telegramState) telegramState.textContent = '✕ ' + e.message;
      GC.toast('❌ ' + e.message, 'error');
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
    const all  = GC.data.live(C.read() || []);
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
.gc-cloud-state{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 12px;border:1px solid #C9D6E4;border-radius:22px;color:#4D6078;background:#fff;font:700 12px/1.1 inherit;white-space:nowrap}
.gc-cloud-state i{display:none}
.gc-state-short{font-weight:800}
.gc-state-detail{font-weight:600;opacity:.85;max-width:260px;overflow:hidden;text-overflow:ellipsis}
.gc-state-detail:empty{display:none}
.gc-cloud-state.ok{background:#E8F7EE;border-color:#9BD9B3;color:#146C3A}
.gc-cloud-state.busy{background:#EAF2FF;border-color:#A9C4F0;color:#1F4E9A}
.gc-cloud-state.busy .gc-state-short{animation:gcPulse 1.2s ease-in-out infinite}
.gc-cloud-state.local,.gc-cloud-state.warning{background:#FFF6E0;border-color:#EBC77A;color:#7A4E00}
.gc-cloud-state.offline{background:#F1F3F6;border-color:#B8C2CF;color:#46505E}
.gc-cloud-state.error{background:#FDECEC;border-color:#EFA3A3;color:#A31D1D}
@keyframes gcPulse{50%{opacity:.45}}
.gc-head-tools .gc-cloud-btns{gap:5px}
.gc-head-tools .gc-cloud-btn,.gc-head-btn{height:44px;min-width:44px;padding:0 11px;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid #B9D9EA;border-radius:9px;background:#EDF8FC;color:#126B91;font:800 12px/1 inherit;cursor:pointer;white-space:nowrap;box-shadow:none;transition:.16s}
.gc-head-tools .gc-cloud-btn:hover{background:#DDF2FA;border-color:#65B5D6}
.gc-head-btn:hover{transform:translateY(-1px);filter:brightness(.98)}
.gc-btn-ico{font-size:15px;line-height:1}.gc-btn-label{white-space:nowrap}
.gc-head-import{background:#FFF8E8;border-color:#EBCB83;color:#865C08}
.gc-head-tg{background:#EEF3FF;border-color:#B8C8F0;color:#3156A5}
.gc-head-export{background:#F7F8FA;border-color:#D5DCE5;color:#48586C}
.gc-head-langs{min-height:44px;display:inline-flex;align-items:stretch;border:1px solid #CBD5E1;border-radius:8px;overflow:hidden;background:#fff}
.gc-head-langs{margin-left:auto;flex:0 0 auto}
.gc-head-langs button{min-width:44px;min-height:44px;padding:0 8px;border:0;border-right:1px solid #CBD5E1;background:#fff;color:#334155;font:700 12px/1 inherit;cursor:pointer}
.gc-head-langs button:last-child{border-right:0}
.gc-head-langs button.on{background:#17B981;color:#fff}
.gc-modal-open{overflow:hidden!important}
.gc-common-modal{display:none;position:fixed;inset:0;z-index:2147483000;padding:22px;background:rgba(8,18,35,.62);backdrop-filter:blur(3px);align-items:center;justify-content:center;font-family:inherit;color:#1E2A3B}
.gc-common-modal.open{display:flex}
.gc-modal-card{width:min(760px,96vw);max-height:92vh;display:flex;flex-direction:column;background:#fff;border:1px solid #D8E0EB;border-radius:20px;box-shadow:0 28px 80px rgba(3,14,31,.34);overflow:hidden;animation:gcModalIn .16s ease-out}
@keyframes gcModalIn{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}
.gc-modal-head{display:flex;align-items:center;gap:10px;padding:17px 22px;border-bottom:1px solid #E6EAF0}
.gc-modal-head strong{flex:1;font-size:17px;color:#172238}
.gc-modal-head button{width:44px;height:44px;border:0;border-radius:9px;background:transparent;color:#718096;font-size:27px;line-height:1;cursor:pointer}
.gc-modal-head button:hover{background:#F1F5F9;color:#1E293B}
.gc-modal-body{display:grid;grid-template-columns:1fr 1fr;gap:14px 16px;padding:20px 22px;overflow:auto}
.gc-field{display:flex;flex-direction:column;gap:7px;min-width:0;color:#63718A;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}
.gc-field-wide{grid-column:1/-1}
.gc-field select,.gc-field input{width:100%;height:46px;padding:0 13px;border:1px solid #C9D5E5;border-radius:10px;background:#fff;color:#233149;font:500 14px/1 inherit;text-transform:none;outline:none;box-sizing:border-box}
.gc-field select:focus,.gc-field input:focus{border-color:#1685B7;box-shadow:0 0 0 3px rgba(22,133,183,.12)}
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
  /* 手機：第一列＝雲端狀態＋語言；第二列＝操作按鈕（平均分配寬度），不再左右捲動。 */
  .gc-head-tools{gap:6px;padding:7px 8px;flex-wrap:wrap;overflow-x:visible}
  .gc-toolbar-title,.gc-btn-label,.gc-state-detail{display:none!important}
  .gc-cloud-state{order:1;flex:1 1 auto;min-width:0;padding:0 12px;font-size:13px;justify-content:flex-start}
  .gc-head-langs{order:2;margin-left:auto}
  .gc-head-cloud{order:3;flex:2 1 96px;display:flex}
  .gc-head-cloud .gc-cloud-btns{display:flex;width:100%;gap:6px}
  .gc-head-tools .gc-cloud-btn,.gc-head-btn{order:3;flex:1 1 44px;width:auto;min-width:44px;padding:0}
  .gc-head-langs button{min-width:44px;padding:0 5px}
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
  .gc-action-strip .gc-cloud-btn,.gc-action-strip .gc-pd-btn,.gc-mode-btn,.gc-action-btn{flex:0 0 auto;justify-content:center;min-height:44px;touch-action:manipulation}
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
GC.version = '3.16-key-water-daily-monthly';
GC.release = '62-single-decision-card';
GC.coreFix = 'fix-core-2026-09-29';
global.GC = GC;
global.GASCheckCore = GC;

})(window);
