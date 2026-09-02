/* ==========================================================================
 * Social Yantra Powerhouse — AI background removal (rembg / U2Net / ISNet)
 *
 * rembg runs entirely locally: the ONNX weights land in ~/.u2net and inference
 * happens on the user's machine (onnxruntime, CPU by default). The panel
 * detects the CLI, offers a one-click install, and drives `rembg i`.
 * Nothing is uploaded anywhere.
 * ========================================================================== */
window.SYRembg = (function (SY) {
  'use strict';

  var R = {};
  var cache = null;

  /* Model catalogue. `file` is what rembg stores under ~/.u2net so the panel
   * can tell the user whether the weights are already on disk. */
  R.MODELS = [
    { id: 'u2net',            label: 'U2Net General',     file: 'u2net.onnx',            size: 176, note: 'general purpose · the default', star: true },
    { id: 'u2netp',           label: 'U2Net Fast',        file: 'u2netp.onnx',           size: 5,   note: 'lightweight · quickest, softer edges' },
    { id: 'isnet-general-use', label: 'ISNet Sharp Edges', file: 'isnet-general-use.onnx', size: 178, note: 'sharper hair / edge detail' },
    { id: 'u2net_human_seg',  label: 'U2Net Human',       file: 'u2net_human_seg.onnx',  size: 176, note: 'tuned for people — best for talking-head cut-outs' }
  ];

  R.modelById = function (id) {
    for (var i = 0; i < R.MODELS.length; i++) { if (R.MODELS[i].id === id) { return R.MODELS[i]; } }
    return R.MODELS[0];
  };

  /* Where rembg keeps its weights: $U2NET_HOME, else ~/.u2net */
  R.modelDir = function () {
    if (!SY.hasNode) { return ''; }
    try {
      if (SY.env.U2NET_HOME) { return SY.env.U2NET_HOME; }
      return SY.require('path').join(SY.require('os').homedir(), '.u2net');
    } catch (e) { return ''; }
  };

  /* Is a model's weight file already downloaded? */
  R.hasModel = function (id) {
    var dir = R.modelDir();
    if (!dir || !SY.hasNode) { return false; }
    var m = R.modelById(id);
    return SY.exists(SY.require('path').join(dir, m.file));
  };

  R.modelStatus = function () {
    var out = [];
    for (var i = 0; i < R.MODELS.length; i++) {
      var m = R.MODELS[i];
      out.push({ id: m.id, label: m.label, size: m.size, note: m.note, star: !!m.star,
        present: R.hasModel(m.id),
        state: R.hasModel(m.id) ? 'on disk' : 'downloads on first use (~' + m.size + ' MB)' });
    }
    return out;
  };

  /* --------------------------- CLI discovery --------------------------- */
  /* Candidates in preference order; each is {bin, args:[…], label}. */
  function candidates() {
    var list = [];
    if (SY.settings && SY.settings.rembgBin) { list.push({ bin: SY.settings.rembgBin, args: [], label: 'settings' }); }
    list.push({ bin: 'rembg', args: [], label: 'PATH' });
    if (SY.hasNode) {
      var py = SY.os === 'win' ? ['py', 'python', 'python3'] : ['python3', 'python'];
      for (var i = 0; i < py.length; i++) { list.push({ bin: py[i], args: ['-m', 'rembg'], label: py[i] + ' -m rembg' }); }
      var home = '';
      try { home = SY.require('os').homedir(); } catch (e) {}
      if (home) {
        list.push({ bin: SY.require('path').join(home, '.local', 'bin', 'rembg'), args: [], label: '~/.local/bin' });
        if (SY.os === 'win') {
          var appdata = SY.env.APPDATA;
          if (appdata) { list.push({ bin: SY.require('path').join(appdata, 'Python', 'Scripts', 'rembg.exe'), args: [], label: 'AppData Scripts' }); }
        }
      }
    }
    return list;
  }
  R.candidates = candidates;

  /* detect(cb) → { ok, bin, args, label, version } */
  R.detect = function (cb, force) {
    cb = cb || function () {};
    if (cache && !force) { cb(cache); return; }
    if (!SY.hasNode) { cb({ ok: false, error: 'Node engine unavailable (demo mode)' }); return; }
    var cp = SY.require('child_process');
    var list = candidates();
    (function next(i) {
      if (i >= list.length) {
        cache = { ok: false, error: 'rembg not found', hint: R.installHint() };
        cb(cache);
        return;
      }
      var cand = list[i];
      if (cand.bin.indexOf('rembg') !== -1 && !/^(rembg|py|python)/.test(cand.bin)) {
        if (!SY.exists(cand.bin)) { next(i + 1); return; }
      }
      var argv = cand.args.concat(['--version']);
      cp.execFile(cand.bin, argv, { timeout: 15000, windowsHide: true }, function (err, stdout, stderr) {
        var txt = String(stdout || '') + String(stderr || '');
        if (err && !/rembg/i.test(txt)) { next(i + 1); return; }
        var m = /([0-9]+\.[0-9]+[0-9.]*)/.exec(txt);
        cache = { ok: true, bin: cand.bin, args: cand.args, label: cand.label, version: m ? m[1] : 'unknown' };
        if (SY.settings && cand.label === 'settings') { /* keep */ }
        cb(cache);
      });
    })(0);
  };

  R.installHint = function () {
    return SY.os === 'win'
      ? 'python -m pip install --user "rembg[cli]" onnxruntime'
      : 'python3 -m pip install --user "rembg[cli]" onnxruntime';
  };

  /* One-click install. Logs each line so the panel can show real progress. */
  R.install = function (onLog, cb) {
    onLog = onLog || function () {};
    cb = cb || function () {};
    if (!SY.hasNode) { cb(new Error('Node engine unavailable (demo mode)')); return; }
    var cp = SY.require('child_process');
    var py = SY.os === 'win' ? 'py' : 'python3';
    var steps = [
      { bin: py, args: ['-m', 'pip', 'install', '--user', 'rembg[cli]', 'onnxruntime'] },
      { bin: SY.os === 'win' ? 'python' : 'python3', args: ['-m', 'pip', 'install', '--user', 'rembg[cli]', 'onnxruntime'] },
      { bin: 'pipx', args: ['install', 'rembg'] }
    ];
    (function next(i) {
      if (i >= steps.length) {
        cb(new Error('No Python/pip/pipx could be used. Install Python 3.9+ (python.org) or run:\n' + R.installHint()));
        return;
      }
      var s = steps[i];
      onLog('$ ' + s.bin + ' ' + s.args.join(' '));
      var child;
      try { child = cp.spawn(s.bin, s.args, { windowsHide: true }); }
      catch (e) { next(i + 1); return; }
      var tail = '';
      child.stdout.on('data', function (d) { var t = String(d); tail += t; onLog(t); });
      child.stderr.on('data', function (d) { var t = String(d); tail += t; onLog(t); });
      child.on('error', function () { next(i + 1); });
      child.on('close', function (code) {
        if (code === 0) {
          cache = null;
          R.detect(function (r) {
            if (r.ok) { onLog('✔ rembg ' + r.version + ' ready (' + r.label + ')'); cb(null, r); }
            else { next(i + 1); }
          }, true);
          return;
        }
        onLog('exit ' + code);
        next(i + 1);
      });
    })(0);
  };

  /* ------------------------------- run ------------------------------- */
  /* opts: { input, output, model, alphaMatting, onlyMask, erode, fg, bg }
   * cb(err, outPath) */
  R.run = function (opts, cb, onLog) {
    cb = cb || function () {};
    onLog = onLog || function () {};
    if (!SY.hasNode) { cb(new Error('Node engine unavailable (demo mode)')); return null; }
    var cp = SY.require('child_process');
    R.detect(function (det) {
      if (!det.ok) { cb(new Error(det.error + ' — ' + det.hint)); return; }
      var model = (opts.model && R.modelById(opts.model)) ? opts.model : 'u2net';
      var args = det.args.concat(['i']);
      args.push('-m', model);
      if (opts.onlyMask) { args.push('-om'); }
      if (opts.alphaMatting) {
        args.push('-a');
        if (opts.erode) { args.push('-ae', String(+opts.erode)); }
        if (opts.fg !== undefined && opts.fg !== null && opts.fg !== '') { args.push('-af', String(+opts.fg)); }
        if (opts.bg !== undefined && opts.bg !== null && opts.bg !== '') { args.push('-ab', String(+opts.bg)); }
      }
      args.push(opts.input, opts.output);

      onLog('$ ' + det.bin + ' ' + args.join(' '));
      SY.mkdirp(SY.require('path').dirname(opts.output));
      var child;
      try { child = cp.spawn(det.bin, args, { windowsHide: true }); }
      catch (e) { cb(e); return; }
      var tail = '';
      child.stdout.on('data', function (d) { var t = String(d); tail += t; onLog(t); });
      child.stderr.on('data', function (d) { var t = String(d); tail += t; onLog(t); });
      child.on('error', function (e) { cb(e); });
      child.on('close', function (code) {
        if (code !== 0) {
          cb(new Error('rembg exit ' + code + (tail ? ' — ' + tail.slice(-300) : '')));
          return;
        }
        if (!SY.exists(opts.output)) { cb(new Error('rembg finished but wrote no file')); return; }
        cb(null, opts.output);
      });
      R.child = child;
    });
    return null;
  };

  R.cancel = function () { try { if (R.child) { R.child.kill('SIGKILL'); } } catch (e) {} };

  return R;
})(window.SY);
