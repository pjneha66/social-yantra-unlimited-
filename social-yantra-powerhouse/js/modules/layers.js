/* ==========================================================================
 * Module 18 — Layer Tools
 * Text layer · Adjustment layer · Solid layer (with colour picker) ·
 * move layer up / down the video stack.
 * Text and solids are rendered to PNG by ffmpeg (js/core/stills.js) and then
 * placed by ExtendScript on a fresh track above the selection.
 * ========================================================================== */
window.LayersMod = (function (SY) {
  'use strict';

  function el(id) { return document.getElementById(id); }

  function init() {
    if (!el('lyTextAdd')) { return; }

    /* ---------------- text layer ---------------- */
    el('lyText').value = SY.settings.layers.text || 'YOUR TEXT';
    el('lyTextColor').value = SY.settings.layers.color || '#ffffff';
    el('lyTextSize').value = SY.settings.layers.size || 0;
    el('lyTextOutline').value = SY.settings.layers.outline || 0;
    el('lyTextShadow').checked = SY.settings.layers.shadow !== false;
    el('lyTextFont').value = SY.settings.layers.font || el('lyTextFont').value;
    el('lyTextAdd').addEventListener('click', addText);
    el('lyTextPreview').addEventListener('click', previewText);
    ['lyText', 'lyTextColor', 'lyTextSize', 'lyTextOutline', 'lyTextShadow', 'lyTextFont'].forEach(function (id) {
      el(id).addEventListener('change', function () {
        SY.settings.layers.text = el('lyText').value;
        SY.settings.layers.color = el('lyTextColor').value;
        SY.settings.layers.size = +el('lyTextSize').value || 0;
        SY.settings.layers.outline = +el('lyTextOutline').value || 0;
        SY.settings.layers.shadow = el('lyTextShadow').checked;
        SY.settings.layers.font = el('lyTextFont').value;
        SY.saveSettings();
      });
    });

    /* ---------------- solid layer ---------------- */
    el('lySolidColor').value = SY.settings.layers.solid || '#7c5cff';
    el('lySolidAlpha').value = SY.settings.layers.alpha === undefined ? 1 : SY.settings.layers.alpha;
    el('lySolidAlphaV').textContent = (+el('lySolidAlpha').value).toFixed(2);
    el('lySolidHex').value = SY.settings.layers.solid || '#7c5cff';
    el('lySolidColor').addEventListener('input', function () {
      el('lySolidHex').value = this.value;
      SY.settings.layers.solid = this.value; SY.saveSettings();
    });
    el('lySolidHex').addEventListener('change', function () {
      var hex = window.SYStills.css(this.value);
      this.value = hex;
      el('lySolidColor').value = hex;
      SY.settings.layers.solid = hex; SY.saveSettings();
    });
    el('lySolidAlpha').addEventListener('input', function () {
      el('lySolidAlphaV').textContent = (+this.value).toFixed(2);
      SY.settings.layers.alpha = +this.value; SY.saveSettings();
    });
    el('lySolidAdd').addEventListener('click', addSolid);
    /* swatch shortcuts */
    var sw = ['#7c5cff', '#29d3c8', '#ff6070', '#ffb454', '#3ddc97', '#000000', '#ffffff'];
    el('lySwatches').innerHTML = sw.map(function (c) {
      return '<span class="swatch" data-c="' + c + '" style="background:' + c + '" title="' + c + '"></span>';
    }).join('');
    var sws = el('lySwatches').querySelectorAll('.swatch');
    for (var i = 0; i < sws.length; i++) {
      sws[i].addEventListener('click', function (e) {
        var c = e.currentTarget.getAttribute('data-c');
        el('lySolidColor').value = c;
        el('lySolidHex').value = c;
        SY.settings.layers.solid = c; SY.saveSettings();
      });
    }

    /* ---------------- adjustment layer ---------------- */
    el('lyAdjPer').addEventListener('click', function () { adj('perClip'); });
    el('lyAdjSpan').addEventListener('click', function () { adj('span'); });
    el('lyAdjAdopt').addEventListener('click', adopt);

    /* ---------------- move up / down ---------------- */
    el('lyUp').addEventListener('click', function () { move(1); });
    el('lyDown').addEventListener('click', function () { move(-1); });
    el('lyAmount').value = 1;
    el('lyRefresh').addEventListener('click', refreshStack);

    el('lyDuration').value = SY.settings.layers.duration || 5;
    refreshStack();
  }

  function dur() { return Math.max(0.2, +el('lyDuration').value || 5); }
  function stat(txt) { el('lyStat').innerHTML = txt; }

  /* ------------------------------- text ------------------------------- */
  function textOpts(outPath, seq) {
    return {
      text: el('lyText').value || 'YOUR TEXT',
      width: seq ? seq.width : 1920,
      height: seq ? seq.height : 1080,
      size: (+el('lyTextSize').value || 0) || (seq ? Math.round(seq.height / 9) : 120),
      color: el('lyTextColor').value || '#ffffff',
      outline: +el('lyTextOutline').value || 0,
      shadow: el('lyTextShadow').checked,
      family: el('lyTextFont').value || '',
      outPath: outPath
    };
  }

  function seqInfo(cb) {
    SY.call('seqInfo', null, function (r) { cb(r.ok ? r.data : null); });
  }

  function addText() {
    if (!SY.hasNode) { SY.toast('Demo mode — text rendering needs the installed panel', 'warn'); return; }
    var btn = el('lyTextAdd');
    SY.busy(btn, true);
    stat('Rendering the text layer…');
    seqInfo(function (seq) {
      var out = window.SYStills.tempPath('layers', 'text');
      window.SYStills.makeText(textOpts(out, seq), function (err, path) {
        if (err) {
          SY.busy(btn, false);
          stat('❌ ' + SY.esc(err.message));
          SY.toast('Text render failed', 'err', 7000);
          return;
        }
        place(path, btn, 'Text layer');
      });
    });
  }

  function previewText() {
    if (!SY.hasNode) { SY.toast('Demo mode', 'warn'); return; }
    seqInfo(function (seq) {
      var out = window.SYStills.tempPath('layers', 'text-preview');
      window.SYStills.makeText(textOpts(out, seq), function (err, path) {
        if (err) { stat('❌ ' + SY.esc(err.message)); return; }
        stat('✅ Preview written<br><span class="mini">' + SY.esc(path) + '</span>');
        SY.reveal(path);
      });
    });
  }

  /* ------------------------------- solid ------------------------------- */
  function addSolid() {
    if (!SY.hasNode) { SY.toast('Demo mode — solid rendering needs the installed panel', 'warn'); return; }
    var btn = el('lySolidAdd');
    SY.busy(btn, true);
    stat('Rendering the solid…');
    seqInfo(function (seq) {
      var out = window.SYStills.tempPath('layers', 'solid');
      window.SYStills.makeSolid({
        color: el('lySolidColor').value || '#000000',
        alpha: +el('lySolidAlpha').value,
        width: seq ? seq.width : 1920,
        height: seq ? seq.height : 1080,
        outPath: out
      }, function (err, path) {
        if (err) {
          SY.busy(btn, false);
          stat('❌ ' + SY.esc(err.message));
          SY.toast('Solid render failed', 'err', 7000);
          return;
        }
        place(path, btn, 'Solid layer');
      });
    });
  }

  /* Shared: hand a rendered PNG to ExtendScript as a layer. */
  function place(path, btn, label) {
    SY.call('addStillLayer', { path: path, durationSec: dur(), mode: el('lySpan').value, track: 'top' }, function (r) {
      SY.busy(btn, false);
      if (!r.ok) { stat('❌ ' + r.error); SY.toast(r.error, 'err', 6500); return; }
      stat('✅ ' + label + ' on <b>V' + (r.data.track + 1) + '</b> · ' +
        r.data.span.start.toFixed(2) + 's → ' + r.data.span.end.toFixed(2) + 's (' + r.data.mode + ')' +
        '<br><span class="mini">' + SY.esc(path) + '</span>');
      SY.toast(label + ' placed', 'ok', 3600);
      refreshStack();
    });
  }

  /* -------------------------- adjustment layer -------------------------- */
  function adj(mode) {
    SY.call('adjAdd', { mode: mode }, function (r) {
      if (!r.ok) { stat('❌ ' + r.error); SY.toast(r.error, 'err', 7000); return; }
      stat('✅ Placed <b>' + r.data.placed + '</b> adjustment layer(s) (' +
        (mode === 'span' ? 'spanning the selection' : 'one per clip') + ')' + (r.data.note ? ' — ' + r.data.note : ''));
      SY.toast('Adjustment layers placed', 'ok');
      refreshStack();
    });
  }

  function adopt() {
    SY.call('adjFindTemplate', {}, function (r) {
      if (!r.ok) { stat('❌ ' + r.error); return; }
      stat.innerHTML = r.data.found
        ? '✅ Template found: <b>' + SY.esc(r.data.name) + '</b>'
        : 'No template yet — in Premiere: <b>File › New › Adjustment Layer</b>, then Adopt again.';
    });
  }

  /* --------------------------- move up / down --------------------------- */
  function move(dir) {
    var btn = el(dir > 0 ? 'lyUp' : 'lyDown');
    SY.busy(btn, true);
    SY.call('moveLayerTrack', { dir: dir, amount: Math.max(1, +el('lyAmount').value || 1) }, function (r) {
      SY.busy(btn, false);
      if (!r.ok) { stat('❌ ' + r.error); SY.toast(r.error, 'err', 6000); return; }
      stat('✅ Moved <b>' + r.data.moved + '</b> clip(s) ' + (dir > 0 ? 'up' : 'down') + ' by ' + r.data.amount +
        (r.data.fallback ? ' <span class="mini">(' + r.data.fallback + ' via re-place)</span>' : '') +
        (r.data.blocked && r.data.blocked.length ? '<br><span style="color:var(--warn)">' +
          r.data.blocked.slice(0, 3).map(SY.esc).join('<br>') + '</span>' : ''));
      SY.toast(r.data.moved + ' clip(s) moved', 'ok', 3200);
      refreshStack();
    });
  }

  function refreshStack() {
    var box = el('lyStack');
    if (!box) { return; }
    SY.call('layerStack', null, function (r) {
      if (!r.ok) { box.innerHTML = '<div class="empty">' + SY.esc(r.error) + '</div>'; return; }
      var tracks = r.data.tracks.slice().reverse();   // V on top, like the timeline
      box.innerHTML = tracks.map(function (t) {
        return '<div class="list-row">' +
          '<span class="tag ' + (t.clips ? 'info' : 'muted') + '">' + t.label + '</span>' +
          '<span class="grow">' + t.clips + ' clip(s)</span>' +
          (t.locked ? '<span class="tag err">locked</span>' : '') +
          (t.hidden ? '<span class="tag warn">hidden</span>' : '') +
          '</div>';
      }).join('') || '<div class="empty">No video tracks.</div>';
    });
  }

  return { init: init, refresh: refreshStack };
})(window.SY);
