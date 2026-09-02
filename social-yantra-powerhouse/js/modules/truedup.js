/* ==========================================================================
 * Module 7 — True Dup (nest cloning)
 * ========================================================================== */
window.TrueDupMod = (function (SY) {
  'use strict';

  function init() {
    var go = document.getElementById('tdGo');
    if (!go) { return; }
    go.addEventListener('click', run);
  }

  function run() {
    var btn = document.getElementById('tdGo');
    var stat = document.getElementById('tdStat');
    var arg = {
      suffix: (document.getElementById('tdSuffix').value || '_CLONE'),
      all: document.getElementById('tdAll').checked
    };
    SY.busy(btn, true);
    stat.textContent = 'Cloning nests…';
    SY.call('trueDup', arg, function (r) {
      SY.busy(btn, false);
      if (!r.ok) { stat.textContent = '❌ ' + r.error; SY.toast(r.error, 'err', 5500); return; }
      var d = r.data;
      stat.innerHTML = '✅ Created <b>' + d.clones + '</b> independent clone(s):<br><span class="mini">' +
        d.details.map(SY.esc).join('<br>') + '</span>';
      SY.toast('True Dup: ' + d.clones + ' nest(s) cloned in place', 'ok');
      SY.log('trueDup: ' + d.details.join(' | '), 'ok');
    });
  }

  return { init: init };
})(window.SY);
