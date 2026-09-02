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

    // tool search / jump box
    var search = document.getElementById('navSearch');
    if (search) {
      search.addEventListener('input', function () {
        var q = search.value.toLowerCase().trim();
        var btns2 = document.querySelectorAll('.nav-btn');
        for (var i = 0; i < btns2.length; i++) {
          var hay = ((btns2[i].getAttribute('data-words') || '') + ' ' + (btns2[i].getAttribute('title') || '')).toLowerCase();
          btns2[i].classList.toggle('dim', !!q && hay.indexOf(q) === -1);
        }
        var groups = document.querySelectorAll('.nav-group');
        for (var g = 0; g < groups.length; g++) {
          groups[g].classList.toggle('dim', !!q && groups[g].textContent.toLowerCase().indexOf(q) === -1);
        }
        if (q) {
          var first = document.querySelector('.nav-btn:not(.dim)');
          if (first && first.classList.contains('only-match')) { goto(first.getAttribute('data-view')); }
        }
      });
      search.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.keyCode !== 13) { return; }
        var first = document.querySelector('.nav-btn:not(.dim)');
        if (first) { goto(first.getAttribute('data-view')); search.blur(); }
      });
    }

    // module inits
    ['SilenceMod', 'FillerMod', 'ChaptersMod', 'DuckMod', 'BeatMod', 'FlowMod', 'WordPopMod',
     'NestMod', 'AssetsMod', 'TrueDupMod', 'ToolsMod', 'NestSeqMod', 'QuickFxMod', 'LayersMod',
     'AIImageMod', 'MediaGetMod', 'ModelsMod', 'SettingsMod'].forEach(function (name) {
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
    // highlight the group this tab belongs to
    var activeBtn = document.querySelector('.nav-btn[data-view="' + view + '"]');
    var group = activeBtn ? activeBtn.getAttribute('data-group') : '';
    var groups = document.querySelectorAll('.nav-group');
    for (var g = 0; g < groups.length; g++) {
      groups[g].classList.toggle('on', groups[g].getAttribute('data-group') === group);
    }
    if (view === 'settings' && window.SettingsMod) { SettingsMod.refresh(); }
    if (view === 'models' && window.ModelsMod) { ModelsMod.refresh(); }
    if (view === 'nest' && window.NestMod) { NestMod.refreshList(); }
    if (view === 'assets' && window.AssetsMod) { AssetsMod.refresh(); }
    if (view === 'duck' && window.DuckMod) { DuckMod.refresh(); }
    if (view === 'beat' && window.BeatMod) { BeatMod.refresh(); }
    if (view === 'chapters' && window.ChaptersMod) { ChaptersMod.refresh(); }
    if (view === 'tools' && window.NestSeqMod) { NestSeqMod.refresh(); }
    if (view === 'quickfx' && window.QuickFxMod) { QuickFxMod.refresh(false); }
    if (view === 'layers' && window.LayersMod) { LayersMod.refresh(); }
    if (view === 'aiimage' && window.AIImageMod) { AIImageMod.refresh(); }
    if (view === 'mediaget' && window.MediaGetMod) { MediaGetMod.refresh(); }
    SY.settings.nav.lastView = view;
    try { SY.saveSettings(); } catch (e) { /* noop */ }
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
