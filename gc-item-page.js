/* gc-item-page.js — 物品頁（學 PSJHR 員工頁）2026-11-22
   Paul 11/22：資產、鑰匙的物品列表跟資訊卡要學 PSJHR 員工頁——手機一眼看得完、不用左右拉、
   照片固定有位置（沒照片也留框，點了直接拍）、列表一筆一行好看好點，不影響原功能、可連動。

   ① 列表：一筆一行（左邊照片／缺照片框、編號＋名稱、第二行重點、右邊狀態），點一行開物品頁。
   ② 物品頁：上面 n/N ◀ ▶ ✕；表頭＝照片＋編號＋名稱＋重點 chips；下面分頁（基本／紀錄／照片／管理…）。
      往下捲到底自動接下一筆（同一個分頁），捲到誰上面就顯示誰；左右滑換上一筆／下一筆；
      電腦：置中視窗、←／→ 換筆、Esc 關；手機返回鍵＝關閉。
   ③ 只負責「畫面」：資料與按鈕都呼叫各頁原本的函式（編輯、刪除、轉移、標籤…），不另存資料。

   用法：
     var ip = GC.ItemPage.create({
       key:'asset', accent:'var(--p,#2563eb)',
       list:function(){ return 目前篩選後的陣列; }, get:function(id){ return 那一筆; }, id:function(it){ return it.code; },
       head:function(it){ return { photo:'src', photoCount:1, code:'AHA001', title:'冰箱', chips:['<span…>'] }; },
       tabs:[{ id:'basic', icon:'📋', label:function(){ return '基本'; }, count:function(it){ return n; }, render:function(it, ip){ return html; } }],
       row:function(it){ return { photo:'', code:'', title:'', sub:'', right:'' }; },
       actions:{ addPhoto:function(it, el, ip){…}, … },   // 頁內 data-gip-act="名稱" 的按鈕
       labels:{ noPhoto:'缺照片', addPhoto:'加照片', end:'已經到最後一筆', … }
     });
     ip.open(id) / ip.close() / ip.refresh() / ip.isOpen()
     ip.listHtml(items) / ip.bindList(el)   // 一筆一行的列表 */
(function (root) {
  'use strict';
  var GC = root.GC || (root.GC = {});
  if (GC.ItemPage) return;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function fn(v) { return typeof v === 'function' ? v : function () { return v; }; }
  /* 照片網址一律走 GC.photo.src：上雲後的 Drive 連結改用縮圖網址，手機才看得到 */
  function psrc(u) { return u && root.GC && GC.photo && GC.photo.src ? GC.photo.src(u) : (u || ''); }

  var CSS = [
    /* 列表：一筆一行 */
    '.gip-list{display:flex;flex-direction:column;background:#fff;border:1px solid #d9e2ec;border-radius:12px;overflow:hidden}',
    '.gip-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border-bottom:1px solid #edf1f5;cursor:pointer;min-height:64px;background:#fff;-webkit-tap-highlight-color:rgba(0,0,0,.05)}',
    '.gip-row:last-child{border-bottom:none}.gip-row:active,.gip-row:hover{background:#f4f8fc}',
    '.gip-th{width:50px;height:50px;border-radius:10px;object-fit:cover;flex:none;border:1px solid #d6e0ea;background:#f3f6f9}',
    '.gip-th.empty{border:1.5px dashed #b4c3d3;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#8a9bb0;font-size:9.5px;font-weight:700;line-height:1.1;text-align:center}',
    '.gip-th.empty b{font-size:16px;font-weight:400}',
    '.gip-rm{flex:1;min-width:0}',
    '.gip-rt{font-weight:800;font-size:14.5px;color:#1d2b3a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.gip-rt .c{font-family:ui-monospace,"IBM Plex Mono",Consolas,monospace;color:var(--gip-acc);font-size:12.5px;margin-right:6px;font-weight:800}',
    '.gip-rs{font-size:12px;color:#64768a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:3px}',
    '.gip-rr{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:4px;font-size:11.5px;color:#64768a;max-width:38%}',
    '.gip-rr>*{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.gip-go{flex:none;color:#a8b6c6;font-size:20px;margin-left:-2px}',
    '.gip-empty{padding:36px 16px;text-align:center;color:#8a9bb0;font-size:13px}',
    /* 物品頁 */
    '.gip-ov{position:fixed;inset:0;z-index:990;display:flex;align-items:stretch;justify-content:center;background:rgba(15,23,42,.45)}',
    '.gip-panel{background:var(--gip-bg,#eef2f6);width:100%;height:100%;display:flex;flex-direction:column;overflow:hidden}',
    '@media(min-width:721px){.gip-ov{align-items:center;padding:18px}.gip-panel{max-width:760px;height:min(92vh,1000px);border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.28)}}',
    '.gip-top{flex:none;display:flex;align-items:center;gap:8px;padding:8px 12px;padding-top:calc(8px + env(safe-area-inset-top,0px));background:#fff;border-bottom:1px solid #dde5ee}',
    '.gip-pos{flex:1;font-size:13px;font-weight:700;color:#5b6b7c;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.gip-pos b{color:#1d2b3a}',
    '.gip-nb{width:46px;height:42px;border:1px solid #c9d5e2;border-radius:10px;background:#fff;font-size:17px;color:#1d2b3a;cursor:pointer;touch-action:manipulation}',
    '.gip-nb:disabled{opacity:.35}',
    '.gip-scroll{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}',
    '.gip-sec{background:#fff;border-bottom:4px solid var(--gip-acc);margin-bottom:12px}',
    '.gip-hd{display:flex;gap:12px;padding:14px 14px 12px;align-items:flex-start}',
    '.gip-ph{width:88px;height:88px;border-radius:14px;flex:none;object-fit:cover;background:#f3f6f9;border:1px solid #d6e0ea;cursor:zoom-in;position:relative}',
    '.gip-ph.empty{cursor:pointer;border:2px dashed #9fb2c6;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#6f8399;font-size:11px;font-weight:800;gap:2px;text-align:center;line-height:1.15;background:#f7f9fb}',
    '.gip-ph.empty b{font-size:24px;font-weight:400}',
    '.gip-ph.ico{cursor:default;display:flex;align-items:center;justify-content:center;font-size:40px;line-height:1;background:linear-gradient(150deg,#ffffff,#e9eff5);box-shadow:inset 0 1px 0 #fff,0 3px 8px rgba(15,23,42,.10)}',
    '.gip-phw{position:relative;flex:none}',
    '.gip-phn{position:absolute;right:-4px;bottom:-4px;background:#1d2b3a;color:#fff;font-size:10.5px;font-weight:800;border-radius:10px;padding:1px 6px;border:2px solid #fff}',
    '.gip-hm{flex:1;min-width:0}',
    '.gip-code{font-family:ui-monospace,"IBM Plex Mono",Consolas,monospace;font-weight:800;font-size:13px;color:var(--gip-acc);letter-spacing:.5px}',
    '.gip-title{font-size:18px;font-weight:800;line-height:1.25;margin:2px 0 7px;color:#1d2b3a;word-break:break-word}',
    '.gip-chips{display:flex;flex-wrap:wrap;gap:5px}',
    '.gip-chip{font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px;background:#eef3f8;color:#36506a;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}',
    '.gip-chip.g{background:#dcfce7;color:#15803d}.gip-chip.y{background:#fef3c7;color:#a16207}.gip-chip.r{background:#fee2e2;color:#b91c1c}.gip-chip.b{background:#dbeafe;color:#1d4ed8}.gip-chip.p{background:#f3e8ff;color:#6d28d9}.gip-chip.k{background:#e5e7eb;color:#374151}',
    '.gip-tabs{position:sticky;top:0;z-index:2;display:flex;overflow-x:auto;background:#fff;border-top:1px solid #eef2f6;border-bottom:1px solid #e1e8ef;scrollbar-width:none}',
    '.gip-tabs::-webkit-scrollbar{display:none}',
    '.gip-tab{flex:1 0 auto;padding:10px 12px;border:none;background:none;font-weight:700;font-size:13.5px;color:#6b7c8e;border-bottom:3px solid transparent;min-height:46px;white-space:nowrap;cursor:pointer;font-family:inherit;touch-action:manipulation}',
    '.gip-tab.on{color:var(--gip-acc);border-bottom-color:var(--gip-acc)}',
    '.gip-tab .n{background:#e8eef4;color:#4b5d70;border-radius:9px;padding:0 6px;font-size:11px;margin-left:4px}',
    '.gip-body{padding:12px 14px 16px}',
    '.gip-kv{display:grid;grid-template-columns:1fr 1fr;gap:12px 14px}',
    '.gip-kv>div{min-width:0}.gip-kv .full{grid-column:1/-1}',
    '.gip-k{font-size:11.5px;color:#7b8ea3;font-weight:600;margin-bottom:1px}',
    '.gip-v{font-size:15px;font-weight:600;color:#1d2b3a;word-break:break-word;line-height:1.35}',
    '.gip-v.mut{color:#9aa9b9;font-weight:500}',
    '.gip-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:8px;margin-bottom:12px}',
    '.gip-kpi{background:#f4f7fa;border-radius:10px;padding:8px 6px;text-align:center;min-width:0}',
    '.gip-kpi b{display:block;font-size:18px;font-weight:800;color:#1d2b3a;line-height:1.15}',
    '.gip-kpi span{display:block;font-size:11px;color:#6b7c8e;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.gip-sub{font-size:12px;font-weight:800;color:#5b6b7c;margin:14px 0 8px;letter-spacing:.3px}',
    '.gip-sub:first-child{margin-top:0}',
    '.gip-pills{display:flex;flex-wrap:wrap;gap:6px}',
    '.gip-pill{min-height:42px;padding:6px 14px;border-radius:999px;border:1.5px solid #cbd5e1;background:#f8fafc;color:#475569;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit}',
    '.gip-pill.on{background:var(--gip-acc);border-color:var(--gip-acc);color:#fff}',
    '.gip-acts{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
    '.gip-btn{min-height:48px;border-radius:11px;border:1.5px solid #c9d5e2;background:#fff;font-weight:700;font-size:14px;color:#1d2b3a;cursor:pointer;font-family:inherit;padding:6px 10px;touch-action:manipulation}',
    '.gip-btn.pri{background:var(--gip-acc);border-color:var(--gip-acc);color:#fff}',
    '.gip-btn.ok{background:#f0fdf4;border-color:#86efac;color:#15803d}.gip-btn.warn{background:#fffbeb;border-color:#fcd34d;color:#b45309}.gip-btn.bad{background:#fef2f2;border-color:#fca5a5;color:#dc2626}.gip-btn.lbl{background:#f3e8ff;border-color:#c4b5fd;color:#6d28d9}',
    '.gip-btn.full{grid-column:1/-1}',
    '.gip-note{padding:9px 11px;border-radius:10px;background:#fef9c3;border:1px solid #eab308;color:#713f12;font-size:12.5px;font-weight:600;margin-bottom:12px}',
    '.gip-hist{display:flex;flex-direction:column;gap:7px}',
    '.gip-h{border-left:4px solid #94a3b8;background:#f6f8fa;border-radius:0 9px 9px 0;padding:7px 10px}',
    '.gip-h.g{border-color:#22c55e}.gip-h.b{border-color:#3b82f6}.gip-h.y{border-color:#eab308}.gip-h.r{border-color:#ef4444}.gip-h.o{border-color:#f97316}',
    '.gip-h .d{font-size:11.5px;color:#7b8ea3;font-weight:600}.gip-h .t{font-size:13.5px;color:#1d2b3a;margin-top:1px;word-break:break-word}',
    '.gip-big{width:100%;max-height:340px;object-fit:contain;border-radius:12px;border:1px solid #d6e0ea;background:#f3f6f9;cursor:zoom-in;display:block}',
    '.gip-bigempty{height:180px;border-radius:12px;border:2px dashed #9fb2c6;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#6f8399;font-weight:800;gap:4px;background:#f7f9fb;cursor:pointer}',
    '.gip-bigempty b{font-size:40px;font-weight:400}',
    '.gip-thumbs{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}',
    '.gip-thumbs img{width:76px;height:76px;object-fit:cover;border-radius:10px;border:1px solid #d6e0ea;cursor:zoom-in}',
    '.gip-cap{font-size:11.5px;color:#7b8ea3;margin-top:6px}',
    '.gip-end{text-align:center;color:#8a9bb0;padding:14px 12px 28px;font-size:12.5px}',
    '.gip-sent{height:2px}',
    '.gip-lock{overflow:hidden!important}',
    /* 物品頁開著時，頁面右下角的浮動按鈕（照片表匯入等）先藏起來，免得蓋到內容 */
    'html.gip-lock #pcx-btn{display:none!important}'
  ].join('\n');

  function injectCss() {
    if (document.getElementById('gip-css')) return;
    var s = document.createElement('style'); s.id = 'gip-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  function create(cfg) {
    cfg = cfg || {};
    injectCss();
    var key = cfg.key || 'item';
    var Lb = cfg.labels || {};
    var lb = function (k, d) { var v = Lb[k]; return v == null ? d : fn(v)(); };
    var idOf = cfg.id || function (it) { return it && (it.id || it.code); };
    var TABKEY = 'gip_tab_' + key;
    var st = { open:false, ids:[], idx:0, start:0, end:-1, tab:'', ov:null, scroll:null, pushed:false, observer:null };
    try { st.tab = localStorage.getItem(TABKEY) || ''; } catch (e) {}

    function tabs() { return (cfg.tabs || []).filter(function (t) { return !t.when || t.when(); }); }
    function curTab() { var ts = tabs(); if (!ts.some(function (t) { return t.id === st.tab; })) st.tab = ts.length ? ts[0].id : ''; return st.tab; }
    function get(id) { if (cfg.get) return cfg.get(id); var l = cfg.list ? cfg.list() : []; for (var i = 0; i < l.length; i++) if (String(idOf(l[i])) === String(id)) return l[i]; return null; }

    /* ── 表頭：照片（沒有就留虛線框，點了直接加）＋編號＋名稱＋chips ── */
    function headHtml(it) {
      var h = cfg.head ? cfg.head(it) : {}, id = esc(idOf(it));
      /* 2026-11-23：沒有照片概念的卡（例如期間報表）可以給 head.icon，放一個大圖示，不出現「缺照片」框 */
      var ph = h.icon ? '<div class="gip-ph ico" aria-hidden="true">' + h.icon + '</div>' : h.photo ? '<div class="gip-phw"><img class="gip-ph" src="' + esc(psrc(h.photo)) + '" alt="" data-gip-act="viewPhoto" data-gip-id="' + id + '">' + (h.photoCount > 1 ? '<span class="gip-phn">' + h.photoCount + '</span>' : '') + '</div>'
        : '<div class="gip-ph empty" role="button" tabindex="0" data-gip-act="addPhoto" data-gip-id="' + id + '"><b>📷</b>' + esc(lb('noPhoto', '缺照片')) + '<br>' + esc(lb('addPhoto', '點這裡加')) + '</div>';
      return '<div class="gip-hd">' + ph + '<div class="gip-hm">' + (h.code ? '<div class="gip-code">' + esc(h.code) + '</div>' : '') +
        '<div class="gip-title">' + esc(h.title || '—') + '</div><div class="gip-chips">' + (h.chips || []).filter(Boolean).join('') + '</div></div></div>';
    }
    function tabsHtml(it) {
      var cur = curTab();
      /* 2026-11-25：只有一個分頁的卡（期間報表）不顯示分頁列，內容一路往下滑 */
      if (cfg.hideSingleTab && tabs().length <= 1) return '';
      return '<div class="gip-tabs">' + tabs().map(function (t) {
        var n = t.count ? t.count(it) : null;
        return '<button type="button" class="gip-tab' + (t.id === cur ? ' on' : '') + '" data-gip-tab="' + esc(t.id) + '">' + (t.icon ? t.icon + ' ' : '') + esc(fn(t.label)()) + (n ? '<span class="n">' + n + '</span>' : '') + '</button>';
      }).join('') + '</div>';
    }
    function bodyHtml(it) {
      var cur = curTab(), t = tabs().filter(function (x) { return x.id === cur; })[0];
      var html = '';
      try { html = t && t.render ? t.render(it, api) : ''; } catch (e) { html = '<div class="gip-empty">⚠️ ' + esc(e && e.message || e) + '</div>'; if (root.console) console.warn('gip tab', e); }
      return '<div class="gip-body">' + (html || '<div class="gip-empty">—</div>') + '</div>';
    }
    function sectionHtml(it, i) {
      return '<section class="gip-sec" data-gip-i="' + i + '" data-gip-id="' + esc(idOf(it)) + '">' + headHtml(it) + tabsHtml(it) + bodyHtml(it) + '</section>';
    }

    function build() {
      if (st.ov) return;
      var ov = document.createElement('div'); ov.className = 'gip-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
      /* data-noswipe：頁面的左右滑換分頁（swipe-tabs.js）不要管這個視窗；換筆由本視窗自己處理 */
      ov.setAttribute('data-noswipe', ''); ov.tabIndex = -1;
      if (cfg.accent) ov.style.setProperty('--gip-acc', cfg.accent); else ov.style.setProperty('--gip-acc', '#2563eb');
      /* 疊層：要在頁首之上、在各頁原本的視窗（編輯、確認、放大照片）之下；各頁可用 cfg.z 調 */
      if (cfg.z) ov.style.zIndex = cfg.z;
      ov.innerHTML = '<div class="gip-panel"><div class="gip-top"><div class="gip-pos"></div>' +
        '<button type="button" class="gip-nb" data-gip-nav="-1" aria-label="◀">◀</button><button type="button" class="gip-nb" data-gip-nav="1" aria-label="▶">▶</button>' +
        '<button type="button" class="gip-nb" data-gip-close aria-label="✕">✕</button></div><div class="gip-scroll"></div></div>';
      document.body.appendChild(ov);
      st.ov = ov; st.scroll = ov.querySelector('.gip-scroll');
      ov.addEventListener('click', onClick);
      ov.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.getAttribute && e.target.getAttribute('data-gip-act')) { e.preventDefault(); e.target.click(); } });
      st.scroll.addEventListener('scroll', onScroll, { passive:true });
      /* 左右滑：換上一筆／下一筆（分頁列本身可以左右捲，不算） */
      var sx = 0, sy = 0, sOk = false;
      st.scroll.addEventListener('touchstart', function (e) { var t = e.touches[0]; sx = t.clientX; sy = t.clientY; sOk = !(e.target.closest && e.target.closest('.gip-tabs,input,textarea,select,.gip-noswipe')); }, { passive:true });
      st.scroll.addEventListener('touchend', function (e) {
        if (!sOk) return; var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
        if (Math.abs(dx) > 70 && Math.abs(dy) < 45) go(dx < 0 ? 1 : -1);
      }, { passive:true });
    }
    function anyModalOpen() {
      return [].some.call(document.querySelectorAll('.ovl:not(.hidden),.modal-bg.open,.modal-overlay.open,.gc-lightbox,.gc-common-modal[style*="flex"]'), function (el) { return el.offsetParent !== null || getComputedStyle(el).position === 'fixed'; });
    }
    function onKey(e) {
      if (!st.open || anyModalOpen()) return;
      var tg = e.target && e.target.tagName; if (/INPUT|TEXTAREA|SELECT/.test(tg || '')) return;
      if (e.key === 'Escape') { close(); e.preventDefault(); e.stopPropagation(); }
      else if (e.key === 'ArrowRight') { go(1); e.preventDefault(); e.stopPropagation(); }
      else if (e.key === 'ArrowLeft') { go(-1); e.preventDefault(); e.stopPropagation(); }
    }
    function onPop() { if (st.open) { st.pushed = false; close(true); } }

    function onClick(e) {
      var t = e.target;
      if (t === st.ov) { close(); return; }
      var nav = t.closest('[data-gip-nav]'); if (nav) { go(+nav.getAttribute('data-gip-nav')); return; }
      if (t.closest('[data-gip-close]')) { close(); return; }
      var tb = t.closest('[data-gip-tab]');
      if (tb) {
        var sec = tb.closest('.gip-sec'), before = sec ? sec.getBoundingClientRect().top : 0;
        st.tab = tb.getAttribute('data-gip-tab'); try { localStorage.setItem(TABKEY, st.tab); } catch (x) {}
        repaint(true);
        /* 換分頁後畫面停在同一筆的表頭 */
        var again = sec && st.scroll.querySelector('.gip-sec[data-gip-i="' + sec.getAttribute('data-gip-i') + '"]');
        if (again) st.scroll.scrollTop += again.getBoundingClientRect().top - Math.min(before, st.scroll.getBoundingClientRect().top);
        return;
      }
      var act = t.closest('[data-gip-act]');
      if (act) {
        var secEl = act.closest('.gip-sec'), name = act.getAttribute('data-gip-act'), sid = act.getAttribute('data-gip-id') || (secEl ? secEl.getAttribute('data-gip-id') : '');
        var it = get(sid); if (!it) return;
        var h = cfg.actions && cfg.actions[name];
        if (h) { e.preventDefault(); h(it, act, api); }
      }
    }

    function updatePos() {
      if (!st.open) return;
      var n = st.ids.length, i = st.idx, it = get(st.ids[i]), h = it && cfg.head ? cfg.head(it) : {};
      var pos = st.ov.querySelector('.gip-pos');
      pos.innerHTML = '<b>' + (n ? i + 1 : 0) + '</b>/' + n + (h.code ? ' · ' + esc(h.code) : '');
      st.ov.querySelector('[data-gip-nav="-1"]').disabled = i <= 0;
      st.ov.querySelector('[data-gip-nav="1"]').disabled = i >= n - 1;
    }
    var scrollRaf = 0;
    function onScroll() {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(function () {
        scrollRaf = 0; if (!st.open) return;
        var top = st.scroll.getBoundingClientRect().top + 70, secs = st.scroll.querySelectorAll('.gip-sec'), cur = st.start;
        for (var k = 0; k < secs.length; k++) { if (secs[k].getBoundingClientRect().top <= top) cur = +secs[k].getAttribute('data-gip-i'); else break; }
        if (cur !== st.idx) { st.idx = cur; updatePos(); }
        /* 捲到底：接下一筆 */
        if (st.scroll.scrollTop + st.scroll.clientHeight >= st.scroll.scrollHeight - 500) appendNext();
      });
    }
    function appendNext() {
      if (st.end >= st.ids.length - 1) { endMark(); return; }
      var nx = st.end + 1, it = get(st.ids[nx]); st.end = nx;
      if (!it) return appendNext();
      var sent = st.scroll.querySelector('.gip-end'); if (sent) sent.remove();
      st.scroll.insertAdjacentHTML('beforeend', sectionHtml(it, nx));
      if (st.end >= st.ids.length - 1) endMark();
    }
    function endMark() {
      if (st.scroll.querySelector('.gip-end')) return;
      st.scroll.insertAdjacentHTML('beforeend', '<div class="gip-end">— ' + esc(lb('end', '已經到最後一筆')) + ' —</div>');
    }
    function paintFrom(i) {
      st.idx = st.start = i; st.end = i - 1;
      st.scroll.innerHTML = '';
      appendNext();
      /* 第一筆很短時先多接一筆，畫面才會滿 */
      if (st.scroll.scrollHeight <= st.scroll.clientHeight + 40) appendNext();
      st.scroll.scrollTop = 0; updatePos();
    }
    /* 重畫目前已經接上的每一筆（資料改了、換分頁、換語言） */
    function repaint(keepScroll) {
      if (!st.open) return;
      var y = st.scroll.scrollTop, html = '';
      for (var i = st.start; i <= st.end; i++) { var it = get(st.ids[i]); if (it) html += sectionHtml(it, i); }
      st.scroll.innerHTML = html; if (st.end >= st.ids.length - 1) endMark();
      if (keepScroll) st.scroll.scrollTop = y;
      updatePos();
    }

    function open(id) {
      var list = cfg.list ? cfg.list() : [];
      st.ids = list.map(function (x) { return String(idOf(x)); });
      var i = st.ids.indexOf(String(id));
      if (i < 0) { if (!get(id)) return false; st.ids.unshift(String(id)); i = 0; }
      build();
      if (!st.open) {
        st.open = true; st.ov.style.display = '';
        document.documentElement.classList.add('gip-lock'); document.body.classList.add('gip-lock');
        document.addEventListener('keydown', onKey, true);
        try { if (root.history && history.pushState) { history.pushState({ gip:key }, ''); st.pushed = true; root.addEventListener('popstate', onPop); } } catch (e) {}
      }
      paintFrom(i);
      try { st.ov.focus({ preventScroll:true }); } catch (e) {}
      if (cfg.onOpen) try { cfg.onOpen(get(id)); } catch (e) {}
      return true;
    }
    function go(d) {
      if (!st.open) return;
      var j = st.idx + d; if (j < 0 || j >= st.ids.length) return;
      paintFrom(j);
    }
    function close(fromPop) {
      if (!st.open) return;
      st.open = false;
      if (st.ov) { st.ov.style.display = 'none'; st.scroll.innerHTML = ''; }
      document.documentElement.classList.remove('gip-lock'); document.body.classList.remove('gip-lock');
      document.removeEventListener('keydown', onKey, true);
      root.removeEventListener('popstate', onPop);
      if (!fromPop && st.pushed) { st.pushed = false; try { history.back(); } catch (e) {} }
      if (cfg.onClose) try { cfg.onClose(); } catch (e) {}
    }
    /* 資料改了：重新抓清單順序；目前這筆被刪了就停在原本位置的下一筆 */
    function refresh() {
      if (!st.open) return;
      var curId = st.ids[st.idx], list = cfg.list ? cfg.list() : [], ids = list.map(function (x) { return String(idOf(x)); });
      if (!ids.length) { close(); return; }
      var i = ids.indexOf(curId);
      if (i < 0 && get(curId)) { ids.unshift(curId); i = 0; }
      st.ids = ids;
      if (i < 0) { paintFrom(Math.min(st.idx, ids.length - 1)); return; }
      var off = i - st.idx;
      st.start = Math.max(0, st.start + off); st.idx = i; st.end = Math.min(ids.length - 1, Math.max(st.end + off, i));
      repaint(true);
    }

    /* ── 列表 ── */
    function rowHtml(it) {
      var r = cfg.row ? cfg.row(it) : {}, id = esc(idOf(it));
      var th = r.photo ? '<img class="gip-th" loading="lazy" src="' + esc(psrc(r.photo)) + '" alt="">' : '<div class="gip-th empty"><b>📷</b>' + esc(lb('noPhotoShort', '缺')) + '</div>';
      return '<div class="gip-row" role="button" tabindex="0" data-gip-id="' + id + '">' + th +
        '<div class="gip-rm"><div class="gip-rt">' + (r.code ? '<span class="c">' + esc(r.code) + '</span>' : '') + esc(r.title || '—') + '</div>' +
        (r.sub ? '<div class="gip-rs">' + r.sub + '</div>' : '') + '</div>' +
        (r.right ? '<div class="gip-rr">' + r.right + '</div>' : '') + '<span class="gip-go">›</span></div>';
    }
    function listHtml(items) {
      items = items || [];
      if (!items.length) return '<div class="gip-list"><div class="gip-empty">📭 ' + esc(lb('emptyList', '查無資料')) + '</div></div>';
      return '<div class="gip-list" style="--gip-acc:' + esc(cfg.accent || '#2563eb') + '">' + items.map(rowHtml).join('') + '</div>';
    }
    function bindList(el) {
      if (!el || el.__gip) return; el.__gip = 1;
      el.addEventListener('click', function (e) {
        if (e.target.closest('button,a,input,select,textarea,label')) return;
        var r = e.target.closest('.gip-row'); if (r) open(r.getAttribute('data-gip-id'));
      });
      el.addEventListener('keydown', function (e) { if (e.key !== 'Enter') return; var r = e.target.closest && e.target.closest('.gip-row'); if (r) open(r.getAttribute('data-gip-id')); });
    }

    /* 分頁內共用的小積木 */
    function kv(rows) {
      return '<div class="gip-kv">' + (rows || []).filter(Boolean).map(function (r) {
        var v = r[1], empty = v == null || v === '' || v === '—';
        return '<div' + (r[2] ? ' class="full"' : '') + '><div class="gip-k">' + esc(r[0]) + '</div><div class="gip-v' + (empty ? ' mut' : '') + '">' + (empty ? '—' : (r[3] ? v : esc(v))) + '</div></div>';
      }).join('') + '</div>';
    }
    function kpis(items) {
      return '<div class="gip-kpis">' + (items || []).filter(Boolean).map(function (k) { return '<div class="gip-kpi"><b' + (k[2] ? ' style="color:' + esc(k[2]) + '"' : '') + '>' + esc(k[0]) + '</b><span>' + esc(k[1]) + '</span></div>'; }).join('') + '</div>';
    }

    var api = {
      open:open, close:close, refresh:refresh, go:go, isOpen:function () { return st.open; },
      currentId:function () { return st.open ? st.ids[st.idx] : null; },
      repaint:function () { repaint(true); },
      listHtml:listHtml, rowHtml:rowHtml, bindList:bindList, kv:kv, kpis:kpis, esc:esc
    };
    return api;
  }

  /* 小工具：手機選照片／拍照 → 壓縮成 dataURL（GC.photo.compress 有就用它） */
  function pickPhoto(opt) {
    opt = opt || {};
    return new Promise(function (resolve) {
      var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
      if (opt.camera) inp.setAttribute('capture', 'environment');
      inp.style.cssText = 'position:fixed;left:-9999px;opacity:0';
      document.body.appendChild(inp);
      inp.onchange = function () {
        var f = inp.files && inp.files[0]; inp.remove(); if (!f) return resolve(null);
        var max = opt.max || 1024, q = opt.quality || 0.72;
        if (GC.photo && GC.photo.compress) { GC.photo.compress(f, max, q).then(resolve, function () { resolve(null); }); return; }
        var rd = new FileReader();
        rd.onload = function (ev) {
          var img = new Image();
          img.onload = function () { var c = document.createElement('canvas'), w = img.width, h = img.height; if (w > max || h > max) { if (w > h) { h = Math.round(h * max / w); w = max; } else { w = Math.round(w * max / h); h = max; } } c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h); resolve(c.toDataURL('image/jpeg', q)); };
          img.onerror = function () { resolve(null); }; img.src = ev.target.result;
        };
        rd.onerror = function () { resolve(null); }; rd.readAsDataURL(f);
      };
      inp.click();
    });
  }

  GC.ItemPage = { create:create, pickPhoto:pickPhoto, esc:esc, src:psrc };
})(typeof window !== 'undefined' ? window : this);
