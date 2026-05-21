/**
 * AC_GASCHECK Platform Config
 * Provides platform-level config accessible to all modules
 */
(function() {
  var CFG_KEY = 'ac_gascheck_platform_cfg';

  window.AC_CFG = {
    GAS_URL:   localStorage.getItem('ac_gascheck_gas_url')   || '',
    BOT_TOKEN: localStorage.getItem('ac_gascheck_tg_token')  || '8673221735:AAH0KoC89DPLNu4D70inRfkY2xwedLkXjnw',
    CHAT_ID:   localStorage.getItem('ac_gascheck_tg_chat')   || '-5113064563',
    get: function() {
      return {
        gasUrl:   this.GAS_URL,
        botToken: this.BOT_TOKEN,
        chatId:   this.CHAT_ID,
      };
    },
    set: function(cfg) {
      if (cfg.gasUrl)   { this.GAS_URL   = cfg.gasUrl;   localStorage.setItem('ac_gascheck_gas_url',  cfg.gasUrl);  }
      if (cfg.botToken) { this.BOT_TOKEN = cfg.botToken;  localStorage.setItem('ac_gascheck_tg_token', cfg.botToken);}
      if (cfg.chatId)   { this.CHAT_ID   = cfg.chatId;   localStorage.setItem('ac_gascheck_tg_chat',  cfg.chatId);  }
    }
  };
})();
