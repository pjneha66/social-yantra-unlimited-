/* Wiring test: the panel is three languages loosely coupled by string names,
 * so a typo shows up only when a user clicks the button. This walks the real
 * files and proves the names line up:
 *   nav data-view        ↔  <section id="view-…">
 *   getElementById(…)    ↔  an id in index.html
 *   SY.call('fn')        ↔  SY.fn = function in a jsxinc
 *   <script src>         ↔  a file on disk
 *   //@include           ↔  a file on disk
 */
'use strict';

var fs = require('fs'), path = require('path');
var base = path.join(__dirname, '..');
var failed = 0, checks = 0;
function check(name, cond, extra) {
  checks++;
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + JSON.stringify(extra).slice(0, 220) : ''));
  if (!cond) { failed++; }
}
function read(p) { return fs.readFileSync(path.join(base, p), 'utf8'); }
function files(dir, ext) {
  return fs.readdirSync(path.join(base, dir)).filter(function (f) { return f.endsWith(ext); })
    .map(function (f) { return dir + '/' + f; });
}

var html = read('index.html');

/* ---------------- nav ↔ views ---------------- */
var views = [];
var navBtns = [];
var re = /class="nav-btn[^"]*"\s+data-view="([\w-]+)"/g, m;
while ((m = re.exec(html)) !== null) { navBtns.push(m[1]); }
var re2 = /<section class="view[^"]*" id="view-([\w-]+)"/g;
while ((m = re2.exec(html)) !== null) { views.push(m[1]); }
check('the nav has buttons', navBtns.length >= 14, navBtns.length);
var missingViews = navBtns.filter(function (v) { return views.indexOf(v) === -1; });
check('every nav button has a view section', missingViews.length === 0, missingViews);
var orphanViews = views.filter(function (v) { return navBtns.indexOf(v) === -1; });
check('every view section is reachable from the nav', orphanViews.length === 0, orphanViews);

/* every nav button declares a group that exists as a nav-group */
var groups = [];
var re3 = /class="nav-group" data-group="([\w-]+)"/g;
while ((m = re3.exec(html)) !== null) { groups.push(m[1]); }
var badGroup = [];
var re4 = /class="nav-btn[^"]*"\s+data-view="[\w-]+"\s+data-group="([\w-]+)"/g;
while ((m = re4.exec(html)) !== null) { if (groups.indexOf(m[1]) === -1) { badGroup.push(m[1]); } }
check('every nav button belongs to a declared group', badGroup.length === 0, badGroup);

/* ---------------- element ids ---------------- */
var ids = {};
var re5 = /\bid="([\w-]+)"/g;
while ((m = re5.exec(html)) !== null) { ids[m[1]] = true; }

var jsFiles = files('js/modules', '.js').concat(files('js/core', '.js'));
var wanted = {};
jsFiles.forEach(function (f) {
  var src = read(f);
  var r1 = /getElementById\(\s*'([\w-]+)'\s*\)/g, mm;
  while ((mm = r1.exec(src)) !== null) { (wanted[mm[1]] = wanted[mm[1]] || []).push(f); }
  var r2 = /getElementById\(\s*"([\w-]+)"\s*\)/g;
  while ((mm = r2.exec(src)) !== null) { (wanted[mm[1]] = wanted[mm[1]] || []).push(f); }
  /* el('id') helpers used by the newer modules */
  if (/function el\(id\)/.test(src)) {
    var r3 = /\bel\(\s*'([\w-]+)'\s*\)/g;
    while ((mm = r3.exec(src)) !== null) { (wanted[mm[1]] = wanted[mm[1]] || []).push(f); }
  }
});
/* ids built at runtime are created by JS, not declared in HTML — allow these */
var DYNAMIC = {};
var missingIds = Object.keys(wanted).filter(function (id) { return !ids[id] && !DYNAMIC[id]; });
check('every getElementById target exists in index.html', missingIds.length === 0,
  missingIds.map(function (id) { return id + ' ← ' + wanted[id][0]; }));
check('the panel declares a lot of ids (sanity)', Object.keys(ids).length > 150, Object.keys(ids).length);

/* duplicate ids would silently break the wiring */
var seen = {}, dupes = [];
var re6 = /\bid="([\w-]+)"/g;
while ((m = re6.exec(html)) !== null) {
  if (seen[m[1]]) { dupes.push(m[1]); }
  seen[m[1]] = true;
}
check('no duplicate element ids', dupes.length === 0, dupes);

/* ---------------- SY.call(fn) ↔ ExtendScript ---------------- */
var jsxSrc = '';
files('jsx/features', '.jsxinc').concat(['jsx/core/sy-core.jsxinc', 'jsx/social-yantra.jsx']).forEach(function (f) { jsxSrc += read(f) + '\n'; });
var defined = {};
var re7 = /^SY\.(\w+)\s*=\s*function/gm;
while ((m = re7.exec(jsxSrc)) !== null) { defined[m[1]] = true; }

var called = {};
jsFiles.forEach(function (f) {
  var src = read(f);
  var r = /SY\.call\(\s*'([\w-]+)'/g, mm;
  while ((mm = r.exec(src)) !== null) { (called[mm[1]] = called[mm[1]] || []).push(f); }
});
var unknownFns = Object.keys(called).filter(function (fn) { return !defined[fn]; });
check('every SY.call() target is defined in ExtendScript', unknownFns.length === 0,
  unknownFns.map(function (fn) { return fn + ' ← ' + called[fn][0]; }));
check('the panel calls a good number of engine functions (sanity)', Object.keys(called).length > 25, Object.keys(called).length);

/* ---------------- <script src> and //@include ---------------- */
var scripts = [];
var re8 = /<script src="([^"]+)"><\/script>/g;
while ((m = re8.exec(html)) !== null) { scripts.push(m[1]); }
var missingScripts = scripts.filter(function (s) { return !fs.existsSync(path.join(base, s)); });
check('every <script src> exists on disk', missingScripts.length === 0, missingScripts);
check('the shell loads every core + module file',
  scripts.length >= fs.readdirSync(path.join(base, 'js/core')).length + fs.readdirSync(path.join(base, 'js/modules')).length + 1,
  [scripts.length, fs.readdirSync(path.join(base, 'js/core')).length, fs.readdirSync(path.join(base, 'js/modules')).length]);

var entry = read('jsx/social-yantra.jsx');
var includes = [];
var re9 = /\/\/@include\s+"([^"]+)"/g;
while ((m = re9.exec(entry)) !== null) { includes.push(m[1]); }
var missingInc = includes.filter(function (i) { return !fs.existsSync(path.join(base, 'jsx', i)); });
check('every //@include resolves to a file', missingInc.length === 0, missingInc);
var allInc = files('jsx/features', '.jsxinc').map(function (f) { return f.replace('jsx/', ''); });
var notIncluded = allInc.filter(function (f) { return includes.indexOf(f) === -1; });
check('every feature engine is included by the entry script', notIncluded.length === 0, notIncluded);

/* ---------------- modules are initialised by app.js ---------------- */
var app = read('js/core/app.js');
var mods = fs.readdirSync(path.join(base, 'js/modules')).map(function (f) { return f.replace('.js', ''); });
var notBooted = mods.filter(function (mod) {
  var src = read('js/modules/' + mod + '.js');
  var gm = /window\.(\w+)\s*=\s*\(function/.exec(src);
  return gm && app.indexOf("'" + gm[1] + "'") === -1;
});
check('every module is listed in the app bootstrap', notBooted.length === 0, notBooted);

/* ---------------- external engines ship a detect + install path ---------------- */
['js/core/rembg.js', 'js/core/mediaget.js'].forEach(function (f) {
  var src = read(f);
  check(f + ' can detect its CLI', /detect\s*=\s*function/.test(src));
  check(f + ' offers a one-click install', /install\s*=\s*function/.test(src) && /pip/.test(src));
  check(f + ' reports a human install hint', /installHint\s*=\s*function/.test(src));
});

console.log(failed ? ('\n' + failed + ' of ' + checks + ' WIRING CHECK(S) FAILED') : '\nALL ' + checks + ' WIRING CHECKS PASSED');
process.exit(failed ? 1 : 0);
