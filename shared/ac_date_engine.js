/**
 * AC_GASCHECK Date Engine (shared)
 * Factory function — each module creates its own instance
 */
(function() {
  window.AC_DATE_ENGINE = function(labelId, onChange) {
    var _period = 'month';
    var _anchor = new Date();

    function pad2(n) { return String(n).padStart(2,'0'); }
    function fmtDate(d) {
      return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
    }
    function startOf(p, d) {
      var a = new Date(d);
      if (p==='day')   return new Date(a.getFullYear(),a.getMonth(),a.getDate());
      if (p==='week')  { var dow=a.getDay(); return new Date(a.getFullYear(),a.getMonth(),a.getDate()-dow); }
      if (p==='month') return new Date(a.getFullYear(),a.getMonth(),1);
      if (p==='year')  return new Date(a.getFullYear(),0,1);
      return a;
    }
    function endOf(p, d) {
      var a = new Date(d);
      if (p==='day')   return new Date(a.getFullYear(),a.getMonth(),a.getDate(),23,59,59);
      if (p==='week')  { var dow=a.getDay(); return new Date(a.getFullYear(),a.getMonth(),a.getDate()+(6-dow)); }
      if (p==='month') return new Date(a.getFullYear(),a.getMonth()+1,0);
      if (p==='year')  return new Date(a.getFullYear(),11,31);
      return a;
    }
    function getLabel() {
      if (_period==='day')   return fmtDate(_anchor);
      if (_period==='week')  return fmtDate(startOf('week',_anchor))+' ~ '+fmtDate(endOf('week',_anchor));
      if (_period==='month') return _anchor.getFullYear()+'-'+pad2(_anchor.getMonth()+1);
      if (_period==='year')  return String(_anchor.getFullYear());
      return '';
    }
    function getRange() {
      return { from: fmtDate(startOf(_period,_anchor)), to: fmtDate(endOf(_period,_anchor)) };
    }
    function sync(trigger) {
      var el = document.getElementById(labelId);
      if (el) el.textContent = getLabel();
      if (trigger && onChange) onChange(getRange());
    }
    function set(p, el) {
      _period = p;
      if (el) {
        var container = el.closest ? el.closest('.dn-periods') : el.parentNode;
        if (container) container.querySelectorAll('.dnp').forEach(function(b){ b.classList.remove('on'); });
        el.classList.add('on');
      }
      sync(true);
    }
    function prev() {
      if (_period==='day')   _anchor.setDate(_anchor.getDate()-1);
      else if (_period==='week')  _anchor.setDate(_anchor.getDate()-7);
      else if (_period==='month') _anchor.setMonth(_anchor.getMonth()-1);
      else if (_period==='year')  _anchor.setFullYear(_anchor.getFullYear()-1);
      sync(true);
    }
    function next() {
      if (_period==='day')   _anchor.setDate(_anchor.getDate()+1);
      else if (_period==='week')  _anchor.setDate(_anchor.getDate()+7);
      else if (_period==='month') _anchor.setMonth(_anchor.getMonth()+1);
      else if (_period==='year')  _anchor.setFullYear(_anchor.getFullYear()+1);
      sync(true);
    }
    function today() { _anchor = new Date(); sync(true); }
    function inRange(dateStr) {
      var d = (dateStr||'').split('T')[0];
      var r = getRange();
      return d >= r.from && d <= r.to;
    }
    sync(false); // initialize label without triggering onChange
    return { set: set, prev: prev, next: next, today: today, getRange: getRange, inRange: inRange };
  };
})();
