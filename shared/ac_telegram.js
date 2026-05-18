/**
 * AC_GASCHECK Platform — Shared Telegram Module
 * Usage: AC_TG.send(msg) | AC_TG.sendMenu() | AC_TG.sendModuleMsg(module, data)
 */
const AC_TG = (() => {
  const getCfg = () => {
    const base = typeof AC_CFG !== 'undefined' ? AC_CFG.get() : {};
    return {
      token : base.BOT_TOKEN  || localStorage.getItem('ac_gascheck_tg_token') || '8673221735:AAH0KoC89DPLNu4D70inRfkY2xwedLkXjnw',
      chatId: base.CHAT_ID    || localStorage.getItem('ac_gascheck_tg_chat')  || '-5113064563',
      gasUrl: base.gasUrl     || localStorage.getItem('ac_gascheck_gas_url')  || '',
    };
  };

  const _toast = (msg) => {
    const el = document.getElementById('toast') || document.getElementById('ac-toast');
    if (!el) return;
    el.textContent = msg; el.classList.add('show');
    clearTimeout(el._act); el._act = setTimeout(() => el.classList.remove('show'), 3200);
  };

  const send = async (text, opts = {}) => {
    const cfg = getCfg();
    // Try via GAS first (avoids CORS issues on some browsers)
    if (cfg.gasUrl) {
      try {
        const body = new URLSearchParams({ payload: JSON.stringify({ action:'telegram', text }) });
        const r = await fetch(cfg.gasUrl, { method:'POST', body, redirect:'follow', headers:{'Content-Type':'application/x-www-form-urlencoded'} });
        const d = await r.json();
        if (d.ok !== false) { _toast('📤 Telegram 已發送'); return true; }
      } catch(e) {}
    }
    // Direct fallback
    try {
      const r = await fetch(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ chat_id: cfg.chatId, text, parse_mode:'HTML', ...opts }),
      });
      const d = await r.json();
      if (d.ok) { _toast('📤 Telegram 已發送'); return true; }
      else { _toast('❌ Telegram: ' + d.description); return false; }
    } catch(e) { _toast('❌ Telegram 失敗: ' + e.message); return false; }
  };

  const sendWithKeyboard = async (text, buttons) => {
    const cfg = getCfg();
    const payload = {
      chat_id: cfg.chatId,
      text, parse_mode:'HTML',
      reply_markup: JSON.stringify({
        inline_keyboard: buttons.map(row =>
          row.map(btn => ({ text: btn.text, url: btn.url || undefined, callback_data: btn.data || undefined }))
        )
      })
    };
    try {
      const r = await fetch(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (d.ok) { _toast('📤 Telegram 已發送 (含按鈕)'); return true; }
      else { _toast('❌ ' + d.description); return false; }
    } catch(e) { _toast('❌ ' + e.message); return false; }
  };

  const sendMenu = async () => {
    const BASE = 'https://saintdou-weng.github.io/ac-gascheck/';
    const t = typeof AC_I18N !== 'undefined' ? k => AC_I18N.t(k) : k => k;
    const cnt = typeof AC_CFG !== 'undefined' ? AC_CFG.getLocalCount() : '—';
    const now = new Date().toLocaleString('zh-TW', { timeZone:'Asia/Phnom_Penh', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
    const text = [
      `🏭 <b>AC GASCHECK 平台</b> — ${now}`,
      `━━━━━━━━━━━━━━━━━━`,
      `📦 資產  |  🏠 宿舍  |  🧹 清潔`,
      `🔑 鑰匙  |  ♻️ EHS  |  💧 水桶`,
      `🌡️ 溫度  |  📊 Dashboard`,
      `━━━━━━━━━━━━━━━━━━`,
      `📊 本地記錄: ${cnt} 筆`,
      `🏭 Vantage River Textiles · SHV`,
    ].join('\n');

    // With inline keyboard buttons
    const buttons = [
      [
        { text:'📦 Asset',      url: BASE+'ac_gascheck_asset_v1.html'       },
        { text:'🏠 Dormitory',  url: BASE+'ac_gascheck_dormitory_v1.html'   },
      ],
      [
        { text:'🧹 Cleaning',   url: BASE+'ac_gascheck_cleaning_v1.html'    },
        { text:'🔑 Key Move',   url: BASE+'ac_gascheck_keymovement_v1.html' },
      ],
      [
        { text:'♻️ EHS',        url: BASE+'ac_gascheck_ehs_v1.html'         },
        { text:'💧 Water Drum', url: BASE+'ac_gascheck_waterdrum_v1.html'   },
      ],
      [
        { text:'🌡️ Temp',       url: BASE+'ac_gascheck_temperature_v1.html' },
        { text:'🏠 Portal',     url: BASE+'ac_gascheck_portal_v1.html'      },
      ],
    ];
    return sendWithKeyboard(text, buttons);
  };

  const sendModuleMsg = async (moduleName, data = {}) => {
    const icons = { asset:'📦', dormitory:'🏠', cleaning:'🧹', keymovement:'🔑', ehs:'♻️', waterdrum:'💧', temperature:'🌡️' };
    const icon = icons[moduleName] || '📋';
    const now  = new Date().toLocaleString('zh-TW', { timeZone:'Asia/Phnom_Penh', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
    const lines = [`${icon} <b>VRT ${moduleName.toUpperCase()}</b> — ${now}`];
    Object.entries(data).forEach(([k,v]) => lines.push(`${k}: ${v}`));
    lines.push(`🏭 Vantage River Textiles · SHV`);
    return send(lines.join('\n'));
  };

  // Fix webhook via GAS
  const fixWebhook = async () => {
    const cfg = getCfg();
    if (!cfg.gasUrl) { _toast('❌ 請先設定 GAS URL'); return; }
    _toast('🔧 重設 Webhook 中…');
    try {
      const body = new URLSearchParams({ payload: JSON.stringify({ action:'fixWebhook' }) });
      const r = await fetch(cfg.gasUrl, { method:'POST', body, redirect:'follow', headers:{'Content-Type':'application/x-www-form-urlencoded'} });
      const d = await r.json();
      _toast(d.ok !== false ? '✅ Webhook 已重設' : '❌ ' + (d.error||'失敗'));
    } catch(e) { _toast('❌ ' + e.message); }
  };

  const checkWebhook = async () => {
    const cfg = getCfg();
    try {
      const r = await fetch(`https://api.telegram.org/bot${cfg.token}/getWebhookInfo`);
      const d = await r.json();
      if (d.ok) {
        const url = d.result.url || '（未設定）';
        const ok2 = url.includes('/exec');
        _toast(ok2 ? '✅ Webhook 正常指向 /exec' : '⚠ Webhook 未設定，請重設');
        return d.result;
      }
    } catch(e) { _toast('❌ ' + e.message); }
    return null;
  };

  return { send, sendWithKeyboard, sendMenu, sendModuleMsg, fixWebhook, checkWebhook };
})();
