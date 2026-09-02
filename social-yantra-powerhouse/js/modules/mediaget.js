/* ==========================================================================
 * Module 17 — Downloader (yt-dlp)
 * YouTube · TikTok · Instagram · Pinterest · quality tiers · audio extract
 * cookies · exact FPS · section download · ffmpeg merge · import to timeline
 * ========================================================================== */
window.MediaGetMod = (function (SY) {
  'use strict';

  var lastFiles = [];
  var logLines = [];
  var busy = false;

  function el(id) { return document.getElementById(id); }
  function log(s) {
    logLines.push(String(s).replace(/\s+$/, ''));
    if (logLines.length > 400) { logLines = logLines.slice(-300); }
    var box = el('dlLog');
    if (box) { box.textContent = logLines.join('\n'); box.scrollTop = 1e9; }
  }

  function init() {
    if (!el('dlUrl')) { return; }

    /* site chips */
    el('dlSites').innerHTML = window.SYMediaGet.SITES.map(function (s) {
      return '<span class="chip" data-site="' + s.id + '" title="' + SY.esc(s.note) + '">' + SY.esc(s.label) + '</span>';
    }).join('');
    bindChips('dlSites', 'data-site', function (id) { siteNote(id); });

    /* quality chips */
    el('dlQuality').innerHTML = window.SYMediaGet.QUALITIES.map(function (q) {
      return '<span class="chip' + (q.id === (SY.settings.get.quality || 'best') ? ' on' : '') +
        '" data-q="' + q.id + '">' + SY.esc(q.label) + '</span>';
    }).join('');
    bindChips('dlQuality', 'data-q', function (id) {
      SY.settings.get.quality = id; SY.saveSettings();
      if (audioOn()) { el('dlStat').textContent = 'Audio-only — the quality tier is ignored.'; }
    });

    /* audio chips */
    el('dlAudio').innerHTML = window.SYMediaGet.AUDIO.filter(function (a) { return a.id !== 'none'; }).map(function (a) {
      return '<span class="chip" data-a="' + a.id + '">' + SY.esc(a.label) + '</span>';
    }).join('') + '<span class="chip on" data-a="none">Keep video</span>';
    bindChips('dlAudio', 'data-a', function (id) {
      SY.settings.get.audio = id; SY.saveSettings();
      el('dlFpsRow').style.display = id === 'none' ? '' : 'none';
      el('dlStat').textContent = id === 'none'
        ? 'Video + audio, merged with ffmpeg.'
        : 'Audio only — ffmpeg re-encodes to ' + id.toUpperCase() + '.';
    });

    /* url → site auto-detect */
    el('dlUrl').addEventListener('change', function () {
      var s = window.SYMediaGet.siteFor(this.value);
      setSiteChip(s.id);
      siteNote(s.id);
    });
    el('dlUrl').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.keyCode === 13) { probe(); }
    });

    /* cookies */
    el('dlCookiesBrowse').addEventListener('click', function () {
      SY.pickFile(['txt', 'json', ''], function (f) {
        if (!f) { return; }
        el('dlCookies').value = f;
        SY.settings.get.cookies = f; SY.saveSettings();
      });
    });
    el('dlBrowser').addEventListener('change', function () {
      SY.settings.get.browser = this.value; SY.saveSettings();
      if (this.value) { el('dlCookies').value = ''; }
    });

    /* save location */
    el('dlDir').value = outDir();
    el('dlDirBrowse').addEventListener('click', function () {
      SY.pickFolder(function (f) {
        if (!f) { return; }
        SY.settings.get.dir = f; SY.saveSettings();
        el('dlDir').value = f;
        SY.toast('Downloads will land in ' + f, 'ok', 3600);
      });
    });
    el('dlReveal').addEventListener('click', function () {
      if (SY.hasNode) { SY.mkdirp(outDir()); SY.reveal(outDir()); } else { SY.toast('Demo mode', 'warn'); }
    });

    /* section */
    el('dlSectionOn').addEventListener('change', function () {
      el('dlSectionRow').style.display = this.checked ? '' : 'none';
    });

    el('dlCheck').addEventListener('click', function () { detect(true); });
    el('dlInstall').addEventListener('click', install);
    el('dlProbe').addEventListener('click', probe);
    el('dlGo').addEventListener('click', download);
    el('dlCancel').addEventListener('click', function () {
      window.SYMediaGet.cancel();
      log('--- cancelled ---');
      SY.toast('Cancel requested', 'warn');
    });
    el('dlImport').addEventListener('click', importAll);
    el('dlLogClear').addEventListener('click', function () { logLines = []; el('dlLog').textContent = ''; });

    /* restore persisted options */
    if (SY.settings.get.browser) { el('dlBrowser').value = SY.settings.get.browser; }
    if (SY.settings.get.cookies) { el('dlCookies').value = SY.settings.get.cookies; }
    if (SY.settings.get.fps) { el('dlFps').value = SY.settings.get.fps; }
    el('dlMerge').checked = SY.settings.get.merge !== false;
    el('dlKeyframes').checked = SY.settings.get.keyframes !== false;
    el('dlNoPlaylist').checked = SY.settings.get.noPlaylist !== false;
    setSiteChip('youtube');

    detect(false);
  }

  function bindChips(containerId, attr, onPick) {
    var box = el(containerId);
    var chips = box.querySelectorAll('.chip');
    for (var i = 0; i < chips.length; i++) {
      chips[i].addEventListener('click', function (e) {
        var all = box.querySelectorAll('.chip');
        for (var k = 0; k < all.length; k++) { all[k].classList.remove('on'); }
        e.currentTarget.classList.add('on');
        onPick(e.currentTarget.getAttribute(attr));
      });
    }
  }

  function chipValue(containerId, attr, fallback) {
    var on = el(containerId).querySelector('.chip.on');
    return on ? on.getAttribute(attr) : fallback;
  }

  function setSiteChip(id) {
    var all = el('dlSites').querySelectorAll('.chip');
    for (var i = 0; i < all.length; i++) {
      all[i].classList.toggle('on', all[i].getAttribute('data-site') === id);
    }
  }

  function siteNote(id) {
    var sites = window.SYMediaGet.SITES;
    for (var i = 0; i < sites.length; i++) {
      if (sites[i].id === id) {
        el('dlSiteNote').textContent = sites[i].note;
        if (id === 'instagram' || id === 'tiktok') {
          el('dlStat').textContent = 'If this fails with a login error, add cookies below.';
        }
        return;
      }
    }
  }

  function audioOn() { return chipValue('dlAudio', 'data-a', 'none') !== 'none'; }
  function outDir() {
    return SY.settings.get.dir || (SY.hasNode ? SY.paths.downloads : '~/Documents/SocialYantra/Downloads');
  }

  /* ---------------------------- engine status ---------------------------- */
  function detect(force) {
    var tag = el('dlStatus');
    tag.className = 'tag muted';
    tag.textContent = 'checking…';
    if (!SY.hasNode) {
      tag.className = 'tag warn';
      tag.textContent = 'demo mode';
      el('dlInstall').disabled = true;
      el('dlGo').disabled = true;
      el('dlStat').textContent = 'Install the panel into Premiere to download (needs Node + Python).';
      return;
    }
    window.SYMediaGet.detect(function (r) {
      if (r.ok) {
        tag.className = 'tag ok';
        tag.textContent = 'yt-dlp ' + r.version + ' · ' + r.label;
        el('dlInstall').style.display = 'none';
        el('dlGo').disabled = false;
        ffmpegStatus();
      } else {
        tag.className = 'tag err';
        tag.textContent = 'not installed';
        el('dlInstall').style.display = '';
        el('dlGo').disabled = true;
        el('dlStat').innerHTML = 'yt-dlp is not installed yet. One click installs it locally with pip:<br>' +
          '<span class="mini">' + SY.esc(window.SYMediaGet.installHint()) + '</span>';
      }
    }, force);
  }

  function ffmpegStatus() {
    var tag = el('dlFfmpegTag');
    SY.testFFmpeg(function (r) {
      if (r.ok) {
        tag.className = 'tag ok';
        tag.textContent = 'ffmpeg ' + r.version + ' · merging on';
      } else {
        tag.className = 'tag warn';
        tag.textContent = 'ffmpeg missing';
        el('dlStat').innerHTML = '⚠️ Without ffmpeg yt-dlp cannot merge separate video+audio streams ' +
          '(the top YouTube tiers) or extract MP3/M4A. Set the path in <b>Settings</b>.';
      }
    });
  }

  function install() {
    var btn = el('dlInstall');
    SY.busy(btn, true);
    el('dlStat').textContent = 'Installing yt-dlp…';
    log('Installing yt-dlp…');
    window.SYMediaGet.install(log, function (err, r) {
      SY.busy(btn, false);
      if (err) {
        el('dlStat').innerHTML = '❌ ' + SY.esc(err.message).replace(/\n/g, '<br>');
        SY.toast('Install failed — see the log', 'err', 8000);
        return;
      }
      el('dlStat').innerHTML = '✅ <b>yt-dlp ' + SY.esc(r.version) + '</b> ready via ' + SY.esc(r.label);
      SY.toast('yt-dlp installed', 'ok', 4000);
      detect(true);
    });
  }

  /* ------------------------------- probe ------------------------------- */
  function probe() {
    var url = (el('dlUrl').value || '').trim();
    if (!window.SYMediaGet.looksLikeUrl(url)) { SY.toast('Paste a full URL (https://…)', 'warn'); return; }
    var btn = el('dlProbe');
    SY.busy(btn, true);
    el('dlStat').textContent = 'Reading the page metadata…';
    window.SYMediaGet.probe(url, function (err, info) {
      SY.busy(btn, false);
      if (err) {
        el('dlStat').innerHTML = '❌ ' + SY.esc(err.message);
        SY.toast('Could not read that URL', 'err', 6500);
        return;
      }
      el('dlStat').innerHTML = '<b>' + SY.esc(info.title) + '</b><br><span class="mini">' +
        SY.esc(info.uploader) + ' · ' + SY.fmtClock(info.duration) +
        (info.max_height ? ' · up to ' + info.max_height + 'p' : '') +
        (info.fps ? ' · ' + info.fps + ' fps' : '') +
        (info.chapters && info.chapters.length ? ' · ' + info.chapters.length + ' chapters' : '') + '</span>';
      if (info.fps && !el('dlFps').value) { el('dlFps').value = Math.round(info.fps); }
      el('dlGo').disabled = false;
      log('probe: ' + info.title + ' (' + info.duration + 's)');
    });
  }

  /* ----------------------------- download ----------------------------- */
  function gather() {
    var section = null;
    if (el('dlSectionOn').checked) {
      section = { start: (el('dlSecA').value || '').trim(), end: (el('dlSecB').value || '').trim() };
    }
    return {
      url: (el('dlUrl').value || '').trim(),
      quality: chipValue('dlQuality', 'data-q', 'best'),
      audio: chipValue('dlAudio', 'data-a', 'none'),
      outDir: outDir(),
      template: '%(title)s [%(id)s].%(ext)s',
      cookies: (el('dlCookies').value || '').trim(),
      cookiesFromBrowser: el('dlBrowser').value || '',
      fps: (el('dlFps').value || '').trim(),
      section: section,
      merge: el('dlMerge').checked,
      keyframes: el('dlKeyframes').checked,
      noPlaylist: el('dlNoPlaylist').checked,
      ffmpegPath: SY.settings.ffmpegPath || ''
    };
  }

  function download() {
    var opts = gather();
    if (!window.SYMediaGet.looksLikeUrl(opts.url)) { SY.toast('Paste a full URL (https://…)', 'warn'); return; }
    if (busy) { SY.toast('A download is already running', 'warn'); return; }

    var args = window.SYMediaGet.buildArgs(opts);
    log('$ yt-dlp ' + window.SYMediaGet.quote(args).join(' '));

    var started = Date.now() - 1000;
    busy = true;
    SY.busy(el('dlGo'), true);
    el('dlCancel').disabled = false;
    el('dlImport').disabled = true;
    el('dlProg').style.display = 'block';
    el('dlProg').querySelector('div').style.width = '2%';
    el('dlStat').textContent = 'Starting…';
    SY.settings.get.dir = opts.outDir;
    SY.settings.get.quality = opts.quality;
    SY.settings.get.audio = opts.audio;
    SY.saveSettings();

    window.SYMediaGet.run(opts, {
      onLog: log,
      onProgress: function (ev) {
        el('dlProg').querySelector('div').style.width = Math.min(100, ev.pct) + '%';
        el('dlStat').textContent = ev.pct.toFixed(1) + '% · ' + (ev.size || '') + ' · ' +
          (ev.speed || '') + (ev.eta ? ' · ETA ' + ev.eta : '');
      },
      onStage: function (ev) {
        if (ev.kind === 'error') { el('dlStat').innerHTML = '❌ ' + SY.esc(ev.message); }
        else { el('dlStat').textContent = '[' + ev.stage + '] ' + (ev.detail || ''); }
      }
    }, function (err, res) {
      busy = false;
      SY.busy(el('dlGo'), false);
      el('dlCancel').disabled = true;
      if (err) {
        el('dlProg').style.display = 'none';
        el('dlStat').innerHTML = '❌ ' + SY.esc(err.message) +
          (el('dlCookies').value || el('dlBrowser').value ? '' : '<br><span class="mini">Login-walled? Add cookies below and try again.</span>');
        SY.toast('Download failed', 'err', 7000);
        return;
      }
      el('dlProg').querySelector('div').style.width = '100%';
      setTimeout(function () { el('dlProg').style.display = 'none'; }, 800);
      window.SYMediaGet.newestFiles(opts.outDir, started, function (files) {
        lastFiles = files;
        var names = files.map(function (f) { return f.name; });
        el('dlList').innerHTML = files.length
          ? files.map(function (f) {
              return '<div class="list-row"><span class="grow">' + SY.esc(f.name) + '</span>' +
                '<span class="tag muted">' + SY.fmtBytes(f.size) + '</span></div>';
            }).join('')
          : '<div class="empty">yt-dlp finished but no new file was found in the folder.</div>';
        el('dlStat').innerHTML = '✅ Downloaded <b>' + (names.length || 0) + '</b> file(s) to ' + SY.esc(opts.outDir);
        el('dlImport').disabled = !files.length;
        SY.toast('Download complete', 'ok', 4000);
        log('done: ' + (res && res.path ? res.path : names.join(', ')));
      });
    });
  }

  /* Bring the downloaded media into Premiere. */
  function importAll() {
    if (!lastFiles.length) { SY.toast('Nothing downloaded yet', 'warn'); return; }
    var paths = lastFiles.map(function (f) { return f.path; });
    var atPlayhead = el('dlImportMode').value === 'playhead';
    if (!atPlayhead) {
      SY.call('assetImport', { paths: paths, binName: 'Downloads' }, function (r) {
        if (!r.ok) { SY.toast(r.error || 'Import failed', 'err', 6000); return; }
        SY.toast('Imported ' + paths.length + ' file(s) into the Downloads bin', 'ok', 4200);
        el('dlStat').innerHTML = '✅ In the project panel: <b>' + paths.length + '</b> file(s)';
      });
      return;
    }
    var i = 0;
    (function next() {
      if (i >= paths.length) {
        SY.toast('Inserted ' + paths.length + ' file(s) at the playhead', 'ok', 4200);
        el('dlStat').innerHTML = '✅ Inserted <b>' + paths.length + '</b> file(s) on the timeline';
        return;
      }
      SY.call('assetInsertAtPlayhead', { path: paths[i++] }, function () { next(); });
    })();
  }

  return { init: init, refresh: function () { detect(false); }, gather: gather };
})(window.SY);
