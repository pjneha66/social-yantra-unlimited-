/* ==========================================================================
 * Social Yantra Powerhouse — Beat / Onset Detection engine
 * Runs on the very same local ffmpeg PCM stream the VAD engine uses.
 *
 *   STFT spectral-flux onset envelope  →  tempo by autocorrelation
 *   →  beat-phase search  →  optional transient snapping  →  bar/downbeats
 *
 * 100% local, no dependencies (the FFT is included below), and pure math so
 * it unit-tests without Premiere or ffmpeg.
 *
 *   SYBeat.createAnalyzer(sampleRate, opts) -> { push(block), finish() }
 *   SYBeat.detect(analyzerResult, opts)     -> { bpm, confidence, beats, … }
 *   SYBeat.detectMedia(path, opts, cb, onProgress)
 *   SYBeat.cutPoints(beats, opts)           -> [seconds] for the razor engine
 * ========================================================================== */
window.SYBeat = (function (SY) {
  'use strict';

  /* ------------------------------ FFT ------------------------------ */
  /* In-place iterative radix-2 Cooley–Tukey. n must be a power of two. */
  function fft(re, im) {
    var n = re.length, i, j, bit;
    for (i = 1, j = 0; i < n; i++) {
      bit = n >> 1;
      for (; j & bit; bit >>= 1) { j ^= bit; }
      j ^= bit;
      if (i < j) {
        var tr = re[i]; re[i] = re[j]; re[j] = tr;
        var ti = im[i]; im[i] = im[j]; im[j] = ti;
      }
    }
    for (var len = 2; len <= n; len <<= 1) {
      var ang = -2 * Math.PI / len;
      var wlr = Math.cos(ang), wli = Math.sin(ang);
      var half = len >> 1;
      for (var k = 0; k < n; k += len) {
        var wr = 1, wi = 0;
        for (var m = 0; m < half; m++) {
          var ar = re[k + m], ai = im[k + m];
          var br = re[k + m + half], bi = im[k + m + half];
          var vr = br * wr - bi * wi;
          var vi = br * wi + bi * wr;
          re[k + m] = ar + vr; im[k + m] = ai + vi;
          re[k + m + half] = ar - vr; im[k + m + half] = ai - vi;
          var nwr = wr * wlr - wi * wli;
          wi = wr * wli + wi * wlr;
          wr = nwr;
        }
      }
    }
  }

  /* --------------------------- analyzer --------------------------- */
  function createAnalyzer(sampleRate, opts) {
    opts = opts || {};
    var N = opts.fftSize || 1024;
    var H = opts.hopSize || 512;
    var gamma = opts.gamma || 32;
    var lowBinMax = Math.max(1, Math.round((opts.lowCutHz || 200) / (sampleRate / N)));

    var win = new Float64Array(N);
    for (var i = 0; i < N; i++) { win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)); }

    var buf = new Float64Array(N);
    var fill = 0;
    var re = new Float64Array(N), im = new Float64Array(N);
    var prev = new Float64Array(N >> 1);
    var env = [], low = [], rms = [];
    var frames = 0, totalSamples = 0, peak = 0, sumSq = 0;

    function frame() {
      for (var i = 0; i < N; i++) { re[i] = buf[i] * win[i]; im[i] = 0; }
      fft(re, im);
      var flux = 0, lowFlux = 0, sq = 0;
      var half = N >> 1;
      for (var b = 0; b < half; b++) {
        var mag = Math.sqrt(re[b] * re[b] + im[b] * im[b]) / half;
        var l = Math.log(1 + gamma * mag);
        var d = l - prev[b];
        if (d > 0) { flux += d; if (b < lowBinMax) { lowFlux += d; } }
        prev[b] = l;
      }
      // frame 0 has no previous spectrum to differ against — its "flux" would
      // be a startup spike, not a real onset
      if (frames === 0) { flux = 0; lowFlux = 0; }
      for (var s = 0; s < N; s++) { sq += buf[s] * buf[s]; }
      var r = Math.sqrt(sq / N);
      if (r > peak) { peak = r; }
      sumSq += sq;
      env.push(flux); low.push(lowFlux); rms.push(r);
      frames++;
      buf.copyWithin(0, H, N);   // slide the window forward by one hop
      fill = N - H;
    }

    return {
      fftSize: N,
      hopSize: H,
      hopSec: H / sampleRate,
      offsetSec: N / (2 * sampleRate),
      push: function (arr) {
        for (var i = 0; i < arr.length; i++) {
          buf[fill++] = arr[i];
          if (fill === N) { frame(); }
        }
        totalSamples += arr.length;
      },
      finish: function () {
        return {
          sampleRate: sampleRate, fftSize: N, hopSize: H, hopSec: H / sampleRate,
          offsetSec: N / (2 * sampleRate),
          envelope: env, low: low, rms: rms,
          frames: frames, dur: totalSamples / sampleRate, peak: peak,
          rmsLevel: totalSamples ? Math.sqrt(sumSq / totalSamples) : 0
        };
      }
    };
  }

  /* --------------------------- helpers --------------------------- */
  function movingAverage(a, n) {
    if (n <= 1 || a.length < n) { return a.slice(); }
    var out = new Array(a.length), half = (n - 1) >> 1, sum = 0;
    for (var i = 0; i < n; i++) { sum += a[i]; }
    for (var j = 0; j < a.length; j++) {
      var lo = j - half, hi = lo + n - 1;
      if (lo < 0) { lo = 0; hi = n - 1; }
      if (hi > a.length - 1) { hi = a.length - 1; lo = hi - n + 1; }
      var s = 0;
      for (var k = lo; k <= hi; k++) { s += a[k]; }
      out[j] = s / (hi - lo + 1);
    }
    return out;
  }
  function mean(a) { var s = 0; for (var i = 0; i < a.length; i++) { s += a[i]; } return a.length ? s / a.length : 0; }
  function median(a) {
    if (!a.length) { return 0; }
    var s = a.slice().sort(function (x, y) { return x - y; });
    var m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  /* --------------------------- detection --------------------------- */
  function detect(res, opts) {
    opts = opts || {};
    var hop = res.hopSec;
    var raw = res.envelope || [];
    var out = {
      bpm: 0, periodSec: 0, confidence: 0, beats: [], onsets: [], downbeats: [],
      beatFrames: [], frames: res.frames, hopSec: hop, duration: res.dur,
      envelope: raw, low: res.low, offsetSec: res.offsetSec, tempoScores: [], note: ''
    };
    var n = raw.length;
    if (n < 24) { out.note = 'Clip too short for reliable beat detection (needs ~1 s of audio).'; return out; }

    var env = movingAverage(raw, Math.max(1, Math.round(opts.smoothFrames || 3)));
    var m = mean(env);
    var x = new Array(n);
    for (var i = 0; i < n; i++) { x[i] = env[i] - m; }

    var e0 = 0;
    for (i = 0; i < n; i++) { e0 += x[i] * x[i]; }
    e0 = e0 / n || 1e-9;

    var minBpm = opts.minBpm || 55, maxBpm = opts.maxBpm || 210;
    var minLag = Math.max(2, Math.round(60 / maxBpm / hop));
    var maxLag = Math.min(n - 2, Math.round(60 / minBpm / hop));
    if (maxLag <= minLag) { maxLag = Math.min(n - 2, minLag + 8); }
    var center = opts.tempoBias || 120, sigma = 0.9;

    function lagScore(lag) {
      var s = 0, cnt = 0;
      for (var i = lag; i < n; i++) { s += x[i] * x[i - lag]; cnt++; }
      return cnt ? (s / cnt) / e0 : 0;
    }
    function prior(bpm) {
      var r = Math.log(bpm / center) / sigma;
      return Math.exp(-0.5 * r * r);
    }

    var best = null, second = null;
    var scores = {};
    for (var lag = minLag; lag <= maxLag; lag++) {
      var bpm = 60 / (lag * hop);
      var ac = lagScore(lag);
      scores[lag] = ac;
      var sc = ac * prior(bpm);
      out.tempoScores.push({ bpm: Math.round(bpm * 10) / 10, score: Math.round(sc * 1000) / 1000 });
      if (!best || sc > best.sc) { second = best; best = { lag: lag, bpm: bpm, sc: sc, ac: ac }; }
      else if (!second || sc > second.sc) { second = { lag: lag, bpm: bpm, sc: sc, ac: ac }; }
    }
    if (!best || best.sc <= 0.01) { out.note = 'No repeating rhythm found (ambient / dialogue-only audio?).'; return out; }

    /* One hop is 32 ms at 16 kHz — far too coarse for a beat grid (120 BPM is
     * 15.625 hops, so an integer lag would lock onto 16 and drift ~2 %).
     * Parabolic interpolation of the autocorrelation peak recovers the
     * sub-hop period. */
    function refine(lag) {
      var a = scores[lag - 1], b = scores[lag], c = scores[lag + 1];
      if (a === undefined) { a = lagScore(lag - 1); scores[lag - 1] = a; }
      if (c === undefined) { c = lagScore(lag + 1); scores[lag + 1] = c; }
      var denom = a - 2 * b + c;
      var delta = (Math.abs(denom) > 1e-12) ? (0.5 * (a - c) / denom) : 0;
      if (delta > 0.5) { delta = 0.5; }
      if (delta < -0.5) { delta = -0.5; }
      return lag + delta;
    }

    /* octave safety: dance tracks often lock onto half/double tempo */
    var cand = [{ lag: best.lag, sc: best.sc, ac: best.ac }];
    [best.bpm * 2, best.bpm / 2, best.bpm * 3 / 2, best.bpm * 2 / 3].forEach(function (b) {
      var lg = Math.round(60 / b / hop);
      if (lg >= minLag && lg <= maxLag) {
        var acx = scores[lg] !== undefined ? scores[lg] : lagScore(lg);
        scores[lg] = acx;
        cand.push({ lag: lg, sc: acx * prior(60 / (lg * hop)), ac: acx });
      }
    });
    cand.sort(function (a, b) { return b.sc - a.sc; });
    var pick = cand[0];

    var periodF = refine(pick.lag);
    if (periodF < 2) { periodF = pick.lag; }
    var periodSec = periodF * hop;

    /* phase: which offset in the bar carries the most onset energy
     * (searched at quarter-frame resolution against the float period) */
    var bestPhase = 0, bestVal = -Infinity;
    for (var p = 0; p < periodF; p += 0.25) {
      var s2 = 0, c2 = 0;
      for (var f2 = p; f2 < n; f2 += periodF) {
        var idx2 = Math.round(f2);
        if (idx2 >= n) { break; }
        s2 += env[idx2]; c2++;
      }
      var v = c2 ? s2 / c2 : 0;
      if (v > bestVal) { bestVal = v; bestPhase = p; }
    }

    /* beats, with optional snap to the nearest real transient */
    var snapWin = opts.snap === false ? 0 : Math.max(1, Math.round(periodF * 0.18));
    var envMax = 0;
    for (i = 0; i < n; i++) { if (env[i] > envMax) { envMax = env[i]; } }
    var beatFrames = [];
    for (var f = bestPhase; f < n; f += periodF) {
      var idx = Math.round(f);
      if (snapWin > 0) {
        var bestI = idx, bestE = -1;
        for (var q = idx - snapWin; q <= idx + snapWin; q++) {
          if (q < 0 || q >= n) { continue; }
          if (env[q] > bestE) { bestE = env[q]; bestI = q; }
        }
        if (bestE >= envMax * 0.2) { idx = bestI; }
      }
      if (!beatFrames.length || idx - beatFrames[beatFrames.length - 1] >= Math.max(1, Math.round(periodF * 0.5))) {
        beatFrames.push(idx);
      }
    }

    var onBeat = [];
    beatFrames.forEach(function (bf) { onBeat.push(env[bf]); });
    var ratio = m > 1e-9 ? mean(onBeat) / m : 0;
    var confidence = Math.max(0, Math.min(1,
      0.55 * Math.min(1, pick.sc / 0.35) + 0.45 * Math.min(1, Math.max(0, ratio - 1) / 1.2)));

    /* downbeats: pick the bar phase with the strongest low-frequency hits */
    var bar = Math.max(1, Math.round(opts.beatsPerBar || 4));
    var lowSm = movingAverage(res.low || [], Math.max(1, Math.round(opts.smoothFrames || 3)));
    var barScore = [], ph;
    for (ph = 0; ph < bar; ph++) { barScore.push(0); }
    for (var bi = 0; bi < beatFrames.length; bi++) {
      barScore[bi % bar] += lowSm[beatFrames[bi]] || 0;
    }
    var barPhase = 0;
    for (ph = 1; ph < bar; ph++) { if (barScore[ph] > barScore[barPhase]) { barPhase = ph; } }

    function tOf(frame) { return (frame * hop) + res.offsetSec; }

    out.bpm = Math.round((60 / periodSec) * 10) / 10;
    out.periodSec = periodSec;
    out.confidence = Math.round(confidence * 100) / 100;
    out.beatFrames = beatFrames;
    out.beats = beatFrames.map(function (bf) { return Math.round(tOf(bf) * 1000) / 1000; });
    out.downbeats = [];
    for (bi = 0; bi < beatFrames.length; bi++) {
      if (bi % bar === barPhase) { out.downbeats.push(Math.round(tOf(beatFrames[bi]) * 1000) / 1000); }
    }
    out.beatCount = beatFrames.length;
    out.onBeatRatio = Math.round(ratio * 100) / 100;
    out.barPhase = barPhase;
    out.beatsPerBar = bar;

    /* onset peaks (for "cut on hits" mode) */
    var med = median(env);
    var sorted = env.slice().sort(function (a, b) { return a - b; });
    var hi = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.97))] || 0;
    var sens = opts.onsetSens || 1.4;
    var thresh = med + Math.max(1e-6, (hi - med)) * (sens / 3);
    var minSep = Math.max(1, Math.round((opts.minOnsetGap || 0.11) / hop));
    var lastPeak = -1e9;
    for (i = 1; i < n - 1; i++) {
      if (env[i] > thresh && env[i] >= env[i - 1] && env[i] > env[i + 1] && (i - lastPeak) >= minSep) {
        out.onsets.push({ t: Math.round(tOf(i) * 1000) / 1000, s: Math.round((env[i] - med) / (hi - med || 1) * 100) / 100 });
        lastPeak = i;
      }
    }
    if (!out.beats.length) { out.note = 'Beat grid could not be resolved on this material.'; }
    return out;
  }

  /* Decode + analyze one media file in a single streaming pass. */
  function detectMedia(mediaPath, opts, cb, onProgress) {
    if (typeof opts === 'function') { cb = opts; opts = {}; }
    opts = opts || {};
    var analyzer = null;
    var decOpts = { blockSeconds: opts.blockSeconds || 1, onProgress: onProgress };
    if (opts.maxSeconds) { decOpts.t = opts.maxSeconds; }
    SYAudio.decodePcm(mediaPath, decOpts, function (arr) {
      if (!analyzer) { analyzer = createAnalyzer(SYAudio.SAMPLE_RATE, opts); }
      analyzer.push(arr);
    }, function (err, info) {
      if (err) { cb(err); return; }
      if (!analyzer) { cb(new Error('No audio decoded from ' + mediaPath)); return; }
      var res = analyzer.finish();
      var det = detect(res, opts);
      det.sampleRate = SYAudio.SAMPLE_RATE;
      det.analyzedSeconds = res.dur;
      cb(null, det);
    });
  }

  /* Map a list of media times onto timeline time for one clip. */
  function toTimeline(times, clip) {
    var off = clip.start - (clip.inPoint || 0);
    var dur = clip.end - clip.start;
    var out = [];
    for (var i = 0; i < times.length; i++) {
      var t = times[i] + off;
      if (t > clip.start + 1e-6 && t < clip.end - 1e-6) { out.push(Math.round(t * 1000) / 1000); }
    }
    return out;
  }

  /* Which beats should the razor hit? every N beats / downbeats only. */
  function cutPoints(times, opts) {
    opts = opts || {};
    var every = Math.max(1, Math.round(opts.every || 1));
    var minGap = opts.minGap || 0;
    var start = (opts.start !== undefined && opts.start !== null) ? +opts.start : -Infinity;
    var end = (opts.end !== undefined && opts.end !== null) ? +opts.end : Infinity;
    var phase = Math.max(0, Math.round(opts.phase || 0));
    var out = [], last = -Infinity;
    for (var i = 0; i < times.length; i++) {
      if ((i - phase) % every !== 0) { continue; }
      var t = times[i];
      if (t <= start || t >= end) { continue; }
      if (out.length && (t - last) < minGap) { continue; }
      out.push(t);
      last = t;
    }
    return out;
  }

  return {
    fft: fft,
    createAnalyzer: createAnalyzer,
    detect: detect,
    detectMedia: detectMedia,
    toTimeline: toTimeline,
    cutPoints: cutPoints,
    movingAverage: movingAverage
  };
})(window.SY);
