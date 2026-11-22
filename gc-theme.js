/* gc-theme.js — GASCheck 共用背景色（2026-11-21 Paul：背景要淡色不是白色；可換色，或跟著 PSJGA 一起換）
 * 1. 預設「跟隨 PSJGA」：讀同網域 PSJGA 的設定 localStorage['vrt_ga_shell_v1_appearance'].colour，
 *    PSJGA 換色後，GASCheck 各頁重新整理（或切回分頁）就跟著換。
 * 2. 也可在這裡自己選色（存在 localStorage['gc_theme_v1']），選「跟隨 PSJGA」就取消自選。
 * 3. 色盤與 PSJGA 相同（6 淺色＋5 深色）。底色換成所選色；頁首與主色跟著換成同色系的深色；
 *    卡片維持白底（和 PSJGA 一樣），淺色主題卡片帶一點點所選色。
 */
(function () {
  'use strict';
  if (window.GCTheme) return;
  var PSJGA_KEY = 'vrt_ga_shell_v1_appearance', OWN_KEY = 'gc_theme_v1';
  /* [key, 底色, 中, 英, 柬, 頁首深色1, 頁首深色2, 主色, 是否深色] */
  var P = [
    ['white', '#f5f7fa', '白色', 'White', 'ស', '#1e293b', '#0f172a', '', 0],
    ['green', '#d3eadb', '淡綠', 'Light green', 'បៃតងខ្ចី', '#1f4d3a', '#143528', '#2d7a5a', 0],
    ['yellow', '#f0e4bc', '淡黃', 'Light yellow', 'លឿងខ្ចី', '#5b4716', '#3d2f0d', '#a8701a', 0],
    ['blue', '#cfe0f2', '淡藍', 'Light blue', 'ខៀវខ្ចី', '#1e3a5f', '#132840', '#2563eb', 0],
    ['pink', '#f0d4df', '粉紅', 'Pink', 'ផ្កាឈូក', '#5a2440', '#3d172b', '#be4b7a', 0],
    ['beige', '#e6daca', '米色', 'Beige', 'ពណ៌ក្រែម', '#4d3d2a', '#33281b', '#8a6a45', 0],
    ['navy', '#14253b', '海軍藍', 'Navy', 'ខៀវចាស់', '#0e1b2c', '#08111d', '#3b82f6', 1],
    ['forest', '#16312b', '墨綠', 'Forest', 'បៃតងចាស់', '#0f241f', '#0a1814', '#2d9c74', 1],
    ['black', '#191b1e', '黑色', 'Black', 'ខ្មៅ', '#0e0f11', '#050506', '#64748b', 1],
    ['wine', '#381920', '酒紅', 'Wine', 'ក្រហមចាស់', '#260f15', '#18090d', '#c2416b', 1],
    ['purple', '#281e3b', '紫色', 'Purple', 'ស្វាយ', '#1b1429', '#120d1c', '#7c5cd6', 1]
  ];
  var DEFAULT = 'green';
  function find(k) { for (var i = 0; i < P.length; i++) if (P[i][0] === k) return P[i]; return null; }
  function read(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function lang() {
    try { var l = (window.GC && GC.lang && GC.lang()) || localStorage.getItem('gc_lang') || document.documentElement.lang || 'zh'; return /km/.test(l) ? 'km' : (/en/.test(l) ? 'en' : 'zh'); } catch (e) { return 'zh'; }
  }
  function t(zh, en, km) { var l = lang(); return l === 'en' ? en : (l === 'km' ? km : zh); }
  /* 2026-11-23 Paul：GASCheck 的調色盤要跟其他平台一樣（可混色、可加壁紙），而且每個平台各設各的。
     → 顏色改由共用調色盤（PSJERP/music.js，設定存 'vrt_pal:ac-gascheck'）來管；這支檔只留「中性的底」：
       一般頁用白色那一組（顏色由共用調色盤蓋上去），入口頁（深色設計）的漸層跟著所選顏色走。
       共用調色盤還沒設定過（或 music.js 沒載到）時，照原本的方式運作，🎨 也照舊。 */
  var SHARED_KEY = 'vrt_pal:ac-gascheck';
  var SHARED_MAP = { green: 'green', yellow: 'yellow', blue: 'blue', pink: 'pink', beige: 'beige', navy: 'navy', dgreen: 'forest', dark: 'black', wine: 'wine', dpurple: 'purple' };
  var SHARED_HDR = { ivory: ['#5c4a1c', '#3d3112'], orange: ['#6b3a12', '#47260b'], purple: ['#3b2a63', '#281c45'], grey: ['#334155', '#1e293b'] };
  function shared() { var j = read(SHARED_KEY); return j && typeof j === 'object' ? j : null; }
  function choice() {
    var own = read(OWN_KEY);
    if (own && own.colour && own.colour !== 'psjga' && find(own.colour)) return { key: own.colour, follow: false };
    var g = read(PSJGA_KEY), k = g && g.colour && find(g.colour) ? g.colour : DEFAULT;
    return { key: k, follow: true, psjga: !!(g && g.colour) };
  }
  function mix(a, b, w) { /* a,b = #rrggbb；w = a 的比例 */
    function h(x) { return [parseInt(x.slice(1, 3), 16), parseInt(x.slice(3, 5), 16), parseInt(x.slice(5, 7), 16)]; }
    var A = h(a), B = h(b), o = '#';
    for (var i = 0; i < 3; i++) { var v = Math.round(A[i] * w + B[i] * (1 - w)); o += (v < 16 ? '0' : '') + v.toString(16); }
    return o;
  }
  var styleEl = null;
  function apply() {
    var c = choice(), p = find(c.key) || find(DEFAULT), root = document.documentElement;
    var sh = shared(), portalH = null;
    if (sh) {   /* 共用調色盤接手：這裡只給中性的底 */
      var mp = find(SHARED_MAP[sh.c] || '') , hx = SHARED_HDR[sh.c];
      portalH = mp ? [mp[5], mp[6]] : (hx || null);
      p = find('white');
    }
    var canvas = p[1], dark = !!p[8], h1 = p[5], h2 = p[6], acc = p[7];
    var soft = dark ? '#ffffff' : mix('#ffffff', canvas, 0.86), alt = dark ? '#f1f5f9' : mix('#ffffff', canvas, 0.6);
    root.setAttribute('data-gc-theme', p[0]);
    root.setAttribute('data-gc-tone', dark ? 'dark' : 'light');
    var s = root.style;
    /* 深色主題不改 --bg：有些頁面的輸入框底色用 --bg，改深色會看不到字；只換頁面底色 */
    if (dark) s.removeProperty('--bg'); else s.setProperty('--bg', canvas);
    s.setProperty('--gc-canvas', canvas);
    s.setProperty('--gc-hdr', h1); s.setProperty('--gc-hdr2', h2);
    s.setProperty('--hdr', h1); s.setProperty('--hdr2', h2);
    s.setProperty('--header', h1); s.setProperty('--nv', h1); s.setProperty('--nv2', h2);
    s.setProperty('--gc-soft', soft); s.setProperty('--gc-alt', alt);
    if (acc) {
      s.setProperty('--gc-acc', acc); s.setProperty('--acc', acc); s.setProperty('--acc2', mix(acc, '#000000', 0.8));
      s.setProperty('--abg', mix('#ffffff', acc, 0.88)); s.setProperty('--p', acc);
    } else {['--gc-acc', '--acc', '--acc2', '--abg', '--p'].forEach(function (v) { s.removeProperty(v); }); }
    if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = 'gc-theme-style'; (document.head || root).appendChild(styleEl); }
    styleEl.textContent =
      'html,body{background:' + canvas + ' !important}' +
      /* 平台首頁（portal）本來是深色設計：底色用所選色系的深色漸層，文字維持白色 */
      'html[data-gc-portal] body{background:linear-gradient(160deg,' + (portalH ? portalH[0] : h1) + ',' + (portalH ? portalH[1] : h2) + ') !important}' +
      /* 頁首：原本是深色頁首的頁面，換成所選色系的深色；白色頁首（資產、溫濕度）只換底線色 */
      '.topbar.gc-dark-hdr,.hd.gc-dark-hdr,header.gc-dark-hdr{background:linear-gradient(135deg,' + h1 + ',' + h2 + ') !important}' +
      '.topbar.gc-light-hdr,.hd.gc-light-hdr{border-bottom-color:' + (acc || h1) + ' !important}' +
      /* 淺色主題：區塊／卡片帶一點所選色；深色主題卡片維持白底 */
      (dark ? '' : 'html:not([data-gc-portal]) .sec,html:not([data-gc-portal]) .card,html:not([data-gc-portal]) .panel,html:not([data-gc-portal]) .box{background-color:' + soft + '}') +
      /* 深色主題：直接放在底色上的標題文字改白色 */
      (dark ? 'body>h1,body>h2,body>h3,.page-title,.sec-title-out{color:#f8fafc !important}' : '') +
      '#gc-theme-btn{border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.92);border-radius:10px;width:34px;height:34px;font-size:17px;line-height:1;cursor:pointer;flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.18)}' +
      '#gc-theme-btn.float{position:fixed;left:10px;bottom:14px;z-index:9000}' +
      '#gc-theme-ov{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10050;display:none;align-items:flex-start;justify-content:center;padding:70px 14px 14px}' +
      '#gc-theme-ov.open{display:flex}' +
      '#gc-theme-ov .box2{background:#fff;color:#0f172a;border-radius:18px;max-width:440px;width:100%;padding:18px 18px 16px;box-shadow:0 10px 40px rgba(0,0,0,.3);font-family:inherit}' +
      '#gc-theme-ov .hd2{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #e2e8f0;padding-bottom:10px;margin-bottom:10px}' +
      '#gc-theme-ov .hd2 small{display:block;color:#64748b;font-size:12px}#gc-theme-ov .hd2 b{font-size:19px}' +
      '#gc-theme-ov .x{border:none;background:none;font-size:24px;cursor:pointer;color:#475569}' +
      '#gc-theme-ov .grp{font-weight:800;margin:12px 0 6px;font-size:14px}' +
      '#gc-theme-ov .sw{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}' +
      '#gc-theme-ov .sw button{border:none;background:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;font-size:12px;color:#334155;padding:2px}' +
      '#gc-theme-ov .sw i{display:block;width:40px;height:40px;border-radius:50%;border:2px solid #cbd5e1;font-style:normal;line-height:36px;text-align:center;font-weight:900}' +
      '#gc-theme-ov .sw button.on i{border-color:#0f766e;box-shadow:0 0 0 3px rgba(15,118,110,.25)}' +
      '#gc-theme-ov .follow{display:flex;align-items:center;gap:8px;margin-top:14px;padding:10px 12px;border-radius:12px;background:#f1f5f9;font-size:13px;cursor:pointer;border:1px solid #e2e8f0;width:100%;text-align:left}' +
      '#gc-theme-ov .follow.on{background:#ecfdf5;border-color:#10b981}' +
      '#gc-theme-ov .note{font-size:12px;color:#64748b;margin-top:8px}';
    markHeaders();
    renderDialog();
  }
  function lum(rgb) { var m = String(rgb).match(/\d+(\.\d+)?/g); if (!m || m.length < 3) return 1; if (m.length > 3 && +m[3] === 0) return 1; return (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255; }
  function markHeaders() {
    if (document.querySelector('.hdr-logo')) document.documentElement.setAttribute('data-gc-portal', '1');
    var els = document.querySelectorAll('.topbar,.hd,body>header');
    for (var i = 0; i < els.length; i++) {
      var e = els[i];
      if (e.classList.contains('gc-dark-hdr') || e.classList.contains('gc-light-hdr')) continue;
      var cs = getComputedStyle(e), bgImg = cs.backgroundImage || '', l = lum(cs.backgroundColor);
      var darkHdr = (bgImg && bgImg !== 'none' && /gradient/.test(bgImg)) ? lum(cs.color) > 0.6 : l < 0.45;
      e.classList.add(darkHdr ? 'gc-dark-hdr' : 'gc-light-hdr');
    }
  }
  /* ---------- 選色視窗 ---------- */
  var ov = null;
  function renderDialog() {
    if (!ov) return;
    var c = choice();
    function sw(group) {
      return P.filter(function (p) { return !!p[8] === group; }).map(function (p) {
        return '<button type="button" data-k="' + p[0] + '" class="' + (c.key === p[0] && !c.follow ? 'on' : '') + '"><i style="background:' + p[1] + ';color:' + (p[8] ? '#fff' : '#0f172a') + '">' + (c.key === p[0] ? '✓' : '') + '</i>' + t(p[2], p[3], p[4]) + '</button>';
      }).join('');
    }
    ov.querySelector('.box2').innerHTML =
      '<div class="hd2"><div><small>GASCheck · ' + t('個人設定', 'Personal setting', 'ការកំណត់ផ្ទាល់ខ្លួន') + '</small><b>' + t('背景與色彩', 'Background & colour', 'ផ្ទៃខាងក្រោយ និងពណ៌') + '</b></div><button class="x" type="button" aria-label="close">×</button></div>' +
      '<button type="button" class="follow ' + (c.follow ? 'on' : '') + '" data-k="psjga">' + (c.follow ? '✅' : '⬜') + ' ' + t('跟隨 PSJGA 總務工作台的顏色（PSJGA 換色，這裡一起換）', 'Follow PSJGA colour (changes together)', 'តាមពណ៌ PSJGA') + '</button>' +
      '<div class="grp">' + t('淺色', 'Light', 'ពណ៌ស្រាល') + '</div><div class="sw">' + sw(false) + '</div>' +
      '<div class="grp">' + t('深色', 'Dark', 'ពណ៌ចាស់') + '</div><div class="sw">' + sw(true) + '</div>' +
      '<div class="note">' + t('這個瀏覽器會記住設定；GASCheck 所有頁面一起換色。', 'Saved in this browser; all GASCheck pages change together.', 'រក្សាទុកក្នុងកម្មវិធីរុករកនេះ') + (c.follow && !c.psjga ? ' ' + t('（PSJGA 尚未設定顏色，先用淡綠）', '(PSJGA has no colour yet — using light green)', '') : '') + '</div>';
  }
  function open() {
    if (window.vrtPalette && window.vrtPalette.open) { try { window.vrtPalette.open(document.getElementById('gc-theme-btn')); return; } catch (e) {} }
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'gc-theme-ov'; ov.innerHTML = '<div class="box2" role="dialog" aria-modal="true"></div>';
      ov.addEventListener('click', function (e) {
        if (e.target === ov || (e.target.closest && e.target.closest('.x'))) { ov.classList.remove('open'); return; }
        var b = e.target.closest && e.target.closest('[data-k]'); if (!b) return;
        var k = b.getAttribute('data-k');
        try { if (k === 'psjga') localStorage.removeItem(OWN_KEY); else localStorage.setItem(OWN_KEY, JSON.stringify({ colour: k, at: new Date().toISOString() })); } catch (err) {}
        apply();
      });
      document.body.appendChild(ov);
    }
    renderDialog(); ov.classList.add('open');
  }
  function addButton() {
    if (document.getElementById('gc-theme-btn')) return;
    var b = document.createElement('button'); b.type = 'button'; b.id = 'gc-theme-btn'; b.textContent = '🎨';
    b.title = t('背景與色彩', 'Background & colour', 'ផ្ទៃខាងក្រោយ និងពណ៌'); b.setAttribute('aria-label', b.title);
    b.addEventListener('click', open);
    var host = document.querySelector('.topbar') || document.querySelector('.hd-in') || document.querySelector('.hdr');
    if (host) host.appendChild(b); else { b.classList.add('float'); document.body.appendChild(b); }
  }
  function boot() { apply(); addButton(); setTimeout(markHeaders, 1200); }
  /* 先套色（避免閃白），DOM 好了再加按鈕 */
  try { apply(); } catch (e) {}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.addEventListener('storage', function (e) { if (e.key === PSJGA_KEY || e.key === OWN_KEY || e.key === SHARED_KEY) apply(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) apply(); });
  window.GCTheme = { apply: apply, open: open, palettes: P, choice: choice };
})();
