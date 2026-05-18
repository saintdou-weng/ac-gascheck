/**
 * AC_GASCHECK Platform — Shared i18n System
 * Usage: AC_I18N.setLang('zh') | AC_I18N.t('key') | AC_I18N.getLang()
 * Modules add their own keys via AC_I18N.extend(dict)
 */
const AC_I18N = (() => {
  let _lang = (typeof AC_CFG !== 'undefined' ? AC_CFG.get().lang : null)
            || localStorage.getItem('ac_gascheck_lang') || 'zh';

  // Platform-wide base dictionary
  const _base = {
    zh: {
      // Nav
      'nav.portal':'← 返回平台', 'nav.home':'首頁',
      'nav.cloud':'☁ 雲端', 'nav.sync':'同步',
      // Cloud
      'cloud.ok':'雲端已連接', 'cloud.err':'連接失敗', 'cloud.not-set':'GAS 未設定',
      'cloud.tap':'點此設定', 'cloud.uploading':'上傳中…', 'cloud.downloading':'下載中…',
      'cloud.upload-ok':'✅ 上傳完成', 'cloud.download-ok':'✅ 下載完成',
      'cloud.upload-err':'❌ 上傳失敗', 'cloud.download-err':'❌ 下載失敗',
      'cloud.no-gas':'請先設定 GAS URL',
      // Date
      'date.day':'日', 'date.week':'週', 'date.month':'月', 'date.year':'年',
      'date.prev':'‹', 'date.next':'›', 'date.today':'今天',
      // Actions
      'btn.save':'儲存', 'btn.delete':'刪除', 'btn.export':'匯出 Excel',
      'btn.import':'匯入 Excel', 'btn.print':'列印', 'btn.refresh':'刷新',
      'btn.upload':'☁ 上傳', 'btn.download':'⬇ 下載', 'btn.tg':'Telegram',
      'btn.new':'新增', 'btn.edit':'編輯', 'btn.cancel':'取消', 'btn.confirm':'確認',
      // Status
      'status.pending':'待審核', 'status.approved':'已核可', 'status.rejected':'已拒絕',
      'status.active':'正常', 'status.inactive':'停用',
      // Common
      'no-rec':'暫無記錄', 'loading':'載入中…', 'all':'全部',
      'search':'搜尋', 'filter':'篩選', 'reset':'重置',
      // Modules
      'mod.asset':'資產管理', 'mod.dormitory':'宿舍管理', 'mod.cleaning':'清潔管理',
      'mod.keymovement':'鑰匙管理', 'mod.ehs':'EHS 環境', 'mod.waterdrum':'水桶管理',
      'mod.temperature':'溫度記錄',
      // Platform
      'platform':'AC GASCHECK 平台', 'vrt':'Vantage River Textiles · SHV',
      'tg.menu':'Telegram 選單', 'log':'操作紀錄',
    },
    en: {
      'nav.portal':'← Portal', 'nav.home':'Home',
      'nav.cloud':'☁ Cloud', 'nav.sync':'Sync',
      'cloud.ok':'Cloud Connected', 'cloud.err':'Connection Failed', 'cloud.not-set':'GAS Not Set',
      'cloud.tap':'Tap to Configure', 'cloud.uploading':'Uploading…', 'cloud.downloading':'Downloading…',
      'cloud.upload-ok':'✅ Upload Complete', 'cloud.download-ok':'✅ Download Complete',
      'cloud.upload-err':'❌ Upload Failed', 'cloud.download-err':'❌ Download Failed',
      'cloud.no-gas':'Please set GAS URL first',
      'date.day':'Day', 'date.week':'Week', 'date.month':'Month', 'date.year':'Year',
      'date.prev':'‹', 'date.next':'›', 'date.today':'Today',
      'btn.save':'Save', 'btn.delete':'Delete', 'btn.export':'Export Excel',
      'btn.import':'Import Excel', 'btn.print':'Print', 'btn.refresh':'Refresh',
      'btn.upload':'☁ Upload', 'btn.download':'⬇ Download', 'btn.tg':'Telegram',
      'btn.new':'Add New', 'btn.edit':'Edit', 'btn.cancel':'Cancel', 'btn.confirm':'Confirm',
      'status.pending':'Pending', 'status.approved':'Approved', 'status.rejected':'Rejected',
      'status.active':'Active', 'status.inactive':'Inactive',
      'no-rec':'No records found', 'loading':'Loading…', 'all':'All',
      'search':'Search', 'filter':'Filter', 'reset':'Reset',
      'mod.asset':'Asset Mgmt', 'mod.dormitory':'Dormitory', 'mod.cleaning':'Cleaning',
      'mod.keymovement':'Key Movement', 'mod.ehs':'EHS', 'mod.waterdrum':'Water Drum',
      'mod.temperature':'Temperature',
      'platform':'AC GASCHECK Platform', 'vrt':'Vantage River Textiles · SHV',
      'tg.menu':'Telegram Menu', 'log':'Activity Log',
    },
    km: {
      'nav.portal':'← វេទិកា', 'nav.home':'ផ្ទះ',
      'nav.cloud':'☁ Cloud', 'nav.sync':'Sync',
      'cloud.ok':'ភ្ជាប់ Cloud', 'cloud.err':'ការភ្ជាប់បរាជ័យ', 'cloud.not-set':'GAS មិនទាន់',
      'cloud.tap':'ចុចដើម្បីកំណត់', 'cloud.uploading':'កំពុងផ្ទុក…', 'cloud.downloading':'កំពុងទាញ…',
      'cloud.upload-ok':'✅ ផ្ទុករួច', 'cloud.download-ok':'✅ ទាញរួច',
      'cloud.upload-err':'❌ ផ្ទុកបរាជ័យ', 'cloud.download-err':'❌ ទាញបរាជ័យ',
      'cloud.no-gas':'សូមកំណត់ GAS URL ជាមុន',
      'date.day':'ថ្ងៃ', 'date.week':'សប្តាហ៍', 'date.month':'ខែ', 'date.year':'ឆ្នាំ',
      'date.prev':'‹', 'date.next':'›', 'date.today':'ថ្ងៃនេះ',
      'btn.save':'រក្សា', 'btn.delete':'លុប', 'btn.export':'Excel',
      'btn.import':'នាំចូល', 'btn.print':'បោះពុម្ព', 'btn.refresh':'ផ្ទុកឡើងវិញ',
      'btn.upload':'☁ ផ្ទុក', 'btn.download':'⬇ ទាញ', 'btn.tg':'Telegram',
      'btn.new':'បន្ថែម', 'btn.edit':'កែ', 'btn.cancel':'បោះបង់', 'btn.confirm':'យល់ព្រម',
      'status.pending':'រង់ចាំ', 'status.approved':'យល់ព្រម', 'status.rejected':'បដិសេធ',
      'status.active':'ប្រើ', 'status.inactive':'ឈប់',
      'no-rec':'រកមិនឃើញ', 'loading':'…', 'all':'ទាំងអស់',
      'search':'ស្វែងរក', 'filter':'ច្រោះ', 'reset':'កំណត់ឡើងវិញ',
      'mod.asset':'ទ្រព្យ', 'mod.dormitory':'ផ្ទះ', 'mod.cleaning':'ការសំអាត',
      'mod.keymovement':'សោ', 'mod.ehs':'EHS', 'mod.waterdrum':'ធុងទឹក',
      'mod.temperature':'សីតុណ្ហភាព',
      'platform':' វេទិកា AC GASCHECK', 'vrt':'Vantage River Textiles · SHV',
      'tg.menu':'Telegram', 'log':'កំណត់ហេតុ',
    },
  };

  let _dict = { zh: { ..._base.zh }, en: { ..._base.en }, km: { ..._base.km } };

  const t = k => (_dict[_lang] || _dict.zh)[k] || (_dict.zh)[k] || k;
  const getLang = () => _lang;

  const setLang = l => {
    _lang = l;
    if (typeof AC_CFG !== 'undefined') AC_CFG.setLang(l);
    else localStorage.setItem('ac_gascheck_lang', l);
    // Update all lang buttons on page
    document.querySelectorAll('[data-ac-lang]').forEach(b =>
      b.classList.toggle('on', b.dataset.acLang === l)
    );
    // Update all data-i elements
    document.querySelectorAll('[data-i]').forEach(el => {
      const k = el.getAttribute('data-i');
      const v = t(k);
      if (v !== k) el.textContent = v;
    });
    // Dispatch event so modules can respond
    window.dispatchEvent(new CustomEvent('ac:langchange', { detail: l }));
  };

  const extend = modDict => {
    ['zh','en','km'].forEach(l => {
      if (modDict[l]) Object.assign(_dict[l], modDict[l]);
    });
  };

  // Apply lang on DOM ready
  const applyAll = () => {
    document.querySelectorAll('[data-i]').forEach(el => {
      const k = el.getAttribute('data-i'); const v = t(k); if(v!==k) el.textContent = v;
    });
  };

  return { t, getLang, setLang, extend, applyAll };
})();
