/* Integration test: really runs ffmpeg through the panel's own code paths —
 * SYStills.makeSolid / makeText and SYFrameQC.lumaProfile / blackDetect /
 * findSpikes — against generated media. Skipped (exit 0) when no ffmpeg is
 * reachable, so CI without ffmpeg stays green; set SY_FFMPEG to point at a
 * specific binary.
 *
 *   SY_FFMPEG=/path/to/ffmpeg node test/media-smoke.js
 */
'use strict';

function makeEl() {
  var el = {
    value: '', checked: false, textContent: '', innerHTML: '', style: {}, dataset: {},
    children: [], classList: { toggle: function () {}, add: function () {}, remove: function () {}, contains: function () { return false; } },
    addEventListener: function () {}, removeEventListener: function () {},
    appendChild: function (c) { this.children.push(c); }, removeChild: function () {},
    querySelector: function () { return makeEl(); }, querySelectorAll: function () { return []; },
    getAttribute: function () { return null; }, setAttribute: function () {}, closest: function () { return null; }
  };
  el.parentNode = { removeChild: function () {} };
  return el;
}
global.window = global;
global.document = {
  body: makeEl(),
  getElementById: function () { return makeEl(); },
  createElement: function () { return makeEl(); },
  querySelector: function () { return makeEl(); },
  querySelectorAll: function () { return []; },
  addEventListener: function () {}, removeEventListener: function () {}
};
global.localStorage = { _s: {}, getItem: function (k) { return this._s[k] || null; }, setItem: function (k, v) { this._s[k] = v; }, removeItem: function (k) { delete this._s[k]; } };
global.require = require;

var fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
var base = path.join(__dirname, '..');
['js/CSInterface.js', 'js/core/bridge.js', 'js/core/stills.js', 'js/core/frameqc.js'].forEach(function (f) {
  var code = fs.readFileSync(path.join(base, f), 'utf8');
  try { (0, eval)(code); }
  catch (e) { console.log('LOAD-FAIL', f, e.message); process.exitCode = 1; }
});

/* ---------------- find a usable ffmpeg ---------------- */
function which(bin) {
  try {
    var out = cp.execSync((process.platform === 'win32' ? 'where ' : 'command -v ') + bin, { encoding: 'utf8' });
    return out.split('\n')[0].trim();
  } catch (e) { return ''; }
}
var FF = process.env.SY_FFMPEG || which('ffmpeg');
if (!FF || !fs.existsSync(FF) && FF !== 'ffmpeg') { FF = which('ffmpeg') || ''; }
if (!FF) {
  console.log('SKIP media integration test — no ffmpeg on PATH (set SY_FFMPEG=/path/to/ffmpeg)');
  process.exit(0);
}
SY.settings.ffmpegPath = FF;

var TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sy-media-'));
var failed = 0, ran = 0;
function check(name, cond, extra) {
  ran++;
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + JSON.stringify(extra).slice(0, 170) : ''));
  if (!cond) { failed++; }
}
function sh(args, cb) {
  cp.execFile(FF, args, { timeout: 120000 }, function (err, so, se) { cb(err, so, se); });
}

console.log('ffmpeg: ' + FF);

/* Mean luma of an image, read back with the same signalstats filter the panel
 * uses for flash detection — an independent confirmation of the render. */
function lumaOf(png, cb) {
  sh(['-hide_banner', '-i', png, '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-',
      '-f', 'null', process.platform === 'win32' ? 'NUL' : '/dev/null'],
    function (err, so, se) {
      var m = /YAVG=([0-9.]+)/.exec(String(so) + String(se));
      cb(m ? parseFloat(m[1]) : NaN);
    });
}
function sizeOf(png, cb) {
  sh(['-hide_banner', '-i', png], function (err, so, se) {
    var m = /(\d{2,5})x(\d{2,5})/.exec(String(se));
    var a = /yuva|rgba|bgra|ya8/.test(String(se));
    cb(m ? { w: +m[1], h: +m[2], alpha: a } : null);
  });
}

/* ---------------- 1. solid layer ---------------- */
var solidPath = path.join(TMP, 'solid.png');
SYStills.makeSolid({ color: '#7c5cff', width: 320, height: 180, alpha: 1, outPath: solidPath }, function (err) {
  if (err) { check('makeSolid renders a PNG', false, err.message); return step2(); }
  check('makeSolid renders a PNG', fs.existsSync(solidPath) && fs.statSync(solidPath).size > 200, fs.statSync(solidPath).size);
  sizeOf(solidPath, function (info) {
    check('the solid has the sequence dimensions', info && info.w === 320 && info.h === 180, info);
    lumaOf(solidPath, function (y) {
      /* #7c5cff → BT.709 luma ≈ 0.2126*124 + 0.7152*92 + 0.0722*255 ≈ 110.5 */
      check('the solid renders the colour that was asked for (YAVG≈110)', y > 100 && y < 122, y);
      step2();
    });
  });
});

/* ---------------- 2. text layer (ffmpeg drawtext fallback) ---------------- */
function step2() {
  var textPath = path.join(TMP, 'text.png');
  SYStills.hasDrawtext(function (have) {
    console.log((have ? 'INFO ' : 'INFO ') + 'ffmpeg drawtext filter: ' + (have ? 'present' : 'ABSENT in this build'));
    SYStills.makeTextFFmpeg({
      text: 'Social Yantra\ndos lineas', width: 640, height: 360, size: 48,
      color: '#ffffff', outline: 3, shadow: true, outPath: textPath
    }, function (err) {
      if (!have) {
        /* No drawtext here — the honest check is that the panel reports it
         * actionably instead of dumping a raw ffmpeg error. */
        check('a missing drawtext filter produces an actionable error',
          !!err && /drawtext/.test(err.message) && /full ffmpeg build|Settings/i.test(err.message),
          err && err.message);
        return step3();
      }
      if (err) { check('makeTextFFmpeg renders a PNG', false, err.message); return step3(); }
      var bytes = fs.statSync(textPath).size;
      check('makeTextFFmpeg renders a PNG', fs.existsSync(textPath) && bytes > 400, bytes);
      sizeOf(textPath, function (info) {
        check('the text layer carries an alpha channel', info && info.alpha === true, info);
        lumaOf(textPath, function (y) {
          /* white glyphs on a fully transparent plate: YAVG over the frame must
           * be low but non-zero, i.e. something was actually drawn */
          check('glyphs were drawn on the transparent plate', y > 1 && y < 60, y);
          SYStills.makeTextFFmpeg({ text: ' ', width: 640, height: 360, size: 48, color: '#ffffff', outPath: path.join(TMP, 'blank.png') },
            function () {
              lumaOf(path.join(TMP, 'blank.png'), function (y2) {
                check('a blank render is measurably emptier than the real one', y2 < y, [y2, y]);
                step3();
              });
            });
        });
      });
    });
  });
}

/* ---------------- 3. flash frame detection ---------------- */
/* 2 s of mid-grey at 25 fps with ONE white frame at n=25 (t=1.0 s) */
function step3() {
  var flashVid = path.join(TMP, 'flash.mp4');
  sh(['-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'color=c=0x808080:s=160x120:r=25:d=2',
      '-vf', "drawbox=x=0:y=0:w=160:h=120:color=white:t=fill:enable='eq(n,25)'",
      '-pix_fmt', 'yuv420p', flashVid], function (err, so, se) {
    if (err) { check('test clip with a flash frame could be generated', false, String(se).slice(-160)); return step4(); }
    SYFrameQC.lumaProfile(flashVid, {}, function (err2, samples) {
      if (err2) { check('lumaProfile reads per-frame YAVG', false, err2.message); return step4(); }
      check('lumaProfile reads one sample per frame', samples.length >= 45 && samples.length <= 55, samples.length);
      check('lumaProfile timestamps start near zero', samples[0] && samples[0].t < 0.1, samples[0] && samples[0].t);
      var res = SYFrameQC.findSpikes(samples, { threshold: 45, maxRun: 2, window: 3 });
      check('the injected white frame is detected', res.flashes.length === 1, res.flashes);
      check('it is detected at the right time (t≈1.0 s)',
        res.flashes[0] && Math.abs(res.flashes[0].t - 1.0) < 0.09, res.flashes[0] && res.flashes[0].t);
      check('it is classified as a white flash', res.flashes[0] && res.flashes[0].kind === 'white', res.flashes[0] && res.flashes[0].kind);
      step4();
    });
  });
}

/* ---------------- 4. empty / black frame detection ---------------- */
/* 3 s of mid-grey with 1 s of black starting at t=1.0 */
function step4() {
  var blackVid = path.join(TMP, 'black.mp4');
  sh(['-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'color=c=0x808080:s=160x120:r=25:d=3',
      '-vf', "drawbox=x=0:y=0:w=160:h=120:color=black:t=fill:enable='between(n,25,49)'",
      '-pix_fmt', 'yuv420p', blackVid], function (err, so, se) {
    if (err) { check('test clip with a black span could be generated', false, String(se).slice(-160)); return done(); }
    SYFrameQC.blackDetect(blackVid, { minDur: 0.2, pixTh: 0.10, picTh: 0.98 }, function (err2, spans) {
      if (err2) { check('blackDetect finds the black span', false, err2.message); return done(); }
      check('blackDetect finds the black span', spans.length === 1, spans);
      check('the span starts at the injected black (t≈1.0 s)',
        spans[0] && Math.abs(spans[0].start - 1.0) < 0.15, spans[0] && spans[0].start);
      check('the span lasts about a second', spans[0] && spans[0].duration > 0.7 && spans[0].duration < 1.3, spans[0] && spans[0].duration);
      /* the flash detector must NOT fire on a 1-second black span */
      SYFrameQC.lumaProfile(blackVid, {}, function (e3, samples) {
        var res = SYFrameQC.findSpikes(samples, { threshold: 45, maxRun: 2, window: 3 });
        check('a 1-second black span is not reported as a flash', res.flashes.length === 0, res.flashes);
        done();
      });
    });
  });
}

function done() {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  console.log(failed
    ? ('\n' + failed + ' of ' + ran + ' MEDIA INTEGRATION TEST(S) FAILED')
    : '\nALL ' + ran + ' MEDIA INTEGRATION TESTS PASSED');
  process.exit(failed ? 1 : 0);
}
