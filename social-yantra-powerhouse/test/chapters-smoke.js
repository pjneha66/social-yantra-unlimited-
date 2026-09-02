/* Chapters engine test: transcript → chapters → CSV / YouTube / SRT / JSON /
 * marker payloads. Verifies grouping, the YouTube rules (00:00 start, ≥10 s
 * chapters), title generation and escaping. Pure functions. */
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
(0, eval)(fs.readFileSync(path.join(base, 'js/core/chapters.js'), 'utf8'));

var failed = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 240) : ''));
  if (!cond) { failed++; }
}

/* ---------------- transcript → chapters ---------------- */
function w(text, start, dur) {
  var out = [], t = start;
  text.split(' ').forEach(function (tok) {
    var d = dur === undefined ? 0.3 : dur;
    out.push({ w: tok, start: t, end: t + d });
    t += d + 0.12;
  });
  return out;
}
var words = []
  .concat(w('welcome back to the show today', 0))                 // 0 → ~2.5 s
  .concat(w('we are editing a podcast', 8))                       // pause of ~5 s → new chapter
  .concat(w('first we cut the silence', 20))                      // pause → new chapter
  .concat(w('then we duck the music', 40));                       // pause → new chapter

var raw = SYChapters.buildFromWords(words, { gapSec: 1.2, maxWords: 60, maxDur: 60 });
check('pause-based grouping finds 4 chapters', raw.length === 4, { n: raw.length, starts: raw.map(function (c) { return c.start; }) });
check('chapter text is the joined words', /^welcome back to the show today$/.test(raw[0].text), raw[0].text);

var ch = SYChapters.finalize(raw, { minChapterSec: 5, titleWords: 4, titleStyle: 'first', endAt: 55, zeroFirst: true });
check('first chapter is forced to 00:00 for YouTube', ch[0].start === 0, ch[0].start);
check('each chapter runs until the next one starts',
  ch[0].end === ch[1].start && ch[1].end === ch[2].start, ch.map(function (c) { return [c.start, c.end]; }));
check('last chapter closes at the sequence end', ch[ch.length - 1].end === 55, ch[ch.length - 1].end);
check('titles come from the first words, without a dangling small word',
  ch[0].title === 'Welcome Back…', ch[0].title);
check('durations are reported', ch[0].duration === ch[0].end - ch[0].start, ch[0].duration);

/* short chapters get merged so YouTube accepts them */
var merged = SYChapters.finalize([
  { start: 0, end: 3, text: 'intro line' },
  { start: 3, end: 6, text: 'still intro' },
  { start: 30, end: 45, text: 'main topic here' }
], { minChapterSec: 10, titleWords: 3 });
check('chapters shorter than the minimum are merged', merged.length === 2, { n: merged.length, starts: merged.map(function (c) { return c.start; }) });
check('a trailing runt folds into its neighbour',
  SYChapters.finalize([{ start: 0, end: 20, text: 'a' }, { start: 21, end: 22, text: 'b' }], { minChapterSec: 10 }).length === 1,
  SYChapters.finalize([{ start: 0, end: 20, text: 'a' }, { start: 21, end: 22, text: 'b' }], { minChapterSec: 10 }).length);

/* ---------------- titles ---------------- */
check('titleCase keeps small words lowercase after the first',
  SYChapters.titleCase('the art of video editing') === 'The Art of Video Editing', SYChapters.titleCase('the art of video editing'));
check('titleCase leaves Devanagari untouched',
  SYChapters.titleCase('यह हिंदी है') === 'यह हिंदी है', SYChapters.titleCase('यह हिंदी है'));
var indexed = SYChapters.finalize([{ start: 0, end: 20, text: 'hello world' }], { titleStyle: 'index', prefix: 'Chapter {n} — ' });
check('index titles honour the {n} prefix', indexed[0].title === 'Chapter 1 — Chapter 1', indexed[0].title);

/* ---------------- serialisers ---------------- */
var csv = SYChapters.toCSV(ch);
check('CSV has a header + one row per chapter',
  csv.split('\r\n').filter(Boolean).length === ch.length + 1 && csv.indexOf('#,start,end,duration_s,timecode,title,transcript') === 0,
  csv.split('\r\n')[0]);
var quoted = SYChapters.toCSV([{ start: 0, end: 12, duration: 12, index: 1, title: 'Intro, the "real" one', text: 'he said, "hi"' }]);
check('CSV quotes fields containing commas and escapes inner quotes',
  quoted.indexOf('"Intro, the ""real"" one"') > 0, quoted.split('\r\n')[1]);

var yt = SYChapters.toYouTube(ch);
check('YouTube format is "MM:SS Title" lines starting at 00:00',
  yt.split('\n')[0] === '00:00 ' + ch[0].title && /^(\d{1,2}:\d{2}(:\d{2})? .+\n)+$/.test(yt), yt.split('\n')[0]);
check('YouTube hours appear only past an hour',
  SYChapters.toYouTube([{ index: 1, start: 3725, end: 3800, title: 'Late bit' }]).split('\n')[0] === '01:02:05 Late bit',
  SYChapters.toYouTube([{ index: 1, start: 3725, end: 3800, title: 'Late bit' }]).split('\n')[0]);
var desc = SYChapters.toYouTubeDescription(ch, { videoTitle: 'My Video' });
check('description block wraps the list for pasting',
  desc.indexOf('My Video') === 0 && desc.indexOf('Chapters:\n00:00') > 0 && desc.indexOf('#chapters') > 0, desc.split('\n').slice(0, 3));

var srt = SYChapters.toSRT(ch);
check('SRT cues use comma milliseconds and an arrow',
  /1\n00:00:00,000 --> 00:00:08,000/.test(srt), srt.split('\n').slice(0, 3).join(' | '));

var json = JSON.parse(SYChapters.toJSON(ch));
check('JSON round-trips count + chapters', json.count === ch.length && json.chapters[0].title === ch[0].title, { count: json.count });

var payload = SYChapters.toMarkerPayload(ch);
check('marker payload carries time, name and Chapter type',
  payload.length === ch.length && payload[0].at === ch[0].start && payload[0].type === 'Chapter' && payload[0].name === ch[0].title, payload[0]);

/* ---------------- other sources ---------------- */
var fromM = SYChapters.buildFromMarkers([
  { at: 0, until: 0, name: 'Intro' }, { at: 12.5, until: 30, name: 'Main' }, { at: 30, until: 30, name: 'Outro' }
], { endAt: 45 });
check('markers become chapters, using the marker duration when it has one',
  fromM.length === 3 && fromM[0].end === 12.5 && fromM[1].end === 30 && fromM[2].end === 45, fromM.map(function (c) { return [c.start, c.end]; }));

var fromI = SYChapters.buildFromIssues([
  { kind: 'blank', at: 5.1, until: 5.86, text: 'V1: blank frames' },
  { kind: 'offline', at: 2, until: 0, text: 'OFFLINE media' }
], {});
check('QC issues sort by time and get a fallback duration',
  fromI.length === 2 && fromI[0].start === 2 && fromI[0].end === 4 && fromI[1].start === 5.1 && fromI[1].end === 5.86, fromI);

var fromIv = SYChapters.buildFromIntervals([[1, 3], { start: 4, end: 6, title: 'Bar 2' }], {});
check('intervals accept both arrays and objects', fromIv.length === 2 && fromIv[1].text === 'Bar 2', fromIv);

/* ---------------- YouTube sanity report ---------------- */
check('youTubeCheck flags too few chapters',
  SYChapters.youTubeCheck([{ start: 0, end: 30 }]).some(function (p) { return /at least 3/.test(p); }),
  SYChapters.youTubeCheck([{ start: 0, end: 30 }]));
check('youTubeCheck flags a late first chapter',
  SYChapters.youTubeCheck([{ start: 4, end: 20 }, { start: 20, end: 40 }, { start: 40, end: 60 }])
    .some(function (p) { return /00:00/.test(p); }), SYChapters.youTubeCheck([{ start: 4, end: 20 }, { start: 20, end: 40 }, { start: 40, end: 60 }]));
check('youTubeCheck flags chapters under 10 s',
  SYChapters.youTubeCheck([{ start: 0, end: 5 }, { start: 5, end: 30 }, { start: 30, end: 60 }])
    .some(function (p) { return /shorter than 10/.test(p); }), SYChapters.youTubeCheck([{ start: 0, end: 5 }, { start: 5, end: 30 }, { start: 30, end: 60 }]));
var valid = SYChapters.finalize(raw, { minChapterSec: 10, titleWords: 4, endAt: 55, zeroFirst: true });
check('a YouTube-legal list reports no problems',
  valid.length >= 3 && valid[0].start === 0 && SYChapters.youTubeCheck(valid).length === 0,
  { n: valid.length, spans: valid.map(function (c) { return [c.start, c.end]; }), problems: SYChapters.youTubeCheck(valid) });

check('empty input never throws', SYChapters.buildFromWords([], {}).length === 0 && SYChapters.finalize([], {}).length === 0);
check('tc formats hours only when needed', SYChapters.tc(65) === '00:01:05' && SYChapters.tc(65, true) === '01:05', [SYChapters.tc(65), SYChapters.tc(65, true)]);

console.log(failed ? ('\n' + failed + ' CHAPTER FAILURES') : '\nALL CHAPTER TESTS PASSED');
process.exit(failed ? 1 : 0);
