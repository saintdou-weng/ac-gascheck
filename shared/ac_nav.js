/**
 * AC_GASCHECK Nav (shared)
 * Provides AC_NAV.inject() for backward compatibility
 * Modules check: if(typeof AC_NAV==='undefined') return;
 * This file ensures that check passes without doing any injection
 * (each module has its own topbar)
 */
(function() {
  window.AC_NAV = {
    inject: function(moduleId, opts) {
      // Each module manages its own navigation.
      // This stub prevents ReferenceError for modules checking AC_NAV.
      // No DOM injection — module's own HTML already has the nav.
      console.log('[AC_NAV] Module:', moduleId, '— self-managed nav');
      if (opts && typeof opts.onReady === 'function') {
        opts.onReady();
      }
    },
    setCloudStatus: function(ok) {
      var badges = document.querySelectorAll('.cloud-badge, .ac-cloud-badge');
      badges.forEach(function(el) {
        el.className = el.className.replace(/\b(ok|err|off)\b/g,'').trim() + ' ' + (ok ? 'ok' : 'err');
      });
    }
  };
})();
