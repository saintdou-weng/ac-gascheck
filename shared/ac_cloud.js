/**
 * AC_GASCHECK Cloud Sync (shared)
 * Wraps GAS Web App calls with standard action routing
 */
(function() {
  window.AC_CLOUD = {
    push: function(module, data) {
      var cfg = window.AC_CFG ? window.AC_CFG.get() : {};
      var url = cfg.gasUrl || localStorage.getItem('ac_gascheck_gas_url') || '';
      if (!url) return Promise.reject(new Error('GAS URL 未設定'));
      var body = new URLSearchParams({
        payload: JSON.stringify({ action: module+'_save', module: module, data: data, ts: new Date().toISOString() })
      });
      return fetch(url, { method:'POST', body: body, redirect:'follow',
        headers:{'Content-Type':'application/x-www-form-urlencoded'} }).then(function(r){ return r.json(); });
    },
    pull: function(module) {
      var cfg = window.AC_CFG ? window.AC_CFG.get() : {};
      var url = cfg.gasUrl || localStorage.getItem('ac_gascheck_gas_url') || '';
      if (!url) return Promise.reject(new Error('GAS URL 未設定'));
      return fetch(url+'?action='+module+'_pull&_t='+Date.now(), { redirect:'follow' }).then(function(r){ return r.json(); });
    },
    ping: function() {
      var cfg = window.AC_CFG ? window.AC_CFG.get() : {};
      var url = cfg.gasUrl || localStorage.getItem('ac_gascheck_gas_url') || '';
      if (!url) return Promise.resolve({ok:false,error:'No GAS URL'});
      return fetch(url+'?action=ping&_t='+Date.now(), { redirect:'follow' }).then(function(r){ return r.json(); });
    }
  };
})();
