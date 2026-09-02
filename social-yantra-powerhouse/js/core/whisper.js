/* ==========================================================================
 * Social Yantra Powerhouse — local Whisper client
 * Two fully-local runtimes:
 *   A) server — any OpenAI-compatible /v1/audio/transcriptions endpoint
 *      (whisper.cpp server, LM Studio, LocalAI, faster-whisper-server…)
 *   B) cli    — whisper.cpp binaries (whisper-cli / main) with word-level JSON
 * Nothing is ever uploaded to the internet.
 * ========================================================================== */
window.SYWhisper = (function (SY) {
  'use strict';

  function normEndpoint(ep) {
    ep = (ep || '').trim().replace(/\/+$/, '');
    if (!ep) { return ''; }
    if (!/^https?:\/\//i.test(ep)) { ep = 'http://' + ep; }
    return ep;
  }

  /* -------------------------- words extraction -------------------------- */
  function extractWords(resp) {
    var words = [];
    if (!resp) { return words; }
    if (resp.words && resp.words.length) {
      resp.words.forEach(function (w) {
        if (w.word || w.text) { words.push({ w: (w.word || w.text || '').trim(), start: +w.start, end: +w.end }); }
      });
      return words;
    }
    if (resp.segments) {
      resp.segments.forEach(function (s) {
        if (s.words && s.words.length) {
          s.words.forEach(function (w) { words.push({ w: (w.word || w.text || '').trim(), start: +w.start, end: +w.end }); });
        } else if (s.text) {
          words.push({ w: s.text.trim(), start: +s.start, end: +s.end, segment: true });
        }
      });
    }
    return words;
  }

  /* -------------------------- HTTP multipart (no fetch in CEP node) -------------------------- */
  function postFile(urlStr, filePath, params, cb, onProgress) {
    var http = SY.require('http'), https = SY.require('https'), fs = SY.require('fs'), path = SY.require('path');
    var u = SY.require('url').parse(urlStr);
    var boundary = '----SY' + Date.now();
    var parts = [];
    Object.keys(params).forEach(function (k) {
      parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="' + k + '"\r\n\r\n' + params[k] + '\r\n'));
    });
    var head = Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="' + path.basename(filePath) + '"\r\nContent-Type: audio/wav\r\n\r\n');
    var tail = Buffer.from('\r\n--' + boundary + '--\r\n');
    var size = fs.statSync(filePath).size;
    var total = size + head.length + tail.length + parts.reduce(function (a, b) { return a + b.length; }, 0);
    var sent = 0;

    var req = (u.protocol === 'https:' ? https : http).request({
      hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.path, method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Content-Length': total }
    }, function (res) {
      var body = '';
      res.on('data', function (d) { body += d; });
      res.on('end', function () {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          cb(new Error('HTTP ' + res.statusCode + ' — ' + body.slice(0, 300)));
          return;
        }
        try { cb(null, JSON.parse(body)); } catch (e) { cb(new Error('Bad JSON from server: ' + body.slice(0, 200))); }
      });
    });
    req.on('error', cb);
    parts.forEach(function (p) { req.write(p); sent += p.length; });
    req.write(head, function () {
      var rs = fs.createReadStream(filePath);
      rs.on('data', function (d) { sent += d.length; if (onProgress) { onProgress(sent / total); } });
      rs.on('end', function () { req.end(tail); });
      rs.on('error', cb);
      rs.pipe(req, { end: false });
    });
  }

  /* -------------------------- public API -------------------------- */
  function transcribe(wavPath, cb, onProgress) {
    var mode = SY.settings.whisperMode;
    if (mode === 'server') { transcribeServer(wavPath, cb, onProgress); }
    else if (mode === 'cli') { transcribeCli(wavPath, cb); }
    else { cb(new Error('Whisper engine disabled. Configure it in Whisper AI Models tab.')); }
  }

  function transcribeServer(wavPath, cb, onProgress) {
    var ep = normEndpoint(SY.settings.whisperEndpoint);
    if (!ep) { cb(new Error('No server endpoint set.')); return; }
    var url = ep.replace(/\/v1\/audio\/transcriptions$/i, '') + '/v1/audio/transcriptions';
    postFile(url, wavPath, {
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: 'word'
    }, function (err, resp) {
      if (err) { cb(err); return; }
      var words = extractWords(resp);
      if (!words.length) { cb(new Error('Server replied but no words/timestamps found. Does it support verbose_json?')); return; }
      cb(null, { words: words, raw: resp.text || '' });
    }, onProgress);
  }

  function transcribeCli(wavPath, cb) {
    var cp = SY.require('child_process'), path = SY.require('path');
    var bin = SY.settings.whisperCli;
    var model = SY.settings.whisperModel;
    if (!bin || !SY.exists(bin)) { cb(new Error('whisper.cpp binary not found at: ' + bin)); return; }
    if (!model || !SY.exists(model)) { cb(new Error('Whisper model not found at: ' + model)); return; }
    var outPrefix = path.join(SY.paths.temp, SY.uid());
    SY.mkdirp(SY.paths.temp);
    var args = ['-m', model, '-f', wavPath, '-oj', '-of', outPrefix, '-ml', '1'];
    // -ml 1 → one word per segment → word-level timestamps in the JSON
    var child = cp.execFile(bin, args, { timeout: 20 * 60000, maxBuffer: 1 << 28, windowsHide: true }, function (err) {
      var jsonPath = outPrefix + '.json';
      var txt = SY.readText(jsonPath);
      if (!txt) { cb(err || new Error('whisper.cpp produced no JSON output.')); return; }
      var data;
      try { data = JSON.parse(txt); } catch (e) { cb(new Error('Bad JSON from whisper.cpp')); return; }
      var src = data.transcription || data;
      var arr = Array.isArray(src) ? src : (src.segments || [src]);
      var words = [];
      arr.forEach(function (seg) {
        var t = (seg.text || '').replace(/^\s+|\s+$/g, '');
        // strip token-level special markers like [_TT_XXX]
        t = t.replace(/\[[_#][A-Z_]+\]/g, '').trim();
        var st = (seg.offsets != null ? +seg.offsets / 1000 : (+seg.start || 0));
        var en = (seg.offsets != null && seg.durations != null)
          ? (+seg.offsets + +seg.durations) / 1000
          : (+seg.end || st + 0.2);
        if (t) { words.push({ w: t, start: st, end: en }); }
      });
      if (!words.length) { cb(new Error('No words parsed from whisper.cpp JSON')); return; }
      cb(null, { words: words, raw: (data.transcription && typeof data.transcription === 'object' ? '' : String(data.transcription || '')) });
    });
  }

  function test(cb) {
    var mode = SY.settings.whisperMode;
    if (mode === 'off') { cb({ ok: false, error: 'Engine disabled' }); return; }
    if (mode === 'cli') {
      var bin = SY.settings.whisperCli, model = SY.settings.whisperModel;
      if (!bin || !SY.exists(bin)) { cb({ ok: false, error: 'CLI binary missing' }); return; }
      if (!model || !SY.exists(model)) { cb({ ok: false, error: 'Model file missing' }); return; }
      cb({ ok: true, note: 'CLI + model found' });
      return;
    }
    var ep = normEndpoint(SY.settings.whisperEndpoint);
    if (!ep) { cb({ ok: false, error: 'No endpoint set' }); return; }
    var http = SY.require('http'), https = SY.require('https');
    var u = SY.require('url').parse(ep);
    var req = (u.protocol === 'https:' ? https : http).request({
      hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: (u.path === '/' ? '/' : u.path), method: 'GET', timeout: 4000
    }, function (res) {
      res.resume();
      cb({ ok: res.statusCode < 500, note: 'HTTP ' + res.statusCode });
    });
    req.on('timeout', function () { req.abort(); cb({ ok: false, error: 'timeout' }); });
    req.on('error', function (e) { cb({ ok: false, error: e.message }); });
    req.end();
  }

  return { transcribe: transcribe, test: test, normEndpoint: normEndpoint };
})(window.SY);
