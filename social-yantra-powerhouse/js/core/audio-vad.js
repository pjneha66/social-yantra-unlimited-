/* ==========================================================================
 * Social Yantra Powerhouse — local audio engine
 * Decodes audio with ffmpeg to 32-bit float PCM (16 kHz mono) entirely on
 * the user's machine. Everything downstream (silence/VAD masks, music
 * auto-ducking, beat detection) is derived from this ONE decode path, so the
 * heavy work happens once per media file. No cloud, no uploads.
 * ========================================================================== */
window.SYAudio = (function (SY) {
  'use strict';

  var WIN = 0.02;           // analysis window: 20 ms
  var SR = 16000;           // decode rate for every analysis
  var analysisCache = {};   // mediaPath -> { dbfs: [], dur, win, sampleRate }

  /* ---------------------------------------------------------------------
   * decodePcm — streaming f32le decoder.
   * Blocks of Float32Array samples are handed to onBlock as they arrive, so
   * long media never has to sit in memory as one giant buffer.
   *   opts: { blockSeconds, ss, t, onProgress(bytes) }
   *   cb(err, { sampleRate, samples, dur })
   * ------------------------------------------------------------------ */
  function decodePcm(mediaPath, opts, onBlock, cb) {
    if (typeof opts === 'function') { cb = onBlock; onBlock = opts; opts = {}; }
    opts = opts || {};
    cb = cb || function () {};
    if (!SY.hasNode) { cb(new Error('Node engine unavailable (demo mode)')); return; }
    var cp = SY.require('child_process');
    SY.resolveFFmpeg(function (ff) {
      var args = [];
      if (opts.ss) { args.push('-ss', String(opts.ss)); }
      args.push('-i', mediaPath);
      if (opts.t) { args.push('-t', String(opts.t)); }
      args = args.concat(['-map', 'a:0', '-ac', '1', '-ar', String(SR), '-vn', '-f', 'f32le', '-']);

      var child;
      try { child = cp.spawn(ff, args, { windowsHide: true }); }
      catch (e) { cb(e); return; }

      var blockSamples = Math.max(256, Math.round((opts.blockSeconds || 1) * SR));
      var pending = Buffer.alloc(0);
      var emitted = 0;   // samples handed to onBlock so far
      var bytes = 0;

      function flush(isFinal) {
        var have = Math.floor(pending.length / 4);
        var consumed = 0;
        while (consumed < have) {
          var room = have - consumed;
          if (!isFinal && room < blockSamples) { break; }
          var n = isFinal ? Math.min(room, blockSamples) : blockSamples;
          var arr = new Float32Array(n);
          for (var i = 0; i < n; i++) { arr[i] = pending.readFloatLE((consumed + i) * 4); }
          consumed += n;
          if (onBlock) { onBlock(arr, emitted); }
          emitted += n;
        }
        if (consumed > 0) { pending = pending.slice(consumed * 4); }
      }

      child.stdout.on('data', function (d) {
        bytes += d.length;
        pending = pending.length ? Buffer.concat([pending, d]) : d;
        flush(false);
        if (opts.onProgress) { opts.onProgress(bytes); }
      });
      child.stderr.on('data', function () { /* ffmpeg chatter */ });
      child.on('error', function (e) { cb(e); });
      child.on('close', function (code) {
        if (code !== 0 && bytes === 0) { cb(new Error('ffmpeg could not decode audio (exit ' + code + ')')); return; }
        flush(true);
        cb(null, { sampleRate: SR, samples: emitted, dur: emitted / SR });
      });
    });
  }

  /* Analyze one media file -> dBFS window array (cached per media path). */
  function analyzeMedia(mediaPath, cb, onProgress) {
    if (analysisCache[mediaPath]) { cb(null, analysisCache[mediaPath]); return; }
    var samplesPerWin = Math.round(SR * WIN);
    var dbfs = [], acc = 0, accN = 0;
    decodePcm(mediaPath, { onProgress: onProgress }, function (arr) {
      for (var i = 0; i < arr.length; i++) {
        acc += arr[i] * arr[i];
        accN++;
        if (accN === samplesPerWin) {
          dbfs.push(20 * Math.log10(Math.sqrt(acc / accN) + 1e-9));
          acc = 0; accN = 0;
        }
      }
    }, function (err, info) {
      if (err) { cb(err); return; }
      var res = { dbfs: dbfs, dur: dbfs.length * WIN, win: WIN, sampleRate: SR, samples: info ? info.samples : dbfs.length * samplesPerWin };
      analysisCache[mediaPath] = res;
      cb(null, res);
    });
  }

  /* media-time silence intervals from an analysis (after padding shrink) */
  function mediaSpeechMask(analysis, thresholdDb, minSilence, padPre, padPost) {
    var dbfs = analysis.dbfs, win = analysis.win;
    var sils = [];
    var runStart = -1;
    for (var w = 0; w < dbfs.length; w++) {
      var silent = dbfs[w] < thresholdDb;
      if (silent && runStart < 0) { runStart = w; }
      if ((!silent || w === dbfs.length - 1) && runStart >= 0) {
        var end = (!silent ? w : w + 1) * win;
        var start = runStart * win;
        runStart = -1;
        if (end - start >= minSilence) {
          var cs = start + padPre, ce = end - padPost;
          if (ce - cs > 0.02) { sils.push([cs, ce]); }
        }
      }
    }
    return sils;
  }

  /* clips: [{mediaPath,start,end,inPoint,trackType,trackIndex,name}] (seconds)
   * -> merged speech intervals in TIMELINE time. Shared by the silence cutter
   *    (which complements it) and by the music auto-ducker (which uses it as-is). */
  function timelineSpeech(clips, analyses, opts) {
    var speech = [];
    clips.forEach(function (c) {
      var an = analyses[c.mediaPath];
      if (!an) { speech.push([c.start, c.end]); return; }   // unknown audio = assume speech (safe)
      var sils = mediaSpeechMask(an, opts.threshold, opts.minDur, opts.padPre, opts.padPost);
      // walk media time -> timeline time: t_tl = c.start + (t_media - c.inPoint)
      var cursor = c.start;
      sils.forEach(function (s) {
        var s_tl = c.start + (s[0] - c.inPoint);
        var e_tl = c.start + (s[1] - c.inPoint);
        if (e_tl <= c.start || s_tl >= c.end) { return; }
        if (s_tl > cursor) { speech.push([cursor, Math.min(s_tl, c.end)]); }
        cursor = Math.max(cursor, e_tl);
      });
      if (cursor < c.end) { speech.push([cursor, c.end]); }
    });
    return merge(speech);
  }

  /* Decode every unique media file behind `clips`, then derive speech. */
  function speechIntervals(clips, opts, cb, onProgress) {
    var unique = {};
    clips.forEach(function (c) { if (c.mediaPath) { unique[c.mediaPath] = true; } });
    var paths = Object.keys(unique);
    if (!paths.length) { cb(new Error('No linked media audio found. Detached/offline audio or captions-only sequence?')); return; }
    var doneCount = 0, analyses = {}, failures = [];

    (function next(i) {
      if (i >= paths.length) { finish(); return; }
      var p = paths[i];
      analyzeMedia(p, function (err, an) {
        if (err) { failures.push(p); SY.log('audio skip: ' + p + ' — ' + err.message, 'warn'); }
        else { analyses[p] = an; }
        doneCount++;
        if (onProgress) { onProgress(doneCount / paths.length); }
        next(i + 1);
      });
    })(0);

    function finish() {
      if (!Object.keys(analyses).length) { cb(new Error('ffmpeg failed to decode any audio in this sequence.')); return; }
      var speech = timelineSpeech(clips, analyses, opts);
      var coverage = merge(clips.map(function (c) { return [c.start, c.end]; }));
      cb(null, { speech: speech, coverage: coverage, media: Object.keys(analyses).length, failures: failures, analyses: analyses });
    }
  }

  /* Full silence scan: speech intervals complemented against clip coverage. */
  function analyzeTimeline(clips, opts, cb, onProgress) {
    speechIntervals(clips, opts, function (err, r) {
      if (err) { cb(err); return; }
      var gaps = complementWithin(r.speech, r.coverage, opts.minCut);
      cb(null, { gaps: gaps, speech: r.speech, clips: clips.length, media: r.media, failures: r.failures });
    }, onProgress);
  }

  function merge(iv) {
    iv = (iv || []).filter(function (x) { return x && x[1] - x[0] > 0.001; })
      .sort(function (a, b) { return a[0] - b[0]; });
    var out = [];
    iv.forEach(function (x) {
      if (out.length && x[0] <= out[out.length - 1][1] + 0.001) {
        out[out.length - 1][1] = Math.max(out[out.length - 1][1], x[1]);
      } else { out.push([x[0], x[1]]); }
    });
    return out;
  }

  function complementWithin(speech, coverage, minLen) {
    if (typeof minLen !== 'number' || isNaN(minLen)) { minLen = 0; }
    var gaps = [];
    coverage.forEach(function (cov) {
      var cursor = cov[0];
      speech.forEach(function (sp) {
        if (sp[1] <= cov[0] || sp[0] >= cov[1]) { return; }
        var g = sp[0] - cursor;
        if (g >= minLen) { gaps.push([cursor, sp[0]]); }
        cursor = Math.max(cursor, sp[1]);
      });
      if (cov[1] - cursor >= minLen) { gaps.push([cursor, cov[1]]); }
    });
    return merge(gaps);
  }

  /* Extract a 16 kHz mono wav slice for Whisper. Returns path. */
  function extractWav(mediaPath, startSec, durSec, outPath, cb) {
    if (!SY.hasNode) { cb(new Error('Node engine unavailable (demo mode)')); return; }
    var cp = SY.require('child_process'), path = SY.require('path');
    outPath = outPath || path.join(SY.paths.temp, SY.uid() + '.wav');
    SY.mkdirp(path.dirname(outPath));
    SY.resolveFFmpeg(function (ff) {
      var args = ['-i', mediaPath, '-ss', startSec.toFixed(3), '-t', durSec.toFixed(3),
        '-ac', '1', '-ar', '16000', '-vn', '-y', outPath];
      var child = cp.spawn(ff, args, { windowsHide: true });
      child.on('error', function (e) { cb(e); });
      child.on('close', function (code) {
        if (code === 0) { cb(null, outPath); }
        else { cb(new Error('ffmpeg wav extraction exit ' + code)); }
      });
    });
  }

  return {
    SAMPLE_RATE: SR,
    WINDOW: WIN,
    decodePcm: decodePcm,
    analyzeMedia: analyzeMedia,
    analyzeTimeline: analyzeTimeline,
    speechIntervals: speechIntervals,
    mediaSpeechMask: mediaSpeechMask,
    timelineSpeech: timelineSpeech,
    merge: merge,
    complementWithin: complementWithin,
    extractWav: extractWav,
    clearCache: function () { analysisCache = {}; }
  };
})(window.SY);
