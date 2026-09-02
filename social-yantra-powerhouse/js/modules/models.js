/* ==========================================================================
 * Module 9 — Whisper AI Models manager (custom download location!)
 * ========================================================================== */
window.ModelsMod = (function (SY) {
  'use strict';

  function init() {
    if (!document.getElementById('mdList')) { return; }

    document.getElementById('mdDir').value = SY.settings.whisperModelDir || (SY.paths.models || '');
    document.getElementById('mdBrowse').addEventListener('click', function () {
      SY.pickFolder(function (f) {
        if (!f) { return; }
        SY.settings.whisperModelDir = f; SY.saveSettings();
        document.getElementById('mdDir').value = f;
        refresh();
      });
    });
    document.getElementById('mdCancel').addEventListener('click', function () {
      if (SYDownloader.cancel()) { SY.toast('Download cancelled'); }
      hideActive();
    });

    // runtime bindings
    document.getElementById('whMode').addEventListener('change', function () {
      SY.settings.whisperMode = this.value;
      SY.saveSettings();
      syncRuntime();
    });
    ['whEndpoint', 'whCli', 'whModel'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', function () {
        SY.settings[id === 'whEndpoint' ? 'whisperEndpoint' : id === 'whCli' ? 'whisperCli' : 'whisperModel'] = this.value;
        SY.saveSettings();
        if (window.FillerMod) { FillerMod.updateEngineTag(); }
      });
    });
    document.getElementById('whCliBrowse').addEventListener('click', function () {
      SY.pickFile(['whisper-cli', 'whisper-cli.exe', 'main', 'main.exe', ''], function (f) {
        if (f) { document.getElementById('whCli').value = f; SY.settings.whisperCli = f; SY.saveSettings(); }
      });
    });
    document.getElementById('whModelBrowse').addEventListener('click', function () {
      SY.pickFile(['bin', 'ggml', ''], function (f) {
        if (f) { document.getElementById('whModel').value = f; SY.settings.whisperModel = f; SY.saveSettings(); }
      });
    });
    document.getElementById('whTest').addEventListener('click', testEngine);
    document.getElementById('whHelp').addEventListener('click', help);
    syncRuntime();
  }

  function syncRuntime() {
    var mode = SY.settings.whisperMode;
    document.getElementById('whMode').value = mode;
    document.getElementById('whEndpoint').value = SY.settings.whisperEndpoint || '';
    document.getElementById('whCli').value = SY.settings.whisperCli || '';
    document.getElementById('whModel').value = SY.settings.whisperModel || '';
    document.getElementById('whServerRow').style.display = mode === 'server' ? 'flex' : 'none';
    document.getElementById('whCliRows').style.display = mode === 'cli' ? 'block' : 'none';
  }

  function refresh() {
    var dir = document.getElementById('mdDir').value || '';
    var models = SYDownloader.list(dir);
    var list = document.getElementById('mdList');
    list.innerHTML = models.map(function (m, i) {
      return '<div class="list-row">' +
        '<span class="grow"><b>' + SY.esc(m.name) + '</b> <span class="mini">' + m.id + '</span><br>' +
        '<span class="mini">' + SY.esc(m.note || '') + '</span></span>' +
        '<span class="tag muted">' + SY.fmtBytes(m.size) + '</span>' +
        (m.downloaded
          ? '<span class="tag ok">on disk</span>'
          : '<button class="btn sm primary" data-dl="' + i + '">Download</button>') +
        '</div>';
    }).join('');
    var btns = list.querySelectorAll('[data-dl]');
    for (var b = 0; b < btns.length; b++) {
      btns[b].addEventListener('click', function (e) {
        var m = models[+e.target.getAttribute('data-dl')];
        if (m) { download(m, dir); }
      });
    }
  }

  function download(model, dir) {
    if (!dir) { SY.toast('Choose a custom download location first', 'warn'); return; }
    if (!SY.hasNode) { SY.toast('Demo mode — downloads need the installed panel', 'warn'); return; }
    var card = document.getElementById('mdActiveCard');
    var bar = document.querySelector('#mdProg > div');
    var stat = document.getElementById('mdActiveStat');
    card.style.display = 'block';
    document.getElementById('mdActiveName').textContent = model.id;
    stat.textContent = 'Connecting to huggingface.co…';
    SY.log('model download start: ' + model.id + ' → ' + dir);

    SYDownloader.download(model, dir, function (err, dest) {
      if (err) {
        stat.textContent = '❌ ' + err.message;
        SY.toast('Download failed: ' + err.message, 'err', 5500);
        SY.log('model download failed: ' + err.message, 'err');
        setTimeout(hideActive, 3500);
        refresh();
        return;
      }
      bar.style.width = '100%';
      stat.innerHTML = '✅ Saved to <b>' + SY.esc(dest) + '</b>';
      SY.toast('Model downloaded to your custom location', 'ok', 5000);
      SY.log('model downloaded: ' + dest, 'ok');
      // offer to use it in CLI mode
      SY.settings.whisperModel = dest;
      if (!SY.settings.whisperCli && SY.settings.whisperMode === 'server') { SY.settings.whisperMode = 'cli'; }
      SY.saveSettings();
      syncRuntime();
      setTimeout(hideActive, 6000);
      refresh();
    }, function (got, total) {
      var pct = total ? Math.round(got / total * 100) : 0;
      bar.style.width = pct + '%';
      stat.textContent = pct + '% · ' + SY.fmtBytes(got) + (total ? ' of ' + SY.fmtBytes(total) : '');
    });
  }

  function hideActive() {
    document.getElementById('mdActiveCard').style.display = 'none';
    document.querySelector('#mdProg > div').style.width = '0%';
  }

  function testEngine() {
    var stat = document.getElementById('whStat');
    stat.textContent = 'Testing…';
    SYWhisper.test(function (r) {
      stat.innerHTML = r.ok
        ? '✅ Engine online (' + SY.esc(r.note || 'ok') + ')'
        : '❌ ' + SY.esc(r.error);
      stat.style.color = r.ok ? 'var(--ok)' : 'var(--err)';
      if (window.FillerMod) { FillerMod.updateEngineTag(); }
    });
  }

  function help() {
    var msg = 'Two fully-local options:\n\n' +
      '1) SERVER (recommended): run whisper.cpp server:\n' +
      '   whisper-server -m ggml-base.bin --port 8080\n' +
      '   (or LM Studio / LocalAI with an OpenAI-compatible endpoint)\n' +
      '   Then set endpoint http://127.0.0.1:8080\n\n' +
      '2) CLI: install whisper.cpp, browse to whisper-cli / main binary,\n' +
      '   pick a downloaded .bin model, done.\n\n' +
      'Everything runs on your machine — no cloud, no fees.';
    SY.toast(msg.replace(/\n/g, ' · '), 'warn', 9000);
    SY.log(msg);
  }

  return { init: init, refresh: refresh };
})(window.SY);
