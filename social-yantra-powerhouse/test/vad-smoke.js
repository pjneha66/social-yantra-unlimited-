/* VAD engine test: feeds synthetic 16 kHz mono f32le PCM through a stubbed
 * ffmpeg child process and verifies silence detection, padding + merging. */
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
try { global.navigator = { platform: 'Linux' }; } catch (e) {}
global.localStorage = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} };

var path = require('path'), fs = require('fs');
var base = path.join(__dirname, '..');
(0, eval)(fs.readFileSync(path.join(base, 'js/CSInterface.js'), 'utf8'));
(0, eval)(fs.readFileSync(path.join(base, 'js/core/bridge.js'), 'utf8'));
SY.log = function (m, l) { console.log('[sy]', l || 'info', m); };
SY.hasNode = true; /* harness: global require isn't visible to eval'd code */

/* stub child_process + force ffmpeg resolution */
var EventEmitter = require('events');
function fakeSpawn(cmd, args) {
  var child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  // synthetic audio: speech 0-3s, silence 3-6s, speech 6-10s, silence 10-11s, speech 11-12s
  var SR = 16000, total = 12;
  var buf = Buffer.alloc(total * SR * 4);
  for (var i = 0; i < total * SR; i++) {
    var t = i / SR;
    var speech = (t < 3) || (t >= 6 && t < 10) || (t >= 11);
    var v = speech ? 0.5 * Math.sin(2 * Math.PI * 220 * t) : 0.0000015; // silence ≈ -96 dBFS
    buf.writeFloatLE(v, i * 4);
  }
  setImmediate(function () {
    var CH = SR * 4; // 1s chunks
    for (var c = 0; c < buf.length; c += CH) {
      child.stdout.emit('data', buf.slice(c, Math.min(c + CH, buf.length)));
    }
    child.emit('close', 0);
  });
  return child;
}
var realRequire = SY.require;
SY.require = function (m) { return m === 'child_process' ? { spawn: fakeSpawn, exec: function (c, o, cb) { cb(new Error('no')); } } : realRequire(m); };

(0, eval)(fs.readFileSync(path.join(base, 'js/core/audio-vad.js'), 'utf8'));

var failed = 0;
function close(a, b, eps) { return Math.abs(a - b) <= (eps || 0.06); }

SYAudio.analyzeTimeline(
  [{ mediaPath: '/m/ep.wav', start: 0, end: 12, inPoint: 0, trackIndex: 0, name: 'ep.wav' }],
  { threshold: -38, minDur: 0.6, padPre: 0.04, padPost: 0.06 },
  function (err, res) {
    var gaps = res && res.gaps;
    console.log('err =', err && err.message, ' gaps =', JSON.stringify(gaps));
    var pass = !err && gaps && gaps.length === 2 &&
      close(gaps[0][0], 3.04) && close(gaps[0][1], 5.96) &&
      close(gaps[1][0], 10.04) && close(gaps[1][1], 10.96);
    console.log(pass ? 'VAD TEST PASSED' : 'VAD TEST FAILED');
    process.exit(pass ? 0 : 1);
  },
  function (p) { process.stdout.write('progress ' + Math.round(p * 100) + '%\r'); }
);
