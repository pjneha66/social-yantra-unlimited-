/* ==========================================================================
 * Social Yantra Powerhouse — still renderer
 * Solid layers, text layers and pasted stills are produced with ffmpeg's
 * lavfi colour source and the drawtext filter, then imported by ExtendScript.
 * That keeps the panel free of native raster/font dependencies: ffmpeg is
 * already required for VAD, transcription and burn-in.
 * ========================================================================== */
window.SYStills = (function (SY) {
  'use strict';

  var SYStills = {};

  /* ------------------------------ spawning ------------------------------ */
  function run(bin, args, cb, onLine) {
    if (!SY.hasNode) { cb(new Error('Node engine unavailable (demo mode)')); return null; }
    var cp = SY.require('child_process');
    var child;
    try { child = cp.spawn(bin, args, { windowsHide: true }); }
    catch (e) { cb(e); return null; }
    var err = '';
    child.stderr.on('data', function (d) {
      var s = String(d);
      err += s;
      if (onLine) { onLine(s); }
      if (err.length > 200000) { err = err.slice(-100000); }
    });
    /* onLine sees stdout too — probes like `-filters` print there */
    if (child.stdout) { child.stdout.on('data', function (d) { if (onLine) { onLine(String(d)); } }); }
    child.on('error', function (e) { cb(e); });
    child.on('close', function (code) {
      if (code === 0) { cb(null, ''); }
      else { cb(new Error('exit ' + code + (err ? ' — ' + err.slice(-400) : ''))); }
    });
    return child;
  }
  SYStills.run = run;

  /* ------------------------------- colours ------------------------------ */
  /* '#7c5cff' / '7c5cff' / 'rgb(124,92,255)' -> {hex:'7c5cff', ffmpeg:'0x7c5cff'} */
  function toHex(c) {
    var s = String(c == null ? '#000000' : c).trim();
    var m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s);
    if (m) {
      function p2(n) { var h = Math.max(0, Math.min(255, +n)).toString(16); return h.length < 2 ? '0' + h : h; }
      return p2(m[1]) + p2(m[2]) + p2(m[3]);
    }
    s = s.replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(s)) { s = s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2); }
    if (!/^[0-9a-f]{6}$/i.test(s)) { return '000000'; }
    return s.toLowerCase();
  }
  SYStills.toHex = toHex;
  SYStills.css = function (c) { return '#' + toHex(c); };

  /* Luma of a hex colour, 0..255 — used to pick a readable default outline. */
  SYStills.luma = function (c) {
    var h = toHex(c);
    return (0.2126 * parseInt(h.slice(0, 2), 16)) + (0.7152 * parseInt(h.slice(2, 4), 16)) + (0.0722 * parseInt(h.slice(4, 6), 16));
  };

  /* --------------------------- drawtext escaping --------------------------- */
  /* Inside a filtergraph argument these characters need a backslash. */
  function escapeDrawtext(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/:/g, '\\:')
      .replace(/%/g, '\\%')
      .replace(/,/g, '\\,')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/;/g, '\\;');
  }
  SYStills.escapeDrawtext = escapeDrawtext;

  /* Value that will sit INSIDE single quotes in the filtergraph. Inside quotes
   * ffmpeg copies characters literally, so a Windows path must NOT have its
   * backslashes doubled — only an embedded quote needs the close/escape/reopen
   * dance. Forward slashes are used as well because ffmpeg accepts them on
   * Windows and they sidestep the whole escaping question. */
  function quoteFilterValue(s) {
    return String(s == null ? '' : s).replace(/\\/g, '/').replace(/'/g, "'\\''");
  }
  SYStills.quoteFilterValue = quoteFilterValue;

  /* ------------------------------- fonts ------------------------------- */
  function fontCandidates() {
    var list = [];
    if (SY.settings && SY.settings.fontFile) { list.push(SY.settings.fontFile); }
    if (SY.os === 'win') {
      var w = SY.env.windir || SY.env.WINDIR || 'C:\\Windows';
      list = list.concat([
        w + '\\Fonts\\arialbd.ttf', w + '\\Fonts\\arial.ttf',
        w + '\\Fonts\\segoeuib.ttf', w + '\\Fonts\\segoeui.ttf',
        w + '\\Fonts\\calibrib.ttf', 'C:\\Windows\\Fonts\\arialbd.ttf'
      ]);
    } else {
      list = list.concat([
        '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
        '/System/Library/Fonts/Supplemental/Arial.ttf',
        '/Library/Fonts/Arial Bold.ttf',
        '/System/Library/Fonts/Helvetica.ttc',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'
      ]);
    }
    return list;
  }

  /* First font that actually exists on disk ('' if none — drawtext then falls
   * back to fontconfig, which works on macOS and most Linux installs). */
  function resolveFont(cb) {
    var list = fontCandidates();
    for (var i = 0; i < list.length; i++) {
      if (list[i] && SY.exists(list[i])) { cb(list[i]); return; }
    }
    cb('');
  }
  SYStills.resolveFont = resolveFont;
  SYStills.fontCandidates = fontCandidates;

  /* ------------------------------- solid ------------------------------- */
  /* ffmpeg -f lavfi -i color=c=0xRRGGBB[@A]:s=WxH -frames:v 1 out.png */
  SYStills.makeSolid = function (opts, cb) {
    opts = opts || {};
    var w = Math.max(8, Math.round(opts.width || 1920));
    var h = Math.max(8, Math.round(opts.height || 1080));
    var hex = toHex(opts.color || '#000000');
    var alpha = (opts.alpha === undefined || opts.alpha === null) ? 1 : Math.max(0, Math.min(1, +opts.alpha));
    var out = opts.outPath;
    if (!out) { cb(new Error('No output path for the solid')); return null; }
    SY.mkdirp(SY.require('path').dirname(out));
    SY.resolveFFmpeg(function (ff) {
      var src = 'color=c=0x' + hex + '@' + alpha.toFixed(3) + ':s=' + w + 'x' + h + ':r=1';
      var args = ['-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'lavfi', '-i', src,
        '-frames:v', '1', '-pix_fmt', 'rgba', out];
      run(ff, args, function (err) {
        if (err) { cb(new Error('Solid render failed — ' + err.message)); return; }
        cb(null, out);
      });
    });
    return null;
  };

  /* ------------------------------- text -------------------------------- */
  /* PRIMARY: the panel is Chromium, so Canvas 2D can rasterise the text with
   * real font shaping (including Devanagari), anti-aliasing, outlines and
   * shadows — no ffmpeg, no font files to locate, no drawtext filter needed.
   * FALLBACK: ffmpeg drawtext, for headless runs where there is no canvas. */

  /* Does this ffmpeg build actually have drawtext? Cached after the first probe. */
  var drawtextState = null;
  SYStills.hasDrawtext = function (cb) {
    if (drawtextState !== null) { cb(drawtextState); return; }
    SY.resolveFFmpeg(function (ff) {
      run(ff, ['-hide_banner', '-filters'], function (err, out) {
        /* run() only reports failure through err; success output comes via cb */
        drawtextState = false;
        cb(false);
      }, function (chunk) {
        if (/\bdrawtext\b/.test(String(chunk))) { drawtextState = true; }
      });
    });
  };

  /* Canvas renderer. opts: { text, width, height, size, color, outline,
   * outlineColor, shadow, family, bold, align, offsetY, outPath } */
  SYStills.drawTextCanvas = function (opts, cb) {
    opts = opts || {};
    var out = opts.outPath;
    if (!out) { cb(new Error('No output path for the text layer')); return; }
    var doc = (typeof document !== 'undefined') ? document : null;
    if (!doc || !doc.createElement) { cb(new Error('No canvas available in this context')); return; }

    var w = Math.max(8, Math.round(opts.width || 1920));
    var h = Math.max(8, Math.round(opts.height || 1080));
    var size = Math.max(6, Math.round(opts.size || Math.round(h / 9)));
    var family = opts.family || '"Arial", "Helvetica Neue", "DejaVu Sans", sans-serif';
    var lines = String(opts.text == null ? 'TEXT LAYER' : opts.text).split(/\r?\n/);
    if (!lines.length) { lines = [' ']; }
    var lineH = Math.round(size * (opts.lineSpacing || 1.28));
    var color = opts.color || '#ffffff';
    var outline = opts.outline === undefined ? Math.max(1, Math.round(size / 22)) : Math.round(opts.outline);
    var outlineColor = opts.outlineColor || (SYStills.luma(color) > 140 ? '#000000' : '#ffffff');

    var cv;
    try {
      cv = doc.createElement('canvas');
      cv.width = w; cv.height = h;
      var ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, w, h);
      ctx.font = (opts.bold === false ? '' : 'bold ') + size + 'px ' + family;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      var totalH = lineH * lines.length;
      var y0 = Math.round((h - totalH) / 2 + (opts.offsetY || 0));
      for (var i = 0; i < lines.length; i++) {
        var body = lines[i].length ? lines[i] : ' ';
        var x = Math.round(w / 2 + (opts.offsetX || 0));
        var y = y0 + i * lineH;
        if (opts.shadow) {
          ctx.shadowColor = 'rgba(0,0,0,0.55)';
          ctx.shadowBlur = Math.max(2, Math.round(size / 12));
          ctx.shadowOffsetX = Math.round(size / 24);
          ctx.shadowOffsetY = Math.round(size / 24);
        }
        if (outline > 0) {
          ctx.lineWidth = outline * 2;
          ctx.strokeStyle = outlineColor;
          ctx.strokeText(body, x, y);
        }
        ctx.shadowColor = 'rgba(0,0,0,0)';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = color;
        ctx.fillText(body, x, y);
      }
    } catch (e) {
      cb(new Error('Canvas render failed: ' + e.message));
      return;
    }

    var url;
    try { url = cv.toDataURL('image/png'); }
    catch (e2) { cb(new Error('Canvas export failed: ' + e2.message)); return; }
    var b64 = String(url).replace(/^data:image\/png;base64,/, '');
    if (!b64 || b64.length < 100) { cb(new Error('Canvas produced an empty image')); return; }

    if (!SY.hasNode) {
      /* browser demo: hand the data URL back so the UI can still show it */
      cb(null, out, { dataUrl: url });
      return;
    }
    try {
      SY.mkdirp(SY.require('path').dirname(out));
      SY.require('fs').writeFileSync(out, Buffer.from(b64, 'base64'));
    } catch (e3) { cb(new Error('Could not write ' + out + ' — ' + e3.message)); return; }
    cb(null, out);
  };

  /* One drawtext per line so multi-line text never has to fight the filter
   * parser's newline handling, and each line gets an exact y offset. */
  SYStills.makeTextFFmpeg = function (opts, cb) {
    opts = opts || {};
    var text = String(opts.text == null ? 'TEXT LAYER' : opts.text);
    var lines = text.split(/\r?\n/);
    if (!lines.length) { lines = [' ']; }
    var w = Math.max(8, Math.round(opts.width || 1920));
    var h = Math.max(8, Math.round(opts.height || 1080));
    var size = Math.max(6, Math.round(opts.size || Math.round(h / 9)));
    var lineH = Math.round(size * (opts.lineSpacing || 1.28));
    var color = opts.color || '#ffffff';
    var outline = opts.outline === undefined ? Math.max(1, Math.round(size / 22)) : Math.round(opts.outline);
    var outlineColor = opts.outlineColor || (SYStills.luma(color) > 140 ? '#000000' : '#ffffff');
    var out = opts.outPath;
    if (!out) { cb(new Error('No output path for the text layer')); return null; }
    SY.mkdirp(SY.require('path').dirname(out));

    resolveFont(function (font) {
      SY.resolveFFmpeg(function (ff) {
        var totalH = lineH * lines.length;
        var y0 = Math.round((h - totalH) / 2 + (opts.offsetY || 0));
        var filters = [];
        for (var i = 0; i < lines.length; i++) {
          var body = lines[i].length ? lines[i] : ' ';
          var f = 'drawtext=' +
            (font ? "fontfile='" + quoteFilterValue(font) + "':" : '') +
            'text=' + escapeDrawtext(body) +
            ':fontcolor=' + color +
            ':fontsize=' + size +
            ':x=(w-text_w)/2+' + Math.round(opts.offsetX || 0) +
            ':y=' + (y0 + i * lineH) +
            (outline > 0 ? ':borderw=' + outline + ':bordercolor=' + outlineColor : '') +
            (opts.shadow ? ':shadowcolor=black@0.55:shadowx=' + Math.round(size / 24) + ':shadowy=' + Math.round(size / 24) : '') +
            (opts.box ? ':box=1:boxcolor=black@0.45:boxborderw=' + Math.round(size / 6) : '');
          filters.push(f);
        }
        var args = ['-hide_banner', '-loglevel', 'error', '-y',
          '-f', 'lavfi', '-i', 'color=c=black@0:s=' + w + 'x' + h + ':r=1',
          '-vf', filters.join(','),
          '-frames:v', '1', '-pix_fmt', 'rgba', out];
        run(ff, args, function (err) {
          if (err) {
            var msg = String(err.message || err);
            if (/No such filter: 'drawtext'|Unknown filter.*drawtext/i.test(msg)) {
              cb(new Error('This ffmpeg build has no drawtext filter (minimal builds often drop it). ' +
                'Install a full ffmpeg build, or point Settings › FFmpeg binary at one that has it.'));
              return;
            }
            cb(new Error('Text render failed — ' + msg +
              (font ? '' : ' (no TrueType font found; set a font in Settings)')));
            return;
          }
          cb(null, out);
        });
      });
    });
    return null;
  };

  /* Text layer entry point: Canvas 2D first (always available in the panel),
   * ffmpeg drawtext as the headless fallback. */
  SYStills.makeText = function (opts, cb) {
    var wantCanvas = !(opts && opts.renderer === 'ffmpeg');
    var tryFfmpeg = function (why) {
      SYStills.makeTextFFmpeg(opts, function (err, out) {
        if (err && why) { cb(new Error(err.message + ' (canvas path unavailable: ' + why + ')')); return; }
        cb(err, out);
      });
    };
    if (!wantCanvas) { tryFfmpeg(''); return null; }
    SYStills.drawTextCanvas(opts, function (err, out, extra) {
      if (!err) { cb(null, out, extra); return; }
      tryFfmpeg(err.message);
    });
    return null;
  };

  /* --------------------------- clipboard image --------------------------- */
  /* Grab whatever image is on the OS clipboard into a PNG. Returns
   * {ok, path} or {ok:false, error}. Windows uses PowerShell + System.Drawing,
   * macOS uses osascript's «class PNGf». Linux has no portable CLI, so the
   * panel falls back to a file picker there. */
  SYStills.pasteClipboard = function (outPath, cb) {
    cb = cb || function () {};
    if (!SY.hasNode) { cb({ ok: false, error: 'Node engine unavailable (demo mode)' }); return; }
    var cp = SY.require('child_process');
    SY.mkdirp(SY.require('path').dirname(outPath));

    if (SY.os === 'win') {
      var ps = 'Add-Type -AssemblyName System.Drawing;' +
        '$i=Get-Clipboard -Format Image;' +
        'if($i -eq $null){exit 3};' +
        '$i.Save(' + JSON.stringify(outPath) + ',[System.Drawing.Imaging.ImageFormat]::Png);' +
        'exit 0';
      cp.exec('powershell -NoProfile -STA -Command "' + ps.replace(/"/g, '\\"') + '"',
        { windowsHide: true, timeout: 25000 }, function (err, stdout, stderr) {
          if (err && err.code === 3) { cb({ ok: false, error: 'The clipboard holds no image. Copy an image first, or use "Choose file…".' }); return; }
          if (err) { cb({ ok: false, error: 'Clipboard read failed: ' + String(stderr || err.message).slice(0, 200) }); return; }
          if (!SY.exists(outPath)) { cb({ ok: false, error: 'Clipboard image could not be saved.' }); return; }
          cb({ ok: true, path: outPath, source: 'clipboard' });
        });
      return;
    }

    /* macOS */
    var script = [
      'set png to the clipboard as «class PNGf»',
      'set f to open for access POSIX file ' + JSON.stringify(outPath) + ' with write permission',
      'set eof of f to 0',
      'write png to f',
      'close access f'
    ].join('\n');
    cp.exec('osascript -e ' + JSON.stringify(script), { timeout: 25000 }, function (err, stdout, stderr) {
      if (err) {
        var msg = String(stderr || err.message);
        if (/not of the class|Can't make|error -1700|clipboard/i.test(msg)) {
          cb({ ok: false, error: 'The clipboard holds no image. Copy an image first, or use "Choose file…".' });
        } else {
          cb({ ok: false, error: 'Clipboard read failed: ' + msg.slice(0, 200) });
        }
        return;
      }
      if (!SY.exists(outPath)) { cb({ ok: false, error: 'Clipboard image could not be saved.' }); return; }
      cb({ ok: true, path: outPath, source: 'clipboard' });
    });
  };

  /* A timestamped PNG path inside the panel's capture folder. */
  SYStills.tempPath = function (sub, name) {
    var path = SY.require('path');
    var dir = path.join((SY.paths.captures || SY.paths.temp || SY.paths.root), sub || 'stills');
    SY.mkdirp(dir);
    var stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return path.join(dir, (name || 'still') + '_' + stamp + '_' + Math.floor(Math.random() * 9000 + 1000) + '.png');
  };

  return SYStills;
})(window.SY);
