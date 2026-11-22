/* ui-motion.js — 共用介面動效（2026-11-22 Paul 指定 5 項規格；GASCheck 與 AC-GA-EXP 共用同一份）
 * 1 懸停回饋：按鈕上移 2px、陰影加深、底色加深 8%、150ms ease-out、手型游標（只在有滑鼠的裝置）
 * 2 游標聚光燈：深色底的卡片網格（目前：GASCheck 平台首頁模組格），半徑 240px、15% 光圈，並照亮範圍內卡片邊框
 * 3 3D 傾斜：重點卡片（平台首頁模組卡、GA-EXP 首頁模組卡），最大 8°、透視 1000px、放大 1.02、離開 300ms 復位
 * 4 導覽列吸頂：只處理「原本就吸頂」的頁首；捲動超過 80px 時收合高度、半透明（淺色頁首→白、深色頁首→深色）、12px 毛玻璃、細陰影、200ms
 * 5 回到頂部：捲動超過一屏後右下角淡入 48px 圓鈕（會自動避開頁面原有的浮動按鈕），點擊 500ms 平滑回頂，到頂淡出
 * 安全原則：
 *  - 按鈕上移用 CSS 的 translate 屬性（不是 transform），不會蓋掉按鈕原本的 transform；卡片有原本的 transform 就不做傾斜
 *  - 卡片（data-ui-card）不套用按鈕懸停規則，避免與傾斜放大衝突
 *  - 分段切換鈕、分頁列、表格內的小按鈕、停用的按鈕不上移
 *  - 觸控手機不做 1–3（沒有滑鼠懸停）；系統設定「減少動態效果」時關閉動畫
 *  - 滑鼠追蹤與捲動都用 requestAnimationFrame 節流
 */
(function () {
  'use strict';
  if (window.UIMotion) return;
  var fine = window.matchMedia && matchMedia('(hover:hover) and (pointer:fine)').matches;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SKIP_PARENTS = '.ptoggle,.tg,.pc-tabs,.gc-period,.seg,.segmented,[role=tablist],.tabs,.tab-bar,#page-tabs,.ptab,table,.sw,.wview-bar,.gcpt';
  var SPOT_GRIDS = ['.mod-grid'];
  var TILT_CARDS = ['.mod-grid > .mb', '.mod-grid > a', 'body > main .grid > a.card', '.grid > a.card'];
  var STICKY = ['.ga-hd', '.topbar', '.hd', '.hdr', '.header', '.exp-nav', 'body > header', 'header.plat'];

  /* ---------- CSS ---------- */
  var css = '' +
    '@media (hover:hover) and (pointer:fine){' +
    'button:not(:disabled):not(.ui-nomo):not([data-ui-card]),.btn:not(:disabled):not(.ui-nomo),[role=button]:not([aria-disabled=true]):not(.ui-nomo):not([data-ui-card]){cursor:pointer;transition-property:translate,box-shadow,background-color,color,border-color,opacity;transition-duration:150ms;transition-timing-function:ease-out}' +
    'button.ui-hov:hover,.btn.ui-hov:hover,[role=button].ui-hov:hover{translate:0 -2px;box-shadow:inset 0 0 0 999px rgba(0,0,0,.08),0 6px 14px rgba(15,23,42,.18)}' +
    '}' +
    /* 2 聚光燈 */
    '.ui-spot{position:relative;isolation:isolate}' +
    '.ui-spot::before{content:"";position:absolute;inset:-180px;pointer-events:none;z-index:0;opacity:var(--ui-on,0);transition:opacity .25s ease-out;background:radial-gradient(240px circle at var(--ui-mx,50%) var(--ui-my,50%),rgba(255,255,255,.15),transparent 70%)}' +
    '.ui-spot>*{position:relative;z-index:1}' +
    '.ui-glow{position:absolute;inset:0;border-radius:inherit;pointer-events:none;padding:1px;z-index:3;opacity:var(--ui-on,0);transition:opacity .25s ease-out;' +
    'background:radial-gradient(240px circle at var(--ui-cx,-999px) var(--ui-cy,-999px),rgba(255,255,255,.75),rgba(255,255,255,.12) 45%,transparent 70%);' +
    '-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}' +
    /* 3 傾斜 */
    '[data-ui-card]{will-change:transform;transform-style:preserve-3d}' +
    '[data-ui-card].ui-tilt-out{transition:transform 300ms ease-out !important}' +
    /* 4 吸頂 */
    '.ui-sticky{transition:padding 200ms ease-out,min-height 200ms ease-out,height 200ms ease-out,background-color 200ms ease-out,box-shadow 200ms ease-out,backdrop-filter 200ms ease-out}' +
    '.ui-sticky.ui-scrolled{backdrop-filter:blur(12px) saturate(1.3);-webkit-backdrop-filter:blur(12px) saturate(1.3);box-shadow:0 2px 12px rgba(15,23,42,.12) !important}' +
    '.ui-sticky.ui-scrolled.ui-light{background:rgba(255,255,255,.82) !important}' +
    '.ui-sticky.ui-scrolled.ui-dark{background:var(--ui-dark-bg,rgba(15,23,42,.82)) !important}' +
    /* 5 回頂 */
    '#ui-top{position:fixed;right:24px;bottom:24px;width:48px;height:48px;border-radius:50%;border:none;cursor:pointer;z-index:8990;background:var(--gc-hdr,#1e293b);color:#fff;font-size:20px;line-height:48px;text-align:center;box-shadow:0 6px 18px rgba(15,23,42,.28);opacity:0;pointer-events:none;translate:0 8px;transition:opacity 200ms ease-out,translate 200ms ease-out,box-shadow 150ms ease-out}' +
    '#ui-top.on{opacity:.92;pointer-events:auto;translate:0 0}' +
    '@media (hover:hover) and (pointer:fine){#ui-top.on:hover{translate:0 -3px;opacity:1;box-shadow:0 10px 22px rgba(15,23,42,.32)}}' +
    '@media (prefers-reduced-motion: reduce){button.ui-hov:hover,.btn.ui-hov:hover{translate:none}.ui-sticky,#ui-top{transition:none}}';
  function addCss() { if (document.getElementById('ui-motion-css')) return; var s = document.createElement('style'); s.id = 'ui-motion-css'; s.textContent = css; (document.head || document.documentElement).appendChild(s); }

  /* ---------- 1 懸停：標記可安全上移的按鈕 ---------- */
  function markButtons(root) {
    if (!fine) return;
    var list = (root || document).querySelectorAll('button:not(.ui-hov),.btn:not(.ui-hov),[role=button]:not(.ui-hov)');
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (b.hasAttribute('data-ui-card') || b.classList.contains('ui-nomo') || b.id === 'ui-top') continue;
      if (b.closest(SKIP_PARENTS)) { b.classList.add('ui-nomo'); continue; }
      var cs = getComputedStyle(b);
      if (cs.position === 'fixed' || (cs.translate && cs.translate !== 'none')) continue; /* 浮動鈕與已用 translate 的不動 */
      b.classList.add('ui-hov');
    }
  }

  /* ---------- 2 聚光燈 ---------- */
  function lum(c) { var m = String(c).match(/[\d.]+/g); if (!m || m.length < 3) return 1; if (m.length > 3 && +m[3] < 0.05) return -1; return (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255; }
  function darkBehind(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentElement) {
      var cs = getComputedStyle(e), L = lum(cs.backgroundColor);
      if (L >= 0) return L < 0.4;
      if (cs.backgroundImage && /gradient/.test(cs.backgroundImage)) { var m = cs.backgroundImage.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}/i); if (m) { var c = m[0]; if (c[0] === '#') { var h = c.length === 4 ? c.replace(/#(.)(.)(.)/, '#$1$1$2$2$3$3') : c; c = 'rgb(' + parseInt(h.slice(1, 3), 16) + ',' + parseInt(h.slice(3, 5), 16) + ',' + parseInt(h.slice(5, 7), 16) + ')'; } return lum(c) < 0.4; } }
    }
    return false;
  }
  var spots = [];
  function setupSpots() {
    if (!fine || reduce) return;
    SPOT_GRIDS.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (g) {
        if (g.classList.contains('ui-spot') || !darkBehind(g)) return;
        var gr = g.getBoundingClientRect(); if (gr.left < 190 || gr.right > window.innerWidth - 190) return; /* 光圈外擴 180px，空間不夠就不做，避免出現橫向捲軸 */
        g.classList.add('ui-spot'); spots.push(g);
        Array.prototype.forEach.call(g.children, function (c) { if (getComputedStyle(c).position === 'static') c.style.position = 'relative'; var gl = document.createElement('span'); gl.className = 'ui-glow'; gl.setAttribute('aria-hidden', 'true'); c.appendChild(gl); });
        g.addEventListener('pointerenter', function () { g.style.setProperty('--ui-on', '1'); Array.prototype.forEach.call(g.querySelectorAll('.ui-glow'), function (x) { x.style.setProperty('--ui-on', '1'); }); });
        g.addEventListener('pointerleave', function () { g.style.setProperty('--ui-on', '0'); Array.prototype.forEach.call(g.querySelectorAll('.ui-glow'), function (x) { x.style.setProperty('--ui-on', '0'); }); });
      });
    });
  }
  /* ---------- 3 傾斜 ---------- */
  var tilts = [];
  function setupTilt() {
    if (!fine || reduce) return;
    TILT_CARDS.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (c) {
        if (c.hasAttribute('data-ui-card')) return;
        var t = getComputedStyle(c).transform; if (t && t !== 'none') return; /* 原本就有 transform 的卡片不動 */
        c.setAttribute('data-ui-card', '1'); tilts.push(c);
        c.addEventListener('pointerleave', function () { c.classList.add('ui-tilt-out'); c.style.transform = ''; setTimeout(function () { c.classList.remove('ui-tilt-out'); }, 320); });
      });
    });
  }
  /* 滑鼠：rAF 節流 */
  var mx = -1, my = -1, mTarget = null, mPending = false;
  function onMove(e) { mx = e.clientX; my = e.clientY; mTarget = e.target; if (!mPending) { mPending = true; requestAnimationFrame(frameMouse); } }
  function frameMouse() {
    mPending = false;
    spots.forEach(function (g) {
      var r = g.getBoundingClientRect(); if (mx < r.left - 60 || mx > r.right + 60 || my < r.top - 60 || my > r.bottom + 60) return;
      g.style.setProperty('--ui-mx', (mx - r.left + 180) + 'px'); g.style.setProperty('--ui-my', (my - r.top + 180) + 'px');
      Array.prototype.forEach.call(g.querySelectorAll('.ui-glow'), function (gl) { var cr = gl.getBoundingClientRect(); gl.style.setProperty('--ui-cx', (mx - cr.left) + 'px'); gl.style.setProperty('--ui-cy', (my - cr.top) + 'px'); });
    });
    var card = mTarget && mTarget.closest && mTarget.closest('[data-ui-card]');
    if (card) {
      var r = card.getBoundingClientRect(), px = (mx - r.left) / r.width - 0.5, py = (my - r.top) / r.height - 0.5;
      card.classList.remove('ui-tilt-out');
      card.style.transition = 'transform 80ms linear';
      card.style.transform = 'perspective(1000px) rotateX(' + (-py * 16).toFixed(2) + 'deg) rotateY(' + (px * 16).toFixed(2) + 'deg) scale(1.02)';
    }
  }

  /* ---------- 4 吸頂 ---------- */
  var stickies = [];
  function setupSticky() {
    var seen = [];
    STICKY.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (h) {
        if (seen.indexOf(h) >= 0 || h.classList.contains('ui-sticky')) return; seen.push(h);
        var cs = getComputedStyle(h);
        if (cs.position !== 'sticky' && cs.position !== 'fixed') return; /* 只處理原本就吸頂的，避免影響版面 */
        if (h.offsetHeight < 30 || h.offsetHeight > 220) return;
        var dark = darkBehindSelf(h);
        h.classList.add('ui-sticky', dark ? 'ui-dark' : 'ui-light');
        var hdr = getComputedStyle(document.documentElement).getPropertyValue('--gc-hdr').trim();
        if (dark) h.style.setProperty('--ui-dark-bg', hdr ? 'color-mix(in srgb,' + hdr + ' 84%,transparent)' : 'rgba(15,23,42,.82)');
        stickies.push({ el: h, pt: parseFloat(cs.paddingTop) || 0, pb: parseFloat(cs.paddingBottom) || 0, h: h.offsetHeight });
      });
    });
  }
  function darkBehindSelf(h) { var cs = getComputedStyle(h), L = lum(cs.backgroundColor); if (cs.backgroundImage && /gradient/.test(cs.backgroundImage)) return lum(cs.color) > 0.6; if (L < 0) return lum(cs.color) > 0.6; return L < 0.45; }
  var sPending = false, lastY = -1;
  function onScroll() { if (!sPending) { sPending = true; requestAnimationFrame(frameScroll); } }
  function frameScroll() {
    sPending = false; var y = window.scrollY || document.documentElement.scrollTop || 0; if (y === lastY) return; lastY = y;
    var was = document.querySelector('.ui-sticky.ui-scrolled') != null; var on = was ? y > 56 : y > 80; /* 上下緩衝，避免在 80px 附近閃動 */
    stickies.forEach(function (s) {
      if (s.el.classList.contains('ui-scrolled') === on) return;
      s.el.classList.toggle('ui-scrolled', on);
      /* 高度收合：依 80→64 的比例（收 20%）縮小上下內距（只動內距、不動內容），原本就很矮的頁首不壓縮 */
      if (on && s.h > 52) { var cut = Math.min(s.h * 0.2, Math.max(0, s.pt + s.pb - 6)), share = (s.pt + s.pb) ? s.pt / (s.pt + s.pb) : 0.5; s.el.style.paddingTop = (s.pt - cut * share) + 'px'; s.el.style.paddingBottom = (s.pb - cut * (1 - share)) + 'px'; }
      else { s.el.style.paddingTop = ''; s.el.style.paddingBottom = ''; }
    });
    var btn = document.getElementById('ui-top');
    if (btn) { var show = y > window.innerHeight; if (show && !btn.classList.contains('on')) placeTop(btn); btn.classList.toggle('on', show); }
  }

  /* ---------- 5 回到頂部 ---------- */
  function placeTop(btn) {
    /* 避開右下角原有的浮動按鈕（例如 📥🖼️、💡、匯入鈕） */
    var W = window.innerWidth, H = window.innerHeight, bottom = 24;
    var all = document.body.querySelectorAll('body *');
    for (var i = 0; i < all.length; i++) {
      var e = all[i]; if (e === btn || e.offsetWidth === 0) continue;
      var cs = getComputedStyle(e); if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      var r = e.getBoundingClientRect(); if (r.width > W * 0.6 || r.height > H * 0.5) continue;
      if (r.right > W - 90 && r.bottom > H - 220 && r.top < H) bottom = Math.max(bottom, H - r.top + 12);
    }
    btn.style.bottom = bottom + 'px';
  }
  function scrollTop500() {
    var y0 = window.scrollY || document.documentElement.scrollTop, t0 = performance.now(), d = reduce ? 1 : 500;
    function ease(t) { return 1 - Math.pow(1 - t, 3); }
    function step(now) { var p = Math.min(1, (now - t0) / d); window.scrollTo(0, Math.round(y0 * (1 - ease(p)))); if (p < 1) requestAnimationFrame(step); }
    requestAnimationFrame(step);
  }
  function setupTop() {
    if (document.getElementById('ui-top')) return;
    var b = document.createElement('button'); b.type = 'button'; b.id = 'ui-top'; b.textContent = '↑';
    b.setAttribute('aria-label', 'Back to top'); b.title = '回到頂部 / Back to top';
    b.addEventListener('click', scrollTop500);
    document.body.appendChild(b);
  }

  /* ---------- 啟動 ---------- */
  function boot() {
    addCss(); setupTop(); setupSticky(); setupSpots(); setupTilt(); markButtons();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function () { var b = document.getElementById('ui-top'); if (b && b.classList.contains('on')) placeTop(b); }, { passive: true });
    if (fine && !reduce) document.addEventListener('pointermove', onMove, { passive: true });
    frameScroll();
    /* 頁面會動態產生按鈕與卡片：稍後與每次 DOM 大變動後補標記（節流） */
    var mt = null;
    try { new MutationObserver(function () { if (mt) return; mt = setTimeout(function () { mt = null; markButtons(); setupSticky(); setupSpots(); setupTilt(); }, 400); }).observe(document.body, { childList: true, subtree: true }); } catch (e) {}
  }
  addCss();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 300); }); else setTimeout(boot, 300);
  window.UIMotion = { refresh: function () { markButtons(); setupSticky(); setupSpots(); setupTilt(); } };
})();
