/* Verify the CEP `cep_node` runtime works even when `process` is not a
 * browser global. CEP exposes this shape on some Premiere versions. */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var base = path.join(__dirname, '..');
var failed = 0;

function check(name, condition, detail) {
  console.log((condition ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
  if (!condition) { failed++; }
}

var storage = {
  getItem: function () {
    // A stale invalid object must not discard the rest of the saved settings.
    return JSON.stringify({ duck: null, nav: { lastView: 'beat' } });
  },
  setItem: function () {}
};
var document = {
  getElementById: function () { return null; },
  createElement: function () { return { style: {}, select: function () {} }; }
};
var context = {
  console: console,
  document: document,
  localStorage: storage,
  navigator: { platform: 'Win32' },
  cep_node: { require: require },
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  JSON: JSON,
  Date: Date,
  Math: Math,
  Buffer: Buffer
};
context.window = context;
vm.createContext(context);

['js/CSInterface.js', 'js/core/bridge.js', 'js/core/rembg.js', 'js/core/mediaget.js'].forEach(function (file) {
  vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), context, { filename: file });
});

check('cep_node enables Node without a global process', context.SY.hasNode === true);
check('environment is resolved through Node require', !!context.SY.env && typeof context.SY.env === 'object');
check('malformed nested settings retain duck defaults', context.SY.settings.duck && context.SY.settings.duck.duckDb === -12);
check('valid nested settings still load', context.SY.settings.nav.lastView === 'beat');
check('rembg model directory works without global process', !!context.SYRembg.modelDir());
check('yt-dlp candidates can be built without global process', context.SYMediaGet.candidates().length > 1);

if (failed) {
  console.log('\n' + failed + ' CEP NODE TEST(S) FAILED');
  process.exit(1);
}
console.log('\nALL CEP NODE TESTS PASSED');
