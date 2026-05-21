/**
 * AC_GASCHECK Platform i18n
 * Lightweight shared i18n — each module may override with its own
 */
(function() {
  var _lang = localStorage.getItem('ac_gascheck_lang') || 'zh';

  window.AC_I18N = {
    get: function()  { return _lang; },
    set: function(l) {
      _lang = l;
      localStorage.setItem('ac_gascheck_lang', l);
      // Update lang buttons platform-wide
      document.querySelectorAll('[data-lang-btn]').forEach(function(b) {
        b.classList.toggle('active', b.getAttribute('data-lang-btn') === l);
      });
    }
  };
})();
