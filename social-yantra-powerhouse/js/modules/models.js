/* ==========================================================================
 * Module 12 — AI Models & Language
 * Custom download location (any folder you choose) · model library state ·
 * transcription language (English / हिन्दी / Hinglish) · local runtime wiring.
 * ========================================================================== */
window.ModelsMod = (function (SY) {
  'use strict';

  var models = [];
  var filterMode = 'all';

  function el(id) { return document.getElementById(id); }
  function dir() { return (el('mdDir').value || '').trim(); }

  function init() {
    if (!el('mdList')) { return; }

    el('mdDir').value = SY.settings.whisperModelDir || SY.settings.modelLastDir || (SY.paths.models || '');
    el('mdBrowse').addEventListener('click', function () {
      SY.pickFolder(function (f) {
        if (!f) { return; }
        el('mdDir').value = f;
        useDir(f);
      });
    });
    el('mdUse').addEventListener('click', function () { useDir(dir()); });
    el('mdDir').addEventListener('change', function () { useDir(dir()); });
    el('mdReveal').addEventListener('click', function () {
      if (!SY.hasNode) { SY.toast('Demo mode', 'warn'); return; }
      var d = dir();
      if (!d) { SY.toast('Choose a folder first', 'warn'); return; }
      SY.mkdirp(d);
      SY.reveal(d);
    });
    el('mdMove').addEventListener('click', moveHere);
    el('mdVerify').addEventListener('click', verifyAll);
    el('mdCancel').addEventListener('click', function () {
      if (SYDownloader.cancel()) { SY.toast('Download cancelled'); }
      hideActive();
    });

    /* language card */
    SYLang.renderPicker(el('mdLangRow'), function (l) { langNote(l); checkModel(); });
    el('mdTranslate').addEventListener('change', function () {
      SY.settings.whisper.translate = this.checked;
      SY.saveSettings();
      langNote(SYLang.current());
    });
    el('mdPrompt').addEventListener('change', function () {
      SY.settings.whisper.customPrompt = this.value;
      SY.saveSettings();
    });

    /* model filters */
    var chips = el('mdFilter').querySelectorAll('.chip');
    for (var i = 0; i < chips.length; i++) {
      (function (chip) {
        chip.addEventListener('click', function () {
          for (var k = 0; k < chips.length; k++) { chips[k].classList.toggle('on', chips[k] === chip); }
          filterMode = chip.getAttribute('data-mf');
          render();
        });
      })(chips[i]);
    }

    /* runtime bindings */
    el('whMode').addEventListener('change', function () {
      SY.settings.whisperMode = this.value;
      SY.saveSettings();
      syncRuntime();
      checkModel();
    });
    [['whEndpoint', 'whisperEndpoint'], ['whCli', 'whisperCli'], ['whModel', 'whisperModel']].forEach(function (pair) {
      el(pair[0]).addEventListener('change', function () {
        SY.settings[pair[1]] = this.value;
        SY.saveSettings();
        checkModel();
        if (window.FillerMod) { FillerMod.updateEngineTag(); }
      });
    });
    el('whCliBrowse').addEventListener('click', function () {
      SY.pickFile(['whisper-cli', 'whisper-cli.exe', 'main', 'main.exe', ''], function (f) {
        if (f) { el('whCli').value = f; SY.settings.whisperCli = f; SY.saveSettings(); }
      });
    });
    el('whModelBrowse').addEventListener('click', function () {
      SY.pickFile(['bin', 'ggml', ''], function (f) {
        if (f) { el('whModel').value = f; SY.settings.whisperModel = f; SY.saveSettings(); checkModel(); }
      });
    });
    el('whTest').addEventListener('click', testEngine);
    el('whHelp').addEventListener('click', help);

    syncRuntime();
    refresh();
  }

  function syncRuntime() {
    var mode = SY.settings.whisperMode;
    el('whMode').value = mode;
    el('whEndpoint').value = SY.settings.whisperEndpoint || '';
    el('whCli').value = SY.settings.whisperCli || '';
    el('whModel').value = SY.settings.whisperModel || '';
    el('whServerRow').style.display = mode === 'server' ? 'flex' : 'none';
    el('whCliRows').style.display = mode === 'cli' ? 'block' : 'none';
    el('mdTranslate').checked = !!SY.settings.whisper.translate;
    el('mdPrompt').value = SY.settings.whisper.customPrompt || '';
    langNote(SYLang.current());
    checkModel();
  }

  function langNote(l) {
    var n = el('mdLangNote');
    if (!n) { return; }
    var r = SYLang.resolve();
    n.innerHTML = SY.esc(l.note) + ' <span class="mini">whisper flag: <b>-l ' + SY.esc(r.language) + '</b>' +
      (r.prompt ? ' + prompt' : '') + (r.translate ? ' + -tr' : '') + '</span>';
  }

  function checkModel() {
    var warn = el('mdModelWarn');
    if (!warn) { return; }
    var msg = SY.settings.whisperMode === 'cli' ? SYLang.modelWarning(SY.settings.whisperModel) : '';
    warn.style.display = msg ? 'block' : 'none';
    warn.className = 'note warn mt8';
    warn.textContent = msg;
  }

  /* ------------------- custom location ------------------- */
  function useDir(d) {
    if (!d) { SY.toast('Type or browse to a folder first', 'warn'); return; }
    var tag = el('mdDirTag'), stat = el('mdDirStat');
    tag.textContent = 'checking…';
    tag.className = 'tag muted';
    SYDownloader.checkDir(d, function (r) {
      if (!r.ok) {
        tag.textContent = 'invalid';
        tag.className = 'tag err';
        stat.innerHTML = '❌ ' + SY.esc(r.error);
        SY.toast(r.error, 'err', 6000);
        return;
      }
      SY.settings.whisperModelDir = d;
      SY.settings.modelLastDir = d;
      SY.saveSettings();
      tag.textContent = r.created ? 'created' : 'ready';
      tag.className = 'tag ok';
      var free = r.freeBytes ? (' · ' + SY.fmtBytes(r.freeBytes) + ' free') : '';
      stat.innerHTML = '✅ <b>' + SY.esc(d) + '</b> — writable' + free +
        ' · ' + r.models + ' model(s) already here' + (r.created ? ' (folder created)' : '');
      SY.log('model folder → ' + d, 'ok');
      refresh();
    });
  }

  function moveHere() {
    var to = dir();
    if (!to) { SY.toast('Set the destination folder first', 'warn'); return; }
    SY.pickFolder(function (from) {
      if (!from) { return; }
      if (from === to) { SY.toast('That is already the destination', 'warn'); return; }
      var bar = el('mdMoveProg');
      bar.style.display = 'block';
      bar.querySelector('div').style.width = '4%';
      SYDownloader.relocate(from, to, function (err, r) {
        if (err) {
          bar.style.display = 'none';
          SY.toast('Move failed: ' + err.message, 'err', 6000);
          return;
        }
        bar.querySelector('div').style.width = '100%';
        SY.toast(r.moved + ' model(s) copied to ' + to, 'ok', 5000);
        el('mdDirStat').innerHTML = '✅ Moved <b>' + r.moved + '</b> model(s) from ' + SY.esc(from) + '.';
        setTimeout(function () { bar.style.display = 'none'; }, 800);
        refresh();
      }, function (done, total) {
        bar.querySelector('div').style.width = Math.round((done / total) * 100) + '%';
      });
    });
  }

  function verifyAll() {
    var d = dir();
    if (!d) { SY.toast('Choose a folder first', 'warn'); return; }
    var ok = 0, bad = [];
    models.forEach(function (m) {
      if (m.state === 'ok') { ok++; }
      else if (m.state === 'corrupt' || m.state === 'partial') { bad.push(m.id + ' (' + m.state + ')'); }
    });
    el('mdDirStat').innerHTML = bad.length
      ? '⚠️ ' + ok + ' model(s) intact · <b>' + SY.esc(bad.join(', ')) + '</b> — re-download those.'
      : '✅ ' + ok + ' model(s) verified on disk (size check passed).';
    SY.toast(bad.length ? (bad.length + ' model file(s) need re-downloading') : (ok + ' model(s) verified'), bad.length ? 'warn' : 'ok');
  }

  /* ------------------- list + download ------------------- */
  function refresh() {
    models = SYDownloader.list(dir());
    var onDisk = models.filter(function (m) { return m.downloaded; });
    el('mdSum').textContent = onDisk.length
      ? '— ' + onDisk.length + ' on disk · ' + SY.fmtBytes(SYDownloader.totalOnDisk(dir()))
      : '— none downloaded yet';
    render();
    checkModel();
  }

  function render() {
    var list = el('mdList');
    var shown = models.filter(function (m) {
      if (filterMode === 'multi') { return !m.en; }
      if (filterMode === 'en') { return m.en; }
      if (filterMode === 'disk') { return m.downloaded; }
      return true;
    });
    if (!shown.length) {
      list.innerHTML = '<div class="empty">Nothing matches that filter.</div>';
      return;
    }
    var langId = SYLang.current().id;
    var needsMulti = langId === 'hi' || langId === 'hinglish' || langId === 'auto';
    list.innerHTML = shown.map(function (m) {
      var i = models.indexOf(m);
      var tag = m.state === 'ok' ? '<span class="tag ok">on disk · ' + SY.fmtBytes(m.diskSize) + '</span>'
        : m.state === 'partial' ? '<span class="tag warn">partial</span>'
        : m.state === 'corrupt' ? '<span class="tag err">corrupt</span>'
        : '<span class="tag muted">' + SY.fmtBytes(m.size) + '</span>';
      var badge = (needsMulti && !m.en) ? '<span class="tag info">Hinglish</span> ' : '';
      if (m.star) { badge += '<span class="tag ok">recommended</span> '; }
      return '<div class="list-row">' +
        '<span class="grow"><b>' + SY.esc(m.name) + '</b> ' + badge + '<span class="mini">' + SY.esc(m.id) + '</span><br>' +
        '<span class="mini">' + SY.esc(m.note || '') + '</span></span>' +
        tag +
        (m.state === 'ok'
          ? '<button class="btn sm" data-use="' + i + '">Use</button>'
          : '<button class="btn sm primary" data-dl="' + i + '">Download</button>') +
        '</div>';
    }).join('');
    var rows = list.querySelectorAll('[data-dl],[data-use]');
    for (var b = 0; b < rows.length; b++) {
      rows[b].addEventListener('click', function (e) {
        var idx = +(e.currentTarget.getAttribute('data-dl') !== null && e.currentTarget.getAttribute('data-dl') !== undefined
          ? e.currentTarget.getAttribute('data-dl') : e.currentTarget.getAttribute('data-use'));
        var m = models[idx];
        if (!m) { return; }
        if (e.currentTarget.hasAttribute('data-use')) { useModel(m); }
        else { download(m, dir()); }
      });
    }
  }

  function useModel(m) {
    SY.settings.whisperModel = m.path;
    if (SY.settings.whisperMode === 'server') { SY.settings.whisperMode = 'cli'; }
    SY.saveSettings();
    syncRuntime();
    SY.toast('Using ' + m.id + ' for CLI transcription', 'ok');
  }

  function download(model, d) {
    if (!d) { SY.toast('Choose a custom download location first', 'warn'); return; }
    if (!SY.hasNode) { SY.toast('Demo mode — downloads need the installed panel', 'warn'); return; }
    if (SYLang.resolve().needsMultilingual && model.en) {
      SY.toast('That model is English-only — ' + SYLang.current().label + ' needs a multilingual model', 'warn', 6000);
    }
    var card = el('mdActiveCard');
    var bar = el('mdProg').querySelector('div');
    var stat = el('mdActiveStat');
    card.style.display = 'block';
    el('mdActiveName').textContent = model.id;
    stat.textContent = 'Connecting to huggingface.co… → ' + d;
    SY.log('model download start: ' + model.id + ' → ' + d);

    SYDownloader.download(model, d, function (err, dest) {
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
      SY.settings.whisperModel = dest;
      if (!SY.settings.whisperCli && SY.settings.whisperMode === 'server') { SY.settings.whisperMode = 'cli'; }
      SY.saveSettings();
      syncRuntime();
      setTimeout(hideActive, 6000);
      refresh();
    }, function (got, total) {
      var pct = total ? Math.round(got / total * 100) : 0;
      bar.style.width = pct + '%';
      stat.textContent = pct + '% · ' + SY.fmtBytes(got) + (total ? ' of ' + SY.fmtBytes(total) : '') + ' → ' + d;
    });
  }

  function hideActive() {
    el('mdActiveCard').style.display = 'none';
    el('mdProg').querySelector('div').style.width = '0%';
  }

  function testEngine() {
    var stat = el('whStat');
    stat.textContent = 'Testing…';
    SYWhisper.test(function (r) {
      stat.innerHTML = r.ok
        ? '✅ Engine online (' + SY.esc(r.note || 'ok') + ')'
        : '❌ ' + SY.esc(r.error);
      if (r.ok && r.warning) { stat.innerHTML += ' <span class="tag warn">model</span> ' + SY.esc(r.warning); }
      stat.style.color = r.ok ? 'var(--ok)' : 'var(--err)';
      checkModel();
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
      'Language: English = .en models are fine. हिन्दी / Hinglish need a\n' +
      'MULTILINGUAL model (ggml-base.bin / small.bin / large) — the panel\n' +
      'also sends a Hinglish prompt so code-mixed lines decode correctly.\n\n' +
      'Everything runs on your machine — no cloud, no fees.';
    SY.toast(msg.replace(/\n/g, ' · '), 'warn', 9000);
    SY.log(msg);
  }

  return { init: init, refresh: refresh };
})(window.SY);
