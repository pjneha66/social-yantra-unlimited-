/* ==========================================================================
 * Social Yantra Powerhouse — Downloader (yt-dlp)
 *
 * yt-dlp already speaks YouTube, TikTok, Instagram and Pinterest (plus ~1800
 * other extractors), so this module is about driving it well from a panel:
 * real format selectors per quality tier, audio extraction, cookies for
 * members-only / login-walled posts, exact-frame-rate re-encode, section
 * downloads and mergeable output — with live progress and cancel.
 * ========================================================================== */
window.SYMediaGet = (function (SY) {
  'use strict';

  var G = {};
  var cache = null;

  /* The four sites the panel advertises. `needs` documents what typically
   * blocks a naive download from that host. */
  G.SITES = [
    { id: 'youtube',   label: 'YouTube',   test: /(^|\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i,
      note: 'Highest tiers are separate video+audio streams — ffmpeg merges them.' },
    { id: 'tiktok',    label: 'TikTok',    test: /(^|\.)?tiktok\.com$/i,
      note: 'Usually downloads clean; some regions need cookies.' },
    { id: 'instagram', label: 'Instagram', test: /(^|\.)?instagram\.com$/i,
      note: 'Reels and private accounts need cookies from a logged-in browser.' },
    { id: 'pinterest', label: 'Pinterest', test: /(^|\.)?pin\.?terest\.[a-z.]+$/i,
      note: 'Works for public pins; boards download as a playlist.' },
    { id: 'other',     label: 'Any other site', test: /.*/,
      note: 'yt-dlp supports ~1800 extractors — paste the URL.' }
  ];

  G.siteFor = function (url) {
    var host = G.hostOf(url);
    for (var i = 0; i < G.SITES.length - 1; i++) {
      if (G.SITES[i].test.test(host)) { return G.SITES[i]; }
    }
    return G.SITES[G.SITES.length - 1];
  };

  G.hostOf = function (url) {
    var m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(String(url || '').trim());
    return m ? m[1].toLowerCase().replace(/^www\./, '') : '';
  };

  G.looksLikeUrl = function (url) {
    return /^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(String(url || '').trim());
  };

  /* Quality tiers → yt-dlp format selectors. */
  G.QUALITIES = [
    { id: 'best', label: 'Best quality', selector: 'bv*+ba/b', sort: 'res,ext:mp4:m4a' },
    { id: '1080', label: '1080p',        selector: 'bv*[height<=1080]+ba/b[height<=1080]', sort: 'res,ext:mp4:m4a' },
    { id: '720',  label: '720p',         selector: 'bv*[height<=720]+ba/b[height<=720]',   sort: 'res,ext:mp4:m4a' },
    { id: '480',  label: '480p',         selector: 'bv*[height<=480]+ba/b[height<=480]',   sort: 'res,ext:mp4:m4a' }
  ];
  G.qualityById = function (id) {
    for (var i = 0; i < G.QUALITIES.length; i++) { if (G.QUALITIES[i].id === id) { return G.QUALITIES[i]; } }
    return G.QUALITIES[0];
  };

  G.AUDIO = [
    { id: 'none', label: 'Keep video' },
    { id: 'mp3',  label: 'MP3',        ext: 'mp3', codecArgs: ['--audio-format', 'mp3', '--audio-quality', '0'] },
    { id: 'm4a',  label: 'M4A / AAC',  ext: 'm4a', codecArgs: ['--audio-format', 'm4a', '--audio-quality', '0'] }
  ];
  G.audioById = function (id) {
    for (var i = 0; i < G.AUDIO.length; i++) { if (G.AUDIO[i].id === id) { return G.AUDIO[i]; } }
    return G.AUDIO[0];
  };

  /* ------------------------ argument builder (pure) ------------------------ */
  /* opts: {
   *   url, quality, audio, outDir, template, cookies, cookiesFromBrowser,
   *   fps, section:{start,end}, merge:true, ffmpegPath, noPlaylist,
   *   keyframes:true, archive, writeInfo, extra:[]
   * } */
  G.buildArgs = function (opts) {
    opts = opts || {};
    var args = [];
    var q = G.qualityById(opts.quality);
    var a = G.audioById(opts.audio);
    var audioOnly = a.id !== 'none';

    /* URL must always come last — everything before it is an option. */
    if (audioOnly) {
      args.push('-x');
      args = args.concat(a.codecArgs);
      if (opts.quality && opts.quality !== 'best') {
        args.push('-f', 'ba[abr<=320]/ba');
      } else {
        args.push('-f', 'ba/b');
      }
    } else {
      args.push('-f', q.selector);
      if (q.sort) { args.push('-S', q.sort); }
    }

    /* merging / container */
    if (!audioOnly && opts.merge !== false) { args.push('--merge-output-format', 'mp4'); }

    /* exact frame rate: yt-dlp has no --fps, and postprocessor args run ffmpeg
     * in stream-copy mode by default, so a filter only takes effect together
     * with a real re-encode. */
    if (!audioOnly && opts.fps && +opts.fps > 0) {
      args.push('--recode-video', 'mp4');
      args.push('--postprocessor-args', 'ffmpeg:-vf fps=' + (+opts.fps));
    }

    /* a bounded time range instead of the whole video */
    if (opts.section && opts.section.start !== undefined && opts.section.start !== '' && opts.section.start !== null) {
      var s = G.clock(opts.section.start), e = G.clock(opts.section.end);
      args.push('--download-sections', '*' + s + '-' + (e === null ? 'inf' : e));
      if (opts.keyframes !== false) { args.push('--force-keyframes-at-cuts'); }
    }

    /* cookies */
    if (opts.cookiesFromBrowser) { args.push('--cookies-from-browser', String(opts.cookiesFromBrowser)); }
    else if (opts.cookies) { args.push('--cookies', String(opts.cookies)); }

    /* output */
    var tpl = opts.template || '%(title)s [%(id)s].%(ext)s';
    args.push('-o', G.joinOut(opts.outDir, tpl));
    if (opts.outDir) { args.push('--paths', 'home:' + String(opts.outDir)); }

    if (opts.noPlaylist !== false) { args.push('--no-playlist'); }
    if (opts.archive) { args.push('--download-archive', String(opts.archive)); }
    if (opts.ffmpegPath) { args.push('--ffmpeg-location', String(opts.ffmpegPath)); }
    if (opts.writeInfo) { args.push('--write-info-json'); }
    if (opts.extra && opts.extra.length) { args = args.concat(opts.extra); }

    /* progress plumbing last so a user-supplied flag can override the above */
    args.push('--newline', '--no-colors', '--progress');
    if (opts.url) { args.push(String(opts.url).trim()); }
    return args;
  };

  /* `--paths home:` needs a plain directory; `-o` then carries the template. */
  G.joinOut = function (dir, tpl) {
    if (!dir) { return String(tpl); }
    var sep = /\\/.test(String(dir)) ? '\\' : '/';
    var d = String(dir).replace(/[\\/]+$/, '');
    return d + sep + String(tpl);
  };

  /* Seconds or "mm:ss"/"hh:mm:ss" → "hh:mm:ss" for --download-sections. */
  G.clock = function (v) {
    if (v === undefined || v === null || v === '') { return null; }
    if (typeof v === 'string' && v.indexOf(':') !== -1) {
      var parts = v.split(':').map(function (x) { return parseInt(x, 10) || 0; });
      while (parts.length < 3) { parts.unshift(0); }
      return parts.slice(-3).map(function (n) { return (n < 10 ? '0' : '') + n; }).join(':');
    }
    var s = Math.max(0, Math.round(+v || 0));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    function p2(n) { return (n < 10 ? '0' : '') + n; }
    return p2(h) + ':' + p2(m) + ':' + p2(sec);
  };

  /* -------------------------- progress parsing (pure) -------------------------- */
  /* yt-dlp with --newline prints one line per update:
   *   [download]  42.3% of  118.42MiB at  3.21MiB/s ETA 00:12
   *   [download]  42.3% of ~118.42MiB at  3.21MiB/s ETA 00:12
   *   [Merger] Merging formats into "/path/out.mp4"
   */
  G.parseLine = function (line) {
    var L = String(line || '').replace(/\r$/, '');
    var m = /\[download\]\s+([0-9.]+)%\s+of\s*~?\s*([0-9.]+\s*\w*i?B)\s+at\s+([0-9.]+\s*\w*i?B\/s|Unknown speed)(?:\s+ETA\s+(\S+))?/.exec(L);
    if (m) {
      return {
        kind: 'progress',
        pct: parseFloat(m[1]),
        size: m[2].trim(),
        speed: m[3].trim(),
        eta: m[4] || '',
        line: L
      };
    }
    if (/\[download\]\s+100%/.test(L)) { return { kind: 'progress', pct: 100, size: '', speed: '', eta: '', line: L }; }

    /* "[download] Destination: …" and "[ExtractAudio] Destination: …" both
     * carry the real output path — check these before the generic stage match
     * or the path gets swallowed by the stage branch. */
    var dst = /\[([\w ]+)\]\s*Destination:\s*(.+)$/.exec(L);
    if (dst) {
      return { kind: 'destination', stage: dst[1], path: dst[2].trim(), line: L };
    }
    var mg = /\[(Merger|ExtractAudio|VideoConvertor|VideoRemuxer|Fixup\w*|Metadata|EmbedThumbnail|FFmpeg\w*)\]\s*(.*)$/.exec(L);
    if (mg) {
      var pathM = /["']([^"']+\.\w+)["']/.exec(L) || /(\S+\.\w+)$/.exec(L);
      return { kind: 'postprocess', stage: mg[1], detail: mg[2] || '', path: pathM ? pathM[1] : '', line: L };
    }
    var err = /^ERROR:\s*(.*)$/.exec(L);
    if (err) { return { kind: 'error', message: err[1], line: L }; }
    var warn = /^WARNING:\s*(.*)$/.exec(L);
    if (warn) { return { kind: 'warn', message: warn[1], line: L }; }
    if (/has already been downloaded/.test(L)) { return { kind: 'skip', line: L }; }
    return { kind: 'log', line: L };
  };

  /* Collect the final file(s) yt-dlp produced in `dir` after `since`. */
  G.newestFiles = function (dir, since, cb) {
    cb = cb || function () {};
    if (!SY.hasNode || !dir || !SY.exists(dir)) { cb([]); return; }
    try {
      var fs = SY.require('fs'), path = SY.require('path');
      var out = fs.readdirSync(dir).map(function (name) {
        var full = path.join(dir, name);
        var st = null;
        try { st = fs.statSync(full); } catch (e) {}
        return st && st.isFile() ? { path: full, name: name, mtime: st.mtimeMs, size: st.size } : null;
      }).filter(Boolean);
      out = out.filter(function (f) {
        return f.mtime >= (since || 0) && !/\.(part|ytdl|temp|tmp)$/i.test(f.name);
      });
      out.sort(function (a, b) { return b.mtime - a.mtime; });
      cb(out.slice(0, 10));
    } catch (e) { cb([]); }
  };

  /* --------------------------- CLI discovery --------------------------- */
  function candidates() {
    var list = [];
    if (SY.settings && SY.settings.ytdlpBin) { list.push({ bin: SY.settings.ytdlpBin, args: [], label: 'settings' }); }
    list.push({ bin: 'yt-dlp', args: [], label: 'PATH' });
    if (SY.hasNode) {
      var py = SY.os === 'win' ? ['py', 'python', 'python3'] : ['python3', 'python'];
      for (var i = 0; i < py.length; i++) { list.push({ bin: py[i], args: ['-m', 'yt_dlp'], label: py[i] + ' -m yt_dlp' }); }
      var home = '';
      try { home = SY.require('os').homedir(); } catch (e) {}
      if (home) {
        list.push({ bin: SY.require('path').join(home, '.local', 'bin', 'yt-dlp'), args: [], label: '~/.local/bin' });
        if (SY.os === 'win') {
          var appdata = process.env && process.env.APPDATA;
          if (appdata) { list.push({ bin: SY.require('path').join(appdata, 'Python', 'Scripts', 'yt-dlp.exe'), args: [], label: 'AppData Scripts' }); }
        }
      }
      try {
        var bundled = SY.require('path').join(SY.cs.getSystemPath(SystemPath.EXTENSION), 'bin',
          SY.os === 'win' ? 'yt-dlp.exe' : 'yt-dlp');
        if (SY.exists(bundled)) { list.push({ bin: bundled, args: [], label: 'bundled' }); }
      } catch (e2) {}
    }
    return list;
  }
  G.candidates = candidates;

  G.detect = function (cb, force) {
    cb = cb || function () {};
    if (cache && !force) { cb(cache); return; }
    if (!SY.hasNode) { cb({ ok: false, error: 'Node engine unavailable (demo mode)' }); return; }
    var cp = SY.require('child_process');
    var list = candidates();
    (function next(i) {
      if (i >= list.length) {
        cache = { ok: false, error: 'yt-dlp not found', hint: G.installHint() };
        cb(cache);
        return;
      }
      var cand = list[i];
      if (cand.bin.indexOf('yt-dlp') !== -1 && !/^yt-dlp$/.test(cand.bin) && !SY.exists(cand.bin)) { next(i + 1); return; }
      cp.execFile(cand.bin, cand.args.concat(['--version']), { timeout: 15000, windowsHide: true },
        function (err, stdout, stderr) {
          var txt = String(stdout || '') + String(stderr || '');
          var m = /([0-9]{4}\.[0-9]{2}\.[0-9]{2}[0-9.]*)/.exec(txt);
          if (err && !m) { next(i + 1); return; }
          cache = { ok: true, bin: cand.bin, args: cand.args, label: cand.label, version: m ? m[1] : 'unknown' };
          cb(cache);
        });
    })(0);
  };

  G.installHint = function () {
    return SY.os === 'win'
      ? 'python -m pip install --user -U yt-dlp'
      : 'python3 -m pip install --user -U yt-dlp';
  };

  G.install = function (onLog, cb) {
    onLog = onLog || function () {};
    cb = cb || function () {};
    if (!SY.hasNode) { cb(new Error('Node engine unavailable (demo mode)')); return; }
    var cp = SY.require('child_process');
    var steps = [
      { bin: SY.os === 'win' ? 'py' : 'python3', args: ['-m', 'pip', 'install', '--user', '-U', 'yt-dlp'] },
      { bin: SY.os === 'win' ? 'python' : 'python3', args: ['-m', 'pip', 'install', '--user', '-U', 'yt-dlp'] },
      { bin: 'pipx', args: ['install', 'yt-dlp'] }
    ];
    (function next(i) {
      if (i >= steps.length) {
        cb(new Error('No Python/pip/pipx could be used. Install Python 3.9+ (python.org) or run:\n' + G.installHint()));
        return;
      }
      var s = steps[i];
      onLog('$ ' + s.bin + ' ' + s.args.join(' '));
      var child;
      try { child = cp.spawn(s.bin, s.args, { windowsHide: true }); }
      catch (e) { next(i + 1); return; }
      child.stdout.on('data', function (d) { onLog(String(d)); });
      child.stderr.on('data', function (d) { onLog(String(d)); });
      child.on('error', function () { next(i + 1); });
      child.on('close', function (code) {
        if (code === 0) {
          cache = null;
          G.detect(function (r) {
            if (r.ok) { onLog('✔ yt-dlp ' + r.version + ' ready (' + r.label + ')'); cb(null, r); }
            else { next(i + 1); }
          }, true);
          return;
        }
        onLog('exit ' + code);
        next(i + 1);
      });
    })(0);
  };

  /* Fetch the metadata for a URL (title, duration, chapters) so the panel can
   * show what it is about to download and offer a section picker. */
  G.probe = function (url, cb) {
    cb = cb || function () {};
    if (!SY.hasNode) { cb(new Error('Node engine unavailable (demo mode)')); return; }
    G.detect(function (det) {
      if (!det.ok) { cb(new Error(det.error)); return; }
      var cp = SY.require('child_process');
      var args = det.args.concat(['-J', '--no-playlist', '--no-warnings', '--no-download', String(url).trim()]);
      cp.execFile(det.bin, args, { timeout: 90000, maxBuffer: 1 << 26, windowsHide: true },
        function (err, stdout, stderr) {
          if (err) { cb(new Error(String(stderr || err.message).slice(0, 300))); return; }
          var info = null;
          try { info = JSON.parse(stdout); } catch (e) { cb(new Error('Unreadable metadata from yt-dlp')); return; }
          var best = 0, bestH = 0;
          var fmts = info.formats || [];
          for (var i = 0; i < fmts.length; i++) {
            if (fmts[i].height && fmts[i].vcodec && fmts[i].vcodec !== 'none' && fmts[i].height > bestH) {
              bestH = fmts[i].height; best = fmts[i].height;
            }
          }
          cb(null, {
            title: info.title || '', uploader: info.uploader || info.channel || '',
            duration: info.duration || 0, max_height: best,
            fps: info.fps || 0, ext: info.ext || '', id: info.id || '',
            chapters: (info.chapters || []).map(function (c) { return { start: c.start_time, end: c.end_time, title: c.title }; }),
            site: G.siteFor(url).id
          });
        });
    });
  };

  /* ------------------------------- run ------------------------------- */
  /* opts = buildArgs options; hooks = { onLog, onProgress, onStage } */
  G.run = function (opts, hooks, cb) {
    hooks = hooks || {};
    cb = cb || function () {};
    if (!SY.hasNode) { cb(new Error('Node engine unavailable (demo mode)')); return; }
    G.detect(function (det) {
      if (!det.ok) { cb(new Error(det.error + ' — ' + det.hint)); return; }
      var cp = SY.require('child_process');
      var args = det.args.concat(G.buildArgs(opts));
      hooks.onLog && hooks.onLog('$ ' + det.bin + ' ' + G.quote(args).join(' '));
      if (opts.outDir) { SY.mkdirp(opts.outDir); }

      var child;
      try { child = cp.spawn(det.bin, args, { windowsHide: true }); }
      catch (e) { cb(e); return; }
      G.child = child;
      var tail = '', finalPath = '', lastPct = -1;

      function feed(chunk) {
        tail += String(chunk);
        var lines = tail.split('\n');
        tail = lines.pop();
        for (var i = 0; i < lines.length; i++) {
          var L = lines[i];
          if (!L.trim()) { continue; }
          var ev = G.parseLine(L);
          hooks.onLog && hooks.onLog(L);
          if (ev.kind === 'progress') {
            if (ev.pct !== lastPct) { lastPct = ev.pct; hooks.onProgress && hooks.onProgress(ev); }
          } else if (ev.kind === 'destination' && ev.path) {
            finalPath = ev.path;
          } else if (ev.kind === 'postprocess') {
            if (ev.path) { finalPath = ev.path; }
            hooks.onStage && hooks.onStage(ev);
          } else if (ev.kind === 'error') {
            hooks.onStage && hooks.onStage(ev);
          }
        }
      }

      child.stdout.on('data', feed);
      child.stderr.on('data', feed);
      child.on('error', function (e) { cb(e); });
      child.on('close', function (code) {
        if (tail.trim()) { feed(tail + '\n'); }
        if (code !== 0) { cb(new Error('yt-dlp exit ' + code)); return; }
        cb(null, { path: finalPath });
      });
    });
  };

  /* Quote argv for display only (never used to build a command string). */
  G.quote = function (args) {
    return args.map(function (a) { return /\s/.test(a) ? '"' + a + '"' : a; });
  };

  G.cancel = function () { try { if (G.child) { G.child.kill('SIGKILL'); } } catch (e) {} };

  return G;
})(window.SY);
