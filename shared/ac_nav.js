/**
 * AC_GASCHECK — Shared Navigation Bar
 * Inject into any module: AC_NAV.inject(moduleId, pushFn, pullFn)
 */
const AC_NAV = (() => {
  const PORTAL_URL = './ac_gascheck_portal_v1.html';

  const inject = (moduleId, opts = {}) => {
    const cfg  = typeof AC_CFG !== 'undefined' ? AC_CFG.get() : {};
    const mods = typeof AC_CFG !== 'undefined' ? AC_CFG.MODULES : [];
    const mod  = mods.find(m => m.id === moduleId) || {};
    const lang = cfg.lang || 'zh';

    const navHtml = `
<nav class="ac-nav" id="ac-nav">
  <a href="${PORTAL_URL}" class="ac-nav-back">← 平台</a>
  <div class="ac-nav-title">${mod.icon||'📋'} ${mod.zhName||moduleId}</div>
  <div class="ac-nav-badge">AC-GASCHECK</div>
  <div class="ac-cloud-mini" onclick="AC_NAV.togglePanel()" title="Cloud Sync">
    <div class="c-dot" data-ac-cloud-dot></div>
    <span data-ac-cloud-label style="font-size:10px;color:rgba(255,255,255,.6)">—</span>
  </div>
  <div class="ac-lang">
    <button data-ac-lang="zh" class="${lang==='zh'?'on':''}" onclick="AC_NAV.setLang('zh')">中</button>
    <button data-ac-lang="en" class="${lang==='en'?'on':''}" onclick="AC_NAV.setLang('en')">EN</button>
    <button data-ac-lang="km" class="${lang==='km'?'on':''}" onclick="AC_NAV.setLang('km')">ក</button>
  </div>
</nav>

<div class="ac-cloud-panel" id="ac-cloud-panel">
  <div class="ac-cp-lbl">GAS Web App URL</div>
  <input id="ac-gas-input" type="text" placeholder="https://script.google.com/macros/s/…/exec" value="${cfg.gasUrl||''}">
  <div class="ac-cp-row">
    <button class="ac-cp-btn ac-cp-save" onclick="AC_NAV.saveGas()">💾 儲存</button>
    <button class="ac-cp-btn ac-cp-push" id="ac-btn-push" onclick="AC_NAV._push()" ${cfg.gasUrl?'':'disabled'}>☁ Push</button>
    <button class="ac-cp-btn ac-cp-pull" id="ac-btn-pull" onclick="AC_NAV._pull()" ${cfg.gasUrl?'':'disabled'}>⬇ Pull</button>
    <button class="ac-cp-btn ac-cp-tg" onclick="AC_TG.sendMenu()">📱 TG</button>
  </div>
  <div class="ac-cp-row" style="margin-top:5px">
    <button class="ac-cp-btn" style="background:rgba(245,158,11,.25);color:#fbbf24;border:1px solid rgba(245,158,11,.3)" onclick="AC_TG.fixWebhook()">🔧 Webhook</button>
    <button class="ac-cp-btn" style="background:rgba(139,92,246,.25);color:#c4b5fd;border:1px solid rgba(139,92,246,.3)" onclick="AC_TG.checkWebhook()">🔍 Check</button>
    <button class="ac-cp-btn" style="background:rgba(255,255,255,.08);color:rgba(255,255,255,.6);border:1px solid rgba(255,255,255,.1)" onclick="AC_NAV.toggleLog()">📝 Log</button>
  </div>
  <div id="ac-log" class="log-wrap" style="background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:7px;font-size:10px;font-family:monospace;color:rgba(255,255,255,.35);max-height:70px;overflow-y:auto;margin-top:6px;display:none">
    <span class="ll-info">AC GASCHECK v1 就緒 · ${mod.zhName||moduleId}</span>
  </div>
</div>

<div id="ac-toast"></div>`;

    // Insert before body first child
    document.body.insertAdjacentHTML('afterbegin', navHtml);
    // Store module opts
    AC_NAV._opts = opts;
    AC_NAV._moduleId = moduleId;
    AC_NAV._lsKey = mod.lsKey || '';
    // Update cloud bar
    setTimeout(() => {
      if (typeof AC_CLOUD !== 'undefined') AC_CLOUD.updateBar();
    }, 300);
  };

  const setLang = (l) => {
    if (typeof AC_I18N !== 'undefined') AC_I18N.setLang(l);
    else {
      document.querySelectorAll('[data-ac-lang]').forEach(b => b.classList.toggle('on', b.dataset.acLang===l));
      localStorage.setItem('ac_gascheck_lang', l);
    }
    if (typeof AC_CFG !== 'undefined') AC_CFG.setLang(l);
  };

  const togglePanel = () => {
    document.getElementById('ac-cloud-panel')?.classList.toggle('open');
    if (typeof AC_CLOUD !== 'undefined') AC_CLOUD.updateBar();
  };

  const saveGas = () => {
    const url = document.getElementById('ac-gas-input')?.value.trim();
    if (!url) return;
    if (typeof AC_CFG !== 'undefined') AC_CFG.setGasUrl(url);
    else localStorage.setItem('ac_gascheck_gas_url', url);
    const pb = document.getElementById('ac-btn-push');
    const plb = document.getElementById('ac-btn-pull');
    if (pb) pb.disabled = false;
    if (plb) plb.disabled = false;
    if (typeof AC_CLOUD !== 'undefined') { AC_CLOUD.updateBar(); setTimeout(() => AC_CLOUD.status(), 500); }
    _toast('✅ GAS 已儲存');
  };

  const _push = async () => {
    const opts = AC_NAV._opts;
    let records = [];
    if (typeof opts.getRecords === 'function') { records = opts.getRecords(); }
    else if (AC_NAV._lsKey) {
      try {
        const raw = localStorage.getItem(AC_NAV._lsKey);
        const d   = raw ? JSON.parse(raw) : null;
        if (!d) { _toast('無本地資料'); return; }
        records = Array.isArray(d) ? d : d.records || Object.values(d).filter(Array.isArray).flat();
      } catch(e) { _toast('讀取失敗: '+e.message); return; }
    }
    if (typeof AC_CLOUD !== 'undefined') await AC_CLOUD.push(AC_NAV._moduleId, records);
  };

  const _pull = async () => {
    if (typeof AC_CLOUD !== 'undefined') {
      const records = await AC_CLOUD.pull(AC_NAV._moduleId);
      if (records && AC_NAV._lsKey) {
        localStorage.setItem(AC_NAV._lsKey, JSON.stringify(records));
        window.dispatchEvent(new CustomEvent('ac:cloudpull', { detail: { tool: AC_NAV._moduleId, records } }));
      }
      const opts = AC_NAV._opts;
      if (records && typeof opts.onPull === 'function') opts.onPull(records);
    }
  };

  const toggleLog = () => {
    document.getElementById('ac-log')?.classList.toggle('show');
  };

  const _toast = (msg) => {
    const el = document.getElementById('ac-toast');
    if (!el) return;
    el.textContent = msg; el.classList.add('show');
    clearTimeout(el._act); el._act = setTimeout(() => el.classList.remove('show'), 3200);
  };

  return { inject, setLang, togglePanel, saveGas, _push, _pull, toggleLog, _opts:{}, _moduleId:'', _lsKey:'' };
})();
