/* ==========================================================================
 * Module 1 — AI Silence Cut & Voice Activity Detection
 * ========================================================================== */
window.SilenceMod = (function (SY) {
  'use strict';

  var gaps = [];      // [{start,end,selected}]
  var els = {};

  function init() {
    els = {
      scan: document.getElementById('silScan'),
      stats: document.getElementById('silStats'),
      prog: document.getElementById('silProg'),
      bar: els.prog ? document.querySelector('#silProg > div') : null,
      list: document.getElementById('silList'),
      cut: document.getElementById('silCut'),
      clear: document.getElementById('silClear')
    };
    if (!els.scan) { return; }

    bindRange('silThreshold', 'silThresholdV', function (v) { return v + ' dB'; });
    bindRange('silMinDur', 'silMinDurV', function (v) { return (+v).toFixed(2) + ' s'; });
    bindRange('silPadPre', 'silPadPreV', function (v) { return (+v).toFixed(2) + ' s'; });
    bindRange('silPadPost', 'silPadPostV', function (v) { return (+v).toFixed(2) + ' s'; });
    for (var k in els) { if (!els[k]) { SY.log('silence init: missing element ' + k, 'warn'); } }

    els.scan.addEventListener('click', scan);
    els.cut.addEventListener('click', cut);
    els.clear.addEventListener('click', function () {
      gaps = []; render(); els.cut.disabled = true; els.clear.disabled = true;
    });
    var refresh = document.getElementById('silRefresh');
    if (refresh) { refresh.addEventListener('click', function () { SYUI.connect(); SY.toast('Track info refreshed'); }); }
  }

  function bindRange(id, valId, fmt) {
    var el = document.getElementById(id), v = document.getElementById(valId);
    if (!el || !v) { return; }
    var upd = function () { v.textContent = fmt(el.value); };
    el.addEventListener('input', upd); upd();
    el.addEventListener('change', function () { persist(); });
  }

  function persist() {
    var s = SY.settings.silence;
    s.threshold = +val('silThreshold'); s.minDur = +val('silMinDur');
    s.padPre = +val('silPadPre'); s.padPost = +val('silPadPost');
    s.mode = document.getElementById('silMode').value;
    s.minCut = +val('silMinCut');
    s.linkAV = document.getElementById('selLinkAV').checked;
    SY.saveSettings();
  }

  function val(id) { var e = document.getElementById(id); return e ? e.value : ''; }

  function restoreUI() {
    var s = SY.settings.silence;
    set('silThreshold', s.threshold); set('silMinDur', s.minDur);
    set('silPadPre', s.padPre); set('silPadPost', s.padPost);
    set('silMinCut', s.minCut);
    document.getElementById('silMode').value = s.mode;
    document.getElementById('selLinkAV').checked = s.linkAV;
    ['silThreshold', 'silMinDur', 'silPadPre', 'silPadPost'].forEach(function (id) {
      var e = document.getElementById(id); e.dispatchEvent(new Event('input'));
    });
  }

  function set(id, v) { var e = document.getElementById(id); if (e && v !== undefined && v !== null) { e.value = v; } }

  function scan() {
    persist();
    SY.busy(els.scan, true);
    els.prog.style.display = 'block'; els.bar.style.width = '4%';
    els.stats.innerHTML = 'Analyzing audio waveforms locally…';
    SY.call('getAudioTopology', null, function (r) {
      if (!r.ok) { fail(r.error); return; }
      var topo = r.data;
      SY.log('VAD: ' + topo.audioClips.length + ' audio clip(s), ' + topo.seq.fps.toFixed(2) + ' fps');
      SYAudio.analyzeTimeline(topo.audioClips, {
        threshold: +val('silThreshold'),
        minDur: +val('silMinDur'),
        padPre: +val('silPadPre'),
        padPost: +val('silPadPost')
      }, function (err, res) {
        if (err) { fail(err.message); return; }
        els.bar.style.width = '100%';
        gaps = (res.gaps || []).map(function (g) {
          return { start: g[0], end: g[1], selected: true };
        }).filter(function (g) { return g.end - g.start >= +val('silMinCut'); });
        render();
        var total = gaps.reduce(function (a, g) { return a + (g.end - g.start); }, 0);
        els.stats.innerHTML = '<b>' + gaps.length + '</b> gaps · <b>' + total.toFixed(2) + 's</b> of silence · runtime saved ≈ <b>' +
          Math.max(0, topo.seq.duration - total).toFixed(1) + 's → ' + topo.seq.duration.toFixed(1) + 's</b>' +
          (res.failures.length ? ' · <span style="color:var(--warn)">' + res.failures.length + ' file(s) skipped</span>' : '');
        els.cut.disabled = !gaps.length;
        els.clear.disabled = !gaps.length;
        SY.busy(els.scan, false);
        setTimeout(function () { els.prog.style.display = 'none'; }, 600);
        SY.log('VAD done: ' + gaps.length + ' gaps, ' + total.toFixed(2) + 's', 'ok');
        SY.toast('Detected ' + gaps.length + ' silent gaps (' + total.toFixed(1) + 's)', 'ok');
      }, function (p) {
        els.bar.style.width = Math.round(p * 100) + '%';
        els.stats.innerHTML = 'Analyzing… ' + Math.round(p * 100) + '%';
      });
    });

    function fail(msg) {
      SY.busy(els.scan, false);
      els.prog.style.display = 'none';
      els.stats.textContent = 'Analysis failed.';
      SY.log('VAD failed: ' + msg, 'err');
      SY.toast(msg, 'err', 5200);
    }
  }

  function render() {
    if (!gaps.length) {
      els.list.innerHTML = '<div class="empty">No gaps detected (or thresholds too strict — try Fine Tune).</div>';
      return;
    }
    var html = '';
    gaps.forEach(function (g, i) {
      html += '<div class="list-row">' +
        '<input type="checkbox" data-i="' + i + '"' + (g.selected ? ' checked' : '') + '>' +
        '<span class="grow"><b>Gap ' + (i + 1) + '</b> · <span class="mono">' + SY.fmtTC(g.start) + ' → ' + SY.fmtTC(g.end) + '</span></span>' +
        '<span class="tag warn">' + (g.end - g.start).toFixed(2) + 's</span></div>';
    });
    els.list.innerHTML = html;
    var boxes = els.list.querySelectorAll('input[type=checkbox]');
    for (var b = 0; b < boxes.length; b++) {
      boxes[b].addEventListener('change', function (e) {
        gaps[+e.target.getAttribute('data-i')].selected = e.target.checked;
      });
    }
  }

  function cut() {
    var cuts = gaps.filter(function (g) { return g.selected; }).map(function (g) { return { start: g.start, end: g.end }; });
    if (!cuts.length) { SY.toast('No gaps selected', 'warn'); return; }
    persist();
    SY.busy(els.cut, true);
    SY.call('executeCuts', {
      cuts: cuts,
      mode: val('silMode'),
      previewOnly: document.getElementById('silPreviewOnly').checked,
      markerPrefix: 'SILENCE'
    }, function (r) {
      SY.busy(els.cut, false);
      if (!r.ok) { SY.toast('Cut failed: ' + r.error, 'err', 6000); return; }
      var d = r.data;
      SY.toast((d.markers !== undefined ? d.markers + ' preview markers' : 'Cut ' + d.applied + ' gaps · ' + d.clipsRemoved + ' clips removed · ' + d.secondsSaved.toFixed(2) + 's saved'), 'ok', 5000);
      SY.log('silence cut: ' + JSON.stringify(d), 'ok');
      if (!document.getElementById('silPreviewOnly').checked) {
        gaps = []; render(); els.cut.disabled = true; els.clear.disabled = true;
        SYUI.connect();
      }
    });
  }

  init();
  restoreUI();
  return { init: function () {}, rescan: scan };
})(window.SY);
