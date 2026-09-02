/* Headless test for the frame QC maths (flash spike detection, blackdetect
 * parsing, clip filtering) and the still renderer's escaping/colour helpers.
 * The ffmpeg calls themselves are covered by the arg construction here plus
 * the live panel run; the detectors' decisions are pure functions. */
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
/* bridge.js probes for Node with `typeof require === 'function'`; require is
 * module-scoped, so expose it globally the way the CEP panel's --mix-contexts
 * runtime does. Without this SY.hasNode would be false and the CLI candidate
 * lists would be short. */
global.require = require;

var fs = require('fs'), path = require('path');
var base = path.join(__dirname, '..');
['js/CSInterface.js', 'js/core/bridge.js', 'js/core/stills.js', 'js/core/frameqc.js',
 'js/core/rembg.js', 'js/core/mediaget.js'].forEach(function (f) {
  var code = fs.readFileSync(path.join(base, f), 'utf8');
  try { (0, eval)(code); }
  catch (e) { console.log('LOAD-FAIL', f, e.message); process.exitCode = 1; }
});

var failed = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + JSON.stringify(extra).slice(0, 170) : ''));
  if (!cond) { failed++; }
}

/* Build a synthetic per-frame luma series. */
function series(base, spikes, n) {
  var out = [];
  for (var i = 0; i < (n || 40); i++) { out.push({ t: i * 0.04, v: base }); }
  for (var k in spikes) { out[+k].v = spikes[k]; }
  return out;
}

/* ---------------- flash spike detection ---------------- */
var one = SYFrameQC.findSpikes(series(110, { 20: 252 }), { threshold: 45, maxRun: 2, window: 3 });
check('a single blown-out frame is a flash', one.flashes.length === 1, one.flashes);
check('the flash is reported at the right frame time', one.flashes[0] && Math.abs(one.flashes[0].t - 0.8) < 1e-6, one.flashes[0]);
check('a near-white frame is classified white', one.flashes[0] && one.flashes[0].kind === 'white', one.flashes[0] && one.flashes[0].kind);

var black = SYFrameQC.findSpikes(series(110, { 12: 0 }), { threshold: 45, maxRun: 2, window: 3 });
check('a single black frame is a flash', black.flashes.length === 1 && black.flashes[0].kind === 'black', black.flashes[0]);

var twoFrame = SYFrameQC.findSpikes(series(110, { 10: 240, 11: 236 }), { threshold: 45, maxRun: 2, window: 3 });
check('a two-frame flash is still caught with maxRun=2', twoFrame.flashes.length === 1 && twoFrame.flashes[0].run === 2, twoFrame.flashes[0]);

var sustained = series(110, {}, 60);
for (var i = 30; i < 60; i++) { sustained[i].v = 200; }   // a real cut to a brighter shot
var sustainedRes = SYFrameQC.findSpikes(sustained, { threshold: 45, maxRun: 2, window: 3 });
check('a sustained brightness change is NOT a flash', sustainedRes.flashes.length === 0, sustainedRes.flashes);

var gentle = SYFrameQC.findSpikes(series(110, { 15: 140 }), { threshold: 45, maxRun: 2, window: 3 });
check('a small luma wobble under the threshold is ignored', gentle.flashes.length === 0, gentle.flashes);

check('stats report the frame count', one.stats.frames === 40, one.stats);
check('medianAround ignores the centre sample',
  SYFrameQC.medianAround([10, 10, 999, 10, 10], 2, 2) === 10,
  SYFrameQC.medianAround([10, 10, 999, 10, 10], 2, 2));

/* ---------------- blackdetect parsing ---------------- */
var bl = SYFrameQC.parseBlackLine('[blackdetect @ 0x7f] black_start:1.200 black_end:2.440 black_duration:1.240');
check('blackdetect line parses', bl && bl.start === 1.2 && bl.end === 2.44 && bl.duration === 1.24, bl);
check('non-blackdetect lines return null', SYFrameQC.parseBlackLine('frame=  12 fps=300') === null);

/* ---------------- clip filtering ---------------- */
var clips = [
  { name: 'a.mp4', trackType: 'video', mediaPath: '/m/a.mp4', start: 0, end: 5 },
  { name: 'a.mp4', trackType: 'audio', mediaPath: '/m/a.mp4', start: 0, end: 5 },
  { name: 'NEST', trackType: 'video', mediaPath: '', start: 5, end: 9, isSequenceItem: true },
  { name: 'solid.png', trackType: 'video', mediaPath: '/m/solid.png', start: 9, end: 12 },
  { name: 'b.mp4', trackType: 'video', mediaPath: '/m/b.mp4', start: 12, end: 20 }
];
var vc = SYFrameQC.videoClips(clips);
check('audio, nests and offline media are excluded from the pixel pass',
  vc.length === 3 && vc.every(function (c) { return c.mediaPath && c.trackType !== 'audio'; }),
  vc.map(function (c) { return c.name; }));
check('clips are sorted by timeline position', vc[0].start === 0 && vc[2].start === 12, vc.map(function (c) { return c.start; }));

/* ---------------- still renderer helpers ---------------- */
check('hex colours normalise to 6 digits', SYStills.toHex('#7c5cff') === '7c5cff' && SYStills.toHex('fff') === 'ffffff', SYStills.toHex('fff'));
check('rgb() input is converted', SYStills.toHex('rgb(124, 92, 255)') === '7c5cff', SYStills.toHex('rgb(124, 92, 255)'));
check('nonsense colours fall back to black', SYStills.toHex('not-a-colour') === '000000', SYStills.toHex('not-a-colour'));
check('luma separates light from dark', SYStills.luma('#ffffff') > 200 && SYStills.luma('#000000') === 0);

check('drawtext escaping covers the filtergraph specials',
  SYStills.escapeDrawtext("a:b,c;d[e]f%g'h\\i") === "a\\:b\\,c\\;d\\[e\\]f\\%g\\'h\\\\i",
  SYStills.escapeDrawtext("a:b,c;d[e]f%g'h\\i"));
check('quoted filter values keep backslashes and only escape quotes',
  SYStills.quoteFilterValue('C:\\Fonts\\Arial Bold.ttf') === 'C:/Fonts/Arial Bold.ttf' &&
  SYStills.quoteFilterValue("/usr/share/fonts/O'Brien.ttf") === "/usr/share/fonts/O'\\''Brien.ttf",
  [SYStills.quoteFilterValue('C:\\Fonts\\Arial Bold.ttf'), SYStills.quoteFilterValue("/usr/share/fonts/O'Brien.ttf")]);
check('font candidates are absolute paths',
  SYStills.fontCandidates().length > 1 && SYStills.fontCandidates()[1].indexOf(':') !== -1 || SYStills.fontCandidates()[1].charAt(0) === '/',
  SYStills.fontCandidates().slice(0, 2));

/* ---------------- rembg catalogue ---------------- */
var ids = SYRembg.MODELS.map(function (m) { return m.id; });
check('the four requested rembg models are present',
  ['u2net', 'u2netp', 'isnet-general-use', 'u2net_human_seg'].every(function (x) { return ids.indexOf(x) !== -1; }), ids);
check('modelById falls back to u2net for junk', SYRembg.modelById('nope').id === 'u2net');
check('rembg candidates include the PATH binary and python -m rembg',
  SYRembg.candidates().some(function (c) { return c.bin === 'rembg'; }) &&
  SYRembg.candidates().some(function (c) { return c.args.join(' ') === '-m rembg'; }),
  SYRembg.candidates().map(function (c) { return c.bin; }));
check('the install hint targets rembg[cli] + onnxruntime',
  /rembg\[cli\]/.test(SYRembg.installHint()) && /onnxruntime/.test(SYRembg.installHint()), SYRembg.installHint());

/* ---------------- canvas text renderer ----------------
 * The panel is Chromium, so text layers are rasterised on a <canvas>. The
 * rasteriser itself is the browser's job; what the panel owns is the layout
 * maths, the outline/shadow sequencing and the PNG write — all of which a
 * recording canvas can verify. */
var draw = [];
global.document.createElement = function (tag) {
  if (tag !== 'canvas') { return makeEl(); }
  var cv = { width: 0, height: 0 };
  var ctx = {};
  ['font', 'textAlign', 'textBaseline', 'lineJoin', 'miterLimit', 'fillStyle',
   'strokeStyle', 'lineWidth', 'shadowColor', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY']
    .forEach(function (k) {
      Object.defineProperty(ctx, k, {
        set: function (v) { draw.push([k, v]); },
        get: function () { return undefined; }
      });
    });
  ctx.clearRect = function () { draw.push(['clearRect']); };
  ctx.fillText = function (t, x, y) { draw.push(['fillText', t, x, y]); };
  ctx.strokeText = function (t, x, y) { draw.push(['strokeText', t, x, y]); };
  cv.getContext = function () { return ctx; };
  cv.toDataURL = function () {
    /* a PNG signature plus enough payload to clear the "empty image" guard,
     * so the base64 → Buffer → writeFileSync round trip is really exercised */
    return 'data:image/png;base64,' + Buffer.from('\x89PNG\r\n\x1a\nSYTEXTLAYER' + 'x'.repeat(200)).toString('base64');
  };
  return cv;
};

var canvasOut = path.join(require('os').tmpdir(), 'sy-canvas-text-' + Date.now() + '.png');
draw.length = 0;
SYStills.drawTextCanvas({
  text: 'Line one\nLine two', width: 800, height: 400, size: 40,
  color: '#ffffff', outline: 2, shadow: true, outPath: canvasOut
}, function (err, out) {
  check('the canvas renderer writes a PNG', !err && out && fs.existsSync(out) && fs.statSync(out).size > 8, err && err.message);
  check('the written file is the decoded data URL',
    out && fs.existsSync(out) && fs.readFileSync(out).toString('latin1').indexOf('SYTEXTLAYER') !== -1,
    out && fs.existsSync(out) ? fs.readFileSync(out).toString('latin1').slice(0, 20) : out);

  var fonts = draw.filter(function (c) { return c[0] === 'font'; });
  check('the font is set to bold + the requested size',
    fonts.length === 1 && /bold 40px/.test(fonts[0][1]), fonts[0] && fonts[0][1]);

  var fills = draw.filter(function (c) { return c[0] === 'fillText'; });
  var strokes = draw.filter(function (c) { return c[0] === 'strokeText'; });
  check('one fill per text line', fills.length === 2, fills);
  check('lines are stacked by the line height (40 * 1.28 = 51)',
    fills.length === 2 && Math.abs((fills[1][3] - fills[0][3]) - 51) < 1, [fills[0] && fills[0][3], fills[1] && fills[1][3]]);
  check('the block is centred vertically',
    fills.length === 2 && Math.abs(fills[0][3] - (400 - 102) / 2) < 2, fills[0] && fills[0][3]);
  check('each line is centred horizontally', fills.every(function (f) { return f[2] === 400; }), fills.map(function (f) { return f[2]; }));
  check('the outline is stroked for each line', strokes.length === 2, strokes.length);
  check('stroke happens before fill (so the outline sits behind)',
    draw.findIndex(function (c) { return c[0] === 'strokeText'; }) <
    draw.findIndex(function (c) { return c[0] === 'fillText'; }));
  var shadowOn = draw.findIndex(function (c) { return c[0] === 'shadowColor' && c[1] !== 'rgba(0,0,0,0)'; });
  var shadowOff = draw.findIndex(function (c) { return c[0] === 'shadowColor' && c[1] === 'rgba(0,0,0,0)'; });
  check('the shadow is raised for the outline and cleared before the fill',
    shadowOn !== -1 && shadowOff > shadowOn, [shadowOn, shadowOff]);

  /* the chosen font stack must actually reach ctx.font */
  draw.length = 0;
  SYStills.drawTextCanvas({ text: 'Fancy', width: 400, height: 200, size: 36,
    family: 'Impact, fantasy', bold: false,
    outPath: path.join(require('os').tmpdir(), 'sy-canvas-font.png') }, function () {
    var f = draw.filter(function (c) { return c[0] === 'font'; })[0];
    check('the font stack from the panel reaches ctx.font',
      !!f && f[1] === '36px Impact, fantasy', f && f[1]);

  /* no outline → no stroke calls */
  draw.length = 0;
  SYStills.drawTextCanvas({ text: 'Plain', width: 400, height: 200, size: 30, outline: 0, shadow: false,
    outPath: path.join(require('os').tmpdir(), 'sy-canvas-plain.png') }, function () {
    check('outline=0 skips the stroke pass',
      draw.filter(function (c) { return c[0] === 'strokeText'; }).length === 0,
      draw.map(function (c) { return c[0]; }));
    try { fs.unlinkSync(canvasOut); } catch (e) {}
    console.log(failed ? ('\n' + failed + ' FRAME/STILLS TEST(S) FAILED') : '\nALL FRAME / STILLS TESTS PASSED');
    process.exit(failed ? 1 : 0);
  });
  });
});
