/* gc-mobile.js — GASCheck 手機上方再精簡（2026-11-22 Paul：上方的精簡畫面要再調整）
 * 只在手機寬度（≤720px）作用，電腦版完全不變；只改外觀，不改任何按鈕與功能。
 *  ① 「🏠 GASCheck 選單」條變細
 *  ② 各頁頁首只留一行：圖示＋標題＋右邊按鈕；副標、時鐘、文件編號收起
 *  ③ 分頁列一行（圖示＋文字並排、36px 高），太多時左右滑；選中的分頁自動捲到看得到
 */
(function () {
  'use strict';
  if (window.__gcMobile) return; window.__gcMobile = 1;
  var css = [
    '@media(max-width:720px){',
    /* ① 選單條 */
    '#fx-home{padding:5px 12px!important;font-size:12px!important;gap:5px!important}',
    /* ② 頁首一行 */
    '.topbar{min-height:0!important;height:auto!important;padding:6px 10px!important;gap:8px!important;flex-wrap:nowrap!important}',
    '.topbar .tb-sub,.topbar .topbar-sub,.topbar .topbar-docno,.topbar .tb-ts,.topbar #ts-sub,.topbar .tb-info>.tb-sub{display:none!important}',
    '.topbar .tb-title,.topbar .topbar-title,.topbar .tb-info{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:15px!important;line-height:1.2}',
    '.topbar .tb-info,.topbar .tb-left,.topbar .topbar-title{flex:1 1 0;min-width:0}',
    '.topbar .tb-logo,.topbar .topbar-icon,.topbar .topbar-logo{font-size:20px!important;flex:none}',
    '.topbar .tb-badge{flex:none}',
    '.topbar .user-pill{max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:4px 10px!important;font-size:12px!important}',
    '.topbar button,.topbar .gc-theme-btn,.topbar [class*="theme"]{flex:none}',
    /* ③ 分頁列一行 */
    'body>.tabs,#tab-bar,#main-tabs,body>.nav,.nav-tabs{display:flex!important;flex-wrap:nowrap!important;overflow-x:auto!important;overflow-y:hidden!important;scrollbar-width:none;padding:0 4px!important;gap:2px!important;grid-template-columns:none!important;-webkit-overflow-scrolling:touch}',
    'body>.tabs::-webkit-scrollbar,#tab-bar::-webkit-scrollbar,#main-tabs::-webkit-scrollbar,body>.nav::-webkit-scrollbar,.nav-tabs::-webkit-scrollbar{display:none}',
    'body>.tabs>.tab,#tab-bar>.tab,#main-tabs>.tab,body>.nav>.nav-btn,.nav-tabs>.tab-btn{flex:0 0 auto!important;flex-direction:row!important;align-items:center!important;justify-content:center!important;gap:4px!important;min-height:38px!important;height:38px;padding:0 11px!important;font-size:12.5px!important;white-space:nowrap!important;line-height:1!important;text-align:left!important;width:auto!important}',
    'body>.nav>.nav-btn{margin:4px 0!important;border-radius:9px!important}',
    '}'
  ].join('\n');
  function inject() { if (document.getElementById('gc-mobile-css')) return; var s = document.createElement('style'); s.id = 'gc-mobile-css'; s.textContent = css; (document.head || document.documentElement).appendChild(s); }
  inject();
  /* 選中的分頁捲到看得到 */
  function reveal() {
    if (!(window.matchMedia && matchMedia('(max-width:720px)').matches)) return;
    var on = document.querySelector('body>.tabs>.tab.active,#tab-bar>.tab.active,#main-tabs>.tab.active,body>.nav>.nav-btn.active,.nav-tabs>.tab-btn.active,body>.tabs>.tab.on');
    var p = on && on.parentElement; if (p) p.scrollLeft = Math.max(0, on.offsetLeft - (p.clientWidth - on.offsetWidth) / 2);   /* 只左右捲分頁列，不動整頁 */
  }
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.tab,.nav-btn,.tab-btn')) setTimeout(reveal, 60); }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(reveal, 400); }); else setTimeout(reveal, 400);
})();
