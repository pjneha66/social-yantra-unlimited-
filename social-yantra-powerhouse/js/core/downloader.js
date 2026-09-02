/* ==========================================================================
 * Social Yantra Powerhouse — Whisper ggml model downloader
 * The user chooses ANY custom location for model storage ("keep in custom
 * location"). Downloads stream from the official whisper.cpp ggml releases on
 * huggingface.co with progress, cancel and size verification.
 * ========================================================================== */
window.SYDownloader = (function (SY) {
  'use strict';

  var MODELS = [
    { id: 'ggml-tiny.en.bin',        name: 'Tiny (English)',    size: 75 * 1024 * 1024,      note: 'fastest, rough' },
    { id: 'ggml-tiny.bin',           name: 'Tiny (Multilingual)', size: 75 * 1024 * 1024,   note: 'fastest, rough' },
    { id: 'ggml-base.en.bin',        name: 'Base (English)',    size: 142 * 1024 * 1024,    note: 'balanced, popular' },
    { id: 'ggml-base.bin',           name: 'Base (Multilingual)', size: 142 * 1024 * 1024, note: 'balanced, popular' },
    { id: 'ggml-small.en.bin',       name: 'Small (English)',   size: 466 * 1024 * 1024,    note: 'great accuracy' },
    { id: 'ggml-small.bin',          name: 'Small (Multilingual)', size: 466 * 1024 * 1024, note: 'great accuracy' },
    { id: 'ggml-medium.en.bin',      name: 'Medium (English)',  size: 1533 * 1024 * 1024,   note: 'heavy, very accurate' },
    { id: 'ggml-medium.bin',         name: 'Medium (Multilingual)', size: 1533 * 1024 * 1024, note: 'heavy, very accurate' },
    { id: 'ggml-large-v3-turbo.bin', name: 'Large v3 Turbo',    size: 1621 * 1024 * 1024,   note: 'best speed/accuracy' },
    { id: 'ggml-large-v3.bin',       name: 'Large v3',          size: 2987 * 1024 * 1024,   note: 'max accuracy, needs RAM' }
  ];
  var BASE = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/';
  var current = null; // { req, cancel }

  function urlFor(id) { return BASE + id; }

  function download(model, destDir, cb, onProgress) {
    if (!SY.hasNode) { cb(new Error('Node engine unavailable (demo mode) — install the panel in Premiere Pro.')); return; }
    if (current) { cb(new Error('A download is already running.')); return; }
    var fs = SY.require('fs'), path = SY.require('path');
    var http = SY.require('http'), https = SY.require('https');
    if (!destDir) { cb(new Error('Choose a custom download location first.')); return; }
    SY.mkdirp(destDir);
    var dest = path.join(destDir, model.id);
    var tmp = dest + '.part';

    var u = SY.require('url').parse(urlFor(model.id));
    var req = (u.protocol === 'https:' ? https : http).get({
      hostname: u.hostname, path: u.path, headers: { 'User-Agent': 'SocialYantra-Powerhouse/1.0' }
    }, function (res) {
      // follow redirects (HF -> CDN)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        var loc = res.headers.location;
        var u2 = SY.require('url').parse(loc);
        var inner = (u2.protocol === 'https:' ? https : http).get({
          hostname: u2.hostname, path: u2.path, headers: { 'User-Agent': 'SocialYantra-Powerhouse/1.0' }
        }, pipe);
        current = { req: inner };
        inner.on('error', fail);
        return;
      }
      pipe(res);

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
          if (ok) { cb(null, dest); } else { cb(new Error('Download incomplete — file removed, please retry.')); }
        });
        out.on('error', fail);
      }
      function fail(e) { current = null; try { fs.unlinkSync(tmp); } catch (x) {} cb(e); }
    });
    req.on('error', function (e) { current = null; cb(e); });
    current = { req: req };
  }

  function cancel() {
    if (current && current.req) {
      try { current.req.destroy(); } catch (e) { /* noop */ }
      current = null;
      return true;
    }
    return false;
  }

  function list(destDir) {
    var out = [];
    MODELS.forEach(function (m) {
      var p = destDir && SY.hasNode ? SY.require('path').join(destDir, m.id) : '';
      m.downloaded = !!(p && SY.exists(p));
      m.path = p;
      out.push(m);
    });
    return out;
  }

  return { MODELS: MODELS, list: list, download: download, cancel: cancel, urlFor: urlFor };
})(window.SY);
