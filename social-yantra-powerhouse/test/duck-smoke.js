/* Ducking envelope test: speech intervals in → smooth keyframe envelope out.
 * Verifies ramp timing, bridging (no music pumping), levels, monotonic keys,
 * interpolation and clip slicing. Pure math — no ffmpeg, no Premiere. */
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
SY.log = function () {};
(0, eval)(fs.readFileSync(path.join(base, 'js/core/duck.js'), 'utf8'));

var failed = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 200) : ''));
  if (!cond) { failed++; }
}
function near(a, b, eps) { return Math.abs(a - b) <= (eps === undefined ? 0.011 : eps); }
function keyAt(env, t) {
  for (var i = 0; i < env.keys.length; i++) { if (near(env.keys[i].t, t, 0.0006)) { return env.keys[i]; } }
  return null;
}

/* ---- 1. two speech regions, one bridged pause ---- */
var opts = { baseDb: 0, duckDb: -12, attackMs: 120, releaseMs: 450, holdGapMs: 250, minSpeechMs: 100, rampSteps: 3 };
var speech = [[2.0, 4.0], [4.2, 6.0], [12.0, 14.0]];
var env = SYDuck.buildEnvelope(speech, opts);

check('bridges the 200 ms pause into one region (no pumping)', env.regions.length === 2, {
  regions: env.regions.length, bridged: env.bridged, spans: env.regions.map(function (r) { return [r.start, r.end]; })
});

var r0 = env.regions[0];
check('fade-down starts 120 ms before speech', near(r0.start, 1.88), r0.start);
check('duck is reached exactly at speech start', near(r0.duckStart, 2.0), r0.duckStart);
check('fade-up ends 450 ms after speech stops', near(r0.end, 6.45), r0.end);
check('ducked level = base + duck amount', near(env.duckLevelDb, -12), env.duckLevelDb);
check('level before the ramp is the base level', near(keyAt(env, 1.88).db, 0), keyAt(env, 1.88));
check('level inside the hold is the duck level', near(keyAt(env, 2.0).db, -12), keyAt(env, 2.0));
check('level returns to base after the release', near(keyAt(env, 6.45).db, 0), keyAt(env, 6.45));

var mono = true, gapsOk = true;
for (var i = 1; i < env.keys.length; i++) {
  if (env.keys[i].t <= env.keys[i - 1].t) { mono = false; }
}
check('keyframes are strictly increasing in time', mono, env.keys.map(function (k) { return k.t; }));

var rampKeys = env.keys.filter(function (k) { return k.t > 1.88 && k.t < 2.0; });
check('ramp is sampled into intermediate keys (smooth, not linear)', rampKeys.length === 2 &&
  rampKeys[0].db < 0 && rampKeys[0].db > -12 && rampKeys[1].db < rampKeys[0].db, rampKeys);

/* ---- 2. interpolation + slicing ---- */
var mid = SYDuck.valueAt(env.keys, 3.0);
check('valueAt holds the duck level mid-speech', near(mid, -12), mid);
var half = SYDuck.valueAt(env.keys, (1.88 + 2.0) / 2);
check('valueAt interpolates through the ramp', half < 0 && half > -12, half);

var sl = SYDuck.slice(env.keys, 3.5, 5.0);
check('slice adds boundary keys so the level holds at clip edges',
  sl.keys.length >= 2 && near(sl.keys[0].t, 3.5) && near(sl.keys[sl.keys.length - 1].t, 5.0) &&
  near(sl.keys[0].db, -12) && near(sl.keys[sl.keys.length - 1].db, -12), sl.keys);

var sl2 = SYDuck.slice(env.keys, 0, 1.0);
check('slice outside the envelope falls back to the base level',
  sl2.keys.length >= 2 && near(sl2.keys[0].db, 0) && near(sl2.keys[1].db, 0), sl2.keys);

/* ---- 3. filtering + stats ---- */
var noisy = SYDuck.buildEnvelope([[1.0, 1.04], [5.0, 9.0]], { minSpeechMs: 100, duckDb: -12, baseDb: 0 });
check('sub-threshold blips are ignored', noisy.regions.length === 1, noisy.regions.length);

var quiet = SYDuck.buildEnvelope([], opts);
check('no speech → no keys, no crash', quiet.keys.length === 0 && quiet.regions.length === 0, quiet);

var deep = SYDuck.buildEnvelope([[0, 5]], { baseDb: 0, duckDb: -200, floorDb: -60 });
check('duck amount is clamped at the floor', near(deep.duckLevelDb, -60), deep.duckLevelDb);

var ducked = SYDuck.buildEnvelope(speech, opts);
check('duckedSeconds reports the held (not ramped) time',
  near(ducked.duckedSeconds, (4.0 - 2.0) + 0.2 + (6.0 - 4.2) + (14.0 - 12.0), 0.02), ducked.duckedSeconds);

var bounded = SYDuck.buildEnvelope(speech, { baseDb: 0, duckDb: -12, start: 0, end: 5 });
var inBounds = bounded.keys.every(function (k) { return k.t >= 0 && k.t <= 5.0001; });
check('keys are clamped to the caller bounds (work area / clip)', inBounds, bounded.keys.map(function (k) { return k.t; }));

console.log(failed ? ('\n' + failed + ' DUCK FAILURES') : '\nALL DUCK TESTS PASSED');
process.exit(failed ? 1 : 0);
