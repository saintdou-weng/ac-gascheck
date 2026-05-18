/**
 * AC_GASCHECK Platform — Shared Date Engine
 * Provides Day/Week/Month/Year with prev/next navigation
 * Usage: AC_DATE.setPeriod('month') | AC_DATE.getRange() | AC_DATE.prev() | AC_DATE.next()
 */
const AC_DATE = (() => {
  let _period = 'month';
  let _anchor  = new Date(); // anchor date for navigation

  const fmt = d => {
    const dd = new Date(d);
    return [dd.getFullYear(), String(dd.getMonth()+1).padStart(2,'0'), String(dd.getDate()).padStart(2,'0')].join('-');
  };
  const fmtMonth = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  const fmtYear  = d => String(d.getFullYear());

  const startOf = (period, date) => {
    const d = new Date(date);
    if (period === 'day')   return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (period === 'week')  { const wd=d.getDay(); return new Date(d.getFullYear(),d.getMonth(),d.getDate()-wd); }
    if (period === 'month') return new Date(d.getFullYear(), d.getMonth(), 1);
    if (period === 'year')  return new Date(d.getFullYear(), 0, 1);
    return d;
  };
  const endOf = (period, date) => {
    const d = new Date(date);
    if (period === 'day')   return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
    if (period === 'week')  { const wd=d.getDay(); return new Date(d.getFullYear(),d.getMonth(),d.getDate()+(6-wd)); }
    if (period === 'month') return new Date(d.getFullYear(), d.getMonth()+1, 0);
    if (period === 'year')  return new Date(d.getFullYear(), 11, 31);
    return d;
  };

  const getRange = () => {
    const from = startOf(_period, _anchor);
    const to   = endOf(_period, _anchor);
    // Also check for manual override from date inputs
    const fi = document.getElementById('ac-date-from');
    const ti = document.getElementById('ac-date-to');
    if (fi && fi.value && ti && ti.value) return { from: fi.value, to: ti.value };
    return { from: fmt(from), to: fmt(to) };
  };

  const getLabel = () => {
    if (_period === 'day')   return fmt(_anchor);
    if (_period === 'week')  return `${fmt(startOf('week',_anchor))} ~ ${fmt(endOf('week',_anchor))}`;
    if (_period === 'month') return fmtMonth(_anchor);
    if (_period === 'year')  return fmtYear(_anchor);
    return '';
  };

  const setPeriod = (p, el) => {
    _period = p;
    _anchor = new Date();
    if (el) {
      document.querySelectorAll('[data-ac-period]').forEach(b => b.classList.remove('on'));
      el.classList.add('on');
    }
    _syncInputs();
    _dispatch();
  };

  const prev = () => {
    if (_period === 'day')   _anchor.setDate(_anchor.getDate()-1);
    if (_period === 'week')  _anchor.setDate(_anchor.getDate()-7);
    if (_period === 'month') _anchor.setMonth(_anchor.getMonth()-1);
    if (_period === 'year')  _anchor.setFullYear(_anchor.getFullYear()-1);
    _syncInputs(); _dispatch();
  };

  const next = () => {
    if (_period === 'day')   _anchor.setDate(_anchor.getDate()+1);
    if (_period === 'week')  _anchor.setDate(_anchor.getDate()+7);
    if (_period === 'month') _anchor.setMonth(_anchor.getMonth()+1);
    if (_period === 'year')  _anchor.setFullYear(_anchor.getFullYear()+1);
    _syncInputs(); _dispatch();
  };

  const today = () => { _anchor = new Date(); _syncInputs(); _dispatch(); };

  const _syncInputs = () => {
    const r  = getRange();
    const fi = document.getElementById('ac-date-from');
    const ti = document.getElementById('ac-date-to');
    const lb = document.getElementById('ac-date-label');
    if (fi) fi.value = r.from;
    if (ti) ti.value = r.to;
    if (lb) lb.textContent = getLabel();
  };

  const _dispatch = () => window.dispatchEvent(new CustomEvent('ac:datechange', { detail: getRange() }));

  const inRange = (dateStr, range) => {
    if (!dateStr) return false;
    const d = dateStr.split('T')[0];
    return d >= range.from && d <= range.to;
  };

  // Render standard date bar into a container element
  const renderBar = (containerId) => {
    const el = document.getElementById(containerId);
    if (!el) return;
    const t = typeof AC_I18N !== 'undefined' ? k => AC_I18N.t(k) : k => k;
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <div style="display:flex;background:var(--bg,#f4f6fb);border-radius:7px;padding:2px;gap:1px">
          ${['day','week','month','year'].map(p => `
            <button data-ac-period="${p}" onclick="AC_DATE.setPeriod('${p}',this)"
              style="padding:5px 10px;border-radius:5px;font-size:10px;font-weight:600;border:none;cursor:pointer;background:transparent;color:var(--text2,#556080);font-family:inherit;transition:.2s"
              class="${_period===p?'on':''}">${t('date.'+p)}</button>`).join('')}
        </div>
        <button onclick="AC_DATE.prev()" style="padding:5px 9px;border:1px solid var(--border,#e4e8f0);border-radius:6px;background:#fff;cursor:pointer;font-size:13px">‹</button>
        <span id="ac-date-label" style="font-size:11px;font-weight:600;min-width:80px;text-align:center">${getLabel()}</span>
        <button onclick="AC_DATE.next()" style="padding:5px 9px;border:1px solid var(--border,#e4e8f0);border-radius:6px;background:#fff;cursor:pointer;font-size:13px">›</button>
        <button onclick="AC_DATE.today()" style="padding:5px 9px;border:1px solid var(--border,#e4e8f0);border-radius:6px;background:#fff;cursor:pointer;font-size:11px;font-weight:600">${t('date.today')}</button>
        <input type="date" id="ac-date-from" value="${getRange().from}" onchange="window.dispatchEvent(new CustomEvent('ac:datechange',{detail:AC_DATE.getRange()}))" style="border:1px solid var(--border,#e4e8f0);border-radius:6px;padding:5px 7px;font-size:11px;font-family:inherit;outline:none;background:#fff">
        <input type="date" id="ac-date-to" value="${getRange().to}" onchange="window.dispatchEvent(new CustomEvent('ac:datechange',{detail:AC_DATE.getRange()}))" style="border:1px solid var(--border,#e4e8f0);border-radius:6px;padding:5px 7px;font-size:11px;font-family:inherit;outline:none;background:#fff">
      </div>`;
    // Style .on buttons
    el.querySelectorAll('[data-ac-period]').forEach(b =>
      b.style.cssText += b.classList.contains('on') ? ';background:var(--p,#4f6ef7);color:#fff' : ''
    );
  };

  return { setPeriod, getRange, getLabel, prev, next, today, inRange, renderBar, fmt };
})();
