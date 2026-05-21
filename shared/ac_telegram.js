/**
 * AC_GASCHECK Telegram Shared
 * Provides platform-level Telegram send function
 */
(function() {
  window.AC_TG = {
    send: function(text, opts) {
      var cfg = window.AC_CFG ? window.AC_CFG.get() : {};
      var token  = cfg.botToken || localStorage.getItem('ac_gascheck_tg_token') || '';
      var chatId = cfg.chatId   || localStorage.getItem('ac_gascheck_tg_chat')  || '';
      if (!token || !chatId) return Promise.resolve({ok:false,error:'No TG config'});
      var payload = Object.assign({ chat_id: chatId, parse_mode: 'HTML', text: text }, opts||{});
      return fetch('https://api.telegram.org/bot'+token+'/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function(r){ return r.json(); }).catch(function(e){ return {ok:false,error:e.message}; });
    },
    template: function(module, title, fields, status) {
      var lines = [
        '<b>' + (module||'VRT') + ' · ' + (title||'通知') + '</b>',
        '━━━━━━━━━━━━━━━━'
      ];
      (fields||[]).forEach(function(f){ lines.push(f); });
      lines.push('━━━━━━━━━━━━━━━━');
      lines.push('📌 狀態：' + (status||'—'));
      lines.push('🕐 時間：' + new Date().toLocaleString('zh-TW'));
      return lines.join('\n');
    }
  };
})();
