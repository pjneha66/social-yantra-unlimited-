/* ==========================================================================
 * Social Yantra Powerhouse — local Whisper client
 * Two fully-local runtimes, both language-aware (English · हिन्दी · Hinglish):
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

  /* What language / prompt / task should this run use? */
  function langArgs() {
    if (window.SYLang) { return SYLang.resolve(); }
    var s = SY.settings.whisper || {};
    return { id: 'auto', language: 'auto', prompt: '', task: 'transcribe', translate: false, label: 'Auto-detect' };
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

  /* "00:00:01,320" / "00:00:01.320" -> ms */
  function tsStringMs(s) {
    var m = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/.exec(String(s || ''));
    if (!m) { return null; }
    return ((+m[1]) * 3600 + (+m[2]) * 60 + (+m[3])) * 1000 + Math.round(+('0.' + m[4]) * 1000);
  }
  /* whisper.cpp writes offsets as {from,to} in milliseconds. Older / other
   * builds may hand over a bare number — treat that as milliseconds too. */
  function spanSeconds(seg, alt) {
    var from = null, to = null;
    var ts = seg && seg.timestamps;
    if (ts) { from = tsStringMs(ts.from); to = tsStringMs(ts.to); }
    var off = seg && seg.offsets;
    if (from === null && off !== undefined && off !== null) {
      if (typeof off === 'object') { from = +off.from; to = +off.to; }
      else { from = +off; to = (seg.durations !== undefined) ? (+off + +seg.durations) : null; }
    }
    if (from === null && seg && seg.start !== undefined) { from = Math.round(+seg.start * 1000); to = Math.round(+seg.end * 1000); }
    if (from === null) { return null; }
    if (to === null || to <= from) { to = from + (alt || 200); }
    return [from / 1000, to / 1000];
  }

  function cleanToken(t) {
    // strip whisper.cpp token markers like [_TT_123] / [#_BLANK_]
    return String(t || '').replace(/\[[_#][A-Z_0-9]+\]/g, '').replace(/^\s+|\s+$/g, '');
  }

  /* Parse a whisper.cpp JSON document into [{w,start,end}]. */
  function parseCppJson(data) {
    var src = data.transcription || data;
    var arr = Array.isArray(src) ? src : (src.segments || [src]);
    var words = [];
    arr.forEach(function (seg) {
      if (seg && seg.words && seg.words.length) {
        seg.words.forEach(function (w) {
          var t = cleanToken(w.text || w.word);
          if (!t) { return; }
          var sp = spanSeconds(w, 200);
          if (!sp) { return; }
          words.push({ w: t, start: sp[0], end: sp[1] });
        });
        return;
      }
      var t2 = cleanToken(seg && seg.text);
      if (!t2) { return; }
      var sp2 = spanSeconds(seg, 200);
      if (!sp2) { return; }
      words.push({ w: t2, start: sp2[0], end: sp2[1], segment: true });
    });
    // a word list must be time-ordered and non-degenerate
    words = words.filter(function (w) { return isFinite(w.start) && isFinite(w.end); });
    words.sort(function (a, b) { return a.start - b.start; });
    return words;
  }

  /* -------------------------- HTTP multipart -------------------------- */
  function postFile(urlStr, filePath, params, cb, onProgress) {
    var http = SY.require('http'), https = SY.require('https'), fs = SY.require('fs'), path = SY.require('path');
    var u = SY.require('url').parse(urlStr);
    var boundary = '----SY' + Date.now();
    var parts = [];
    Object.keys(params).forEach(function (k) {
      if (params[k] === undefined || params[k] === null || params[k] === '') { return; }
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
    else { cb(new Error('Whisper engine disabled. Configure it in the AI Models & Language tab.')); }
  }

  function transcribeServer(wavPath, cb, onProgress) {
    var ep = normEndpoint(SY.settings.whisperEndpoint);
    if (!ep) { cb(new Error('No server endpoint set.')); return; }
    var url = ep.replace(/\/v1\/audio\/transcriptions$/i, '') + '/v1/audio/transcriptions';
    var L = langArgs();
    var params = {
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: 'word',
      task: L.task
    };
    if (L.language && L.language !== 'auto') { params.language = L.language; }
    if (L.prompt) { params.prompt = L.prompt; }
    SY.log('whisper server · ' + L.label + (L.prompt ? ' + prompt' : '') + ' · ' + L.task, 'info');
    postFile(url, wavPath, params, function (err, resp) {
      if (err) { cb(err); return; }
      var words = extractWords(resp);
      if (!words.length) { cb(new Error('Server replied but no words/timestamps found. Does it support verbose_json + word granularity?')); return; }
      cb(null, { words: words, raw: resp.text || '', language: resp.language || L.language, requested: L.id });
    }, onProgress);
  }

  function transcribeCli(wavPath, cb) {
    var cp = SY.require('child_process'), path = SY.require('path');
    var bin = SY.settings.whisperCli;
    var model = SY.settings.whisperModel;
    if (!bin || !SY.exists(bin)) { cb(new Error('whisper.cpp binary not found at: ' + bin)); return; }
    if (!model || !SY.exists(model)) { cb(new Error('Whisper model not found at: ' + model)); return; }
    if (window.SYLang) {
      var warn = SYLang.modelWarning(model);
      if (warn) { SY.log(warn, 'warn'); }
    }
    var L = langArgs();
    var outPrefix = path.join(SY.paths.temp, SY.uid());
    SY.mkdirp(SY.paths.temp);
    /* -ojf  full JSON incl. per-word offsets · -ml 1 + -sow  one word per segment
     * -l    spoken language ('auto' to detect) · --prompt  biases Hinglish decoding
     * -tr   translate to English · -np  keep stdout quiet */
    var args = ['-m', model, '-f', wavPath, '-ojf', '-of', outPrefix, '-ml', '1', '-sow', '-np',
      '-l', (L.language || 'auto')];
    if (L.translate) { args.push('-tr'); }
    if (L.prompt) { args.push('--prompt', L.prompt); }
    SY.log('whisper cli · ' + L.label + ' · ' + args.join(' '), 'info');

    cp.execFile(bin, args, { timeout: 30 * 60000, maxBuffer: 1 << 28, windowsHide: true }, function (err) {
      var jsonPath = outPrefix + '.json';
      var txt = SY.readText(jsonPath);
      if (!txt) {
        // some builds append the input extension: foo.wav.json
        var alt = outPrefix + path.extname(wavPath) + '.json';
        txt = SY.readText(alt);
        if (txt) { jsonPath = alt; }
      }
      if (!txt) { cb(err || new Error('whisper.cpp produced no JSON output (expected ' + jsonPath + ').')); return; }
      var data;
      try { data = JSON.parse(txt); } catch (e) { cb(new Error('Bad JSON from whisper.cpp')); return; }
      var words = parseCppJson(data);
      if (!words.length) { cb(new Error('No words parsed from whisper.cpp JSON')); return; }
      var raw = '';
      try { raw = words.map(function (w) { return w.w; }).join(' '); } catch (e2) {}
      cb(null, { words: words, raw: raw, language: L.language, requested: L.id });
    });
  }

  function test(cb) {
    var mode = SY.settings.whisperMode;
    if (mode === 'off') { cb({ ok: false, error: 'Engine disabled' }); return; }
    var L = langArgs();
    var warn = '';
    if (mode === 'cli' && window.SYLang) { warn = SYLang.modelWarning(SY.settings.whisperModel); }
    if (mode === 'cli') {
      var bin = SY.settings.whisperCli, model = SY.settings.whisperModel;
      if (!bin || !SY.exists(bin)) { cb({ ok: false, error: 'CLI binary missing' }); return; }
      if (!model || !SY.exists(model)) { cb({ ok: false, error: 'Model file missing' }); return; }
      cb({ ok: true, note: 'CLI + model found · ' + L.label, language: L.id, warning: warn });
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
      cb({ ok: res.statusCode < 500, note: 'HTTP ' + res.statusCode + ' · ' + L.label, language: L.id, warning: warn });
    });
    req.on('timeout', function () { req.abort(); cb({ ok: false, error: 'timeout' }); });
    req.on('error', function (e) { cb({ ok: false, error: e.message }); });
    req.end();
  }

  return {
    transcribe: transcribe,
    test: test,
    normEndpoint: normEndpoint,
    langArgs: langArgs,
    parseCppJson: parseCppJson,
    tsStringMs: tsStringMs,
    spanSeconds: spanSeconds
  };
})(window.SY);
