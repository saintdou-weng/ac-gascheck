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
  const DATA_KEY_RE = /^(?:vrt_a7|vrt_c7|vrt_p7|vrt_th_z|vrt_th_r|vrt_keys|vrt_waste_v3|vrt_dorm_hub_v2|vrt_clean_hub_v2|vrt_dorm_draft|wdr_data|wdr_\d{4}_\d{2}|ac_waterdrum_backup)$/;
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
    'gc.cloudTools':'雲端工具','gc.indexedDb':'資料庫：IndexedDB'
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
    'gc.cloudTools':'Cloud Tools','gc.indexedDb':'Storage: IndexedDB'
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
    'gc.cloudTools':'ឧបករណ៍ Cloud','gc.indexedDb':'ការផ្ទុក៖ IndexedDB'
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

/* ═══════════════════════════════════════════════════════════
   2. CLOUD — 安全合併，永不被少量資料覆蓋
   ═══════════════════════════════════════════════════════════ */
const CLOUD = GC.cloud = {
  gasUrl: '',
  setUrl(u) { CLOUD.gasUrl = u || ''; },

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
    return CLOUD.post({ type: 'notify', parse_mode: 'HTML', text });
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
    const LB = { day: 'gc.today', week: 'gc.thisWeek', month: 'gc.thisMonth', year: 'gc.thisYear', all: 'gc.all' };
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

  /** 解析檔案 → {headers, rows}（SheetJS 依慣例 cellDates:false, raw:true） */
  parse(file) {
    return new Promise((resolve, reject) => {
      if (typeof XLSX === 'undefined') return reject(new Error('SheetJS (XLSX) not loaded'));
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('read fail'));
      fr.onload = e => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array', cellDates: false, raw: true });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
          const nonEmpty = aoa.filter(r => r.some(c => String(c).trim() !== ''));
          if (!nonEmpty.length) return reject(new Error('empty file'));
          resolve({ headers: nonEmpty[0].map(x => String(x)), rows: nonEmpty.slice(1), sheetName: wb.SheetNames[0] });
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
         <input type="file" id="${id}" accept="${accept}" hidden>
       </div>
       <div class="gc-import-status" id="${id}_st"></div>`;

    const dz = el.querySelector('#' + id + '_dz');
    const input = el.querySelector('#' + id);
    const st = el.querySelector('#' + id + '_st');

    function status(msg, cls) {
      st.className = 'gc-import-status' + (cls ? ' ' + cls : '');
      st.textContent = msg || '';
    }

    async function handle(file) {
      if (!file) return;
      status(I18.t('gc.importing'), 'busy');
      try {
        const { headers, rows, sheetName } = await IMPORT.parse(file);
        const schema = opt.schema || {};
        const map = IMPORT.autoMap(headers, schema);
        const objects = rows.map(r => {
          const o = {};
          Object.keys(map).forEach(f => { o[f] = map[f] >= 0 ? r[map[f]] : ''; });
          o._raw = r;
          return o;
        }).filter(o => Object.keys(schema).some(f => String(o[f]).trim() !== ''));

        status(`✅ ${objects.length} ${I18.t('gc.imported')}`, 'ok');
        if (opt.onData) opt.onData(objects, { headers, map, sheetName, fileName: file.name });
      } catch (err) {
        status('❌ ' + I18.t('gc.importFail') + ': ' + err.message, 'err');
      }
    }

    dz.onclick = () => input.click();
    input.onchange = e => { handle(e.target.files[0]); e.target.value = ''; };
    ['dragenter', 'dragover'].forEach(ev =>
      dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev =>
      dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', e => {
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handle(f);
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
       weather:  bool      是否顯示天氣統計
       photo:    bool      是否顯示照片統計
       gasUrl
     } */
  cfg = cfg || {};
  if (!cfg.__storageReady && STORAGE && STORAGE.ready) {
    const next = Object.assign({}, cfg, { __storageReady: true });
    STORAGE.ready.then(() => GC.attach(next));
    return { refresh: () => {}, getPeriod: () => 'month' };
  }
  const C = Object.assign({
    dateField: 'date', idField: 'id', groupField: null,
    weather: false, photo: false, importSchema: null,
    weatherField: 'weather',   // 各模組欄位名可能不同（如 temperature 用 'wx'）
    photoField:   'photos'
  }, cfg || {});

  if (C.gasUrl) CLOUD.setUrl(C.gasUrl);

  /* ── 面板 DOM：固定放在模組內容頂端，不再使用浮動按鈕 ── */
  const bar = document.createElement('div');
  bar.className = 'gc-tools-card';
  bar.innerHTML = `
    <div class="gc-panel" id="gcPanel">
      <div class="gc-panel-head">
        <span class="gc-panel-title">☁️ <span data-i="gc.cloudTools">${U.escapeHtml(I18.t('gc.cloudTools'))}</span></span>
        <span class="gc-storage-badge" data-i="gc.indexedDb">${U.escapeHtml(I18.t('gc.indexedDb'))}</span>
        <span id="gcLangSw"></span>
      </div>
      <div class="gc-panel-body">
        <div class="gc-sec">
          <div class="gc-sec-t" data-i="gc.dashboard">${U.escapeHtml(I18.t('gc.dashboard'))}</div>
          <div id="gcPeriod" style="margin-bottom:10px"></div>
          <div id="gcDash"></div>
        </div>
        <div class="gc-sec">
          <div class="gc-sec-t">☁️ <span data-i="gc.upload">${U.escapeHtml(I18.t('gc.upload'))}</span> / <span data-i="gc.download">${U.escapeHtml(I18.t('gc.download'))}</span></div>
          <div id="gcCloud"></div>
          <div class="gc-note" id="gcCloudNote"></div>
        </div>
        ${C.importSchema ? `<div class="gc-sec">
          <div class="gc-sec-t" data-i="gc.smartImport">${U.escapeHtml(I18.t('gc.smartImport'))}</div>
          <div id="gcImport"></div>
        </div>` : ''}
      </div>
    </div>`;
  const contentMount = document.querySelector('.main, .content, .page, .wrap') || document.body;
  if (contentMount.firstChild) contentMount.insertBefore(bar, contentMount.firstChild);
  else contentMount.appendChild(bar);

  // 在各模組原有分頁列加入同一個普通分頁按鈕，取代右上／右下浮動的工具圖示。
  const nav = document.querySelector('.tabs, .nav-tabs, #tab-bar, .nav, .znav');
  if (nav && !nav.querySelector('.gc-tab-trigger')) {
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'gc-tab-trigger';
    trigger.innerHTML = '☁️ <span data-i="gc.cloudTools">' + U.escapeHtml(I18.t('gc.cloudTools')) + '</span>';
    trigger.setAttribute('aria-controls', 'gcPanel');
    trigger.onclick = () => bar.scrollIntoView({ behavior: 'smooth', block: 'start' });
    nav.appendChild(trigger);
  }

  /* ── 元件掛載 ── */
  GC.i18n.mountSwitcher('#gcLangSw');

  let period = 'month';
  GC.period.mount('#gcPeriod', {
    value: period,
    onChange: m => { period = m; refresh(); }
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
  GC.mountCloudButtons('#gcCloud', cloudOpt);

  if (C.importSchema) {
    GC.import.mount('#gcImport', {
      schema: C.importSchema,
      onData: (rows, meta) => {
        const cur = C.read() || [];
        rows.forEach(r => {
          r[C.idField] = r[C.idField] || U.uid('imp');
          r.updatedAt = U.now();
          delete r._raw;
          cur.push(r);
        });
        C.write(cur);
        refresh();
        GC.toast(`✅ ${rows.length} ${I18.t('gc.imported')} — ${meta.fileName}`, 'success');
        if (C.onImport) C.onImport(rows);
      }
    });
  }

  /* ── 重新整理儀表板 ── */
  function refresh() {
    const all  = C.read() || [];
    const view = GC.period.filter(all, period, C.dateField);
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

    const note = document.getElementById('gcCloudNote');
    if (note) note.textContent =
      `${I18.t('gc.total')}: ${all.length} ｜ tool=${C.tool}`;
    I18.apply(bar);
  }

  /* ── 分頁內工具列：面板保持可見，避免智慧匯入／雲端按鈕被藏起來 ── */
  const panel = bar.querySelector('#gcPanel');
  if (panel) panel.classList.add('open');
  window.addEventListener('gc:langchange', refresh);

  refresh();
  return { refresh, getPeriod: () => period };
};

/* ── 面板樣式 ── */
const BAR_CSS = `
.gc-tools-card{display:block;width:100%;max-width:1400px;margin:0 0 16px;font-family:inherit;scroll-margin-top:12px}
.gc-tab-trigger{display:inline-flex;align-items:center;gap:5px;margin-left:8px;padding:9px 13px;border:1px solid rgba(26,62,120,.25);border-radius:8px;background:#fff;color:#1A3E78;font:600 12px/1 inherit;cursor:pointer;white-space:nowrap;transition:.15s}
.gc-tab-trigger:hover{background:#EBF0FA;border-color:#1A3E78;color:#153268}
.gc-panel{position:static;width:100%;background:#fff;border:1px solid #D8DCE6;border-radius:13px;box-shadow:0 4px 18px rgba(15,20,32,.1);display:flex;max-height:none;overflow:visible;flex-direction:column}
.gc-panel.open{display:flex}
.gc-panel-head{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:11px 14px;border-bottom:1px solid #EEF1F6;background:#F7F8FA;border-radius:13px 13px 0 0}
.gc-panel-title{font-weight:700;font-size:13px;color:#1A3E78;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gc-storage-badge{font-size:10px;color:#16653A;background:#E8F7EE;border:1px solid #BCE7CB;border-radius:12px;padding:3px 8px;white-space:nowrap}
.gc-panel-body{display:grid;grid-template-columns:minmax(220px,1.2fr) minmax(190px,.8fr) minmax(240px,1.2fr);gap:14px;padding:14px;overflow:visible}
.gc-sec{min-width:0;margin:0}
.gc-sec:last-child{margin-bottom:0}
.gc-sec-t{font-size:11px;font-weight:700;color:#5A6478;text-transform:uppercase;letter-spacing:.7px;margin-bottom:9px}
.gc-note{font-size:10px;color:#8892A8;margin-top:7px}
@media(max-width:900px){.gc-panel-body{grid-template-columns:1fr 1fr}.gc-sec:last-child{grid-column:1/-1}}
@media(max-width:560px){
  .gc-panel-body{grid-template-columns:1fr}
  .gc-sec:last-child{grid-column:auto}
  .gc-tab-trigger{margin:6px 0 0 4px;padding:8px 10px}
  .gc-storage-badge{order:3}
}
`;
(function(){
  function inj(){ if(document.getElementById('gc-bar-css'))return;
    const s=document.createElement('style'); s.id='gc-bar-css'; s.textContent=BAR_CSS; document.head.appendChild(s); }
  if(document.head) inj(); else document.addEventListener('DOMContentLoaded', inj);
})();

/* ── 匯出 ── */
GC.version = '2.0';
global.GC = GC;
global.GASCheckCore = GC;

})(window);
