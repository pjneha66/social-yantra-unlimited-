/* ==========================================================================
 * Social Yantra Powerhouse — core bridge
 * CEP / Node / browser (demo) environment detection + shared services.
 * ========================================================================== */
window.SY = (function () {
  'use strict';

  var SY = {};

  /* ---------------------------- environment ---------------------------- */
  SY.inCEP = !!window.__adobe_cep__;
  SY.cs = new CSInterface();
  var nodeRequire = null;
  try {
    if (typeof require === 'function' && typeof process !== 'undefined' && process.versions && process.versions.node) {
      nodeRequire = require;
    } else if (window.cep_node && window.cep_node.require) {
      nodeRequire = window.cep_node.require;
    }
  } catch (e) { nodeRequire = null; }
  SY.hasNode = !!nodeRequire;
  SY.require = function (m) { return nodeRequire ? nodeRequire(m) : null; };

  var nd = SY.hasNode ? SY.require('os') : null;
  SY.os = (nd && nd.platform && nd.platform().indexOf('win') === 0) ? 'win' : 'mac';
  SY.sep = SY.os === 'win' ? '\\' : '/';
  SY.home = nd ? nd.homedir() : '';

  SY.paths = {
    documents: (function () {
      if (!SY.hasNode) { return ''; }
      var path = SY.require('path'), os = SY.require('os');
      return path.join(os.homedir(), 'Documents');
    })(),
    root: '' // set below (SocialYantra data folder)
  };
  if (SY.hasNode) {
    var _p = SY.require('path');
    SY.paths.root = _p.join(SY.paths.documents, 'SocialYantra');
    SY.paths.freeze = _p.join(SY.paths.root, 'Freeze');
    SY.paths.nests = _p.join(SY.paths.root, 'NestSaver');
    SY.paths.media = _p.join(SY.paths.root, 'Media');
    SY.paths.models = _p.join(SY.paths.root, 'WhisperModels');
    SY.paths.library = _p.join(SY.paths.root, 'AssetsLibrary');
    SY.paths.temp = _p.join(SY.paths.root, 'temp');
  }

  /* ---------------------------- logging ---------------------------- */
  var logs = [], logEls = null, logCountEl = null;
  SY.log = function (msg, level) {
    level = level || 'info';
    var t = new Date().toTimeString().slice(0, 8);
    logs.push({ t: t, level: level, msg: String(msg) });
    if (logs.length > 600) { logs.shift(); }
    if (!logEls) {
      logEls = document.getElementById('logview');
      logCountEl = document.getElementById('logCount');
      var bar = document.getElementById('logbar');
      if (bar) { bar.addEventListener('click', function () { if (logEls) { logEls.classList.toggle('open'); logEls.scrollTop = 1e9; } }); }
    }
    if (logEls) {
      var div = document.createElement('div');
      div.className = 'l-' + level;
      div.textContent = '[' + t + '] ' + msg;
      logEls.appendChild(div);
      while (logEls.children && logEls.children.length > 600 && logEls.removeChild) { logEls.removeChild(logEls.firstChild); }
      logEls.scrollTop = 1e9;
      if (logCountEl) { logCountEl.textContent = logs.length + ' events'; }
    }
    if (SY.inCEP) { try { SY.cs.evalScript('SY.jsxLog(' + JSON.stringify(String(msg)) + ')'); } catch (e) { /* noop */ } }
  };

  /* ---------------------------- toast ---------------------------- */
  SY.toast = function (msg, kind, ms) {
    var box = document.getElementById('toasts');
    if (!box) { return; }
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0';
      el.style.transition = 'opacity .3s';
      setTimeout(function () { if (el.parentNode) { box.removeChild(el); } }, 320);
    }, ms || 3400);
  };

  /* ---------------------------- settings ---------------------------- */
  var DEFAULTS = {
    ffmpegPath: '',
    whisperMode: 'server',            // 'server' | 'cli' | 'off'
    whisperEndpoint: 'http://127.0.0.1:8080',
    whisperCli: '',
    whisperModel: '',
    whisperModelDir: '',
    modelLastDir: '',
    nestRoot: '',
    silence: { threshold: -38, minDur: 0.6, padPre: 0.04, padPost: 0.06, mode: 'ripple', minCut: 0.3, linkAV: true },
    filler: { custom: '', pad: 0.02, minLen: 0.08, repeats: true, words: ['um', 'uh', 'er', 'ah', 'hmm', 'like', 'you know', 'i mean', 'sort of', 'kind of', 'basically', 'actually', 'literally', 'right', 'okay'] },
    wordpop: { wordsPerCap: 1, holdCap: 0.8, popScale: 115, upper: true },
    flow: { keyBudget: 48, antiOvershoot: true },
    assetsRoot: ''
  };
  var settings = null;
  SY.loadSettings = function () {
    settings = JSON.parse(JSON.stringify(DEFAULTS));
    try {
      var raw = localStorage.getItem('sySettings');
      if (raw) {
        var s = JSON.parse(raw);
        Object.keys(s).forEach(function (k) {
          if (settings[k] && typeof settings[k] === 'object' && !Array.isArray(settings[k])) {
            Object.keys(s[k]).forEach(function (k2) { settings[k][k2] = s[k][k2]; });
          } else { settings[k] = s[k]; }
        });
      }
    } catch (e) { /* fresh */ }
    SY.settings = settings;
    return settings;
  };
  SY.saveSettings = function () {
    try { localStorage.setItem('sySettings', JSON.stringify(settings)); } catch (e) { /* noop */ }
    if (SY.hasNode) {
      try {
        var fs = SY.require('fs'), path = SY.require('path');
        SY.mkdirp(SY.paths.root);
        fs.writeFileSync(path.join(SY.paths.root, 'settings.json'), JSON.stringify(settings, null, 2));
      } catch (e) { /* noop */ }
    }
  };

  /* ---------------------------- fs helpers (node) ---------------------------- */
  SY.mkdirp = function (dir) {
    if (!SY.hasNode) { return false; }
    var fs = SY.require('fs'), path = SY.require('path');
    try { fs.mkdirSync(dir, { recursive: true }); return true; } catch (e) { return false; }
  };
  SY.exists = function (p) {
    if (!SY.hasNode || !p) { return false; }
    try { return SY.require('fs').existsSync(p); } catch (e) { return false; }
  };
  SY.readText = function (p) {
    if (!SY.hasNode) { return null; }
    try { return SY.require('fs').readFileSync(p, 'utf8'); } catch (e) { return null; }
  };
  SY.writeText = function (p, txt) {
    if (!SY.hasNode) { return false; }
    try {
      var path = SY.require('path');
      SY.mkdirp(path.dirname(p));
      SY.require('fs').writeFileSync(p, txt);
      return true;
    } catch (e) { SY.log('write failed: ' + p + ' — ' + e.message, 'err'); return false; }
  };
  SY.walk = function (dir, depth, out) {
    out = out || [];
    if (!SY.hasNode || !dir || !SY.exists(dir)) { return out; }
    var fs = SY.require('fs'), path = SY.require('path');
    try {
      fs.readdirSync(dir, { withFileTypes: true }).forEach(function (ent) {
        var full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          out.push({ path: full, name: ent.name, dir: true });
          if (depth > 0) { SY.walk(full, depth - 1, out); }
        } else {
          out.push({ path: full, name: ent.name, dir: false, ext: (path.extname(ent.name) || '').toLowerCase() });
        }
      });
    } catch (e) { /* permission */ }
    return out;
  };
  SY.reveal = function (p) {
    if (!SY.hasNode) { return; }
    var cp = SY.require('child_process');
    try {
      if (SY.os === 'win') { cp.exec('explorer /select,"' + p + '"'); }
      else { cp.exec('open -R "' + p + '"'); }
    } catch (e) { SY.log('reveal failed: ' + e.message, 'warn'); }
  };

  /* ---------------------------- dialogs ---------------------------- */
  SY.pickFolder = function (cb) {
    if (window.cep && window.cep.fs && window.cep.fs.showOpenDialogEx) {
      var r = window.cep.fs.showOpenDialogEx(false, true, 'Choose folder', [], '');
      if (r && r.data && r.data.length) { cb(r.data[0]); }
      return;
    }
    cb('');
  };
  SY.pickFile = function (filters, cb) {
    if (window.cep && window.cep.fs && window.cep.fs.showOpenDialogEx) {
      var r = window.cep.fs.showOpenDialogEx(true, false, 'Choose file', filters || [], '');
      if (r && r.data && r.data.length) { cb(r.data[0]); }
      return;
    }
    cb('');
  };

  /* ---------------------------- ExtendScript RPC ---------------------------- */
  SY.call = function (fn, arg, cb) {
    cb = cb || function () {};
    var argJson = JSON.stringify(arg === undefined ? null : arg);
    var expr = 'SY.evalJson(' + JSON.stringify(fn) + ',' + JSON.stringify(argJson) + ')';
    SY.cs.evalScript(expr, function (res) {
      if (res === undefined || res === null || res === 'EvalScript error.' || res === '') {
        var msg = 'ExtendScript error calling ' + fn + (res ? ' (' + res + ')' : ' (empty)');
        SY.log(msg, 'err');
        cb({ ok: false, error: msg });
        return;
      }
      var parsed;
      try { parsed = JSON.parse(res); } catch (e) {
        SY.log('bad JSON from ' + fn + ': ' + String(res).slice(0, 200), 'err');
        cb({ ok: false, error: 'Unparseable ExtendScript response' });
        return;
      }
      cb(parsed);
    });
  };

  /* ---------------------------- ffmpeg ---------------------------- */
  var ffmpegCache = null;
  SY.resolveFFmpeg = function (cb) {
    if (ffmpegCache) { cb(ffmpegCache); return; }
    if (!SY.hasNode) { cb('ffmpeg'); return; } // demo/browser: pretend
    var cp = SY.require('child_process');
    if (SY.settings.ffmpegPath && SY.exists(SY.settings.ffmpegPath)) { ffmpegCache = SY.settings.ffmpegPath; cb(ffmpegCache); return; }
    var candidates = SY.os === 'win'
      ? ['ffmpeg', 'C:\\ffmpeg\\bin\\ffmpeg.exe', 'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe', process.env.USERPROFILE + '\\ffmpeg\\bin\\ffmpeg.exe']
      : ['ffmpeg', '/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg', '/usr/bin/ffmpeg'];
    var i = 0;
    (function next() {
      if (i >= candidates.length) { cb('ffmpeg'); return; }
      var cand = candidates[i++];
      cp.exec((SY.os === 'win' ? '"' + cand + '" -version' : '"' + cand + '" -version'), { timeout: 6000 }, function (err, stdout) {
        if (!err && /ffmpeg/i.test(stdout || '')) { ffmpegCache = cand; cb(cand); }
        else { next(); }
      });
    })();
  };
  SY.testFFmpeg = function (cb) {
    if (!SY.hasNode) { cb({ ok: false, error: 'Node disabled (demo mode)' }); return; }
    var p = SY.settings.ffmpegPath && SY.exists(SY.settings.ffmpegPath) ? SY.settings.ffmpegPath : 'ffmpeg';
    SY.require('child_process').exec('"' + p + '" -version', { timeout: 6000 }, function (err, stdout) {
      if (err) { cb({ ok: false, error: String(err.message || err) }); return; }
      var m = /ffmpeg version (\S+)/i.exec(stdout);
      cb({ ok: true, version: m ? m[1] : 'unknown' });
    });
  };

  /* ---------------------------- misc utils ---------------------------- */
  SY.fmtBytes = function (b) {
    if (b > 1024 * 1024 * 1024) { return (b / 1073741824).toFixed(2) + ' GB'; }
    if (b > 1024 * 1024) { return (b / 1048576).toFixed(1) + ' MB'; }
    if (b > 1024) { return (b / 1024).toFixed(0) + ' KB'; }
    return b + ' B';
  };
  SY.fmtTime = function (s) {
    if (s < 0) { s = 0; }
    var m = Math.floor(s / 60), sec = s - m * 60;
    return (m < 10 ? '0' + m : m) + ':' + (sec < 10 ? '0' + sec.toFixed(2) : sec.toFixed(2));
  };
  SY.fmtTC = function (s) {
    if (s < 0) { s = 0; }
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), f = Math.round((s - Math.floor(s)) * 100);
    return [h, m, sec].map(function (n) { return (n < 10 ? '0' : '') + n; }).join(':') + '.' + (f < 10 ? '0' : '') + f;
  };
  SY.uid = function () {
    return 'sy' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  };
  SY.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  }); };

  SY.busy = function (btn, on) {
    if (!btn) { return; }
    btn.classList.toggle('busy', !!on);
    btn.disabled = !!on || btn.dataset.keepDisabled === '1';
  };

  /* ---------------------------- subtitle parsing ---------------------------- */
  SY.parseSrt = function (text) {
    var cues = [];
    var re = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-{1,3}>\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      var start = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+('0.' + m[4]));
      var end = (+m[5]) * 3600 + (+m[6]) * 60 + (+m[7]) + (+('0.' + m[8]));
      // find text: lines after this match until blank or next cue index
      var after = text.slice(re.lastIndex).replace(/^\s*\d+\s*\n/, '');
      var stop = after.search(/\n\s*\n/);
      var chunk = stop === -1 ? after : after.slice(0, stop);
      chunk = chunk.split('\n').filter(function (l) { return l.trim() !== '' && !/^\d+$/.test(l.trim()); }).join(' ').trim();
      cues.push({ start: start, end: end, text: chunk });
    }
    return cues;
  };

  SY.loadSettings();
  return SY;
})();
