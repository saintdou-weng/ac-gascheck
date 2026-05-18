/**
 * AC_GASCHECK Platform — Shared Cloud (GAS) Sync
 * Usage: AC_CLOUD.push(tool,records) | AC_CLOUD.pull(tool) | AC_CLOUD.status()
 */
const AC_CLOUD = (() => {
  const getGasUrl = () =>
    (typeof AC_CFG!=='undefined' ? AC_CFG.get().gasUrl : null) ||
    localStorage.getItem('ac_gascheck_gas_url') || '';

  const _setDot = (state) => {
    document.querySelectorAll('[data-ac-cloud-dot]').forEach(el => {
      el.className = el.className.replace(/\b(ok|err|syncing)\b/g,'').trim();
      if (state) el.classList.add(state);
    });
  };
  const _setLabel = (msg) => {
    document.querySelectorAll('[data-ac-cloud-label]').forEach(el => el.textContent = msg);
  };
  const _setTs = (msg) => {
    document.querySelectorAll('[data-ac-cloud-ts]').forEach(el => el.textContent = msg);
  };
  const _toast = (msg, dur=3200) => {
    const el = document.getElementById('toast') || document.getElementById('ac-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._act);
    el._act = setTimeout(() => el.classList.remove('show'), dur);
  };
  const _log = (msg, type) => {
    const el = document.getElementById('ac-log') || document.getElementById('logWrap');
    if (!el) return;
    const now = new Date();
    const ts  = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const cls = type==='ok'?'ll-ok':type==='err'?'ll-err':'ll-info';
    el.innerHTML += `\n<span class="${cls}">[${ts}] ${msg}</span>`;
    el.scrollTop = el.scrollHeight;
  };

  const gasPost = async (payload) => {
    const url = getGasUrl();
    if (!url) throw new Error('GAS URL 未設定');
    _setDot('syncing');
    try {
      const body = new URLSearchParams({ payload: JSON.stringify(payload) });
      const res  = await fetch(url, { method:'POST', body, redirect:'follow', headers:{'Content-Type':'application/x-www-form-urlencoded'} });
      const data = await res.json();
      _setDot(data.ok !== false ? 'ok' : 'err');
      return data;
    } catch(e) {
      _setDot('err'); throw e;
    }
  };

  const gasGet = async (params) => {
    const url = getGasUrl();
    if (!url) throw new Error('GAS URL 未設定');
    _setDot('syncing');
    try {
      const qs   = new URLSearchParams({ ...params, _t: Date.now() }).toString();
      const res  = await fetch(url + '?' + qs, { redirect:'follow' });
      const data = await res.json();
      _setDot(data.ok !== false ? 'ok' : 'err');
      return data;
    } catch(e) {
      _setDot('err'); throw e;
    }
  };

  const push = async (tool, records) => {
    const url = getGasUrl();
    const t = typeof AC_I18N !== 'undefined' ? k => AC_I18N.t(k) : k => k;
    if (!url) { _toast(t('cloud.no-gas')); return false; }
    _toast(t('cloud.uploading'));
    _setLabel(t('cloud.uploading'));
    try {
      const d = await gasPost({ action:'push', tool, records, recordCount: records.length, updatedAt: new Date().toISOString() });
      if (d.ok !== false) {
        const msg = `${t('cloud.upload-ok')} (${records.length})`;
        _toast(msg); _setLabel(t('cloud.ok')); _setTs(fmtNow()); _log(`✓ push:${tool} ${records.length}筆`, 'ok');
        if (typeof AC_CFG !== 'undefined') AC_CFG.setMeta({ lastPush: new Date().toISOString(), lastTool: tool });
        return true;
      } else {
        _toast(t('cloud.upload-err') + ': ' + (d.error||'')); _setLabel(t('cloud.err')); return false;
      }
    } catch(e) {
      _toast(t('cloud.upload-err') + ': ' + e.message); _setLabel(t('cloud.err')); _log(`✗ push:${tool} ${e.message}`, 'err'); return false;
    }
  };

  const pull = async (tool) => {
    const url = getGasUrl();
    const t = typeof AC_I18N !== 'undefined' ? k => AC_I18N.t(k) : k => k;
    if (!url) { _toast(t('cloud.no-gas')); return null; }
    _toast(t('cloud.downloading'));
    _setLabel(t('cloud.downloading'));
    try {
      const d = await gasGet({ action:'pull', tool });
      if (d.ok !== false) {
        const records = d.records || d.data?.records || d.data || [];
        _toast(`${t('cloud.download-ok')} (${Array.isArray(records)?records.length:0})`);
        _setLabel(t('cloud.ok')); _setTs(fmtNow()); _log(`✓ pull:${tool} ${Array.isArray(records)?records.length:0}筆`, 'ok');
        if (typeof AC_CFG !== 'undefined') AC_CFG.setMeta({ lastPull: new Date().toISOString() });
        return records;
      } else {
        _toast(t('cloud.download-err') + ': ' + (d.error||'')); _setLabel(t('cloud.err')); return null;
      }
    } catch(e) {
      _toast(t('cloud.download-err') + ': ' + e.message); _setLabel(t('cloud.err')); _log(`✗ pull:${tool} ${e.message}`, 'err'); return null;
    }
  };

  const status = async () => {
    const url = getGasUrl();
    if (!url) { updateBar(false); return null; }
    try {
      const d = await gasGet({ action:'status' });
      updateBar(d.ok !== false);
      return d;
    } catch(e) { updateBar(false); return null; }
  };

  const updateBar = (ok) => {
    const t = typeof AC_I18N !== 'undefined' ? k => AC_I18N.t(k) : k => k;
    const url = getGasUrl();
    if (!url) {
      _setDot(''); _setLabel(t('cloud.not-set')); _setTs(t('cloud.tap')); return;
    }
    if (ok === false) {
      _setDot('err'); _setLabel(t('cloud.err')); return;
    }
    _setDot('ok');
    _setLabel(t('cloud.ok'));
    const meta = typeof AC_CFG !== 'undefined' ? AC_CFG.get().meta : {};
    const ts   = meta.lastPush || meta.lastPull;
    _setTs(ts ? fmtNow(new Date(ts)) : t('cloud.tap'));
  };

  const fmtNow = (d = new Date()) => {
    const p = n => String(n).padStart(2,'0');
    return `${p(d.getMonth()+1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  // Render cloud action bar (upload + download + status dot)
  const renderBar = (containerId, { tool, lsKey, getLocalFn }) => {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = `
      <div data-ac-cloud-bar style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11px">
        <div data-ac-cloud-dot class="c-dot" style="width:8px;height:8px;border-radius:50%;background:#94a3b8;flex-shrink:0;transition:.3s"></div>
        <span data-ac-cloud-label style="font-weight:600;color:rgba(255,255,255,.8)">GAS 未設定</span>
        <span data-ac-cloud-ts style="margin-left:auto;font-family:monospace;font-size:10px;color:rgba(255,255,255,.45)">—</span>
        <button onclick="AC_CLOUD._doUpload('${tool}','${lsKey}',${getLocalFn ? getLocalFn : 'null'})"
          style="background:rgba(34,197,94,.2);border:1px solid rgba(34,197,94,.3);color:#4ade80;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:10px;font-weight:700;font-family:inherit">☁ Upload</button>
        <button onclick="AC_CLOUD._doDownload('${tool}','${lsKey}')"
          style="background:rgba(59,130,246,.2);border:1px solid rgba(59,130,246,.3);color:#93c5fd;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:10px;font-weight:700;font-family:inherit">⬇ Download</button>
      </div>`;
    setTimeout(() => updateBar(), 400);
  };

  const _doUpload = async (tool, lsKey, getLocalFn) => {
    let records = [];
    try {
      if (typeof getLocalFn === 'function') { records = getLocalFn(); }
      else {
        const raw = localStorage.getItem(lsKey);
        const d   = raw ? JSON.parse(raw) : null;
        if (!d) { _toast('無本地資料'); return; }
        records = Array.isArray(d) ? d : d.records || Object.values(d).filter(Array.isArray).flat();
      }
    } catch(e) { _toast('讀取資料失敗: ' + e.message); return; }
    await push(tool, records);
  };

  const _doDownload = async (tool, lsKey) => {
    const records = await pull(tool);
    if (!records) return;
    if (Array.isArray(records) && records.length) {
      localStorage.setItem(lsKey, JSON.stringify(records));
      window.dispatchEvent(new CustomEvent('ac:cloudpull', { detail: { tool, records } }));
    }
  };

  return { push, pull, status, updateBar, gasPost, gasGet, renderBar, _doUpload, _doDownload };
})();
