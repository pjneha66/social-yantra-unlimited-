/* ==========================================================================
 * Module 6 — Beat Detection & Auto-Cut to Music
 * Onset/tempo analysis on the same local PCM stream the VAD engine decodes,
 * then the existing razor engine cuts the timeline on the beat grid.
 * ========================================================================== */
window.BeatMod = (function (SY) {
  'use strict';

  var clips = [];      // flattened audio clips with track info
  var picked = null;   // chosen clip { mediaPath, start, end, inPoint, … }
  var det = null;      // detection result (media time)
  var tl = null;       // detection mapped to timeline time
  var cutPlan = [];
  var canvas = null, ctx = null, CW = 0, CH = 0;

  function el(id) { return document.getElementById(id); }

  function init() {
    if (!el('btAnalyze')) { return; }
    el('btReload').addEventListener('click', loadTracks);
    el('btPickSel').addEventListener('click', pickSelected);
    el('btAnalyze').addEventListener('click', analyze);
    el('btCut').addEventListener('click', function () { execute(false); });
    el('btMarkers').addEventListener('click', function () { execute(true); });
    el('btChapters').addEventListener('click', toChapters);
    ['btMode', 'btMinGap', 'btTarget', 'btRangeA', 'btRangeB'].forEach(function (id) {
      el(id).addEventListener('change', plan);
    });
    var mg = el('btMinGap');
    mg.addEventListener('input', function () { el('btMinGapV').textContent = (+mg.value).toFixed(2) + ' s'; plan(); });
    el('btMinGapV').textContent = (+mg.value).toFixed(2) + ' s';

    canvas = el('btCanvas');
    try { ctx = canvas.getContext('2d'); } catch (e) { ctx = null; }
    window.addEventListener('resize', function () { if (tl) { draw(); } });
    restore();
  }

  function restore() {
    var b = SY.settings.beat;
    el('btMinBpm').value = b.minBpm; el('btMaxBpm').value = b.maxBpm;
    el('btBar').value = b.beatsPerBar; el('btSnap').checked = !!b.snap;
    el('btMode').value = b.mode || 'every4';
    el('btMinGap').value = b.minGap;
    el('btMinGapV').textContent = (+b.minGap).toFixed(2) + ' s';
  }

  function persist() {
    var b = SY.settings.beat;
    b.minBpm = +el('btMinBpm').value || 55;
    b.maxBpm = +el('btMaxBpm').value || 210;
    b.beatsPerBar = +el('btBar').value || 4;
    b.snap = el('btSnap').checked;
    b.mode = el('btMode').value;
    b.minGap = +el('btMinGap').value || 0.12;
    SY.saveSettings();
    return b;
  }

  /* ------------------------- source picker ------------------------- */
  function loadTracks() {
    SY.call('getAudioTracks', null, function (r) {
      if (!r.ok) { el('btTracks').innerHTML = '<div class="empty">' + SY.esc(r.error) + '</div>'; return; }
      clips = [];
      (r.data.tracks || []).forEach(function (t) {
        t.clips.forEach(function (c) {
          if (!c.mediaPath) { return; }
          c.trackLabel = t.label;
          c.trackIndex = t.index;
          c.locked = t.locked;
          clips.push(c);
        });
      });
      render();
    });
  }

  function pickSelected() {
    var sel = clips.filter(function (c) { return c.selected; });
    if (!sel.length) {
      SY.call('getAudioTracks', null, function (r) {
        if (!r.ok || !(r.data.selection || []).length) { SY.toast('Nothing selected — click a clip row instead', 'warn'); return; }
        picked = r.data.selection[0];
        render();
      });
      return;
    }
    picked = sel[0];
    render();
    SY.toast('Using "' + picked.name + '" on ' + picked.trackLabel, 'ok');
  }

  function render() {
    var box = el('btTracks');
    if (!clips.length) {
      box.innerHTML = '<div class="empty">No media-linked audio clips. Import your music bed and drop it on an audio track.</div>';
      return;
    }
    box.innerHTML = clips.map(function (c, i) {
      var on = picked && picked.mediaPath === c.mediaPath && picked.trackIndex === c.trackIndex &&
        Math.abs(picked.start - c.start) < 0.01;
      return '<div class="list-row pick' + (on ? ' on' : '') + '" data-i="' + i + '">' +
        '<span class="tag ' + (on ? 'ok' : 'muted') + '">' + SY.esc(c.trackLabel) + '</span>' +
        '<span class="grow"><b>' + SY.esc(c.name) + '</b> <span class="mini">' +
        (c.end - c.start).toFixed(1) + 's on the timeline</span></span>' +
        (c.locked ? '<span class="tag err">locked</span>' : '') +
        '</div>';
    }).join('');
    var rows = box.querySelectorAll('[data-i]');
    for (var i = 0; i < rows.length; i++) {
      rows[i].addEventListener('click', function (e) {
        picked = clips[+e.currentTarget.getAttribute('data-i')];
        render();
        el('btStats').innerHTML = 'Ready: <b>' + SY.esc(picked.name) + '</b> on ' + SY.esc(picked.trackLabel) + ' — press Detect beats.';
      });
    }
  }

  /* ------------------------- detection ------------------------- */
  function analyze() {
    if (!picked) { SY.toast('Pick the music clip first', 'warn'); return; }
    var b = persist();
    SY.busy(el('btAnalyze'), true);
    el('btProg').style.display = 'block';
    el('btProg').querySelector('div').style.width = '6%';
    el('btStats').textContent = 'Decoding ' + picked.name + ' locally and computing the onset envelope…';

    SYBeat.detectMedia(picked.mediaPath, {
      minBpm: b.minBpm, maxBpm: b.maxBpm,
      beatsPerBar: b.beatsPerBar, snap: b.snap
    }, function (err, res) {
      SY.busy(el('btAnalyze'), false);
      if (err) {
        el('btStats').textContent = 'Analysis failed.';
        el('btProg').style.display = 'none';
        SY.toast('Beat analysis: ' + err.message, 'err', 6500);
        return;
      }
      det = res;
      tl = {
        bpm: res.bpm,
        confidence: res.confidence,
        periodSec: res.periodSec,
        beats: SYBeat.toTimeline(res.beats, picked),
        downbeats: SYBeat.toTimeline(res.downbeats, picked),
        onsets: SYBeat.toTimeline(res.onsets.map(function (o) { return o.t; }), picked),
        envelope: res.envelope,
        hopSec: res.hopSec,
        offsetSec: res.offsetSec,
        clip: picked,
        tempoScores: res.tempoScores || [],
        note: res.note || ''
      };
      el('btResultCard').style.display = 'block';
      el('btBpm').textContent = res.bpm ? res.bpm.toFixed(1) : '—';
      el('btConf').textContent = res.confidence ? Math.round(res.confidence * 100) + '%' : '—';
      el('btBeats').textContent = tl.beats.length;
      el('btBars').textContent = tl.downbeats.length;
      var alt = (res.tempoScores || []).slice().sort(function (x, y) { return y.score - x.score; }).slice(0, 4);
      el('btAlt').innerHTML = (res.note ? '<span class="tag warn">' + SY.esc(res.note) + '</span> ' : '') +
        'tempo candidates: ' + alt.map(function (a) { return a.bpm + ' (' + a.score.toFixed(2) + ')'; }).join(' · ');
      draw();
      plan();
      el('btProg').style.display = 'none';
      SY.log('beat detect: ' + res.bpm + ' bpm, ' + tl.beats.length + ' beats, confidence ' + res.confidence, 'ok');
      SY.toast(res.bpm ? (res.bpm.toFixed(1) + ' BPM · ' + tl.beats.length + ' beats') : 'No repeating rhythm found',
        res.bpm ? 'ok' : 'warn', 5000);
    }, function (bytes) {
      // ffmpeg decode progress is byte-based; show a gentle bar
      var mb = bytes / 1048576;
      el('btProg').querySelector('div').style.width = Math.min(92, 6 + mb * 4) + '%';
    });
  }

  /* ------------------------- canvas ------------------------- */
  function draw() {
    if (!ctx || !tl) { return; }
    var w = 600;
    try { w = canvas.parentNode.clientWidth || 600; } catch (e) { w = 600; }
    CW = canvas.width = Math.max(120, w);
    CH = canvas.height = 110;
    ctx.clearRect(0, 0, CW, CH);

    var env = tl.envelope || [];
    var t0 = picked.start, t1 = picked.end;
    var span = Math.max(0.2, t1 - t0);
    var max = 0;
    for (var i = 0; i < env.length; i++) { if (env[i] > max) { max = env[i]; } }
    max = max || 1;
    function X(t) { return 4 + ((t - t0) / span) * (CW - 8); }

    // onset envelope (media time -> timeline time)
    ctx.fillStyle = 'rgba(77,139,255,.55)';
    var step = Math.max(1, Math.floor(env.length / (CW * 2)));
    for (i = 0; i < env.length; i += step) {
      var t = picked.start + (i * tl.hopSec + tl.offsetSec) - (picked.inPoint || 0);
      if (t < t0 || t > t1) { continue; }
      var h = (env[i] / max) * (CH - 18);
      ctx.fillRect(X(t), CH - 8 - h, Math.max(1, (step * tl.hopSec / span) * (CW - 8)), h);
    }
    // beat lines
    ctx.strokeStyle = 'rgba(41,211,200,.85)';
    ctx.lineWidth = 1;
    for (i = 0; i < tl.beats.length; i++) {
      var x = X(tl.beats[i]);
      ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x, CH - 8); ctx.stroke();
    }
    // downbeats
    ctx.strokeStyle = '#7c5cff';
    ctx.lineWidth = 2;
    for (i = 0; i < tl.downbeats.length; i++) {
      var xd = X(tl.downbeats[i]);
      ctx.beginPath(); ctx.moveTo(xd, 2); ctx.lineTo(xd, CH - 6); ctx.stroke();
    }
    ctx.fillStyle = '#6f7a90';
    ctx.fillText(SY.fmtClock(t0), 4, 10);
    ctx.fillText(SY.fmtClock(t1), CW - 48, 10);
  }

  /* ------------------------- cut plan ------------------------- */
  function plan() {
    if (!tl) { return; }
    var b = persist();
    var every = 1, source = tl.beats, phase = 0;
    if (b.mode === 'every2') { every = 2; }
    else if (b.mode === 'every4') { every = Math.max(1, b.beatsPerBar || 4); }
    else if (b.mode === 'downbeats') { source = tl.downbeats; every = 1; }
    else if (b.mode === 'onsets') { source = tl.onsets; every = 1; }
    var a = parseFloat(el('btRangeA').value);
    var z = parseFloat(el('btRangeB').value);
    cutPlan = SYBeat.cutPoints(source, {
      every: every,
      minGap: b.minGap,
      start: isNaN(a) ? null : a,
      end: isNaN(z) ? null : z
    });
    var box = el('btCutList');
    if (!cutPlan.length) {
      box.innerHTML = '<div class="empty">No cut points in that range.</div>';
      return;
    }
    var shown = cutPlan.slice(0, 40).map(function (t) {
      return '<span class="tag info" style="margin:1px">' + SY.fmtClock(t) + '</span>';
    }).join(' ');
    box.innerHTML = '<div class="list-row" style="display:block;white-space:normal">' + shown +
      (cutPlan.length > 40 ? ' <span class="mini">+' + (cutPlan.length - 40) + ' more</span>' : '') + '</div>';
    el('btResult2').innerHTML = '<b>' + cutPlan.length + '</b> cut point(s) planned' +
      (every > 1 ? ' (every ' + every + ' beats)' : '') + ' · min gap ' + b.minGap.toFixed(2) + 's.';
  }

  /* ------------------------- execute ------------------------- */
  function execute(markersOnly) {
    if (!cutPlan.length) { SY.toast('Nothing to cut — detect beats first', 'warn'); return; }
    var target = el('btTarget').value;
    var arg = {
      times: cutPlan,
      markers: !!markersOnly,
      markerPrefix: 'BEAT',
      videoTracks: target === 'audio' ? [] : null,
      audioTracks: target === 'video' ? [] : null
    };
    SY.busy(el('btCut'), true);
    SY.call('razorPoints', arg, function (r) {
      SY.busy(el('btCut'), false);
      if (!r.ok) {
        el('btResult2').innerHTML = '❌ ' + SY.esc(r.error);
        SY.toast(r.error, 'err', 6000);
        return;
      }
      el('btResult2').innerHTML = markersOnly
        ? '✅ ' + r.data.markers + ' beat marker(s) placed — no cuts made.'
        : '✅ Razor hit <b>' + r.data.cuts + '</b> of ' + r.data.points + ' point(s)' +
          (r.data.note ? ' <span class="mini">' + SY.esc(r.data.note) + '</span>' : '');
      SY.toast(markersOnly ? 'Beat markers placed' : ('Cut at ' + r.data.cuts + ' beat point(s)'), 'ok');
      SYUI.connect();
    });
  }

  function toChapters() {
    if (!tl || !tl.downbeats.length) { SY.toast('Detect beats first', 'warn'); return; }
    var bars = [];
    for (var i = 0; i < tl.downbeats.length; i++) {
      bars.push({
        start: tl.downbeats[i],
        end: (i + 1 < tl.downbeats.length) ? tl.downbeats[i + 1] : tl.downbeats[i] + (tl.periodSec || 1) * (SY.settings.beat.beatsPerBar || 4),
        text: 'Bar ' + (i + 1) + ' · ' + tl.bpm + ' BPM'
      });
    }
    SY.lastBars = { intervals: bars, bpm: tl.bpm, from: picked ? picked.name : 'music' };
    SY.toast(bars.length + ' bars sent to the Chapters tab', 'ok');
    SYUI.goto('chapters');
    if (window.ChaptersMod && ChaptersMod.fromBars) { ChaptersMod.fromBars(); }
  }

  function refresh() { if (!clips.length) { loadTracks(); } }

  return { init: init, refresh: refresh, result: function () { return tl; }, plan: function () { return cutPlan; } };
})(window.SY);
