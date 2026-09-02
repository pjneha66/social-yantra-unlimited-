/* ==========================================================================
 * Social Yantra Powerhouse — Music Auto-Ducking engine
 * Turns speech intervals (from the VAD speech mask or Whisper word
 * timestamps) into a smooth volume-ducking envelope: keyframed fade-down
 * before dialogue, a hold through it, and a smooth fade-up after.
 *
 * Pure math — no Premiere, no Node — so it is unit-testable and reusable by
 * the panel preview canvas and the ExtendScript writer alike.
 *
 *   SYDuck.buildEnvelope(speechIv, opts)
 *     -> { keys:[{t,db}], regions:[{start,end,duckStart,duckEnd}], duckLevelDb,
 *          duckedSeconds, keyCount, bridged }
 * ========================================================================== */
window.SYDuck = (function () {
  'use strict';

  var DEFAULTS = {
    baseDb: 0,          // clip's normal level (Premiere shows 0.0 dB)
    duckDb: -12,        // how far to dip while dialogue plays (negative offset)
    attackMs: 120,      // fade-down length
    releaseMs: 450,     // fade-up length
    holdGapMs: 250,     // bridge speech gaps shorter than this (stay ducked)
    minSpeechMs: 100,   // ignore speech blips shorter than this
    minDuckMs: 120,     // never duck for less than this
    rampSteps: 3,       // keys inside each ramp (1 = plain linear ramp)
    floorDb: -60,       // hard floor
    minKeyGap: 0.004    // drop keys closer together than this
  };

  function opt(o, k) { return (o && o[k] !== undefined && o[k] !== null && o[k] !== '') ? +o[k] : DEFAULTS[k]; }

  /* cosine ease-in-out: gentle start/stop, so the duck never "clicks" */
  function ease(p) { return 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, p))); }

  function norm(speech, minSpeech) {
    var iv = (speech || [])
      .map(function (s) { return Array.isArray(s) ? [+s[0], +s[1]] : [ +s.start, +s.end ]; })
      .filter(function (s) { return isFinite(s[0]) && isFinite(s[1]) && s[1] - s[0] >= minSpeech; })
      .sort(function (a, b) { return a[0] - b[0]; });
    var out = [];
    iv.forEach(function (s) {
      if (out.length && s[0] <= out[out.length - 1][1]) {
        out[out.length - 1][1] = Math.max(out[out.length - 1][1], s[1]);
      } else { out.push([s[0], s[1]]); }
    });
    return out;
  }

  /* Group speech into duck regions, bridging short pauses so the music does
   * not pump up and down between words. */
  function duckRegions(speech, opts) {
    var attack = opt(opts, 'attackMs') / 1000;
    var release = opt(opts, 'releaseMs') / 1000;
    var gap = opt(opts, 'holdGapMs') / 1000;
    var minDuck = opt(opts, 'minDuckMs') / 1000;
    var regions = [];
    var bridged = 0;

    speech.forEach(function (s) {
      var last = regions[regions.length - 1];
      if (last && s[0] - last.speechEnd <= gap) {
        // bridge: extend the current region, no ramp back up in between
        last.speechEnd = s[1];
        last.end = s[1] + release;
        last.speech.push(s);
        bridged++;
      } else {
        regions.push({ speechStart: s[0], speechEnd: s[1], speech: [s], start: s[0] - attack, end: s[1] + release });
      }
    });

    // drop regions too short to be worth keyframing
    regions = regions.filter(function (r) { return (r.speechEnd - r.speechStart) >= minDuck || (r.end - r.start) >= minDuck; });

    return regions.map(function (r) {
      r.attack = Math.min(attack, (r.end - r.start) / 2);
      r.release = Math.min(release, (r.end - r.start) / 2);
      r.duckStart = r.start + r.attack;
      r.duckEnd = r.end - r.release;
      r.bridged = r.speech.length;
      return r;
    });
  }

  /* Build the keyframe list: [{t:seconds, db:level}] sorted & deduped. */
  function buildEnvelope(speech, opts) {
    opts = opts || {};
    var baseDb = opt(opts, 'baseDb');
    var duckLevel = baseDb + opt(opts, 'duckDb');
    var floor = opt(opts, 'floorDb');
    var steps = Math.max(1, Math.round(opt(opts, 'rampSteps')));
    var minKeyGap = opt(opts, 'minKeyGap');
    if (duckLevel < floor) { duckLevel = floor; }

    var minSpeech = opt(opts, 'minSpeechMs') / 1000;
    var sp = norm(speech, minSpeech);
    var regions = duckRegions(sp, opts);

    var keys = [];
    function push(t, db) {
      if (!isFinite(t) || !isFinite(db)) { return; }
      var last = keys[keys.length - 1];
      if (last && Math.abs(last.t - t) < minKeyGap) { last.db = db; return; }  // replace, keep spacing legal
      keys.push({ t: t, db: db });
    }
    function ramp(t0, t1, v0, v1) {
      for (var i = 1; i < steps; i++) {
        var p = i / steps;
        push(t0 + (t1 - t0) * p, v0 + (v1 - v0) * ease(p));
      }
    }

    regions.forEach(function (r) {
      push(r.start, baseDb);
      ramp(r.start, r.duckStart, baseDb, duckLevel);
      push(r.duckStart, duckLevel);
      push(r.duckEnd, duckLevel);
      ramp(r.duckEnd, r.end, duckLevel, baseDb);
      push(r.end, baseDb);
    });

    keys.sort(function (a, b) { return a.t - b.t; });

    // clamp to the caller's timeline bounds (clip / work area)
    if (opts.start !== undefined || opts.end !== undefined) {
      var lo = opts.start !== undefined ? +opts.start : -Infinity;
      var hi = opts.end !== undefined ? +opts.end : Infinity;
      keys = keys.filter(function (k) { return k.t >= lo - 1e-9 && k.t <= hi + 1e-9; });
    }
    keys.forEach(function (k) { k.t = Math.round(k.t * 1e5) / 1e5; k.db = Math.round(k.db * 100) / 100; });

    var ducked = 0;
    regions.forEach(function (r) { ducked += (r.duckEnd - r.duckStart); });

    return {
      keys: keys,
      regions: regions,
      speech: sp,
      duckLevelDb: duckLevel,
      baseDb: baseDb,
      duckedSeconds: ducked,
      keyCount: keys.length,
      bridged: regions.reduce(function (a, r) { return a + (r.bridged > 1 ? 1 : 0); }, 0),
      settings: {
        baseDb: baseDb, duckDb: duckLevel - baseDb,
        attackMs: opt(opts, 'attackMs'), releaseMs: opt(opts, 'releaseMs'),
        holdGapMs: opt(opts, 'holdGapMs'), rampSteps: steps
      }
    };
  }

  /* Linear dB value of an envelope at time t (used to hold boundary values). */
  function valueAt(keys, t) {
    if (!keys || !keys.length) { return null; }
    if (t <= keys[0].t) { return keys[0].db; }
    var last = keys[keys.length - 1];
    if (t >= last.t) { return last.db; }
    for (var i = 1; i < keys.length; i++) {
      if (t <= keys[i].t) {
        var a = keys[i - 1], b = keys[i];
        var span = b.t - a.t;
        if (span <= 1e-9) { return b.db; }
        var p = (t - a.t) / span;
        return a.db + (b.db - a.db) * p;
      }
    }
    return last.db;
  }

  /* Slice the keys that fall inside [t0,t1], adding boundary keys so the
   * level holds correctly at the clip edges. */
  function slice(keys, t0, t1) {
    var out = [];
    var first = null, last = null;
    keys.forEach(function (k) {
      if (k.t >= t0 - 1e-9 && k.t <= t1 + 1e-9) {
        if (!first || k.t < first.t) { first = k; }
        if (!last || k.t > last.t) { last = k; }
        out.push({ t: k.t, db: k.db });
      }
    });
    var v0 = valueAt(keys, t0);
    var v1 = valueAt(keys, t1);
    if (v0 !== null) { out.unshift({ t: t0, db: Math.round(v0 * 100) / 100 }); }
    if (v1 !== null) { out.push({ t: t1, db: Math.round(v1 * 100) / 100 }); }
    out.sort(function (a, b) { return a.t - b.t; });
    // dedupe
    var dedup = [];
    out.forEach(function (k) {
      var l = dedup[dedup.length - 1];
      if (l && Math.abs(l.t - k.t) < 1e-4) { return; }
      dedup.push(k);
    });
    return { keys: dedup, touched: !!(first && last) };
  }

  return {
    DEFAULTS: DEFAULTS,
    buildEnvelope: buildEnvelope,
    duckRegions: duckRegions,
    valueAt: valueAt,
    slice: slice,
    ease: ease
  };
})();
