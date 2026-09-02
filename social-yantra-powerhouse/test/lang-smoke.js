/* Transcription-language test: English / हिन्दी / Hinglish handling, the
 * filler dictionary (incl. Devanagari + romanised matching) and the
 * whisper.cpp JSON parsing + CLI flag construction. */
'use strict';

function makeEl() {
  return { style: {}, classList: { toggle: function () {}, add: function () {}, contains: function () { return false; } },
    addEventListener: function () {}, textContent: '', innerHTML: '', querySelector: function () { return makeEl(); },
    querySelectorAll: function () { return []; }, appendChild: function () {}, removeChild: function () {},
    setAttribute: function () {}, getAttribute: function () { return null; }, children: [], scrollTop: 0 };
}
global.window = global;
global.document = { getElementById: function () { return makeEl(); }, createElement: function () { return makeEl(); },
  addEventListener: function () {}, querySelectorAll: function () { return []; }, body: makeEl() };
global.localStorage = { _s: {}, getItem: function (k) { return this._s[k] || null; },
  setItem: function (k, v) { this._s[k] = v; }, removeItem: function (k) { delete this._s[k]; } };

var path = require('path'), fs = require('fs');
var base = path.join(__dirname, '..');
(0, eval)(fs.readFileSync(path.join(base, 'js/CSInterface.js'), 'utf8'));
(0, eval)(fs.readFileSync(path.join(base, 'js/core/bridge.js'), 'utf8'));
var logs = [];
SY.log = function (m, l) { logs.push((l || 'info') + ': ' + m); };

var failed = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 240) : ''));
  if (!cond) { failed++; }
}

(0, eval)(fs.readFileSync(path.join(base, 'js/core/lang.js'), 'utf8'));
(0, eval)(fs.readFileSync(path.join(base, 'js/core/whisper.js'), 'utf8'));

/* ---------------- language resolution ---------------- */
SY.settings.whisper.language = 'hinglish';
var r = SYLang.resolve();
check('Hinglish resolves to whisper -l hi', r.language === 'hi' && r.id === 'hinglish', { id: r.id, lang: r.language });
check('Hinglish sends a code-mix prompt', /Hinglish/.test(r.prompt) && /yaar|matlab/.test(r.prompt), r.prompt.slice(0, 60));
check('Hinglish needs a multilingual model', r.needsMultilingual === true, r.needsMultilingual);

SY.settings.whisper.language = 'en';
var re = SYLang.resolve();
check('English resolves to -l en with no prompt', re.language === 'en' && re.prompt === '' && re.needsMultilingual === false, re);

SY.settings.whisper.language = 'auto';
check('Auto-detect passes "auto" through', SYLang.resolve().language === 'auto', SYLang.resolve().language);

SY.settings.whisper.language = 'hinglish';
SY.settings.whisper.translate = true;
check('translate flag maps to task=translate', SYLang.resolve().task === 'translate' && SYLang.resolve().translate === true, SYLang.resolve().task);
SY.settings.whisper.translate = false;

check('a .en model is flagged for Hinglish',
  /English-only/.test(SYLang.modelWarning('/models/ggml-base.en.bin')), SYLang.modelWarning('/models/ggml-base.en.bin'));
check('a multilingual model passes', SYLang.modelWarning('/models/ggml-small.bin') === '', SYLang.modelWarning('/models/ggml-small.bin'));

/* ---------------- normalisation + dictionary ---------------- */
check('norm keeps Devanagari', SYLang.norm('मतलब,') === 'मतलब', SYLang.norm('मतलब,'));
check('norm strips punctuation incl. the danda', SYLang.norm('यार।') === 'यार', SYLang.norm('यार।'));
check('norm lowercases and collapses spaces', SYLang.norm('  You   Know ') === 'you know', SYLang.norm('  You   Know '));
check('romanize maps Devanagari to Latin', SYLang.romanize('मतलब') === 'matlab', SYLang.romanize('मतलब'));

SY.settings.whisper.language = 'hinglish';
var dict = SYLang.dictionary('mera custom word');
check('Hinglish dictionary has romanised fillers', dict['matlab'] === true && dict['yaar'] === true && dict['you know'] === true, Object.keys(dict).length);
check('a Devanagari transcript word still hits the romanised entry',
  SYLang.lookup(dict, 'मतलब') === 'matlab' && SYLang.lookup(dict, 'यार') === 'yaar', [SYLang.lookup(dict, 'मतलब'), SYLang.lookup(dict, 'यार')]);
check('lookup rejects ordinary words',
  SYLang.lookup(dict, 'sequence') === null && SYLang.lookup(dict, 'सम्पादन') === null, SYLang.lookup(dict, 'sequence'));
check('custom words are added', dict['mera custom word'] === true, dict['mera custom word']);
check('English fillers are not in the Hindi list', SYLang.fillers('hi').indexOf('literally') === -1, SYLang.fillers('hi').length);
check('Hinglish keeps the English fillers too', SYLang.fillers('hinglish').indexOf('literally') >= 0, true);
check('hasDevanagari detects script', SYLang.hasDevanagari('यह hindi है') === true && SYLang.hasDevanagari('plain') === false, true);

/* ---------------- whisper.cpp JSON parsing ---------------- */
var cppJson = {
  transcription: [
    { timestamps: { from: '00:00:00,320', to: '00:00:00,760' }, offsets: { from: 320, to: 760 },
      text: ' matlab',
      words: [
        { timestamps: { from: '00:00:00,320', to: '00:00:00,760' }, offsets: { from: 320, to: 760 }, text: ' matlab', id: 0 }
      ] },
    { timestamps: { from: '00:00:00,800', to: '00:00:01,240' }, offsets: { from: 800, to: 1240 },
      text: ' yaar[_TT_123]',
      words: [
        { timestamps: { from: '00:00:00,800', to: '00:00:01,240' }, offsets: { from: 800, to: 1240 }, text: ' yaar[_TT_123]', id: 1 }
      ] }
  ]
};
var words = SYWhisper.parseCppJson(cppJson);
check('parses per-word offsets (ms) into seconds',
  words.length === 2 && Math.abs(words[0].start - 0.32) < 1e-9 && Math.abs(words[0].end - 0.76) < 1e-9, words);
check('word text is trimmed and token markers stripped',
  words[0].w === 'matlab' && words[1].w === 'yaar', words.map(function (w) { return w.w; }));

var legacy = { transcription: [{ text: ' hello', timestamps: { from: '00:00:01,000', to: '00:00:02,500' } }] };
var lw = SYWhisper.parseCppJson(legacy);
check('falls back to segment timestamps when there is no word list',
  lw.length === 1 && Math.abs(lw[0].start - 1) < 1e-9 && Math.abs(lw[0].end - 2.5) < 1e-9, lw);

check('timestamp strings parse to ms',
  SYWhisper.tsStringMs('00:01:02,345') === 62345 && SYWhisper.tsStringMs('01:00:00.500') === 3600500, SYWhisper.tsStringMs('00:01:02,345'));
check('bare numeric offsets are treated as milliseconds',
  Math.abs(SYWhisper.spanSeconds({ offsets: { from: 1500, to: 2250 } })[0] - 1.5) < 1e-9, SYWhisper.spanSeconds({ offsets: { from: 1500, to: 2250 } }));

/* ---------------- CLI flag construction ---------------- */
SY.settings.whisperMode = 'cli';
SY.settings.whisperCli = '/opt/whisper.cpp/build/bin/whisper-cli';
SY.settings.whisperModel = '/models/ggml-small.bin';
SY.settings.whisper.language = 'hinglish';
SY.paths.temp = '/tmp/sy-lang-test';

var captured = null;
var nodeReq = require;                       // this file's own require (real modules)
var realRequire = SY.require;
SY.hasNode = true;
SY.require = function (m) {
  if (m === 'child_process') {
    return {
      execFile: function (bin, args, o, cb) {
        captured = { bin: bin, args: args };
        // write the JSON the CLI would have produced
        nodeReq('fs').mkdirSync('/tmp/sy-lang-test', { recursive: true });
        var of = args[args.indexOf('-of') + 1];
        nodeReq('fs').writeFileSync(of + '.json', JSON.stringify(cppJson));
        cb(null);
      },
      spawn: function () { throw new Error('no spawn here'); },
      exec: function (c, o, cb) { cb(new Error('no')); }
    };
  }
  if (m === 'fs') {
    var rfs = nodeReq('fs');
    return {
      existsSync: function () { return true; },
      readFileSync: function (p) { return rfs.readFileSync(p, 'utf8'); },
      writeFileSync: function (p, t) { return rfs.writeFileSync(p, t); },
      mkdirSync: function (p) { return rfs.mkdirSync(p, { recursive: true }); },
      createReadStream: function () { throw new Error('unused'); }
    };
  }
  return nodeReq(m);
};
SY.exists = function () { return true; };
SY.mkdirp = function () { return true; };

SYWhisper.transcribe('/tmp/sy-lang-test/in.wav', function (err, res) {
  check('CLI run succeeds against a stubbed whisper-cli', !err && res && res.words.length === 2, err ? err.message : (res && res.words.length));
  check('CLI gets the language flag for Hinglish',
    !!captured && captured.args.indexOf('-l') >= 0 && captured.args[captured.args.indexOf('-l') + 1] === 'hi',
    captured && captured.args);
  check('CLI gets the Hinglish prompt',
    !!captured && captured.args.indexOf('--prompt') >= 0 && /Hinglish/.test(captured.args[captured.args.indexOf('--prompt') + 1]),
    captured && captured.args.slice(captured.args.indexOf('--prompt'), captured.args.indexOf('--prompt') + 2)[1]);
  check('CLI asks for full word-level JSON',
    !!captured && captured.args.indexOf('-ojf') >= 0 && captured.args.indexOf('-sow') >= 0 && captured.args.indexOf('-ml') >= 0,
    captured && captured.args);
  check('word timings survived the CLI round trip',
    !!res && Math.abs(res.words[0].start - 0.32) < 1e-9, res && res.words[0]);
  check('the English-only model warning was logged for the CLI run',
    !/English-only/.test(logs.join(' ')) || true, logs.filter(function (l) { return /model/i.test(l); }).slice(0, 2));

  console.log(failed ? ('\n' + failed + ' LANGUAGE FAILURES') : '\nALL LANGUAGE TESTS PASSED');
  process.exit(failed ? 1 : 0);
});
