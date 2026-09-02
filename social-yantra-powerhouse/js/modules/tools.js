/* ==========================================================================
 * Module 8 — Dedicated Timeline Shortcut Tools
 * ========================================================================== */
window.ToolsMod = (function (SY) {
  'use strict';

  function init() {
    if (!document.getElementById('tlAdjPer')) { return; }

    /* Smart adjustment layers */
    document.getElementById('tlAdjPer').addEventListener('click', function () { adj('perClip'); });
    document.getElementById('tlAdjSpan').addEventListener('click', function () { adj('span'); });
    document.getElementById('tlAdjAdopt').addEventListener('click', adopt);

    /* Staircase stagger */
    document.getElementById('tlStairUp').addEventListener('click', function () { stair(1); });
    document.getElementById('tlStairDown').addEventListener('click', function () { stair(-1); });

    /* Freeze frame */
    document.getElementById('tlFreeze').addEventListener('click', freeze);
    document.getElementById('tlFreezeReveal').addEventListener('click', function () {
      if (SY.hasNode) { SY.reveal(SY.paths.freeze); } else { SY.toast('Demo mode', 'warn'); }
    });

    /* QC checker */
    document.getElementById('tlQcGo').addEventListener('click', qc);
  }

  function adj(mode) {
    var stat = document.getElementById('tlAdjStat');
    SY.call('adjAdd', { mode: mode }, function (r) {
      if (!r.ok) { stat.textContent = '❌ ' + r.error; SY.toast(r.error, 'err', 6000); return; }
      stat.innerHTML = '✅ Placed <b>' + r.data.placed + '</b> adjustment layer(s) (' +
        (mode === 'span' ? 'spanning selection' : 'one per clip') + ')' + (r.data.note ? ' — ' + r.data.note : '');
      SY.toast('Adjustment layers placed', 'ok');
    });
  }

  function adopt() {
    var stat = document.getElementById('tlAdjStat');
    SY.call('adjFindTemplate', {}, function (r) {
      if (!r.ok) { stat.textContent = '❌ ' + r.error; return; }
      if (r.data.found) {
        stat.innerHTML = '✅ Template found: <b>' + SY.esc(r.data.name) + '</b> — ready to use.';
        SY.toast('Adopted "' + r.data.name + '" as the adjustment-layer template', 'ok');
      } else {
        stat.innerHTML = 'No template yet — in Premiere: <b>File › New › Adjustment Layer</b>, keep the default name, then Adopt again.';
      }
    });
  }

  function stair(dir) {
    var arg = {
      dir: dir,
      frames: +document.getElementById('tlStairN').value || 12,
      trackShift: +document.getElementById('tlStairT').value || 0
    };
    SY.call('staircase', arg, function (r) {
      if (!r.ok) { SY.toast(r.error, 'err', 5000); return; }
      SY.toast('Staggered ' + r.data.moved + ' clips' + (r.data.note ? ' — ' + r.data.note : ''), r.data.note ? 'warn' : 'ok', 5000);
    });
  }

  function freeze() {
    var folder = SY.paths.freeze || '';
    var arg = folder ? { folder: folder } : {};
    SY.call('freezeFrame', arg, function (r) {
      if (!r.ok) { SY.toast(r.error, 'err', 5000); return; }
      SY.toast('Still saved: ' + r.data.path, 'ok', 4500);
      if (SY.hasNode) { SY.reveal(r.data.path); }
    });
  }

  function qc() {
    var list = document.getElementById('tlQcList');
    var kinds = { gaps: false, offline: false, silence: false };
    var chips = document.querySelectorAll('[data-qc]');
    for (var i = 0; i < chips.length; i++) {
      if (chips[i].classList.contains('on')) { kinds[chips[i].getAttribute('data-qc')] = true; }
    }
    list.innerHTML = '<div class="empty">Scanning…</div>';
    SY.call('qcScan', {
      gaps: kinds.gaps, offline: kinds.offline, silence: kinds.silence,
      markers: document.getElementById('tlQcMarkers').checked
    }, function (r) {
      if (!r.ok) { list.innerHTML = '<div class="empty">' + SY.esc(r.error) + '</div>'; return; }
      var issues = r.data.issues || [];
      if (!issues.length) {
        list.innerHTML = '<div class="empty">✅ Clean timeline — no blank frames, offline media or silent holes found.</div>';
        SY.toast('QC scan: clean ✓', 'ok');
        return;
      }
      var html = issues.map(function (iss) {
        var tag = iss.kind === 'offline' ? 'err' : (iss.kind === 'blank' ? 'warn' : 'info');
        return '<div class="list-row"><span class="tag ' + tag + '">' + iss.kind + '</span>' +
          '<span class="grow">' + SY.esc(iss.text) + '</span>' +
          '<span class="mono">' + SY.fmtTC(iss.at) + '</span></div>';
      }).join('');
      list.innerHTML = html;
      SY.toast('QC scan: ' + issues.length + ' issue(s) flagged' + (document.getElementById('tlQcMarkers').checked ? ' + markers' : ''), 'warn');
    });
  }

  return { init: init };
})(window.SY);
