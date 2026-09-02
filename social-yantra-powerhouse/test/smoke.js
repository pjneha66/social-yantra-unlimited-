/* Headless smoke test: loads all panel scripts with a minimal DOM shim and
 * runs app boot + module inits + a demo evalScript round-trip. */
'use strict';

function makeEl(id) {
  var el = {
    id: id || '',
    value: '',
    checked: false,
    textContent: '',
    innerHTML: '',
    style: {},
    dataset: {},
    disabled: false,
    className: '',
    width: 0,
    height: 0,
    children: [],
    classList: { toggle: function () {}, add: function () {}, remove: function () {}, contains: function () { return false; } },
    addEventListener: function () {},
    removeEventListener: function () {},
    dispatchEvent: function () {},
    getAttribute: function () { return null; },
    setAttribute: function () {},
    appendChild: function (c) { this.children.push(c); },
    removeChild: function () {},
    querySelector: function () { return makeEl(); },
    querySelectorAll: function () { return []; },
    closest: function () { return null; },
    getContext: function () {
      return new Proxy({}, { get: function (t, k) {
        if (k === 'canvas') { return el; }
        return function () {};
      }, set: function () { return true; } });
    },
    getBoundingClientRect: function () { return { left: 0, top: 0 }; }
  };
  if (id === 'flowCanvas') { el.parentNode = { clientWidth: 420 }; }
  else { el.parentNode = { removeChild: function () {}, clientWidth: 420 }; }
  return el;
}

var els = {};
var domListeners = {};
global.window = global;
global.document = {
  body: makeEl('body'),
  getElementById: function (id) { if (!els[id]) { els[id] = makeEl(id); } return els[id]; },
  createElement: function () { return makeEl(); },
  querySelector: function (sel) {
    var m = /#([\w-]+)(?:\s*>\s*div)?/.exec(sel || '');
    if (m) { return this.getElementById(m[1]); }
    return makeEl();
  },
  querySelectorAll: function () { return []; },
  addEventListener: function (ev, fn) { (domListeners[ev] = domListeners[ev] || []).push(fn); },
  removeEventListener: function () {}
};
try { global.navigator = { platform: 'Win32' }; } catch (e) { Object.defineProperty(global, 'navigator', { value: { platform: 'Win32' }, configurable: true }); }
global.localStorage = { _s: {}, getItem: function (k) { return this._s[k] || null; }, setItem: function (k, v) { this._s[k] = v; }, removeItem: function (k) { delete this._s[k]; } };
global.Event = function (t) { this.type = t; };
global.confirm = function () { return true; };

var path = require('path');
var files = [
  'js/CSInterface.js',
  'js/core/bridge.js',
  'js/core/audio-vad.js',
  'js/core/duck.js',
  'js/core/beat.js',
  'js/core/lang.js',
  'js/core/chapters.js',
  'js/core/whisper.js',
  'js/core/downloader.js',
  'js/core/demo.js',
  'js/modules/silence.js',
  'js/modules/filler.js',
  'js/modules/chapters.js',
  'js/modules/duck.js',
  'js/modules/beat.js',
  'js/modules/flow.js',
  'js/modules/wordpop.js',
  'js/modules/nest.js',
  'js/modules/assets.js',
  'js/modules/truedup.js',
  'js/modules/tools.js',
  'js/modules/models.js',
  'js/modules/settings.js',
  'js/core/app.js'
];
var base = path.join(__dirname, '..');
files.forEach(function (f) {
  var code = require('fs').readFileSync(path.join(base, f), 'utf8');
  try { (0, eval)(code); console.log('LOADED', f); }
  catch (e) { console.log('LOAD-FAIL', f, '—', e.message); process.exitCode = 1; }
});

// fire DOMContentLoaded → app init + module inits
try {
  (domListeners.DOMContentLoaded || []).forEach(function (fn) { fn({}); });
  console.log('BOOT: app + modules initialized OK');
} catch (e) {
  console.log('BOOT-FAIL:', e.stack);
  process.exitCode = 1;
}

// demo evalScript round trip
setTimeout(function () {
  try {
    SY.call('ping', null, function (r) {
      console.log('PING:', JSON.stringify(r));
      if (!r.ok) { process.exitCode = 1; }
      SY.call('executeCuts', { cuts: [{ start: 3.42, end: 5.1 }], mode: 'ripple' }, function (r2) {
        console.log('CUTS:', JSON.stringify(r2));
        console.log('SMOKE TEST ' + (r2.ok ? 'PASSED' : 'FAILED'));
        process.exit(process.exitCode || (r2.ok ? 0 : 1));
      });
    });
  } catch (e) { console.log('RPC-FAIL', e.stack); process.exit(1); }
}, 300);
