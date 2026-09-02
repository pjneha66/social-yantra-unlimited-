/* ==========================================================================
 * Module 16 — AI Image (background removal)
 * Selected clip frame or an image file → rembg (U2Net / ISNet) → cut-out PNG
 * back onto the timeline. 100% local.
 * ========================================================================== */
window.AIImageMod = (function (SY) {
  'use strict';

  var lastInput = '';
  var lastOutput = '';
  var logLines = [];

  function el(id) { return document.getElementById(id); }
  function log(s) {
    logLines.push(String(s).replace(/\s+$/, ''));
    if (logLines.length > 240) { logLines = logLines.slice(-180); }
    var box = el('aiLog');
    if (box) {
      box.textContent = logLines.join('\n');
      box.scrollTop = 1e9;
    }
  }

  function init() {
    if (!el('aiStatus')) { return; }

    el('aiCheck').addEventListener('click', function () { detect(true); });
    el('aiInstall').addEventListener('click', install);
    el('aiClipFrame').addEventListener('click', fromClip);
    el('aiPickFile').addEventListener('click', fromFile);
    el('aiRun').addEventListener('click', run);
    el('aiPlace').addEventListener('click', place);
    el('aiReveal').addEventListener('click', function () {
      if (lastOutput && SY.hasNode) { SY.reveal(lastOutput); }
      else { SY.toast('Nothing processed yet', 'warn'); }
    });
    el('aiLogClear').addEventListener('click', function () { logLines = []; el('aiLog').textContent = ''; });

    /* model chips */
    var models = window.SYRembg.modelStatus();
    el('aiModels').innerHTML = models.map(function (m) {
      return '<span class="chip' + (m.id === (SY.settings.aiimage.model || 'u2net') ? ' on' : '') +
        '" data-model="' + m.id + '" title="' + SY.esc(m.note) + '">' + SY.esc(m.label) + '</span>';
    }).join('');
    var chips = el('aiModels').querySelectorAll('.chip');
    for (var i = 0; i < chips.length; i++) {
      chips[i].addEventListener('click', function (e) {
        var all = el('aiModels').querySelectorAll('.chip');
        for (var k = 0; k < all.length; k++) { all[k].classList.remove('on'); }
        e.currentTarget.classList.add('on');
        SY.settings.aiimage.model = e.currentTarget.getAttribute('data-model');
        SY.saveSettings();
        showModelState();
      });
    }

    el('aiAlpha').checked = !!SY.settings.aiimage.alphaMatting;
    el('aiAlpha').addEventListener('change', function () {
      SY.settings.aiimage.alphaMatting = this.checked; SY.saveSettings();
    });

    detect(false);
    showModelState();
  }

  function currentModel() {
    var on = el('aiModels').querySelector('.chip.on');
    return on ? on.getAttribute('data-model') : (SY.settings.aiimage.model || 'u2net');
  }

  function showModelState() {
    var id = currentModel();
    var m = window.SYRembg.modelById(id);
    var present = SY.hasNode ? window.SYRembg.hasModel(id) : false;
    var tag = el('aiModelTag');
    tag.className = 'tag ' + (present ? 'ok' : 'muted');
    tag.textContent = present ? 'weights on disk' : 'downloads on first run';
    el('aiModelNote').innerHTML = '<b>' + SY.esc(m.label) + '</b> — ' + SY.esc(m.note) +
      '<br><span class="mini">stored in ' + SY.esc(SY.hasNode ? window.SYRembg.modelDir() : '~/.u2net') +
      ' · ~' + m.size + ' MB' + (present ? ' · already downloaded' : ' · downloads automatically the first time') + '</span>';
  }

  function detect(force) {
    var tag = el('aiStatus');
    tag.className = 'tag muted';
    tag.textContent = 'checking…';
    if (!SY.hasNode) {
      tag.className = 'tag warn';
      tag.textContent = 'demo mode';
      el('aiStat').textContent = 'Install the panel into Premiere to run rembg (it needs Node + Python).';
      el('aiInstall').disabled = true;
      return;
    }
    window.SYRembg.detect(function (r) {
      if (r.ok) {
        tag.className = 'tag ok';
        tag.textContent = 'rembg ' + r.version + ' · ' + r.label;
        el('aiInstall').style.display = 'none';
        el('aiStat').innerHTML = 'Ready. ' + SY.esc(r.bin) + (r.args.length ? ' ' + r.args.join(' ') : '');
      } else {
        tag.className = 'tag err';
        tag.textContent = 'not installed';
        el('aiInstall').style.display = '';
        el('aiStat').innerHTML = 'rembg is not installed yet. One click installs it locally with pip:<br>' +
          '<span class="mini">' + SY.esc(window.SYRembg.installHint()) + '</span>';
      }
      el('aiRun').disabled = !r.ok;
      showModelState();
    }, force);
  }

  function install() {
    var btn = el('aiInstall');
    SY.busy(btn, true);
    el('aiStat').textContent = 'Installing rembg + onnxruntime (a few minutes the first time)…';
    log('Installing rembg…');
    window.SYRembg.install(log, function (err, r) {
      SY.busy(btn, false);
      if (err) {
        el('aiStat').innerHTML = '❌ ' + SY.esc(err.message).replace(/\n/g, '<br>');
        SY.toast('Install failed — see the log', 'err', 8000);
        return;
      }
      el('aiStat').innerHTML = '✅ <b>rembg ' + SY.esc(r.version) + '</b> ready via ' + SY.esc(r.label);
      SY.toast('rembg installed', 'ok', 4500);
      detect(true);
    });
  }

  /* ------------------------------ inputs ------------------------------ */
  /* Capture the frame under the playhead from the selected clip. */
  function fromClip() {
    var stat = el('aiStat');
    if (!SY.hasNode) { SY.toast('Demo mode — capture needs the installed panel', 'warn'); return; }
    stat.textContent = 'Capturing the frame at the playhead…';
    var path = SY.paths.captures
      ? SY.require('path').join(SY.paths.captures, 'ai', 'clipframe_' + Date.now() + '.png')
      : '';
    SY.call('captureFrameTo', { path: path }, function (r) {
      if (!r.ok) { stat.textContent = '❌ ' + r.error; SY.toast(r.error, 'err', 6000); return; }
      setInput(r.data.path, 'selected clip frame @' + r.data.at.toFixed(2) + 's');
      stat.innerHTML = '✅ Captured <b>' + SY.esc(r.data.name || 'frame') + '</b> — press Remove background.';
    });
  }

  function fromFile() {
    SY.pickFile(['png', 'jpg', 'jpeg', 'tif', 'tiff', 'webp', ''], function (f) {
      if (!f) { return; }
      setInput(f, 'image file');
      el('aiStat').innerHTML = '✅ <b>' + SY.esc(f.replace(/^.*[\\/]/, '')) + '</b> — press Remove background.';
    });
  }

  function setInput(p, label) {
    lastInput = p;
    lastOutput = '';
    el('aiInput').value = p;
    el('aiInputLabel').textContent = label || '';
    el('aiRun').disabled = !lastInput;
    el('aiPlace').disabled = true;
    el('aiOutTag').className = 'tag muted';
    el('aiOutTag').textContent = 'no cut-out yet';
  }

  /* ------------------------------- run ------------------------------- */
  function run() {
    if (!lastInput) { SY.toast('Pick a clip frame or an image file first', 'warn'); return; }
    var btn = el('aiRun');
    var model = currentModel();
    var outDir = SY.paths.cutouts || SY.paths.temp;
    var base = lastInput.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
    var out = SY.require('path').join(outDir, base + '_' + model + '_' + Date.now() + '.png');

    SY.busy(btn, true);
    el('aiStat').textContent = 'Running ' + model + ' (first run downloads the weights)…';
    el('aiOutTag').className = 'tag muted';
    el('aiOutTag').textContent = 'working…';
    log('--- ' + model + ' ---');

    window.SYRembg.run({
      input: lastInput,
      output: out,
      model: model,
      alphaMatting: el('aiAlpha').checked,
      erode: (el('aiErode').value || '').trim(),
      fg: (el('aiFg').value || '').trim(),
      bg: (el('aiBg').value || '').trim()
    }, function (err, outPath) {
      SY.busy(btn, false);
      if (err) {
        el('aiStat').innerHTML = '❌ ' + SY.esc(err.message);
        el('aiOutTag').className = 'tag err';
        el('aiOutTag').textContent = 'failed';
        SY.toast('Background removal failed', 'err', 7000);
        return;
      }
      lastOutput = outPath;
      var kb = 0;
      try { kb = SY.require('fs').statSync(outPath).size; } catch (e) {}
      el('aiOutTag').className = 'tag ok';
      el('aiOutTag').textContent = 'cut-out ready · ' + SY.fmtBytes(kb);
      el('aiStat').innerHTML = '✅ <b>' + SY.esc(outPath.replace(/^.*[\\/]/, '')) + '</b><br>' +
        '<span class="mini">' + SY.esc(outPath) + '</span>';
      el('aiPlace').disabled = false;
      SY.toast('Background removed', 'ok', 3600);
      log('✔ ' + outPath);
    }, log);
  }

  /* Put the cut-out back on the timeline above the source clip. */
  function place() {
    if (!lastOutput) { SY.toast('Run a removal first', 'warn'); return; }
    var dur = Math.max(0.2, +el('aiDuration').value || 5);
    SY.call('pasteImage', { path: lastOutput, durationSec: dur, mode: 'overwrite' }, function (r) {
      if (!r.ok) { el('aiStat').textContent = '❌ ' + r.error; SY.toast(r.error, 'err', 6000); return; }
      el('aiStat').innerHTML = '✅ Cut-out on <b>V' + (r.data.track + 1) + '</b> for ' +
        r.data.duration.toFixed(2) + 's at ' + r.data.at.toFixed(2) + 's';
      SY.toast('Cut-out placed on the timeline', 'ok', 4000);
    });
  }

  return { init: init, refresh: function () { detect(false); } };
})(window.SY);
