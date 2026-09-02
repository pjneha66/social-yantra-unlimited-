/* Beat-detection test: synthetic 120 BPM drum material through the real
 * STFT onset detector, plus the full ffmpeg-decode → analyze path with a
 * stubbed child_process. Verifies BPM, grid phase, cut planning and the
 * media→timeline mapping. */
'use strict';

function makeEl() {
  return { style: {}, classList: { toggle: function () {}, add: function () {}, contains: function () { return false; } },
    addEventListener: function () {}, textContent: '', innerHTML: '', querySelector: function () { return makeEl(); },
    appendChild: function () {}, setAttribute: function () {}, getAttribute: function () { return null; },
    children: [], removeChild: function () {}, scrollTop: 0 };
}
global.window = global;
global.document = { getElementById: function () { return makeEl(); }, createElement: function () { return makeEl(); },
  addEventListener: function () {}, querySelectorAll: function () { return []; }, body: makeEl() };
global.localStorage = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} };

var path = require('path'), fs = require('fs');
var base = path.join(__dirname, '..');
(0, eval)(fs.readFileSync(path.join(base, 'js/CSInterface.js'), 'utf8'));
(0, eval)(fs.readFileSync(path.join(base, 'js/core/bridge.js'), 'utf8'));
SY.log = function (m, l) { if (l === 'err') { console.log('[sy-err]', m); } };
SY.hasNode = true;

var failed = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 220) : ''));
  if (!cond) { failed++; }
}

/* ---------------- synthetic audio ---------------- */
var SR = 16000;
function makeDrums(seconds, bpm) {
  var n = Math.round(seconds * SR);
  var buf = new Float32Array(n);
  var period = 60 / bpm;
  for (var b = 0; b * period < seconds; b++) {
    var t0 = Math.round(b * period * SR);
    var kickLen = Math.round(0.09 * SR);
    for (var i = 0; i < kickLen && (t0 + i) < n; i++) {
      var t = i / SR;
      var env = Math.exp(-t * 34);
      // 62 Hz body + a broadband click so the spectral flux is unambiguous
      var v = env * (0.75 * Math.sin(2 * Math.PI * 62 * t) + (i < 90 ? 0.5 * (Math.random() * 2 - 1) : 0));
      buf[t0 + i] += v;
    }
    // offbeat hat, quieter — must not become the beat grid
    var h0 = Math.round((b * period + period / 2) * SR);
    for (var j = 0; j < 260 && (h0 + j) < n; j++) {
      buf[h0 + j] += 0.12 * Math.exp(-(j / SR) * 90) * (Math.random() * 2 - 1);
    }
  }
  for (var k = 0; k < n; k++) { buf[k] += 0.004 * (Math.random() * 2 - 1); }
  return buf;
}
function makeNoise(seconds) {
  var n = Math.round(seconds * SR), buf = new Float32Array(n);
  for (var i = 0; i < n; i++) { buf[i] = 0.05 * (Math.random() * 2 - 1); }
  return buf;
}

(0, eval)(fs.readFileSync(path.join(base, 'js/core/audio-vad.js'), 'utf8'));
(0, eval)(fs.readFileSync(path.join(base, 'js/core/beat.js'), 'utf8'));

/* ---------------- 1. FFT sanity ---------------- */
(function () {
  var N = 1024, re = new Float64Array(N), im = new Float64Array(N);
  var bin = 40;
  for (var i = 0; i < N; i++) { re[i] = Math.sin(2 * Math.PI * bin * i / N); }
  SYBeat.fft(re, im);
  var peak = 0, peakBin = 0;
  for (var b = 1; b < N / 2; b++) {
    var m = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
    if (m > peak) { peak = m; peakBin = b; }
  }
  check('FFT puts a pure sine in the right bin', peakBin === bin, { peakBin: peakBin, expected: bin });
})();

/* ---------------- 2. onset envelope + tempo ---------------- */
function analyze(buf) {
  var an = SYBeat.createAnalyzer(SR, {});
  for (var off = 0; off < buf.length; off += 4096) { an.push(buf.subarray(off, Math.min(off + 4096, buf.length))); }
  return an.finish();
}

var drums = makeDrums(12, 120);
var res = analyze(drums);
var det = SYBeat.detect(res, { minBpm: 55, maxBpm: 210, beatsPerBar: 4 });

check('onset envelope was produced for every hop', res.frames > 300, { frames: res.frames, env: res.envelope.length });
check('detects 120 BPM on synthetic drums', Math.abs(det.bpm - 120) < 3, { bpm: det.bpm });
check('beat period ≈ 0.5 s', Math.abs(det.periodSec - 0.5) < 0.03, { period: det.periodSec });
check('finds ~24 beats in 12 s', det.beats.length >= 22 && det.beats.length <= 26, { beats: det.beats.length });
check('confidence is high on clean rhythmic material', det.confidence >= 0.7, { conf: det.confidence, ratio: det.onBeatRatio });

var spacing = [];
for (var i = 1; i < det.beats.length; i++) { spacing.push(det.beats[i] - det.beats[i - 1]); }
var avg = spacing.reduce(function (a, b) { return a + b; }, 0) / spacing.length;
var worst = spacing.reduce(function (a, b) { return Math.max(a, Math.abs(b - 0.5)); }, 0);
check('beat grid is evenly spaced at 0.5 s', Math.abs(avg - 0.5) < 0.02 && worst < 0.06, { avg: avg, worst: worst });

var firstBeatDrift = Math.min(det.beats[0] % 0.5, 0.5 - (det.beats[0] % 0.5));
check('beat grid is phase-locked to the kick (not the offbeat hat)', firstBeatDrift < 0.09, { first: det.beats[0], drift: firstBeatDrift });
check('downbeats fall every 4 beats', det.downbeats.length === 6 && Math.abs(det.downbeats[1] - det.downbeats[0] - 2.0) < 0.06,
  { downbeats: det.downbeats.length, gap: det.downbeats[1] - det.downbeats[0] });
check('onset peaks were picked', det.onsets.length >= 20, { onsets: det.onsets.length });

/* ---------------- 3. cut planning ---------------- */
var every4 = SYBeat.cutPoints(det.beats, { every: 4, minGap: 0 });
check('cutPoints(every 4 beats) gives one cut per bar', every4.length === 6, { n: every4.length, first: every4[0] });
var gapped = SYBeat.cutPoints(det.beats, { every: 1, minGap: 0.9 });
check('minGap thins out dense cuts', gapped.length <= 13 && gapped.every(function (t, i) { return i === 0 || (t - gapped[i - 1]) >= 0.89; }), { n: gapped.length });
var ranged = SYBeat.cutPoints(det.beats, { every: 1, minGap: 0, start: 4, end: 8 });
check('time range limits the cuts', ranged.length === 8 && ranged[0] > 4 && ranged[ranged.length - 1] < 8, { n: ranged.length, range: [ranged[0], ranged[ranged.length - 1]] });
var phased = SYBeat.cutPoints(det.beats, { every: 2, phase: 1 });
check('phase offset shifts which beats are cut', phased.length > 0 && Math.abs(phased[0] - det.beats[1]) < 1e-6, { first: phased[0], beats1: det.beats[1] });

/* ---------------- 4. media → timeline mapping ---------------- */
var clip = { start: 10, end: 20, inPoint: 3, outPoint: 13 };
var mapped = SYBeat.toTimeline([0, 3.5, 9.9, 12], clip);
// media time 0 is before the clip's in-point (3 s) → it lands at 7 s, outside
// the clip span, so it must be dropped; 3.5 s → 10 + (3.5 − 3) = 10.5 s
check('toTimeline offsets by clip start − inPoint and clips to the span',
  mapped.length === 3 && Math.abs(mapped[0] - 10.5) < 1e-6 &&
  Math.abs(mapped[1] - 16.9) < 1e-6 && Math.abs(mapped[2] - 19) < 1e-6, mapped);

/* ---------------- 5. non-rhythmic material ---------------- */
var noiseDet = SYBeat.detect(analyze(makeNoise(6)), { minBpm: 55, maxBpm: 210 });
check('white noise yields low confidence / no grid', noiseDet.confidence < 0.55, { bpm: noiseDet.bpm, conf: noiseDet.confidence });

var tiny = SYBeat.detect({ envelope: [1, 2, 3], hopSec: 0.032, frames: 3, dur: 0.1, low: [0, 0, 0], offsetSec: 0.03 }, {});
check('too-short audio degrades gracefully', tiny.bpm === 0 && /too short/i.test(tiny.note), tiny.note);

/* ---------------- 6. end-to-end through the ffmpeg decoder ---------------- */
var EventEmitter = require('events');
function fakeSpawn(cmd, args) {
  var child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  var buf = Buffer.alloc(drums.length * 4);
  for (var i = 0; i < drums.length; i++) { buf.writeFloatLE(drums[i], i * 4); }
  setImmediate(function () {
    var CH = SR * 4;
    for (var c = 0; c < buf.length; c += CH) { child.stdout.emit('data', buf.slice(c, Math.min(c + CH, buf.length))); }
    child.emit('close', 0);
  });
  return child;
}
var realRequire = SY.require;
SY.require = function (m) {
  return m === 'child_process' ? { spawn: fakeSpawn, exec: function (c, o, cb) { cb(new Error('no ffmpeg here')); } } : realRequire(m);
};

SYBeat.detectMedia('/m/music_bed.mp3', { minBpm: 55, maxBpm: 210, beatsPerBar: 4 }, function (err, d) {
  check('detectMedia streams the decode and reports the same tempo',
    !err && Math.abs(d.bpm - 120) < 3 && d.beats.length >= 22, err ? err.message : { bpm: d.bpm, beats: d.beats.length, secs: d.analyzedSeconds });
  console.log(failed ? ('\n' + failed + ' BEAT FAILURES') : '\nALL BEAT TESTS PASSED');
  process.exit(failed ? 1 : 0);
}, function () {});
