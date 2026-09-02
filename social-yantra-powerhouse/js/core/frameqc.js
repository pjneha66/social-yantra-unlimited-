/* ==========================================================================
 * Social Yantra Powerhouse — frame QC engine
 *
 * Two pixel-level detectors, both local, both driven by ffmpeg:
 *
 *  FLASH  signalstats gives the mean luma of every frame (YAVG). A flash frame
 *         is an isolated outlier: its luma differs from the local baseline by
 *         more than the threshold and the anomaly lasts at most `maxRun`
 *         frames. One black or one blown-out frame in the middle of a shot is
 *         exactly this signature.
 *
 *  EMPTY  blackdetect reports spans where almost every pixel is below the
 *         threshold. Combined with the structural hole scan (ExtendScript
 *         blankScan) that covers "no clip at all" AND "clip that renders
 *         nothing".
 *
 * Everything here maps media time back to timeline time using the clip's
 * in-point and start, so markers land on the right frame.
 * ========================================================================== */
window.SYFrameQC = (function (SY) {
  'use strict';

  var QC = {};

  /* --------------------------- ffmpeg plumbing --------------------------- */
  function nullSink() { return SY.os === 'win' ? 'NUL' : '/dev/null'; }

  function spawn(ff, args, onOut, onErr, cb) {
    if (!SY.hasNode) { cb(new Error('Node engine unavailable (demo mode)'), '', ''); return null; }
    var cp = SY.require('child_process');
    var child;
    try { child = cp.spawn(ff, args, { windowsHide: true }); }
    catch (e) { cb(e, '', ''); return null; }
    var out = '', err = '';
    child.stdout.on('data', function (d) { out += d; if (onOut) { onOut(d); } if (out.length > 4e6) { out = out.slice(-2e6); } });
    child.stderr.on('data', function (d) { err += d; if (onErr) { onErr(d); } if (err.length > 4e6) { err = err.slice(-2e6); } });
    child.on('error', function (e) { cb(e, out, err); });
    child.on('close', function () { cb(null, out, err); });
    return child;
  }

  /* ------------------------- per-frame luma (flash) ------------------------- */
  /* opts: { ss, t, onProgress } → cb(err, [{t, v}], stats) */
  QC.lumaProfile = function (mediaPath, opts, cb) {
    opts = opts || {};
    SY.resolveFFmpeg(function (ff) {
      var args = ['-hide_banner', '-nostats'];
      if (opts.ss) { args.push('-ss', String(+opts.ss).toFixed(4)); }
      args.push('-i', mediaPath);
      if (opts.t) { args.push('-t', String(+opts.t).toFixed(4)); }
      args.push('-map', 'v:0', '-an',
        '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-',
        '-f', 'null', nullSink());
      var samples = [];
      var cur = -1;
      spawn(ff, args,
        function (chunk) {
          var lines = String(chunk).split('\n');
          for (var i = 0; i < lines.length; i++) {
            var L = lines[i];
            var fm = /pts_time:([0-9.]+)/.exec(L);
            if (fm && /^frame:/.test(L)) { cur = parseFloat(fm[1]); continue; }
            var ym = /lavfi\.signalstats\.YAVG=([0-9.]+)/.exec(L);
            if (ym) { samples.push({ t: cur < 0 ? samples.length * 0.04 : cur, v: parseFloat(ym[1]) }); cur = -1; }
          }
          if (opts.onProgress) { opts.onProgress(samples.length); }
        },
        null,
        function (err, out, errTxt) {
          if (err) { cb(err, []); return; }
          if (!samples.length) {
            cb(new Error('No frame statistics — ' + (String(errTxt).slice(-160) || 'is the signalstats filter available?')), []);
            return;
          }
          cb(null, samples, { frames: samples.length });
        });
    });
  };

  /* Median of a window, ignoring index `skip`. */
  function medianAround(vals, i, win, skip) {
    var a = [];
    for (var k = Math.max(0, i - win); k <= Math.min(vals.length - 1, i + win); k++) {
      if (k === i) { continue; }
      a.push(vals[k]);
    }
    if (!a.length) { return vals[i]; }
    a.sort(function (x, y) { return x - y; });
    return a[Math.floor(a.length / 2)];
  }
  QC.medianAround = medianAround;

  /* Median of vals[from..to] inclusive, or null when the range is empty. */
  function medianRange(vals, from, to) {
    if (to < from) { return null; }
    var a = vals.slice(from, to + 1);
    a.sort(function (x, y) { return x - y; });
    return a[Math.floor(a.length / 2)];
  }
  QC.medianRange = medianRange;

  /* Pure spike detector — unit tested with synthetic frame series.
   *
   * A flash is an ISOLATED outlier, so a frame only counts when it deviates
   * from BOTH sides: a hard cut into a brighter shot makes the last frame
   * before the cut look dark against the frames after it, and a one-sided
   * test would report every scene change as a black flash.
   *
   * opts: { threshold, maxRun, window, minAbs } */
  QC.findSpikes = function (samples, opts) {
    opts = opts || {};
    var threshold = (opts.threshold === undefined) ? 45 : +opts.threshold;   // luma units
    var maxRun = (opts.maxRun === undefined) ? 2 : Math.max(1, +opts.maxRun);
    var win = (opts.window === undefined) ? 3 : Math.max(1, +opts.window);
    var minAbs = (opts.minAbs === undefined) ? 8 : +opts.minAbs;             // dark-footage guard

    var vals = [], i;
    for (i = 0; i < samples.length; i++) { vals.push(+samples[i].v); }

    /* signed deviation for reporting; `isolated` gates it */
    var deltas = [], isolated = [];
    for (i = 0; i < vals.length; i++) {
      var left = medianRange(vals, Math.max(0, i - win), i - 1);
      var right = medianRange(vals, i + 1, Math.min(vals.length - 1, i + win));
      var dl = left === null ? null : vals[i] - left;
      var dr = right === null ? null : vals[i] - right;
      var both = dl !== null && dr !== null &&
        Math.abs(dl) > threshold && Math.abs(dr) > threshold && (dl > 0) === (dr > 0);
      deltas.push(dl !== null ? dl : (dr === null ? 0 : dr));
      isolated.push(both);
    }

    /* contiguous runs of isolated outliers */
    var runs = [], start = -1;
    for (i = 0; i < isolated.length; i++) {
      if (isolated[i] && start < 0) { start = i; }
      if ((!isolated[i] || i === isolated.length - 1) && start >= 0) {
        var end = isolated[i] ? i : i - 1;
        runs.push({ from: start, to: end, len: end - start + 1 });
        start = -1;
      }
    }

    var flashes = [];
    for (var r = 0; r < runs.length; r++) {
      var run = runs[r];
      if (run.len > maxRun) { continue; }                 // sustained change, not a flash
      var peak = run.from, peakAbs = -1;
      for (var k = run.from; k <= run.to; k++) {
        if (Math.abs(deltas[k]) > peakAbs) { peakAbs = Math.abs(deltas[k]); peak = k; }
      }
      if (peakAbs < threshold) { continue; }
      /* a 1-frame drop to near-black on footage that is already dark is
       * usually a decode artefact, not something an editor can act on */
      if (vals[peak] < minAbs && deltas[peak] < 0 && vals[peak - 1] !== undefined && vals[peak - 1] < minAbs) {
        continue;
      }
      flashes.push({
        index: peak, t: samples[peak] ? samples[peak].t : peak,
        luma: Math.round(vals[peak] * 10) / 10,
        delta: Math.round(deltas[peak] * 10) / 10,
        run: run.len,
        kind: deltas[peak] > 0 ? (vals[peak] > 230 ? 'white' : 'bright') : 'black'
      });
    }

    var maxDelta = 0, sum = 0;
    for (i = 0; i < deltas.length; i++) { var ad = Math.abs(deltas[i]); if (ad > maxDelta) { maxDelta = ad; } sum += ad; }
    return {
      flashes: flashes,
      stats: {
        frames: vals.length,
        meanAbsDelta: vals.length ? Math.round((sum / vals.length) * 100) / 100 : 0,
        maxAbsDelta: Math.round(maxDelta * 10) / 10,
        runs: runs.length
      }
    };
  };

  /* ------------------------- black spans (empty) ------------------------- */
  /* opts: { ss, t, minDur, pixTh, picTh } → cb(err, [{start,end,duration}]) */
  QC.blackDetect = function (mediaPath, opts, cb) {
    opts = opts || {};
    var minDur = (opts.minDur === undefined) ? 0.04 : +opts.minDur;
    var pixTh = (opts.pixTh === undefined) ? 0.10 : +opts.pixTh;
    var picTh = (opts.picTh === undefined) ? 0.98 : +opts.picTh;
    SY.resolveFFmpeg(function (ff) {
      var args = ['-hide_banner', '-nostats'];
      if (opts.ss) { args.push('-ss', String(+opts.ss).toFixed(4)); }
      args.push('-i', mediaPath);
      if (opts.t) { args.push('-t', String(+opts.t).toFixed(4)); }
      args.push('-map', 'v:0', '-an',
        '-vf', 'blackdetect=d=' + minDur + ':pix_th=' + pixTh + ':pic_th=' + picTh,
        '-f', 'null', nullSink());
      var spans = [];
      spawn(ff, args, null,
        function (chunk) {
          var lines = String(chunk).split('\n');
          for (var i = 0; i < lines.length; i++) {
            var m = /black_start:([0-9.]+)\s+black_end:([0-9.]+)\s+black_duration:([0-9.]+)/.exec(lines[i]);
            if (m) { spans.push({ start: parseFloat(m[1]), end: parseFloat(m[2]), duration: parseFloat(m[3]) }); }
          }
        },
        function (err, out, errTxt) {
          if (err) { cb(err, []); return; }
          if (/No such filter|Unknown filter/i.test(String(errTxt))) {
            cb(new Error('blackdetect filter unavailable in this ffmpeg build'), []);
            return;
          }
          cb(null, spans);
        });
    });
  };

  /* Parse a blackdetect/signalstats style log line (used by the tests and by
   * the live stderr reader). */
  QC.parseBlackLine = function (line) {
    var m = /black_start:([0-9.]+)\s+black_end:([0-9.]+)\s+black_duration:([0-9.]+)/.exec(String(line || ''));
    if (!m) { return null; }
    return { start: parseFloat(m[1]), end: parseFloat(m[2]), duration: parseFloat(m[3]) };
  };

  /* ------------------------ sequence orchestration ------------------------ */
  /* clips: [{name, start, end, inPoint, outPoint, mediaPath, trackIndex,
   *          trackType, isSequenceItem, offline}] */
  function videoClips(clips) {
    var out = [];
    for (var i = 0; i < (clips || []).length; i++) {
      var c = clips[i];
      if (c.trackType === 'audio') { continue; }
      if (!c.mediaPath) { continue; }        // nests, solids, offlines
      out.push(c);
    }
    out.sort(function (a, b) { return a.start - b.start; });
    return out;
  }
  QC.videoClips = videoClips;

  /* Run one detector across every video clip.
   * opts: { mode:'flash'|'empty', threshold, maxRun, minDur, pixTh,
   *         limitSeconds, onProgress(done, total, clipName) } */
  QC.scanClips = function (clips, opts, cb) {
    opts = opts || {};
    var list = videoClips(clips);
    if (!list.length) {
      cb(null, { issues: [], clips: 0, skipped: (clips || []).length,
        note: 'No analysable video clips — nests, solids and offline media have no pixels to read.' });
      return;
    }
    if (!SY.hasNode) { cb(new Error('Node engine unavailable (demo mode)')); return; }

    var issues = [], notes = [], done = 0;
    var limit = opts.limitSeconds ? +opts.limitSeconds : 0;

    (function next(i) {
      if (i >= list.length) {
        issues.sort(function (a, b) { return a.at - b.at; });
        cb(null, { issues: issues, clips: list.length, skipped: (clips || []).length - list.length, notes: notes });
        return;
      }
      var c = list[i];
      var inP = (c.inPoint === undefined || c.inPoint === null) ? 0 : +c.inPoint;
      var outP = (c.outPoint === undefined || c.outPoint === null) ? inP + (c.end - c.start) : +c.outPoint;
      var dur = Math.max(0.04, outP - inP);
      if (limit && dur > limit) { dur = limit; notes.push('"' + c.name + '": only the first ' + limit + 's were analysed'); }

      function pushIssue(kind, at, until, extra) {
        issues.push({
          kind: kind, clip: c.name, track: c.trackIndex,
          at: Math.max(0, at), until: Math.max(0, until),
          dur: Math.max(0, until - at),
          mediaAt: extra.mediaAt, mediaUntil: extra.mediaUntil,
          luma: extra.luma, delta: extra.delta, run: extra.run,
          text: (kind === 'flash'
            ? (extra.kindLabel || 'flash') + ' frame in "' + c.name + '" @' + at.toFixed(2) + 's (luma ' + (extra.luma || 0) + ', Δ' + (extra.delta || 0) + ')'
            : 'empty/black in "' + c.name + '" ' + at.toFixed(2) + 's–' + until.toFixed(2) + 's')
        });
      }

      if (opts.mode === 'empty') {
        QC.blackDetect(c.mediaPath, { ss: inP, t: dur, minDur: opts.minDur, pixTh: opts.pixTh, picTh: opts.picTh },
          function (err, spans) {
            if (err) { notes.push('"' + c.name + '": ' + err.message); }
            else {
              for (var s = 0; s < spans.length; s++) {
                var sp = spans[s];
                pushIssue('empty', c.start + sp.start, c.start + sp.end,
                  { mediaAt: inP + sp.start, mediaUntil: inP + sp.end });
              }
            }
            done++;
            if (opts.onProgress) { opts.onProgress(done, list.length, c.name); }
            next(i + 1);
          });
        return;
      }

      QC.lumaProfile(c.mediaPath, {
        ss: inP, t: dur,
        onProgress: function () { if (opts.onProgress) { opts.onProgress(done, list.length, c.name); } }
      }, function (err, samples) {
        if (err) { notes.push('"' + c.name + '": ' + err.message); }
        else {
          var res = QC.findSpikes(samples, { threshold: opts.threshold, maxRun: opts.maxRun });
          for (var f = 0; f < res.flashes.length; f++) {
            var fl = res.flashes[f];
            var fdur = 0.04;
            if (samples.length > 1 && samples[1].t > samples[0].t) { fdur = samples[1].t - samples[0].t; }
            pushIssue('flash', c.start + fl.t, c.start + fl.t + fdur * fl.run, {
              mediaAt: inP + fl.t, mediaUntil: inP + fl.t + fdur * fl.run,
              luma: fl.luma, delta: fl.delta, run: fl.run, kindLabel: fl.kind
            });
          }
          notes.push('"' + c.name + '": ' + samples.length + ' frames, peak Δluma ' + res.stats.maxAbsDelta);
        }
        done++;
        if (opts.onProgress) { opts.onProgress(done, list.length, c.name); }
        next(i + 1);
      });
    })(0);
  };

  return QC;
})(window.SY);
