/* ==========================================================================
 * Social Yantra Powerhouse — Whisper ggml model downloader
 * The user chooses ANY custom location for model storage. Downloads stream
 * from the official whisper.cpp ggml releases on huggingface.co with
 * progress, cancel, resume-safe temp files and size verification.
 * ========================================================================== */
window.SYDownloader = (function (SY) {
  'use strict';

  var MODELS = [
    { id: 'ggml-tiny.en.bin',        name: 'Tiny (English)',       size: 75 * 1024 * 1024,   note: 'fastest, rough · English only', en: true },
    { id: 'ggml-tiny.bin',           name: 'Tiny (Multilingual)',  size: 75 * 1024 * 1024,   note: 'fastest, rough · Hindi/Hinglish ready', en: false },
    { id: 'ggml-base.en.bin',        name: 'Base (English)',       size: 142 * 1024 * 1024,  note: 'balanced, popular · English only', en: true },
    { id: 'ggml-base.bin',           name: 'Base (Multilingual)',  size: 142 * 1024 * 1024,  note: 'balanced, popular · Hindi/Hinglish ready', en: false },
    { id: 'ggml-small.en.bin',       name: 'Small (English)',      size: 466 * 1024 * 1024,  note: 'great accuracy · English only', en: true },
    { id: 'ggml-small.bin',          name: 'Small (Multilingual)', size: 466 * 1024 * 1024,  note: 'great accuracy · best Hinglish value', en: false, star: true },
    { id: 'ggml-medium.en.bin',      name: 'Medium (English)',     size: 1533 * 1024 * 1024, note: 'heavy, very accurate · English only', en: true },
    { id: 'ggml-medium.bin',         name: 'Medium (Multilingual)', size: 1533 * 1024 * 1024, note: 'heavy, very accurate · best Hindi quality', en: false },
    { id: 'ggml-large-v3-turbo.bin', name: 'Large v3 Turbo',       size: 1621 * 1024 * 1024, note: 'best speed/accuracy · multilingual', en: false },
    { id: 'ggml-large-v3.bin',       name: 'Large v3',             size: 2987 * 1024 * 1024, note: 'max accuracy, needs RAM · multilingual', en: false }
  ];
  var BASE = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/';
  var current = null; // { req }

  function urlFor(id) { return BASE + id; }

  /* ------------------- custom location helpers ------------------- */

  /* Validate a user-chosen folder: does it exist / can we write / free space */
  function checkDir(dir, cb) {
    cb = cb || function () {};
    if (!dir) { cb({ ok: false, error: 'No folder chosen yet.' }); return; }
    if (!SY.hasNode) { cb({ ok: false, error: 'Node engine unavailable (demo mode).' }); return; }
    var fs = SY.require('fs'), path = SY.require('path');
    var report = { ok: true, dir: dir, created: false, writable: false, freeBytes: 0, models: 0 };
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        report.created = true;
      } else if (!fs.statSync(dir).isDirectory()) {
        cb({ ok: false, error: 'That path is a file, not a folder.' });
        return;
      }
    } catch (e) { cb({ ok: false, error: 'Cannot create folder: ' + e.message }); return; }
    try {
      var probe = path.join(dir, '.sy-write-test');
      fs.writeFileSync(probe, 'ok');
      fs.unlinkSync(probe);
      report.writable = true;
    } catch (e2) { cb({ ok: false, error: 'Folder is not writable: ' + e2.message }); return; }
    try {
      if (typeof fs.statfsSync === 'function') {
        var st = fs.statfsSync(dir);
        report.freeBytes = st.bavail * st.bsize;
      }
    } catch (e3) { /* older node */ }
    try {
      report.models = fs.readdirSync(dir).filter(function (f) { return /^ggml-.*\.bin$/i.test(f); }).length;
    } catch (e4) { /* ignore */ }
    cb(report);
  }

  /* Copy every ggml model found in `from` into `to` (relocate your library). */
  function relocate(from, to, cb, onProgress) {
    if (!SY.hasNode) { cb(new Error('Node engine unavailable (demo mode)')); return; }
    if (!from || !to) { cb(new Error('Pick both the old and the new location.')); return; }
    var fs = SY.require('fs'), path = SY.require('path');
    if (!SY.exists(from)) { cb(new Error('Old folder not found: ' + from)); return; }
    SY.mkdirp(to);
    var files;
    try {
      files = fs.readdirSync(from).filter(function (f) { return /^ggml-.*\.bin$/i.test(f); });
    } catch (e) { cb(e); return; }
    if (!files.length) { cb(null, { moved: 0, note: 'No models in the old folder.' }); return; }
    var done = 0, moved = [];
    (function next(i) {
      if (i >= files.length) { cb(null, { moved: moved.length, files: moved }); return; }
      var src = path.join(from, files[i]);
      var dst = path.join(to, files[i]);
      try {
        var sz = fs.statSync(src).size;
        var rs = fs.createReadStream(src), ws = fs.createWriteStream(dst);
        var got = 0;
        rs.on('data', function (d) { got += d.length; if (onProgress) { onProgress(done + got / sz, files.length); } });
        rs.on('error', function (e) { next(i + 1); });
        ws.on('error', function (e) { next(i + 1); });
        ws.on('finish', function () {
          moved.push(files[i]);
          done++;
          if (onProgress) { onProgress(done, files.length); }
          next(i + 1);
        });
        rs.pipe(ws);
      } catch (e2) { next(i + 1); }
    })(0);
  }

  /* Size-check one model on disk (catches truncated / renamed files). */
  function verify(model, dir) {
    if (!SY.hasNode || !dir) { return { state: 'unknown' }; }
    var fs = SY.require('fs'), path = SY.require('path');
    var p = path.join(dir, model.id);
    var part = p + '.part';
    try {
      if (fs.existsSync(p)) {
        var sz = fs.statSync(p).size;
        if (sz < model.size * 0.9) { return { state: 'corrupt', path: p, size: sz, expected: model.size }; }
        return { state: 'ok', path: p, size: sz, expected: model.size };
      }
      if (fs.existsSync(part)) {
        return { state: 'partial', path: part, size: fs.statSync(part).size, expected: model.size };
      }
    } catch (e) { return { state: 'unknown', error: e.message }; }
    return { state: 'missing' };
  }

  /* ------------------- download ------------------- */
  function download(model, destDir, cb, onProgress) {
    if (!SY.hasNode) { cb(new Error('Node engine unavailable (demo mode) — install the panel in Premiere Pro.')); return; }
    if (current) { cb(new Error('A download is already running.')); return; }
    var fs = SY.require('fs'), path = SY.require('path');
    var http = SY.require('http'), https = SY.require('https');
    if (!destDir) { cb(new Error('Choose a custom download location first.')); return; }
    SY.mkdirp(destDir);
    var dest = path.join(destDir, model.id);
    var tmp = dest + '.part';

    function get(u, isFirst) {
      var req = (u.protocol === 'https:' ? https : http).get({
        hostname: u.hostname, path: u.path, headers: { 'User-Agent': 'SocialYantra-Powerhouse/1.0' }
      }, function (res) {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          var loc = res.headers.location;
          if (!/^https?:/i.test(loc)) {
            loc = u.protocol + '//' + u.hostname + (loc.charAt(0) === '/' ? '' : '/') + loc;
          }
          current = { req: null };
          get(SY.require('url').parse(loc), false);
          return;
        }
        pipe(res);
      });
      req.on('error', function (e) { current = null; cb(e); });
      current = { req: req };
    }

    function pipe(resp) {
      if (resp.statusCode !== 200) { fail(new Error('HTTP ' + resp.statusCode + ' from model host')); return; }
      var total = +resp.headers['content-length'] || model.size;
      var got = 0;
      var out = fs.createWriteStream(tmp);
      resp.on('data', function (d) {
        got += d.length;
        if (onProgress) { onProgress(got, total); }
      });
      resp.pipe(out);
      out.on('finish', function () {
        var ok = true;
        try {
          var stat = fs.statSync(tmp);
          if (total && stat.size < total * 0.98) { ok = false; }
          if (ok) { fs.renameSync(tmp, dest); }
          else { try { fs.unlinkSync(tmp); } catch (e) {} }
        } catch (e) { ok = false; }
        current = null;
        if (ok) { cb(null, dest); } else { cb(new Error('Download incomplete — temp file removed, please retry.')); }
      });
      out.on('error', fail);
    }
    function fail(e) { current = null; try { fs.unlinkSync(tmp); } catch (x) {} cb(e); }

    get(SY.require('url').parse(urlFor(model.id)), true);
  }

  function cancel() {
    if (current && current.req) {
      try { current.req.destroy(); } catch (e) { /* noop */ }
      current = null;
      return true;
    }
    return false;
  }

  /* Model list annotated with on-disk state for a given custom location. */
  function list(destDir) {
    var out = [];
    var path = SY.hasNode ? SY.require('path') : null;
    MODELS.forEach(function (m) {
      var rec = {
        id: m.id, name: m.name, size: m.size, note: m.note, en: m.en, star: !!m.star,
        path: destDir && path ? path.join(destDir, m.id) : '',
        downloaded: false, state: 'missing', diskSize: 0
      };
      var v = verify(m, destDir);
      rec.state = v.state;
      rec.diskSize = v.size || 0;
      rec.downloaded = v.state === 'ok';
      out.push(rec);
    });
    return out;
  }

  function totalOnDisk(destDir) {
    return list(destDir).reduce(function (a, m) { return a + (m.diskSize || 0); }, 0);
  }

  return {
    MODELS: MODELS,
    list: list,
    download: download,
    cancel: cancel,
    urlFor: urlFor,
    checkDir: checkDir,
    relocate: relocate,
    verify: verify,
    totalOnDisk: totalOnDisk,
    isBusy: function () { return !!current; }
  };
})(window.SY);
