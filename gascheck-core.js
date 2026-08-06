/* ═══════════════════════════════════════════════════════════════
   AC GASCheck — Shared Core  v1.0
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
  const DATA_KEY_RE = /^(?:vrt_a7|vrt_c7|vrt_p7|vrt_photos|vrt_th_z|vrt_th_r|vrt_keys|vrt_waste_v3|vrt_dorm_hub_v2|vrt_clean_hub_v2|vrt_dorm_draft|wdr_data|wdr_\d{4}_\d{2}|wdr_default_fac_price|wdr_default_sta_price|wdr_exchange_rate|wdr_last_saved|wdr_tg_config|ac_waterdrum_backup|ac_gascheck_tg_chat|ac_gascheck_tg_token|tg_chat|tg_token)$/;
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
   1. I18N — 繁中 / English / ខ្មែរ
   ═══════════════════════════════════════════════════════════ */
const BASE_DICT = {
  zh: {
    'gc.upload':'上傳雲端','gc.download':'下載雲端','gc.sync':'同步中…',
    'gc.uploaded':'已上傳雲端','gc.downloaded':'已下載並合併',
    'gc.upFail':'上傳失敗','gc.downFail':'下載失敗','gc.noCloud':'雲端尚無資料',
    'gc.merged':'筆已合併','gc.added':'筆新增','gc.updated':'筆更新','gc.kept':'筆本地保留',
    'gc.day':'日','gc.week':'週','gc.month':'月','gc.year':'年','gc.all':'全部',
    'gc.today':'今日','gc.thisWeek':'本週','gc.thisMonth':'本月','gc.thisYear':'今年',
    'gc.photo':'照片','gc.addPhoto':'加照片','gc.takePhoto':'拍照','gc.chooseFile':'選檔案',
    'gc.photoTooBig':'照片過大，已自動壓縮','gc.removePhoto':'移除照片','gc.noPhoto':'無照片',
    'gc.smartImport':'智慧匯入','gc.dropHere':'拖曳檔案到此，或點擊選擇',
    'gc.supportFmt':'支援 Excel (.xlsx/.xls) 與 CSV','gc.importing':'解析中…',
    'gc.imported':'筆已匯入','gc.importFail':'匯入失敗','gc.mapCols':'欄位對應',
    'gc.dashboard':'儀表板','gc.total':'總計','gc.records':'筆記錄',
    'gc.noData':'尚無資料','gc.export':'匯出','gc.search':'搜尋',
    'gc.weather':'天氣','gc.sunny':'晴','gc.cloudy':'多雲','gc.rain':'雨',
    'gc.heavyRain':'大雨','gc.storm':'雷雨','gc.hot':'酷熱','gc.humid':'潮濕',
    'gc.confirm':'確認','gc.cancel':'取消','gc.save':'儲存','gc.delete':'刪除','gc.close':'關閉',
    'gc.cloudTools':'雲端工具','gc.indexedDb':'資料庫：IndexedDB',
    'gc.noGasUrl':'尚未設定 GAS URL','gc.emptyMsg':'訊息內容是空的，未送出','gc.noGasResp':'GAS 沒有回傳資料，請確認部署 URL','gc.noMsgId':'GAS 未取得 Telegram messageId，請檢查 Bot/群組設定','gc.preview':'預覽','gc.previewEmpty':'此期間沒有資料，無法傳送','gc.confirmSend':'確認傳送','gc.sending':'傳送中…','gc.importReport':'匯入結果','gc.fileOk':'成功','gc.fileFail':'失敗','gc.refresh':'重新整理','gc.telegram':'Telegram','gc.sendTelegram':'發送 Telegram','gc.period':'摘要期間',
    'gc.summary':'摘要','gc.review':'審查','gc.approval':'Approval','gc.quickActions':'快速操作',
    'gc.directHint':'上方按鈕可直接同步、匯入與發送，不需填網址／Token／Chat ID',
    'gc.sentTelegram':'Telegram 已發送','gc.noApproval':'沒有待審查／待核可資料',
    'gc.pendingApproval':'待審查／待核可','gc.mode':'訊息類型','gc.dataType':'資料類型','gc.refDate':'基準日期'
  },
  en: {
    'gc.upload':'Upload','gc.download':'Download','gc.sync':'Syncing…',
    'gc.uploaded':'Uploaded to cloud','gc.downloaded':'Downloaded & merged',
    'gc.upFail':'Upload failed','gc.downFail':'Download failed','gc.noCloud':'No cloud data',
    'gc.merged':'merged','gc.added':'added','gc.updated':'updated','gc.kept':'kept local',
    'gc.day':'Day','gc.week':'Week','gc.month':'Month','gc.year':'Year','gc.all':'All',
    'gc.today':'Today','gc.thisWeek':'This Week','gc.thisMonth':'This Month','gc.thisYear':'This Year',
    'gc.photo':'Photo','gc.addPhoto':'Add Photo','gc.takePhoto':'Camera','gc.chooseFile':'Choose File',
    'gc.photoTooBig':'Photo compressed','gc.removePhoto':'Remove','gc.noPhoto':'No photo',
    'gc.smartImport':'Smart Import','gc.dropHere':'Drop file here or click to select',
    'gc.supportFmt':'Supports Excel (.xlsx/.xls) and CSV','gc.importing':'Parsing…',
    'gc.imported':'rows imported','gc.importFail':'Import failed','gc.mapCols':'Column Mapping',
    'gc.dashboard':'Dashboard','gc.total':'Total','gc.records':'records',
    'gc.noData':'No data','gc.export':'Export','gc.search':'Search',
    'gc.weather':'Weather','gc.sunny':'Sunny','gc.cloudy':'Cloudy','gc.rain':'Rain',
    'gc.heavyRain':'Heavy Rain','gc.storm':'Storm','gc.hot':'Hot','gc.humid':'Humid',
    'gc.confirm':'Confirm','gc.cancel':'Cancel','gc.save':'Save','gc.delete':'Delete','gc.close':'Close',
    'gc.cloudTools':'Cloud Tools','gc.indexedDb':'Storage: IndexedDB',
    'gc.noGasUrl':'GAS URL not set','gc.emptyMsg':'Message empty — not sent','gc.noGasResp':'No response from GAS deployment','gc.noMsgId':'No Telegram messageId; check bot/group settings','gc.preview':'Preview','gc.previewEmpty':'No data for this period','gc.confirmSend':'Send','gc.sending':'Sending…','gc.importReport':'Import Result','gc.fileOk':'OK','gc.fileFail':'Failed','gc.refresh':'Refresh','gc.telegram':'Telegram','gc.sendTelegram':'Send to Telegram','gc.period':'Summary period',
    'gc.summary':'Summary','gc.review':'Review','gc.approval':'Approval','gc.quickActions':'Quick actions',
    'gc.directHint':'Use the buttons above to sync, import and send; no URL/token/chat ID entry is needed',
    'gc.sentTelegram':'Telegram sent','gc.noApproval':'No pending review/approval records',
    'gc.pendingApproval':'Pending review/approval','gc.mode':'Message type','gc.dataType':'Data type','gc.refDate':'As of'
  },
  km: {
    'gc.upload':'ផ្ទុកឡើង','gc.download':'ទាញយក','gc.sync':'កំពុងធ្វើសមកាលកម្ម…',
    'gc.uploaded':'បានផ្ទុកឡើងលើ Cloud','gc.downloaded':'បានទាញយក និងបញ្ចូលគ្នា',
    'gc.upFail':'ការផ្ទុកឡើងបរាជ័យ','gc.downFail':'ការទាញយកបរាជ័យ','gc.noCloud':'គ្មានទិន្នន័យលើ Cloud',
    'gc.merged':'បានបញ្ចូលគ្នា','gc.added':'បានបន្ថែម','gc.updated':'បានធ្វើបច្ចុប្បន្នភាព','gc.kept':'រក្សាទុកក្នុងតំបន់',
    'gc.day':'ថ្ងៃ','gc.week':'សប្ដាហ៍','gc.month':'ខែ','gc.year':'ឆ្នាំ','gc.all':'ទាំងអស់',
    'gc.today':'ថ្ងៃនេះ','gc.thisWeek':'សប្ដាហ៍នេះ','gc.thisMonth':'ខែនេះ','gc.thisYear':'ឆ្នាំនេះ',
    'gc.photo':'រូបថត','gc.addPhoto':'បន្ថែមរូបថត','gc.takePhoto':'ថតរូប','gc.chooseFile':'ជ្រើសឯកសារ',
    'gc.photoTooBig':'រូបថតត្រូវបានបង្ហាប់','gc.removePhoto':'លុបចេញ','gc.noPhoto':'គ្មានរូបថត',
    'gc.smartImport':'នាំចូលឆ្លាតវៃ','gc.dropHere':'ទម្លាក់ឯកសារនៅទីនេះ ឬចុចដើម្បីជ្រើស',
    'gc.supportFmt':'គាំទ្រ Excel (.xlsx/.xls) និង CSV','gc.importing':'កំពុងវិភាគ…',
    'gc.imported':'ជួរបាននាំចូល','gc.importFail':'ការនាំចូលបរាជ័យ','gc.mapCols':'ការផ្គូផ្គងជួរឈរ',
    'gc.dashboard':'ផ្ទាំងគ្រប់គ្រង','gc.total':'សរុប','gc.records':'កំណត់ត្រា',
    'gc.noData':'គ្មានទិន្នន័យ','gc.export':'នាំចេញ','gc.search':'ស្វែងរក',
    'gc.weather':'អាកាសធាតុ','gc.sunny':'មេឃស្រឡះ','gc.cloudy':'មានពពក','gc.rain':'ភ្លៀង',
    'gc.heavyRain':'ភ្លៀងខ្លាំង','gc.storm':'ព្យុះ','gc.hot':'ក្ដៅ','gc.humid':'សើម',
    'gc.confirm':'បញ្ជាក់','gc.cancel':'បោះបង់','gc.save':'រក្សាទុក','gc.delete':'លុប','gc.close':'បិទ',
    'gc.cloudTools':'ឧបករណ៍ Cloud','gc.indexedDb':'ការផ្ទុក៖ IndexedDB',
    'gc.noGasUrl':'មិនទាន់កំណត់ GAS URL','gc.emptyMsg':'សារទទេ — មិនបានផ្ញើ','gc.noGasResp':'គ្មានការឆ្លើយតបពី GAS','gc.noMsgId':'រកមិនឃើញ messageId','gc.preview':'មើលជាមុន','gc.previewEmpty':'គ្មានទិន្នន័យសម្រាប់រយៈពេលនេះ','gc.confirmSend':'ផ្ញើ','gc.sending':'កំពុងផ្ញើ…','gc.importReport':'លទ្ធផលនាំចូល','gc.fileOk':'ជោគជ័យ','gc.fileFail':'បរាជ័យ','gc.refresh':'ផ្ទុកឡើងវិញ','gc.telegram':'Telegram','gc.sendTelegram':'ផ្ញើទៅ Telegram','gc.period':'រយៈពេលសង្ខេប',
    'gc.summary':'សង្ខេប','gc.review':'ពិនិត្យ','gc.approval':'Approval','gc.quickActions':'សកម្មភាពរហ័ស',
    'gc.directHint':'ប្រើប៊ូតុងខាងលើដើម្បីធ្វើសមកាលកម្ម នាំចូល និងផ្ញើ ដោយមិនចាំបាច់បញ្ចូល URL/token/chat ID',
    'gc.sentTelegram':'បានផ្ញើ Telegram','gc.noApproval':'គ្មានទិន្នន័យកំពុងរង់ចាំពិនិត្យ/អនុម័ត',
    'gc.pendingApproval':'កំពុងរង់ចាំពិនិត្យ/អនុម័ត','gc.mode':'ប្រភេទសារ','gc.dataType':'ប្រភេទទិន្នន័យ','gc.refDate':'កាលបរិច្ឆេទយោង'
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
  async upload(tool, localList, opt) {
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
  async download(tool, localList, opt) {
    opt = opt || {};
    const d = await CLOUD.get({ action: 'pull', tool });
    const rawCloudList = (d && d.data && d.data.list) || (d && d.list) || [];
    const cloudList = (rawCloudList || []).map(typeof opt.fromCloud === 'function' ? opt.fromCloud : (r => r));
    if (!cloudList.length) return { list: localList, stat: null, empty: true, response: d };
    const m = CLOUD.merge(localList, cloudList, opt.idKey, opt.tsKey);
    return { list: m.list, stat: m.stat, empty: false, response: d };
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
    /* 照 ac-hra-pay 做法：必須拿到 messageId 才算成功，否則明確報錯 */
    if (!CLOUD.gasUrl) throw new Error(I18.t('gc.noGasUrl'));
    if (!text || !String(text).trim()) throw new Error(I18.t('gc.emptyMsg'));
    const d = await CLOUD.post({ type: 'notify', parse_mode: 'HTML', text });
    if (!d) throw new Error(I18.t('gc.noGasResp'));
    if (d.ok === false) throw new Error(d.error || 'GAS error');
    const info = d.data || d;
    if (info.sent !== true || !info.messageId) throw new Error(I18.t('gc.noMsgId'));
    return info;
  }
};

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
    return {
      get: () => photos.slice(),
      set: arr => { photos = (arr || []).slice(); render(); },
      clear: () => { photos = []; render(); }
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
    const accept = opt.accept || '.xlsx,.xls,.csv';

    el.innerHTML =
      `<div class="gc-import" id="${id}_dz">
         <div class="gc-import-ic">📊</div>
         <div class="gc-import-t" data-i="gc.smartImport">${U.escapeHtml(I18.t('gc.smartImport'))}</div>
         <div class="gc-import-d" data-i="gc.dropHere">${U.escapeHtml(I18.t('gc.dropHere'))}</div>
         <div class="gc-import-h" data-i="gc.supportFmt">${U.escapeHtml(I18.t('gc.supportFmt'))}</div>
         <input type="file" id="${id}" accept="${accept}"${opt.multiple === false ? '' : ' multiple'} hidden>
       </div>
       <div class="gc-import-status" id="${id}_st"></div>
       <div class="gc-imp-report" id="${id}_rep" style="display:none"></div>`;

    const dz = el.querySelector('#' + id + '_dz');
    const input = el.querySelector('#' + id);
    const st = el.querySelector('#' + id + '_st');
    const rep = el.querySelector('#' + id + '_rep');

    /* 照 ac-hra-pay：逐檔列出成功/失敗與原因，並提示缺什麼 */
    function report(rows, notes) {
      if (!rep) return;
      if (!rows || !rows.length) { rep.style.display = 'none'; rep.innerHTML = ''; return; }
      rep.innerHTML = rows.map(function (r) {
        return r.ok
          ? '<div class="gc-imp-row"><span class="gc-imp-ok">✓</span><span><b>' +
            U.escapeHtml(r.file) + '</b> → ' + U.escapeHtml(String(r.n)) + ' ' +
            U.escapeHtml(I18.t('gc.records')) +
            (r.detail ? ' · ' + U.escapeHtml(r.detail) : '') + '</span></div>'
          : '<div class="gc-imp-row"><span class="gc-imp-bad">✕</span><span><b>' +
            U.escapeHtml(r.file) + '</b> — ' + U.escapeHtml(r.msg || '') + '</span></div>';
      }).join('') +
      (notes && notes.length
        ? '<div class="gc-imp-note">📌 ' + notes.map(U.escapeHtml).join('；') + '</div>'
        : '');
      rep.style.display = '';
    }

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
      const fileLog = [];
      if (rep) { rep.style.display = 'none'; rep.innerHTML = ''; }
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
          /* 記錄哪些欄位沒對應到，方便使用者判斷是不是欄位名不同 */
          const unmapped = Object.keys(opt.schema || {}).filter(function (f) { return map[f] === undefined || map[f] < 0; });
          fileLog.push({ ok: true, file: file.name, n: objects.length,
            detail: (sheetName ? sheetName : '') +
                    (unmapped.length ? (sheetName ? ' · ' : '') + '未對應: ' + unmapped.join('/') : '') });
          status(I18.t('gc.importing') + ' ' + (i + 1) + '/' + list.length + ' · ' + file.name, 'busy');
        } catch (err) {
          errors.push(file.name + ': ' + (err && err.message ? err.message : err));
          fileLog.push({ ok: false, file: file.name, msg: (err && err.message ? err.message : String(err)) });
          status(I18.t('gc.importing') + ' ' + (i + 1) + '/' + list.length + ' · ' + file.name, 'busy');
        }
      }
      if (!allObjects.length && errors.length) {
        status('❌ ' + I18.t('gc.importFail'), 'err');
        report(fileLog, [I18.t('gc.importFail')]);
        return;
      }
      const fileNames = metas.map(m => m.fileName).join(', ');
      const okN = fileLog.filter(function (x) { return x.ok; }).length;
      status((okN === fileLog.length ? '✅ ' : '⚠ ') + okN + '/' + fileLog.length + ' · ' +
        allObjects.length + ' ' + I18.t('gc.imported'), errors.length ? 'warning' : 'ok');
      const notes = [];
      const zeroFiles = fileLog.filter(function (x) { return x.ok && x.n === 0; });
      if (zeroFiles.length) notes.push(zeroFiles.map(function (x) { return x.file; }).join(', ') + ' 讀到 0 筆，請確認欄位名稱');
      report(fileLog, notes);
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


.gc-tg-ov{position:fixed;inset:0;background:rgba(15,20,32,.5);z-index:9900;display:none;align-items:center;justify-content:center;padding:20px}
.gc-tg-ov.open{display:flex}
.gc-tg-box{background:#fff;border-radius:13px;width:min(520px,100%);max-height:86vh;display:flex;flex-direction:column;box-shadow:0 14px 46px rgba(0,0,0,.3)}
.gc-tg-head{padding:13px 16px;border-bottom:1px solid #EEF1F6;display:flex;justify-content:space-between;align-items:center}
.gc-tg-title{font-weight:700;font-size:14px;color:#1A3E78}
.gc-tg-x{border:0;background:transparent;font-size:17px;cursor:pointer;color:#8892A8;line-height:1}
.gc-tg-x:hover{color:#B91C1C}
.gc-tg-meta{padding:10px 16px;display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid #F4F6FA;background:#FAFBFC}
.gc-tg-chip{background:#EBF0FA;color:#1A3E78;font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px}
.gc-tg-chip-n{background:#E6F4EC;color:#16653A}
.gc-tg-body{padding:14px 16px;overflow-y:auto;flex:1}
.gc-tg-pre{margin:0;font:12px/1.6 'IBM Plex Mono',ui-monospace,monospace;white-space:pre-wrap;word-break:break-word;color:#1A2035;background:#F7F8FA;border:1px solid #EEF1F6;border-radius:8px;padding:12px}
.gc-tg-foot{padding:12px 16px;border-top:1px solid #EEF1F6;display:flex;gap:8px;justify-content:flex-end}
.gc-tg-cancel{border:1px solid #D8DCE6;background:#fff;color:#4A5472;padding:8px 16px;border-radius:7px;font:600 13px/1 inherit;cursor:pointer}
.gc-tg-cancel:hover{background:#EEF1F6}
.gc-tg-send{border:0;background:#1A3E78;color:#fff;padding:8px 22px;border-radius:7px;font:600 13px/1 inherit;cursor:pointer}
.gc-tg-send:hover{background:#153268}
.gc-tg-send.off,.gc-tg-send:disabled{background:#C4CAD8;cursor:not-allowed}
.gc-imp-report{margin-top:10px;font-size:12px;line-height:1.65}
.gc-imp-row{display:flex;gap:7px;align-items:flex-start;padding:2px 0}
.gc-imp-ok{color:#059669;font-weight:700}
.gc-imp-bad{color:#DC2626;font-weight:700}
.gc-imp-note{margin-top:7px;padding-top:7px;border-top:1px solid #EEF1F6;color:#B45309}
.gc-toast-box{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:10000;display:flex;flex-direction:column;gap:7px;align-items:center;pointer-events:none}
.gc-toast{background:#1A2035;color:#fff;padding:10px 19px;border-radius:8px;font-size:13px;box-shadow:0 4px 18px rgba(0,0,0,.24);animation:gcIn .25s ease;max-width:88vw}
.gc-toast.success{background:#16653A}.gc-toast.error{background:#B91C1C}.gc-toast.warning{background:#7D4E00}
.gc-toast.out{opacity:0;transform:translateY(8px);transition:.3s}
@keyframes gcIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}

.gc-cloud-btns{display:inline-flex;gap:7px}
.gc-cloud-btn{display:inline-flex;align-items:center;gap:5px;padding:7px 13px;border:1px solid #D8DCE6;background:#fff;border-radius:7px;font:600 12px/1 inherit;color:#1A3E78;cursor:pointer;transition:.15s}
.gc-cloud-btn:hover{background:#EBF0FA;border-color:#1A3E78}
.gc-cloud-btn:disabled{opacity:.45;cursor:not-allowed}

.gc-action-strip{display:flex;align-items:center;gap:7px;flex-wrap:wrap;overflow:visible;white-space:normal;padding:10px 12px;margin-bottom:10px;background:#F7F9FC;border:1px solid #D8DCE6;border-radius:12px;box-shadow:0 3px 12px rgba(15,20,32,.08)}
.gc-action-strip>*{flex-shrink:0}
.gc-action-heading{font-size:12px;font-weight:800;color:#1A3E78;white-space:nowrap;margin-right:2px}
.gc-action-label{font-size:11px;font-weight:700;color:#5A6478;white-space:nowrap;margin-left:4px}
.gc-scope-select,.gc-ref-date{height:34px;padding:0 8px;border:1px solid #C9D3E3;border-radius:8px;background:#fff;color:#1A3E78;font:700 11px/1 inherit;flex:0 0 auto}
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
  if (!el) return;
  opt = opt || {};
  el.innerHTML =
    `<div class="gc-cloud-btns">
       <button type="button" class="gc-cloud-btn" data-gc-up>☁️ <span data-i="gc.upload">${U.escapeHtml(I18.t('gc.upload'))}</span></button>
       <button type="button" class="gc-cloud-btn" data-gc-down>⬇️ <span data-i="gc.download">${U.escapeHtml(I18.t('gc.download'))}</span></button>
     </div>`;
  const up = el.querySelector('[data-gc-up]'), down = el.querySelector('[data-gc-down]');

  up.onclick = async () => {
    up.disabled = true;
    try {
      const local = opt.getList ? opt.getList() : [];
      const { res, list } = await CLOUD.upload(opt.tool, local, {
        idKey: opt.idKey, tsKey: opt.tsKey, extra: opt.extra,
        toCloud: opt.toCloud, fromCloud: opt.fromCloud
      });
      if (res && res.ok !== false) {
        if (opt.setList) opt.setList(list);
        GC.toast('☁ ' + I18.t('gc.uploaded') + ' (' + list.length + ')', 'success');
        if (opt.onDone) opt.onDone(list);
      } else GC.toast('❌ ' + I18.t('gc.upFail') + ': ' + ((res && res.error) || ''), 'error');
    } catch (e) { GC.toast('❌ ' + I18.t('gc.upFail') + ': ' + e.message, 'error'); }
    up.disabled = false;
  };

  down.onclick = async () => {
    down.disabled = true;
    try {
      const local = opt.getList ? opt.getList() : [];
      const r = await CLOUD.download(opt.tool, local, {
        idKey: opt.idKey, tsKey: opt.tsKey, fromCloud: opt.fromCloud
      });
      if (r.empty) GC.toast('⚠ ' + I18.t('gc.noCloud'), 'warning');
      else {
        if (opt.onRemote) opt.onRemote(r.response || {});
        if (opt.setList) opt.setList(r.list);
        GC.toast('⬇ ' + I18.t('gc.downloaded') + ' — ' +
          r.stat.added + ' ' + I18.t('gc.added') + ' / ' +
          r.stat.updated + ' ' + I18.t('gc.updated') + ' / ' +
          r.stat.kept + ' ' + I18.t('gc.kept'), 'success');
        if (opt.onDone) opt.onDone(r.list);
      }
    } catch (e) { GC.toast('❌ ' + I18.t('gc.downFail') + ': ' + e.message, 'error'); }
    down.disabled = false;
  };
};

/* ═══════════════════════════════════════════════════════════
   10.5 TELEGRAM — 直接摘要／審查／Approval
   Telegram token 留在 GAS，瀏覽器只呼叫固定 Web App URL。
   ═══════════════════════════════════════════════════════════ */
GC.telegram = {
  pending(record) {
    if (!record) return false;
    const vals = [record.status, record.approvalStatus, record.reviewStatus,
      record.approval, record.approved, record.review];
    return vals.some(v => v === false || /pending|待審|待核|待批|review|approval|審查|核可|未完成/i.test(String(v || '')));
  },
  buildText(cfg, period, mode, ref, scope) {
    cfg = cfg || {};
    const all = typeof cfg.read === 'function' ? (cfg.read() || []) : [];
    const list = Array.isArray(all) ? all : [];
    let view = PERIOD.filter(list, period || 'month', cfg.dateField || 'date', ref);
    if (cfg.scopeField && scope && scope !== 'all') view = view.filter(r => String(r && r[cfg.scopeField] || '') === String(scope));
    const pending = view.filter(GC.telegram.pending);
    const periodLabels = {
      day: I18.t('gc.today'), week: I18.t('gc.thisWeek'), month: I18.t('gc.thisMonth'),
      year: I18.t('gc.thisYear'), all: I18.t('gc.all')
    };
    const modeLabels = { summary: I18.t('gc.summary'), review: I18.t('gc.review'), approval: I18.t('gc.approval') };
    const title = U.escapeHtml(cfg.title || cfg.tool || 'AC GASCHECK');
    const lines = [
      '♻️ <b>' + title + '</b>',
      '📅 ' + U.escapeHtml(periodLabels[period] || period || I18.t('gc.thisMonth')),
      '📊 ' + U.escapeHtml(I18.t('gc.records')) + ': <b>' + view.length + '</b> / ' +
        U.escapeHtml(I18.t('gc.total')) + ': ' + list.length,
      '🧾 ' + U.escapeHtml(I18.t('gc.mode')) + ': ' + U.escapeHtml(modeLabels[mode] || modeLabels.summary)
    ];
    const photoCount = cfg.photoField ? view.filter(r => U.asArray(r && r[cfg.photoField]).length).length : 0;
    const weatherCount = cfg.weatherField ? view.filter(r => r && r[cfg.weatherField]).length : 0;
    lines.push('━━━━━━━━━━━━━━━━', '📊 <b>Dashboard</b>');
    lines.push('• Records: <b>' + view.length + '</b> | Photos: ' + photoCount + (cfg.weather ? ' | Weather: ' + weatherCount : ''));
    if (cfg.groupField) {
      const groups = GC.dash.groupBy(view, r => r && r[cfg.groupField]).slice(0, 8);
      groups.forEach(g => lines.push('• ' + U.escapeHtml(g.label) + ': ' + g.value));
    }
    if (mode === 'review' || mode === 'approval') {
      lines.push('━━━━━━━━━━━━━━━━');
      lines.push('⏳ ' + U.escapeHtml(I18.t('gc.pendingApproval')) + ': <b>' + pending.length + '</b>');
      if (!pending.length) lines.push('✅ ' + U.escapeHtml(I18.t('gc.noApproval')));
    }
    lines.push('━━━━━━━━━━━━━━━━', '⏰ ' + U.ymdhms());
    return lines.join('\n');
  },
  async send(text, photos, buttons) {
    if (!text) throw new Error('No Telegram text');
    const res = await CLOUD.post({ action: 'telegram', text: text, photos: Array.isArray(photos) ? photos.slice(0, 5) : [], buttons: Array.isArray(buttons) ? buttons : [] });
    if (!res || res.ok === false) throw new Error((res && res.error) || 'Telegram request failed');
    return res;
  }
};


/* ═══════════════════════════════════════════════════════════
   11. ATTACH — 通用掛載面板（不動模組內部程式碼）
   ═══════════════════════════════════════════════════════════ */
GC.attach = function (cfg) {
  /* cfg = {
       tool, title, lsKey,
       read()  -> Array   讀取記錄陣列
       write(list)        寫回記錄陣列
       dateField, idField,
       groupField          儀表板長條圖分組欄位
       importSchema        智慧匯入欄位對應
       importParser(file,schema) -> Promise<{objects,headers,...}>（可自訂跨分頁解析）
       telegramScopes      [{value,zh,en,km}]（Telegram 資料類型選擇）
       scopeField          Telegram／統計分組篩選欄位
       periodRef           true 時顯示基準日期
       weather:  bool      是否顯示天氣統計
       photo:    bool      是否顯示照片統計
       gasUrl,
       telegramBuilder({ period, mode, ref, scope, cfg }) -> string|{text,photos}  (optional module-specific report)
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
    telegramScopes: null, scopeField: null, periodRef: false,
    weatherField: 'weather',   // 各模組欄位名可能不同（如 temperature 用 'wx'）
    photoField:   'photos'
  }, cfg || {});

  // 固定使用已確認可用的 Web App 入口；模組內舊的 gasUrl 只保留相容性，不再要求使用者手動設定。
  CLOUD.setUrl(DEFAULT_GAS_URL);

  /* ── 面板 DOM：固定放在模組內容頂端，不再使用浮動按鈕 ── */
  const bar = document.createElement('div');
  bar.className = 'gc-tools-card';
  bar.innerHTML = `
    <div class="gc-action-strip" id="gcActionStrip">
      <span class="gc-action-heading">☁️ <span data-i="gc.quickActions">${U.escapeHtml(I18.t('gc.quickActions'))}</span></span>
      <div id="gcTopCloud"></div>
      <button type="button" class="gc-action-btn gc-tg-btn" data-gc-send>✈️ <span data-i="gc.telegram">${U.escapeHtml(I18.t('gc.telegram'))}</span></button>
      ${C.importSchema ? `<button type="button" class="gc-action-btn gc-import-btn" data-gc-import>📥 <span data-i="gc.smartImport">${U.escapeHtml(I18.t('gc.smartImport'))}</span></button>` : ''}
      ${C.telegramScopes ? `<span class="gc-action-label" data-i="gc.dataType">${U.escapeHtml(I18.t('gc.dataType'))}</span><select class="gc-scope-select" data-gc-scope aria-label="${U.escapeHtml(I18.t('gc.dataType'))}"></select>` : ''}
      <span class="gc-action-label" data-i="gc.period">${U.escapeHtml(I18.t('gc.period'))}</span>
      <div id="gcQuickPeriod"></div>
      ${C.periodRef ? `<span class="gc-action-label" data-i="gc.refDate">${U.escapeHtml(I18.t('gc.refDate'))}</span><button type="button" class="gc-ref-nav" data-gc-ref-prev aria-label="Previous date">◀</button><input class="gc-ref-date" data-gc-ref type="date" aria-label="${U.escapeHtml(I18.t('gc.refDate'))}"><button type="button" class="gc-ref-nav" data-gc-ref-next aria-label="Next date">▶</button>` : ''}
      <span class="gc-action-label" data-i="gc.mode">${U.escapeHtml(I18.t('gc.mode'))}</span>
      <div class="gc-mode" id="gcQuickMode">
        <button type="button" class="gc-mode-btn on" data-gc-mode="summary">📄 <span data-i="gc.summary">${U.escapeHtml(I18.t('gc.summary'))}</span></button>
        <button type="button" class="gc-mode-btn" data-gc-mode="review">🔎 <span data-i="gc.review">${U.escapeHtml(I18.t('gc.review'))}</span></button>
        <button type="button" class="gc-mode-btn" data-gc-mode="approval">✅ <span data-i="gc.approval">${U.escapeHtml(I18.t('gc.approval'))}</span></button>
      </div>
      <span class="gc-action-status" id="gcTelegramState" aria-live="polite"></span>
    </div>
    <div class="gc-panel" id="gcPanel">
      <div class="gc-panel-head">
        <span class="gc-panel-title">☁️ <span data-i="gc.cloudTools">${U.escapeHtml(I18.t('gc.cloudTools'))}</span></span>
        <span class="gc-storage-badge" data-i="gc.indexedDb">${U.escapeHtml(I18.t('gc.indexedDb'))}</span>
      </div>
      <div class="gc-panel-body">
        <div class="gc-sec">
          <div class="gc-sec-t" data-i="gc.dashboard">${U.escapeHtml(I18.t('gc.dashboard'))}</div>
          <div id="gcDash"></div>
        </div>
        <div class="gc-sec">
          <div class="gc-sec-t">☁️ <span data-i="gc.upload">${U.escapeHtml(I18.t('gc.upload'))}</span> / <span data-i="gc.download">${U.escapeHtml(I18.t('gc.download'))}</span></div>
          <div class="gc-cloud-info" data-i="gc.directHint">${U.escapeHtml(I18.t('gc.directHint'))}</div>
          <div class="gc-note" id="gcCloudNote"></div>
        </div>
        ${C.importSchema ? `<div class="gc-sec gc-import-sec">
          <div class="gc-sec-t">📥 <span data-i="gc.smartImport">${U.escapeHtml(I18.t('gc.smartImport'))}</span></div>
          <div id="gcImport"></div>
        </div>` : ''}
      </div>
    </div>
  `;
  /* ── 掛載位置 ──
     各模組結構不同：temperature 只有一個 .main（全頁共用）；
     cleaning 是每個分頁各有一個 .main，若插進第一個 .main
     工具卡只會出現在「總覽」分頁，其他分頁看不到。
     所以優先掛在頁籤列之後、所有分頁之前，確保每個分頁都看得到。 */
  (function mountBar() {
    if (C.mountSelector) {
      const custom = document.querySelector(C.mountSelector);
      if (custom) { custom.appendChild(bar); return; }
    }
    // 1) 頁籤列之後（適用有多個 pane 的模組，如 cleaning）
    const tabs = document.querySelector('.tabs, #main-tabs, nav.tabs');
    const panes = document.querySelectorAll('.pane, .tab-pane, [data-pane]');
    if (tabs && panes.length > 1 && tabs.parentNode) {
      tabs.parentNode.insertBefore(bar, tabs.nextSibling);
      return;
    }
    // 2) 單一內容容器（適用 temperature 這類）
    const mains = document.querySelectorAll('.main, .content, .page, .wrap');
    if (mains.length === 1) {
      const m = mains[0];
      if (m.firstChild) m.insertBefore(bar, m.firstChild); else m.appendChild(bar);
      return;
    }
    // 3) 有多個 .main 但沒有頁籤 → 放在第一個 .main 之前（頁面層級）
    if (mains.length > 1 && mains[0].parentNode) {
      mains[0].parentNode.insertBefore(bar, mains[0]);
      return;
    }
    // 4) 最後手段
    if (tabs && tabs.parentNode) tabs.parentNode.insertBefore(bar, tabs.nextSibling);
    else document.body.insertBefore(bar, document.body.firstChild);
  })();

  /* ── 元件掛載 ── */
  let period = 'month';
  let mode = 'summary';
  let periodRef = C.periodRef ? U.ymd(new Date()) : null;
  let scope = 'all';
  const scopeSelect = bar.querySelector('[data-gc-scope]');
  const refInput = bar.querySelector('[data-gc-ref]');
  const refPrev = bar.querySelector('[data-gc-ref-prev]');
  const refNext = bar.querySelector('[data-gc-ref-next]');
  const scopeLabel = item => typeof item === 'string' ? item : (item[I18.lang] || item.zh || item.en || item.value || '');
  function renderScope() {
    if (!scopeSelect || !Array.isArray(C.telegramScopes)) return;
    scopeSelect.innerHTML = C.telegramScopes.map(item => `<option value="${U.escapeHtml(item.value)}">${U.escapeHtml(scopeLabel(item))}</option>`).join('');
    scopeSelect.value = scope;
  }
  renderScope();
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
    tool: C.tool, idKey: C.idField, tsKey: 'updatedAt',
    toCloud: C.toCloud,
    fromCloud: C.fromCloud,
    getList: () => C.read() || [],
    setList: list => C.write(list),
    onRemote: d => { if (C.onRemote) C.onRemote(d || {}); },
    onDone: () => { refresh(); if (C.onSync) C.onSync(); }
  };
  // 雲端按鈕固定放在頁面頂部快捷列，避免跑到頁面底部或被浮動圖示遮住。
  GC.mountCloudButtons('#gcTopCloud', cloudOpt);

  const sendTelegram = bar.querySelector('[data-gc-send]');
  const telegramState = bar.querySelector('#gcTelegramState');
  /* ── 組出目前設定下的 Telegram 內容 ── */
  async function buildTelegramPacket() {
    const customText = typeof C.telegramBuilder === 'function'
      ? await C.telegramBuilder({ period, mode, ref: periodRef, scope, cfg: C })
      : null;
    const built = customText == null ? GC.telegram.buildText(C, period, mode, periodRef, scope) : customText;
    return typeof built === 'string' ? { text: built, photos: [] } : (built || { text: '', photos: [] });
  }

  /* ── 預覽彈窗（照 ac-hra-pay：先看內容再決定送不送）── */
  function ensureTgModal() {
    let m = document.getElementById('gcTgModal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'gcTgModal'; m.className = 'gc-tg-ov';
    m.innerHTML =
      '<div class="gc-tg-box">' +
        '<div class="gc-tg-head">' +
          '<span class="gc-tg-title">✈️ <span data-i="gc.sendTelegram"></span></span>' +
          '<button type="button" class="gc-tg-x" id="gcTgX">✕</button>' +
        '</div>' +
        '<div class="gc-tg-meta" id="gcTgMeta"></div>' +
        '<div class="gc-tg-body"><pre class="gc-tg-pre" id="gcTgPre"></pre></div>' +
        '<div class="gc-tg-foot">' +
          '<button type="button" class="gc-tg-cancel" id="gcTgCancel" data-i="gc.cancel"></button>' +
          '<button type="button" class="gc-tg-send" id="gcTgSend" data-i="gc.confirmSend"></button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);
    m.querySelector('#gcTgX').onclick = () => m.classList.remove('open');
    m.querySelector('#gcTgCancel').onclick = () => m.classList.remove('open');
    m.onclick = e => { if (e.target === m) m.classList.remove('open'); };
    return m;
  }

  async function openTelegramPreview() {
    const m = ensureTgModal();
    const pre = m.querySelector('#gcTgPre');
    const meta = m.querySelector('#gcTgMeta');
    const send = m.querySelector('#gcTgSend');
    I18.apply(m);

    /* 顯示目前期間/模式/範圍，讓人一眼知道要送什麼 */
    const all = C.read() || [];
    let view = GC.period.filter(all, period, C.dateField, periodRef);
    if (C.scopeField && scope && scope !== 'all')
      view = view.filter(r => String(r && r[C.scopeField] || '') === String(scope));
    const PD = { day:'gc.today', week:'gc.thisWeek', month:'gc.thisMonth', year:'gc.thisYear', all:'gc.all' };
    meta.innerHTML =
      '<span class="gc-tg-chip">' + U.escapeHtml(I18.t(PD[period] || period)) + '</span>' +
      '<span class="gc-tg-chip">' + U.escapeHtml(mode) + '</span>' +
      (scope && scope !== 'all' ? '<span class="gc-tg-chip">' + U.escapeHtml(scope) + '</span>' : '') +
      '<span class="gc-tg-chip gc-tg-chip-n">' + view.length + ' ' + U.escapeHtml(I18.t('gc.records')) + '</span>';

    pre.textContent = I18.t('gc.sync');
    m.classList.add('open');

    try {
      const packet = await buildTelegramPacket();
      const plain = String(packet.text || '').replace(/<\/?[^>]+>/g, '');
      if (!plain.trim() || !view.length) {
        pre.textContent = '⚠️ ' + I18.t('gc.previewEmpty');
        send.disabled = true; send.classList.add('off');
      } else {
        pre.textContent = plain;
        send.disabled = false; send.classList.remove('off');
      }
      send.onclick = async () => {
        send.disabled = true;
        const orig = send.textContent;
        send.textContent = I18.t('gc.sending');
        try {
          const dashUrl = C.dashboardUrl || DASHBOARD_BASE_URL + (DASHBOARD_PATHS[C.tool] || 'ac_gascheck_portal_v1.html');
          const buttons = packet.buttons || [[{ text:'📊 Open Dashboard / 開啟平台', url: dashUrl }]];
          await GC.telegram.send(packet.text, packet.photos, buttons);
          if (telegramState) telegramState.textContent = '✓ ' + I18.t('gc.sentTelegram');
          GC.toast('✈️ ' + I18.t('gc.sentTelegram'), 'success');
          m.classList.remove('open');
        } catch (e) {
          if (telegramState) telegramState.textContent = '✕ ' + e.message;
          GC.toast('❌ ' + e.message, 'error');
        }
        send.disabled = false; send.textContent = orig;
      };
    } catch (e) {
      pre.textContent = '⚠️ ' + e.message;
      send.disabled = true; send.classList.add('off');
    }
  }
  if (sendTelegram) sendTelegram.onclick = openTelegramPreview;

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
    let view = GC.period.filter(all, period, C.dateField, periodRef);
    if (C.scopeField && scope && scope !== 'all') view = view.filter(r => String(r && r[C.scopeField] || '') === String(scope));
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
  window.addEventListener('gc:langchange', () => { renderScope(); refresh(); });

  refresh();
  /* ── 自動刷新：模組自己存檔後，面板數字要跟著動（修 ehs 顯示 0 的問題）── */
  let _lastSig = '';
  function autoRefresh() {
    try {
      const all = C.read() || [];
      const last = all.length ? all[all.length - 1] : null;
      const sig = all.length + '|' + (last && last[C.idField] || '') + '|' + (last && last.updatedAt || '');
      if (sig !== _lastSig) { _lastSig = sig; refresh(); }
    } catch (e) {}
  }
  autoRefresh();
  setInterval(autoRefresh, 1500);
  window.addEventListener('storage', autoRefresh);
  window.addEventListener('gc:datachange', function () { refresh(); });

  return { refresh, getPeriod: () => period, sendTelegram: openTelegramPreview, openTelegram: openTelegramPreview };
};

/* ── 面板樣式 ── */
const BAR_CSS = `
.gc-tools-card{display:block;width:100%;max-width:none;margin:0 0 16px;font-family:inherit;scroll-margin-top:12px}
.gc-panel{position:static;width:100%;background:#fff;border:1px solid #D8DCE6;border-radius:13px;box-shadow:0 4px 18px rgba(15,20,32,.1);display:flex;max-height:none;overflow:visible;flex-direction:column}
.gc-panel.open{display:flex}
.gc-panel-head{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:11px 14px;border-bottom:1px solid #EEF1F6;background:#F7F8FA;border-radius:13px 13px 0 0}
.gc-panel-title{font-weight:700;font-size:13px;color:#1A3E78;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gc-storage-badge{font-size:10px;color:#16653A;background:#E8F7EE;border:1px solid #BCE7CB;border-radius:12px;padding:3px 8px;white-space:nowrap}
.gc-panel-body{display:grid;grid-template-columns:minmax(260px,1.05fr) minmax(240px,.85fr) minmax(300px,1.2fr);gap:14px;padding:14px;overflow:visible}
.gc-sec{min-width:0;margin:0}
.gc-sec:last-child{margin-bottom:0}
.gc-import-sec{min-width:0}
.gc-import-focus{outline:3px solid rgba(78,111,255,.25);outline-offset:3px;border-radius:9px;transition:outline .2s}
.gc-sec-t{font-size:11px;font-weight:700;color:#5A6478;text-transform:uppercase;letter-spacing:.7px;margin-bottom:9px}
.gc-note{font-size:10px;color:#8892A8;margin-top:7px}
@media(max-width:1050px){.gc-panel-body{grid-template-columns:1fr 1fr}.gc-import-sec{grid-column:1/-1}}
@media(max-width:560px){
  .gc-action-strip{align-items:center;flex-wrap:wrap;overflow:visible;white-space:normal;padding:8px 9px}
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
GC.version = '2.2';
global.GC = GC;
global.GASCheckCore = GC;

})(window);
