/* ==========================================================================
 * Social Yantra Powerhouse — app bootstrap, navigation, connection status
 * ========================================================================== */
window.SYUI = (function (SY) {
  'use strict';

  var UI = { current: 'silence' };

  function init() {
    document.body.classList.toggle('demo', !SY.inCEP);

    // nav
    var btns = document.querySelectorAll('.nav-btn');
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () { UI.goto(btn.getAttribute('data-view')); });
      })(btns[i]);
    }

    // accordions
    var heads = document.querySelectorAll('.acc-head');
    for (var a = 0; a < heads.length; a++) {
      (function (h) {
        h.addEventListener('click', function (e) {
          if (e.target.closest && e.target.closest('input,button,select')) { return; }
          h.parentNode.classList.toggle('open');
        });
      })(heads[a]);
    }

    // chip groups (multi)
    document.addEventListener('click', function (e) {
      var chip = e.target.closest ? e.target.closest('.chip') : null;
      if (!chip || !chip.hasAttribute('data-qc')) { return; }
      chip.classList.toggle('on');
    });

    // module inits
    ['SilenceMod', 'FillerMod', 'FlowMod', 'WordPopMod', 'NestMod', 'AssetsMod',
     'TrueDupMod', 'ToolsMod', 'ModelsMod', 'SettingsMod'].forEach(function (name) {
      if (window[name] && typeof window[name].init === 'function') {
        try { window[name].init(); } catch (e) { SY.log(name + ' init failed: ' + e.message, 'err'); }
      }
    });

    connect();
    setInterval(refreshSeqInfo, 4000);
    SY.log('Social Yantra Powerhouse Panel started' + (SY.inCEP ? ' (CEP' + (SY.hasNode ? ' + Node' : '') + ')' : ' (browser demo)'), 'ok');
  }

  function goto(view) {
    UI.current = view;
    var btns = document.querySelectorAll('.nav-btn');
    for (var i = 0; i < btns.length; i++) { btns[i].classList.toggle('active', btns[i].getAttribute('data-view') === view); }
    var views = document.querySelectorAll('.view');
    for (var v = 0; v < views.length; v++) { views[v].classList.toggle('active', views[v].id === 'view-' + view); }
    if (view === 'settings') { SettingsMod.refresh(); }
    if (view === 'models') { ModelsMod.refresh(); }
    if (view === 'nest') { NestMod.refreshList(); }
    if (view === 'assets') { AssetsMod.refresh(); }
  }

  function connect() {
    var dot = document.getElementById('connDot'), label = document.getElementById('connLabel');
    SY.call('ping', null, function (r) {
      if (r.ok && r.data) {
        dot.className = 'dot ok';
        label.textContent = 'Premiere ' + (r.data.version || '') + (r.data.qe === 'available' ? ' · QE' : '');
        refreshSeqInfo();
      } else {
        dot.className = 'dot bad';
        label.textContent = SY.inCEP ? 'script error' : 'demo mode';
      }
    });
  }

  function refreshSeqInfo() {
    if (!SY.inCEP || UI.current === 'settings') { return; }
    SY.call('seqInfo', null, function (r) {
      var el = document.getElementById('seqInfo');
      if (r.ok) {
        el.textContent = r.data.name + ' · ' + r.data.width + '×' + r.data.height +
          ' · ' + r.data.fps.toFixed(2) + ' fps · ' + r.data.duration.toFixed(1) + 's' +
          ' · V' + r.data.numVideoTracks + '/A' + r.data.numAudioTracks;
        UI.seq = r.data;
      } else {
        el.textContent = 'No active sequence';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);

  UI.goto = goto;
  UI.connect = connect;
  return UI;
})(window.SY);
