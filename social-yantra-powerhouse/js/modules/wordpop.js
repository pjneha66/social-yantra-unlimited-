/* ==========================================================================
 * Module 4 — Automated Word-Pop Captions & Subtitles
 * ========================================================================== */
window.WordPopMod = (function (SY) {
  'use strict';

  var cues = []; // [{start,end,text}]
  var els = {};

  function init() {
    els = {
      stat: document.getElementById('wpStat'),
      list: document.getElementById('wpList'),
      create: document.getElementById('wpCreate')
    };
    if (!els.create) { return; }
    document.getElementById('wpFromFiller').addEventListener('click', fromWhisper);
    document.getElementById('wpImportSrt').addEventListener('click', importSrt);
    document.getElementById('wpCreate').addEventListener('click', createTrack);
    document.getElementById('wpBakePop').addEventListener('click', bakePop);
    ['wpWords', 'wpHold', 'wpPop'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', regen);
    });
    document.getElementById('wpUpper').addEventListener('change', regen);
    var s = SY.settings.wordpop;
    document.getElementById('wpWords').value = s.wordsPerCap;
    document.getElementById('wpHold').value = s.holdCap;
    document.getElementById('wpPop').value = s.popScale;
    document.getElementById('wpUpper').checked = s.upper;
  }

  function words() { return SY.lastTranscript && SY.lastTranscript.words ? SY.lastTranscript.words : null; }

  function fromWhisper() {
    SY.busy(document.getElementById('wpFromFiller'), true);
    if (words() && Date.now() - SY.lastTranscript.at < 3600000) {
      build(words(), null);
      SY.busy(document.getElementById('wpFromFiller'), false);
      return;
    }
    // transcribe now (same pipeline as filler module)
    if (!window.FillerMod) { SY.busy(document.getElementById('wpFromFiller'), false); return; }
    document.getElementById('fillAnalyze').click();
    var waited = 0;
    (function poll() {
      waited += 500;
      if (words()) {
        build(words(), null);
        SY.busy(document.getElementById('wpFromFiller'), false);
      } else if (waited < 240000) { setTimeout(poll, 500); }
      else {
        SY.busy(document.getElementById('wpFromFiller'), false);
        SY.toast('Transcription timed out', 'err');
      }
    })();
  }

  function importSrt() {
    SY.pickFile(['srt', 'vtt'], function (p) {
      if (!p) { return; }
      var txt = SY.readText(p);
      if (!txt && !SY.hasNode) { txt = '1\n00:00:01,000 --> 00:00:02,400\nThis is a demo caption line\n\n2\n00:00:02,400 --> 00:00:04,100\nwith word-pop hold logic.'; }
      if (!txt) { SY.toast('Could not read file', 'err'); return; }
      var parsed = SY.parseSrt(txt);
      if (!parsed.length) { SY.toast('No cues found in file', 'warn'); return; }
      // explode cue words with proportional timing
      var ws = [];
      parsed.forEach(function (c) {
        var toks = c.text.split(/\s+/).filter(Boolean);
        if (!toks.length) { return; }
        var per = (c.end - c.start) / toks.length;
        toks.forEach(function (tk, i) { ws.push({ w: tk, start: c.start + i * per, end: c.start + (i + 1) * per }); });
      });
      build(ws, null);
    });
  }

  function fromPaste() {
    var txt = (document.getElementById('wpPaste').value || '').trim();
    if (!txt) { SY.toast('Paste a script first', 'warn'); return; }
    var dur = 20;
    if (SYUI.seq && SYUI.seq.duration) { dur = SYUI.seq.duration; }
    var toks = txt.split(/\s+/).filter(Boolean);
    var per = Math.min(0.6, dur / toks.length);
    var ws = toks.map(function (tk, i) { return { w: tk, start: i * per, end: (i + 1) * per - 0.02 }; });
    build(ws, null);
  }

  function build(ws, offset) {
    if (!ws || !ws.length) { SY.toast('No words available — transcribe or import first', 'warn'); return; }
    var per = Math.max(1, +document.getElementById('wpWords').value || 1);
    var holdCap = Math.min(0.8, +document.getElementById('wpHold').value || 0.8);
    var upper = document.getElementById('wpUpper').checked;
    ws = ws.slice().sort(function (a, b) { return a.start - b.start; });

    cues = [];
    for (var i = 0; i < ws.length; i += per) {
      var grp = ws.slice(i, i + per);
      var start = grp[0].start;
      var text = grp.map(function (g) { return g.w; }).join(' ');
      if (upper) { text = text.toUpperCase(); }
      var nextStart = (i + per < ws.length) ? ws[i + per].start : (grp[grp.length - 1].end + holdCap);
      var end = Math.min(nextStart, grp[grp.length - 1].end + holdCap);
      cues.push({ start: start, end: Math.max(end, start + 0.12), text: text });
    }
    render();
    els.create.disabled = !cues.length;
    var total = cues.reduce(function (a, c) { return a + (c.end - c.start); }, 0);
    els.stat.innerHTML = 'Built <b>' + cues.length + '</b> caption events · ' + total.toFixed(1) + 's coverage · hold cap ' + holdCap.toFixed(2) + 's';
  }

  function regen() {
    SY.settings.wordpop = {
      wordsPerCap: +document.getElementById('wpWords').value,
      holdCap: +document.getElementById('wpHold').value,
      popScale: +document.getElementById('wpPop').value,
      upper: document.getElementById('wpUpper').checked
    };
    SY.saveSettings();
    if (words()) { build(words(), null); }
  }

  function render() {
    if (!cues.length) {
      els.list.innerHTML = '<div class="empty">No caption data yet.</div>';
      return;
    }
    var html = '';
    cues.slice(0, 60).forEach(function (c, i) {
      html += '<div class="list-row"><span class="mono" style="min-width:88px">' + SY.fmtTC(c.start) + '</span>' +
        '<span class="grow">' + SY.esc(c.text) + '</span>' +
        '<span class="tag info">' + (c.end - c.start).toFixed(2) + 's</span></div>';
    });
    if (cues.length > 60) { html += '<div class="empty">… ' + (cues.length - 60) + ' more</div>'; }
    els.list.innerHTML = html;
  }

  function srtText() {
    function tc(s) {
      var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), ms = Math.round((s - Math.floor(s)) * 1000);
      function p2(n) { return (n < 10 ? '0' : '') + n; }
      return p2(h) + ':' + p2(m) + ':' + p2(sec) + ',' + (ms < 100 ? (ms < 10 ? '00' : '0') : '') + ms;
    }
    return cues.map(function (c, i) {
      return (i + 1) + '\n' + tc(c.start) + ' --> ' + tc(c.end) + '\n' + c.text + '\n';
    }).join('\n');
  }

  function createTrack() {
    if (!cues.length) { return; }
    var path = null;
    if (SY.hasNode) {
      var p = SY.require('path');
      path = p.join(SY.paths.temp, 'wordpop_' + SY.uid() + '.srt');
      if (!SY.writeText(path, srtText())) { SY.toast('Could not write SRT (check Documents folder permissions)', 'err'); return; }
    } else {
      SY.toast('Demo mode: SRT generated in-memory only', 'warn');
      return;
    }
    SY.busy(els.create, true);
    SY.call('createCaptionTrackFromSrt', { srtPath: path, offsetSeconds: 0 }, function (r) {
      SY.busy(els.create, false);
      if (!r.ok) { SY.toast(r.error, 'err', 6500); return; }
      SY.toast('Native caption track created — ' + cues.length + ' events', 'ok', 4500);
      els.stat.innerHTML = '✅ ' + r.data.note;
    });
  }

  function bakePop() {
    var ws = words();
    if (!ws) { SY.toast('Transcribe first (captions tab or filler tab)', 'warn'); return; }
    SY.call('bakeWordPop', {
      words: ws.map(function (w) { return { start: w.start, end: w.end }; }),
      popScale: +document.getElementById('wpPop').value || 115,
      dur: 0.09
    }, function (r) {
      if (!r.ok) { SY.toast(r.error, 'err', 5000); return; }
      SY.toast('Word-pop baked on ' + r.data.clipsPopped + ' clip(s)', 'ok');
    });
  }

  function onTranscript() { if (words()) { build(words(), null); } }

  // paste → build
  document.addEventListener('DOMContentLoaded', function () {
    var area = document.getElementById('wpPaste');
    if (area) { area.addEventListener('change', fromPaste); }
  });

  return { init: init, onTranscript: onTranscript, rebuild: build };
})(window.SY);
