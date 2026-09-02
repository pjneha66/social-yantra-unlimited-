/* Headless test for the Downloader (yt-dlp) argument builder, progress parser
 * and site detection. These are pure functions — they decide exactly what
 * command the panel runs, so getting them wrong means a broken download. */
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

var fs = require('fs'), path = require('path');
var base = path.join(__dirname, '..');
['js/CSInterface.js', 'js/core/bridge.js', 'js/core/mediaget.js'].forEach(function (f) {
  var code = fs.readFileSync(path.join(base, f), 'utf8');
  try { (0, eval)(code); }
  catch (e) { console.log('LOAD-FAIL', f, e.message); process.exitCode = 1; }
});

var G = SYMediaGet;
var failed = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + JSON.stringify(extra).slice(0, 200) : ''));
  if (!cond) { failed++; }
}
/* index of a flag in an argv array (-1 when absent) */
function at(args, flag) { return args.indexOf(flag); }
function after(args, flag) { var i = at(args, flag); return i === -1 ? undefined : args[i + 1]; }

var URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

/* ---------------- quality tiers ---------------- */
var best = G.buildArgs({ url: URL, quality: 'best' });
check('best quality asks for the top video+audio pair', after(best, '-f') === 'bv*+ba/b', after(best, '-f'));
var f1080 = G.buildArgs({ url: URL, quality: '1080' });
check('1080p caps the height in the selector', after(f1080, '-f') === 'bv*[height<=1080]+ba/b[height<=1080]', after(f1080, '-f'));
var f720 = G.buildArgs({ url: URL, quality: '720' });
check('720p caps the height in the selector', after(f720, '-f') === 'bv*[height<=720]+ba/b[height<=720]', after(f720, '-f'));
var f480 = G.buildArgs({ url: URL, quality: '480' });
check('480p caps the height in the selector', after(f480, '-f') === 'bv*[height<=480]+ba/b[height<=480]', after(f480, '-f'));
check('quality tiers sort by resolution then container', after(best, '-S') === 'res,ext:mp4:m4a', after(best, '-S'));

/* ---------------- audio extraction ---------------- */
var mp3 = G.buildArgs({ url: URL, quality: 'best', audio: 'mp3' });
check('MP3 extracts audio', at(mp3, '-x') !== -1);
check('MP3 asks for the mp3 container at top quality',
  after(mp3, '--audio-format') === 'mp3' && after(mp3, '--audio-quality') === '0',
  [after(mp3, '--audio-format'), after(mp3, '--audio-quality')]);
check('MP3 does not try to merge a video container', at(mp3, '--merge-output-format') === -1);
var m4a = G.buildArgs({ url: URL, audio: 'm4a' });
check('M4A/AAC extracts audio in an m4a container', after(m4a, '--audio-format') === 'm4a', after(m4a, '--audio-format'));

/* ---------------- ffmpeg merging ---------------- */
check('merging to MP4 is on by default for video', after(best, '--merge-output-format') === 'mp4', after(best, '--merge-output-format'));
var noMerge = G.buildArgs({ url: URL, quality: 'best', merge: false });
check('merging can be switched off', at(noMerge, '--merge-output-format') === -1);
check('the ffmpeg binary can be pinned', after(G.buildArgs({ url: URL, ffmpegPath: '/opt/ffmpeg' }), '--ffmpeg-location') === '/opt/ffmpeg');

/* ---------------- exact FPS ---------------- */
var fps = G.buildArgs({ url: URL, quality: '1080', fps: 29.97 });
check('exact FPS re-encodes to mp4', after(fps, '--recode-video') === 'mp4', after(fps, '--recode-video'));
check('exact FPS is applied as an ffmpeg filter (copy mode would ignore it)',
  after(fps, '--postprocessor-args') === 'ffmpeg:-vf fps=29.97', after(fps, '--postprocessor-args'));
var noFps = G.buildArgs({ url: URL, quality: '1080' });
check('no FPS means no re-encode', at(noFps, '--recode-video') === -1 && at(noFps, '--postprocessor-args') === -1);
var audioFps = G.buildArgs({ url: URL, audio: 'mp3', fps: 30 });
check('exact FPS is skipped for audio-only downloads', at(audioFps, '--recode-video') === -1);

/* ---------------- download section ---------------- */
var sec = G.buildArgs({ url: URL, section: { start: '00:01:30', end: '120' } });
check('a section becomes --download-sections with a clock range',
  after(sec, '--download-sections') === '*00:01:30-00:02:00', after(sec, '--download-sections'));
check('section cuts force keyframes by default', at(sec, '--force-keyframes-at-cuts') !== -1);
var secNoKf = G.buildArgs({ url: URL, section: { start: 90, end: 120 }, keyframes: false });
check('keyframe forcing can be turned off', at(secNoKf, '--force-keyframes-at-cuts') === -1);
var secOpen = G.buildArgs({ url: URL, section: { start: 30, end: '' } });
check('an open-ended section runs to the end', after(secOpen, '--download-sections') === '*00:00:30-inf', after(secOpen, '--download-sections'));
check('no section means no --download-sections', at(best, '--download-sections') === -1);
check('clock() normalises seconds and h:mm:ss',
  G.clock(90) === '00:01:30' && G.clock('1:02:03') === '01:02:03' && G.clock('') === null,
  [G.clock(90), G.clock('1:02:03'), G.clock('')]);

/* ---------------- cookies ---------------- */
var ck = G.buildArgs({ url: URL, cookies: '/tmp/cookies.txt' });
check('a cookies file is passed through', after(ck, '--cookies') === '/tmp/cookies.txt', after(ck, '--cookies'));
var br = G.buildArgs({ url: URL, cookiesFromBrowser: 'chrome' });
check('browser cookies take precedence over a file',
  after(br, '--cookies-from-browser') === 'chrome' && at(br, '--cookies') === -1,
  [after(br, '--cookies-from-browser'), at(br, '--cookies')]);
check('no cookies by default', at(best, '--cookies') === -1 && at(best, '--cookies-from-browser') === -1);

/* ---------------- output ---------------- */
var out = G.buildArgs({ url: URL, outDir: '/home/me/Downloads' });
check('the output template keeps the title and id',
  /%\(\w+\)/.test(after(out, '-o')) && after(out, '-o').indexOf('%(title)s') !== -1, after(out, '-o'));
check('the save folder is set with --paths home:', after(out, '--paths') === 'home:/home/me/Downloads', after(out, '--paths'));
check('--paths uses the platform separator on Windows paths',
  after(G.buildArgs({ url: URL, outDir: 'C:\\Users\\me\\Downloads' }), '-o').indexOf('\\') !== -1,
  after(G.buildArgs({ url: URL, outDir: 'C:\\Users\\me\\Downloads' }), '-o'));
check('trailing slashes do not double up',
  after(G.buildArgs({ url: URL, outDir: '/tmp/dl/' }), '-o').indexOf('//') === -1,
  after(G.buildArgs({ url: URL, outDir: '/tmp/dl/' }), '-o'));

/* ---------------- misc flags ---------------- */
check('playlists are skipped by default', at(best, '--no-playlist') !== -1);
check('--no-playlist can be turned off', at(G.buildArgs({ url: URL, noPlaylist: false }), '--no-playlist') === -1);
check('progress parsing flags are always last-ish', at(best, '--newline') !== -1 && at(best, '--progress') !== -1);
check('the URL is the final argument', best[best.length - 1] === URL, best[best.length - 1]);
check('a leading/trailing space in the URL is trimmed',
  G.buildArgs({ url: '  ' + URL + '  ' }).slice(-1)[0] === URL);
check('extra flags are appended before the progress plumbing',
  G.buildArgs({ url: URL, extra: ['--limit-rate', '2M'] }).indexOf('2M') !== -1);
check('the archive file can be set', after(G.buildArgs({ url: URL, archive: '/tmp/a.txt' }), '--download-archive') === '/tmp/a.txt');

/* ---------------- progress parsing ---------------- */
var p1 = G.parseLine('[download]  42.3% of  118.42MiB at  3.21MiB/s ETA 00:12');
check('a percentage line parses', p1.kind === 'progress' && p1.pct === 42.3 && p1.eta === '00:12', p1);
var p2 = G.parseLine('[download]  42.3% of ~118.42MiB at  3.21MiB/s ETA 00:12');
check('an unknown total (~) still parses', p2.kind === 'progress' && p2.pct === 42.3 && p2.size === '118.42MiB', p2);
check('the destination line yields the file path',
  G.parseLine('[download] Destination: /tmp/dl/Video [abc].mp4').path === '/tmp/dl/Video [abc].mp4',
  G.parseLine('[download] Destination: /tmp/dl/Video [abc].mp4'));
var p3 = G.parseLine('[Merger] Merging formats into "/tmp/dl/Video [abc].mp4"');
check('the merge stage reports its output path', p3.kind === 'postprocess' && p3.stage === 'Merger' && /abc/.test(p3.path), p3);
var p4 = G.parseLine('[ExtractAudio] Destination: /tmp/dl/song.mp3');
check('audio extraction is recognised', p4.kind === 'destination' && /song\.mp3$/.test(p4.path), p4);
check('an ERROR line is surfaced', G.parseLine('ERROR: unable to download video data').kind === 'error');
check('a WARNING line is surfaced', G.parseLine('WARNING: unable to obtain file size').kind === 'warn');
check('already-downloaded is a skip', G.parseLine('[download] x.mp4 has already been downloaded').kind === 'skip');
check('other chatter is just a log line', G.parseLine('[info] abc: Downloading 1 format(s): 137+140').kind === 'log');

/* ---------------- site detection ---------------- */
check('youtube.com is YouTube', G.siteFor('https://www.youtube.com/watch?v=x').id === 'youtube');
check('youtu.be is YouTube', G.siteFor('https://youtu.be/x').id === 'youtube');
check('tiktok.com is TikTok', G.siteFor('https://www.tiktok.com/@user/video/1').id === 'tiktok');
check('instagram.com is Instagram', G.siteFor('https://www.instagram.com/reel/ABC/').id === 'instagram');
check('pinterest.com is Pinterest', G.siteFor('https://www.pinterest.com/pin/1/').id === 'pinterest');
check('pinterest.co.uk is Pinterest', G.siteFor('https://www.pinterest.co.uk/pin/1/').id === 'pinterest');
check('an unknown host falls back to "other"', G.siteFor('https://vimeo.com/1').id === 'other');
check('hostOf strips the scheme and www', G.hostOf('https://WWW.TikTok.com/a?b=1') === 'tiktok.com', G.hostOf('https://WWW.TikTok.com/a?b=1'));
check('looksLikeUrl rejects junk', G.looksLikeUrl('not a url') === false && G.looksLikeUrl('https://x.y/z') === true);
check('every advertised site has a note', G.SITES.every(function (s) { return !!s.note; }));

/* ---------------- CLI discovery ---------------- */
var cands = G.candidates().map(function (c) { return c.bin + ' ' + c.args.join(' '); });
check('yt-dlp on PATH is tried', cands.indexOf('yt-dlp ') !== -1, cands);
check('python -m yt_dlp is tried', cands.indexOf('python3 -m yt_dlp') !== -1, cands);
check('quote() only quotes arguments containing spaces',
  G.quote(['-o', 'a b.mp4', '-x']).join('|') === '-o|"a b.mp4"|"-x"'.replace('"-x"', '-x'), G.quote(['-o', 'a b.mp4', '-x']));
check('the install hint targets yt-dlp', /yt-dlp/.test(G.installHint()), G.installHint());

console.log(failed ? ('\n' + failed + ' DOWNLOADER TEST(S) FAILED') : '\nALL DOWNLOADER TESTS PASSED');
process.exit(failed ? 1 : 0);
