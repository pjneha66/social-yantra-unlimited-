/* Guard CEP manifest and installer details that determine whether Premiere
 * lists the panel at all. These checks are intentionally text-level so they
 * run on every development platform, including Linux CI. */
'use strict';

var fs = require('fs');
var path = require('path');
var base = path.join(__dirname, '..');
var manifest = fs.readFileSync(path.join(base, 'CSXS', 'manifest.xml'), 'utf8');
var installer = fs.readFileSync(path.join(base, 'install', 'install-windows.bat'), 'utf8');
var failed = 0;

function check(name, condition) {
  console.log((condition ? 'PASS ' : 'FAIL ') + name);
  if (!condition) { failed++; }
}

check('manifest has the CEP namespace', /xmlns="http:\/\/ns\.adobe\.com\/cep\/manifest"/.test(manifest));
check('manifest accepts Premiere Pro 2020 and later', /<Host Name="PPRO" Version="\[14\.0,99\.9\]"\/>/.test(manifest));
check('manifest enables the CEP mixed context', /<Parameter>--mixed-context<\/Parameter>/.test(manifest));
check('Windows installer writes PlayerDebugMode as REG_SZ', /PlayerDebugMode \/t REG_SZ \/d 1 \/f/.test(installer));
check('Windows installer does not overwrite PlayerDebugMode as REG_DWORD', installer.indexOf('PlayerDebugMode /t REG_DWORD') === -1);

if (failed) {
  console.log('\n' + failed + ' MANIFEST TEST(S) FAILED');
  process.exit(1);
}
console.log('\nALL MANIFEST TESTS PASSED');
