/* ==========================================================================
 * Social Yantra Powerhouse — local Voice Activity Detection engine
 * Decodes audio with ffmpeg to 32-bit float PCM (16 kHz mono) entirely on
 * the user's machine, computes RMS energy windows and derives speech/silence
 * masks. No cloud, no uploads.
 * ========================================================================== */
window.SYAudio = (function (SY) {
  'use strict';

  var WIN = 0.02;           // analysis window: 20 ms
  var analysisCache = {};   // mediaPath -> { dbfs: [], dur: , at: }

  /* (streaming decode is done with spawn inside analyzeMedia/extractWav) */

  /* Analyze one media file -> dBFS window array. Uses spawn for streaming. */
  function analyzeMedia(mediaPath, cb, onProgress) {
    if (analysisCache[mediaPath]) { cb(null, analysisCache[mediaPath]); return; }
    if (!SY.hasNode) { cb(new Error('Node engine unavailable (demo mode)')); return; }
    var cp = SY.require('child_process');
    SY.resolveFFmpeg(function (ff) {
      var args = ['-i', mediaPath, '-map', 'a:0', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'];
      var child;
      try { child = cp.spawn(ff, args, { windowsHide: true }); }
      catch (e) { cb(e); return; }

      var chunks = [], total = 0;
      child.stdout.on('data', function (d) { chunks.push(d); total += d.length; if (onProgress) { onProgress(total); } });
      child.stderr.on('data', function () { /* ffmpeg chatter */ });
      child.on('error', function (e) { cb(e); });
      child.on('close', function (code) {
        if (code !== 0 && total === 0) { cb(new Error('ffmpeg could not decode audio (exit ' + code + ')')); return; }
        var buf = Buffer.concat(chunks);
        var nWin = Math.floor((buf.length / 4) / (16000 * WIN));
        var dbfs = new Array(nWin);
        var samplesPerWin = Math.floor(16000 * WIN);
        for (var w = 0; w < nWin; w++) {
          var sum = 0;
          var base = w * samplesPerWin;
          for (var i = 0; i < samplesPerWin; i++) { var s = buf.readFloatLE((base + i) * 4); sum += s * s; }
          var rms = Math.sqrt(sum / samplesPerWin);
          dbfs[w] = 20 * Math.log10(rms + 1e-9);
        }
        var res = { dbfs: dbfs, dur: nWin * WIN, win: WIN };
        analysisCache[mediaPath] = res;
        cb(null, res);
      });
    });
  }

  /* media-time speech mask from analysis */
  function mediaSpeechMask(analysis, thresholdDb, minSilence, padPre, padPost) {
    // returns array of silence intervals [start,end] (media time) AFTER padding shrink
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

  /* clips: [{mediaPath,start,end,inPoint,trackType,trackIndex,name}] (seconds) */
  function analyzeTimeline(clips, opts, cb, onProgress) {
    var unique = {};
    clips.forEach(function (c) { if (c.mediaPath) { unique[c.mediaPath] = true; } });
    var paths = Object.keys(unique);
    var doneCount = 0, analyses = {}, failures = [];
    if (!paths.length) { cb(new Error('No linked media audio found. Detached/offline audio or captions-only sequence?')); return; }

    (function next(i) {
      if (i >= paths.length) { finish(); return; }
      var p = paths[i];
      analyzeMedia(p, function (err, an) {
        if (err) { failures.push(p); SY.log('VAD skip: ' + p + ' — ' + err.message, 'warn'); }
        else { analyses[p] = an; }
        doneCount++;
        if (onProgress) { onProgress(doneCount / paths.length); }
        next(i + 1);
      });
    })(0);

    function finish() {
      if (!Object.keys(analyses).length) { cb(new Error('ffmpeg failed to decode any audio in this sequence.')); return; }

      // 1) speech intervals per clip, in TIMELINE time
      var speech = [];   // [start,end] timeline
      var coverage = []; // [start,end] timeline where audio exists
      clips.forEach(function (c) {
        var an = analyses[c.mediaPath];
        if (!an) { coverage.push([c.start, c.end]); return; }
        coverage.push([c.start, c.end]);
        var sils = mediaSpeechMask(an, opts.threshold, opts.minDur, opts.padPre, opts.padPost);
        // walk media time -> timeline time: t_tl = c.start + (t_media - c.inPoint)
        // speech within clip = clip span minus silence (clipped to clip bounds)
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

      // 2) merge & complement
      speech = merge(speech);
      coverage = merge(coverage);
      var gaps = complementWithin(speech, coverage, opts.minCut);
      cb(null, { gaps: gaps, clips: clips.length, media: Object.keys(analyses).length, failures: failures });
    }
  }

  function merge(iv) {
    iv = iv.filter(function (x) { return x[1] - x[0] > 0.001; }).sort(function (a, b) { return a[0] - b[0]; });
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
    analyzeMedia: analyzeMedia,
    analyzeTimeline: analyzeTimeline,
    extractWav: extractWav,
    clearCache: function () { analysisCache = {}; }
  };
})(window.SY);
