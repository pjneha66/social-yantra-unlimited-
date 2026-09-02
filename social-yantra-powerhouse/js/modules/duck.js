/* ==========================================================================
 * Module 5 — Music Auto-Ducking
 * Dialogue detection (VAD speech mask or Whisper transcript) → duck envelope
 * → Volume › Level keyframes on the chosen audio track.
 * ========================================================================== */
window.DuckMod = (function (SY) {
  'use strict';

  var tracks = [];          // from SY.getAudioTracks
  var target = null;        // track index to duck
  var speech = [];          // timeline speech intervals
  var envelope = null;      // SYDuck envelope
  var canvas = null, ctx = null, CW = 0, CH = 0;

  function el(id) { return document.getElementById(id); }

  function init() {
    if (!el('dkScan')) { return; }

    el('dkScan').addEventListener('click', scan);
    el('dkApply').addEventListener('click', function () { send('keys'); });
    el('dkPreview').addEventListener('click', function () { send('markers'); });
    el('dkClear').addEventListener('click', function () { send('clear'); });
    el('dkReload').addEventListener('click', loadTracks);
    el('dkGuess').addEventListener('click', guessTarget);
    el('dkSource').addEventListener('change', function () {
      SY.settings.duck.source = this.value;
      SY.saveSettings();
    });

    bindRange('dkThreshold', 'dkThresholdV', ' dB', function (v) { SY.settings.duck.threshold = v; });
    bindRange('dkMinSpeech', 'dkMinSpeechV', ' ms', function (v) { SY.settings.duck.minSpeechMs = v; });
    bindRange('dkAmount', 'dkAmountV', ' dB', function (v) { SY.settings.duck.duckDb = v; redraw(); });
    bindRange('dkBase', 'dkBaseV', ' dB', function (v) { SY.settings.duck.baseDb = v; redraw(); });
    bindRange('dkAttack', 'dkAttackV', ' ms', function (v) { SY.settings.duck.attackMs = v; redraw(); });
    bindRange('dkRelease', 'dkReleaseV', ' ms', function (v) { SY.settings.duck.releaseMs = v; redraw(); });
    bindRange('dkHold', 'dkHoldV', ' ms', function (v) { SY.settings.duck.holdGapMs = v; redraw(); });

    canvas = el('dkCanvas');
    try { ctx = canvas.getContext('2d'); } catch (e) { ctx = null; }
    window.addEventListener('resize', function () { sizeCanvas(); redraw(); });
    sizeCanvas();
    restore();
  }

  function bindRange(id, valId, suffix, onChange) {
    var input = el(id), out = el(valId);
    if (!input) { return; }
    input.addEventListener('input', function () {
      out.textContent = input.value + suffix;
      if (onChange) { onChange(+input.value); SY.saveSettings(); }
    });
  }

  function restore() {
    var d = SY.settings.duck;
    set('dkThreshold', d.threshold === undefined ? -38 : d.threshold, ' dB', 'dkThresholdV');
    set('dkMinSpeech', d.minSpeechMs, ' ms', 'dkMinSpeechV');
    set('dkAmount', d.duckDb, ' dB', 'dkAmountV');
    set('dkBase', d.baseDb, ' dB', 'dkBaseV');
    set('dkAttack', d.attackMs, ' ms', 'dkAttackV');
    set('dkRelease', d.releaseMs, ' ms', 'dkReleaseV');
    set('dkHold', d.holdGapMs, ' ms', 'dkHoldV');
    el('dkSource').value = d.source || 'vad';
  }
  function set(id, v, suffix, valId) {
    var input = el(id);
    if (!input) { return; }
    input.value = v;
    el(valId).textContent = v + suffix;
  }

  function opts() {
    var d = SY.settings.duck;
    return {
      baseDb: +el('dkBase').value || 0,
      duckDb: +el('dkAmount').value || -12,
      attackMs: +el('dkAttack').value || 120,
      releaseMs: +el('dkRelease').value || 450,
      holdGapMs: +el('dkHold').value || 250,
      minSpeechMs: +el('dkMinSpeech').value || 100,
      rampSteps: 3
    };
  }

  /* ------------------------- tracks ------------------------- */
  function loadTracks() {
    SY.call('getAudioTracks', null, function (r) {
      if (!r.ok) { el('dkTracks').innerHTML = '<div class="empty">' + SY.esc(r.error) + '</div>'; return; }
      tracks = r.data.tracks || [];
      renderTracks();
      if (target === null && tracks.length) { guessTarget(true); }
    });
  }

  function renderTracks() {
    var box = el('dkTracks');
    if (!tracks.length) { box.innerHTML = '<div class="empty">The active sequence has no audio tracks.</div>'; return; }
    box.innerHTML = tracks.map(function (t) {
      var names = [];
      for (var i = 0; i < t.clips.length && i < 3; i++) { names.push(t.clips[i].name); }
      var more = t.clips.length > 3 ? ' +' + (t.clips.length - 3) : '';
      return '<div class="list-row pick' + (target === t.index ? ' on' : '') + '" data-tr="' + t.index + '">' +
        '<span class="tag ' + (target === t.index ? 'ok' : 'muted') + '">' + SY.esc(t.label) + '</span>' +
        '<span class="grow"><b>' + t.clips.length + '</b> clip' + (t.clips.length === 1 ? '' : 's') +
        ' <span class="mini">' + SY.esc(names.join(', ') + more) + '</span></span>' +
        (t.locked ? '<span class="tag err">locked</span>' : '') +
        '</div>';
    }).join('');
    var rows = box.querySelectorAll('[data-tr]');
    for (var i = 0; i < rows.length; i++) {
      rows[i].addEventListener('click', function (e) {
        target = +e.currentTarget.getAttribute('data-tr');
        renderTracks();
      });
    }
  }

  /* Heuristic: the "music" track is usually the highest audio track, or the one
   * whose clips are fewest & longest (a bed under many dialogue clips). */
  function guessTarget(quiet) {
    if (!tracks.length) { return; }
    var best = null, bestScore = -Infinity;
    tracks.forEach(function (t) {
      if (t.locked) { return; }
      var span = 0;
      t.clips.forEach(function (c) { span += (c.end - c.start); });
      var avg = t.clips.length ? span / t.clips.length : 0;
      var score = t.index * 2 + Math.min(avg, 60) / 20 - t.clips.length * 0.35;
      if (score > bestScore) { bestScore = score; best = t.index; }
    });
    if (best === null) { return; }
    target = best;
    renderTracks();
    if (!quiet) { SY.toast('Music track guess: A' + (best + 1) + ' — change it by clicking a row', 'ok'); }
  }

  function trackTag() {
    var tag = el('dkTrackTag');
    tag.textContent = target === null ? 'no target' : 'ducking A' + (target + 1);
    tag.className = 'tag ' + (target === null ? 'muted' : 'ok');
  }

  /* ------------------------- dialogue scan ------------------------- */
  function scan() {
    var src = el('dkSource').value;
    SY.busy(el('dkScan'), true);
    el('dkProg').style.display = 'block';
    el('dkProg').querySelector('div').style.width = '8%';
    el('dkStats').textContent = src === 'transcript' ? 'Reading the last transcript…' : 'Decoding audio locally (ffmpeg)…';

    if (src === 'transcript') {
      var tr = SY.lastTranscript;
      if (!tr || !tr.words || !tr.words.length) {
        fail('No transcript yet — run Transcribe in the Filler Remover tab first, or switch the source to VAD.');
        return;
      }
      var iv = tr.words.map(function (w) { return [w.start, w.end]; });
      done(SYAudio.merge(iv), tr.words.length + ' transcript words');
      return;
    }

    SY.call('getAudioTopology', null, function (r) {
      if (!r.ok) { fail(r.error); return; }
      var clips = (r.data.audioClips || []).filter(function (c) { return c.trackIndex !== target; });
      if (!clips.length) { clips = r.data.audioClips || []; }
      if (!clips.length) { fail('No media-linked audio found on the dialogue tracks.'); return; }
      SYAudio.speechIntervals(clips, {
        threshold: +el('dkThreshold').value,
        minDur: 0.2,
        padPre: 0.02,
        padPost: 0.02
      }, function (err, res) {
        if (err) { fail(err.message); return; }
        done(res.speech, res.media + ' media file(s) decoded · ' + (res.failures || []).length + ' skipped');
      }, function (p) {
        el('dkProg').querySelector('div').style.width = (8 + p * 84) + '%';
        el('dkStats').textContent = 'Analyzing waveforms… ' + Math.round(p * 100) + '%';
      });
    });

    function fail(msg) {
      SY.busy(el('dkScan'), false);
      el('dkProg').style.display = 'none';
      el('dkStats').textContent = 'Scan failed.';
      SY.toast(msg, 'err', 6000);
    }
    function done(iv, note) {
      SY.busy(el('dkScan'), false);
      el('dkProg').querySelector('div').style.width = '100%';
      speech = iv || [];
      var spoken = speech.reduce(function (a, s) { return a + (s[1] - s[0]); }, 0);
      el('dkStats').innerHTML = '<b>' + speech.length + '</b> dialogue region(s) · <b>' +
        spoken.toFixed(1) + ' s</b> of speech · ' + SY.esc(note);
      redraw();
      setTimeout(function () { el('dkProg').style.display = 'none'; }, 600);
      SY.log('duck scan: ' + speech.length + ' speech regions', 'ok');
    }
  }

  /* ------------------------- envelope ------------------------- */
  function buildEnvelope() {
    if (!speech.length) { return null; }
    var e = SYDuck.buildEnvelope(speech, opts());
    if (SYUI.seq && SYUI.seq.duration) { e.duration = SYUI.seq.duration; }
    return e;
  }

  function redraw() {
    envelope = buildEnvelope();
    trackTag();
    var stat = el('dkEnvelopeStat');
    if (!envelope || !envelope.keys.length) {
      stat.textContent = 'No dialogue detected yet — run a scan first.';
      if (ctx) { clearCanvas(); }
      return;
    }
    stat.innerHTML = '<b>' + envelope.regions.length + '</b> duck region(s) · <b>' + envelope.keyCount +
      '</b> keyframes · ducked <b>' + envelope.duckedSeconds.toFixed(1) + ' s</b> to <b>' +
      envelope.duckLevelDb.toFixed(1) + ' dB</b>' +
      (envelope.bridged ? ' · ' + envelope.bridged + ' bridged (no pumping)' : '');
    drawEnvelope(envelope);
  }

  function sizeCanvas() {
    if (!canvas) { return; }
    var w = 600;
    try { w = canvas.parentNode.clientWidth || 600; } catch (e) { w = 600; }
    CW = canvas.width = Math.max(120, w);
    CH = canvas.height = 120;
  }

  function clearCanvas() {
    if (!ctx) { return; }
    ctx.clearRect(0, 0, CW, CH);
  }

  function drawEnvelope(env) {
    sizeCanvas();
    clearCanvas();
    if (!ctx) { return; }
    var keys = env.keys;
    var t0 = keys[0].t, t1 = keys[keys.length - 1].t;
    if (env.duration && env.duration > t1) { t1 = env.duration; }
    var span = Math.max(0.2, t1 - t0);
    var lo = Math.min(env.duckLevelDb, env.baseDb) - 2;
    var hi = env.baseDb + 2;
    function X(t) { return 6 + ((t - t0) / span) * (CW - 12); }
    function Y(db) { return CH - 10 - ((db - lo) / (hi - lo)) * (CH - 22); }

    // ducked regions
    ctx.fillStyle = 'rgba(124,92,255,.14)';
    env.regions.forEach(function (r) {
      ctx.fillRect(X(r.start), 6, Math.max(1, X(r.end) - X(r.start)), CH - 16);
    });
    // grid
    ctx.strokeStyle = '#202632';
    ctx.lineWidth = 1;
    for (var g = 1; g < 6; g++) {
      var gx = 6 + (g / 6) * (CW - 12);
      ctx.beginPath(); ctx.moveTo(gx, 6); ctx.lineTo(gx, CH - 10); ctx.stroke();
    }
    // base level line
    ctx.strokeStyle = 'rgba(111,122,144,.7)';
    ctx.beginPath(); ctx.moveTo(6, Y(env.baseDb)); ctx.lineTo(CW - 6, Y(env.baseDb)); ctx.stroke();
    // envelope
    ctx.strokeStyle = '#29d3c8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var i = 0; i < keys.length; i++) {
      var x = X(keys[i].t), y = Y(keys[i].db);
      if (i === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
    }
    ctx.stroke();
    // keyframe dots
    ctx.fillStyle = '#7c5cff';
    for (i = 0; i < keys.length && i < 400; i++) {
      ctx.fillRect(X(keys[i].t) - 1, Y(keys[i].db) - 1, 2, 2);
    }
    ctx.fillStyle = '#6f7a90';
    ctx.fillText(SY.fmtClock(t0), 6, CH - 1);
    ctx.fillText(SY.fmtClock(t1), CW - 46, CH - 1);
    ctx.fillText(env.baseDb.toFixed(0) + ' dB', 6, 12);
  }

  /* ------------------------- send to Premiere ------------------------- */
  function send(mode) {
    if (mode !== 'clear' && (!envelope || !envelope.keys.length)) {
      SY.toast('Detect dialogue first — there is no envelope to write', 'warn');
      return;
    }
    if (target === null) {
      if (!tracks.length) { loadTracks(); }
      SY.toast('Pick the audio track to duck (click a row)', 'warn');
      return;
    }
    var btn = mode === 'keys' ? el('dkApply') : null;
    SY.busy(btn, true);
    var arg = {
      tracks: [target],
      keys: (envelope ? envelope.keys : []).map(function (k) { return { t: k.t, db: k.db }; }),
      mode: mode,
      baseDb: +el('dkBase').value || 0,
      duckDb: +el('dkAmount').value || -12,
      onlySelected: el('dkSelectedOnly').checked,
      markerPrefix: 'DUCK'
    };
    SY.call('duckTrack', arg, function (r) {
      SY.busy(btn, false);
      var out = el('dkResult');
      if (!r.ok) {
        out.innerHTML = '❌ ' + SY.esc(r.error);
        SY.toast(r.error, 'err', 6000);
        return;
      }
      var d = r.data;
      if (mode === 'clear') {
        out.innerHTML = '✅ Ducking cleared on A' + (target + 1) + ' — level restored to ' + arg.baseDb + ' dB.';
        SY.toast('Ducking removed from A' + (target + 1), 'ok');
      } else if (mode === 'markers') {
        out.innerHTML = '✅ ' + d.markers + ' preview marker(s) placed at each duck start.';
        SY.toast(d.markers + ' duck markers placed', 'ok');
      } else {
        out.innerHTML = '✅ <b>' + d.keys + '</b> volume keyframes written on A' + (target + 1) +
          (d.clips && d.clips.length ? ' — ' + SY.esc(d.clips.slice(0, 2).join(' · ')) : '') +
          (d.note ? ' <span class="mini">' + SY.esc(d.note) + '</span>' : '');
        SY.toast('Music ducked under ' + envelope.regions.length + ' dialogue region(s)', 'ok');
      }
      SY.log('duck ' + mode + ' on A' + (target + 1) + ': ' + (d.keys || d.markers || 0), 'ok');
    });
  }

  /* Called by SYUI when the tab becomes visible. */
  function refresh() {
    if (!tracks.length) { loadTracks(); }
    else { renderTracks(); }
    redraw();
  }

  return { init: init, refresh: refresh, envelope: function () { return envelope; } };
})(window.SY);
