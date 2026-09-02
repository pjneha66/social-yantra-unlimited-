/* ==========================================================================
 * Module 15 — Quick Effects
 * One-click Premiere effects on the selection, plus custom effects and
 * custom .prfpset presets (installed where Premiere can see them).
 * ========================================================================== */
window.QuickFxMod = (function (SY) {
  'use strict';

  /* id → { name, match:[…], props: {displayName: default} } */
  var CATALOG = [
    { id: 'warp', name: 'Warp Stabilizer', match: ['Warp Stabilizer'], props: {},
      note: 'Premiere analyses it in the background — watch the Effect Controls panel.' },
    { id: 'lumetri', name: 'Lumetri Color', match: ['Lumetri Color'], props: {},
      note: 'Attach only; pick the LUT / grade in Effect Controls.' },
    { id: 'blur', name: 'Gaussian Blur', match: ['Gaussian Blur'],
      props: { Blurriness: 12, 'Repeat Edge Pixels': true } },
    { id: 'shadow', name: 'Drop Shadow', match: ['Drop Shadow'],
      props: { Distance: 12, Softness: 10, Opacity: 0.6 } },
    { id: 'crop', name: 'Crop', match: ['Crop'],
      props: { Left: 0, Right: 0, Top: 0, Bottom: 0 } },
    { id: 'ultrakey', name: 'Ultra Key', match: ['Ultra Key'], props: {},
      note: 'Eyedrop the key colour in Effect Controls — colour values are not scriptable.' },
    { id: 'basic3d', name: 'Basic 3D', match: ['Basic 3D'],
      props: { Swivel: 20, Tilt: 0, 'Distance to Image': 120 } },
    { id: 'cornerpin', name: 'Corner Pin', match: ['Corner Pin'], props: {},
      note: 'Drag the corner handles in the Program monitor afterwards.' },
    { id: 'dirblur', name: 'Directional Blur', match: ['Directional Blur'],
      props: { Direction: 0, 'Blur Length': 12 } },
    { id: 'bw', name: 'Black & White', match: ['Black & White', 'Tint'], props: {},
      note: 'Falls back to Tint on builds without the Image Control set.' }
  ];

  var known = [];   // effect names this Premiere build reports
  var loaded = false;

  function el(id) { return document.getElementById(id); }

  function init() {
    if (!el('fxGrid')) { return; }

    renderGrid();
    el('fxRefreshList').addEventListener('click', function () { loadEffects(true); });
    el('fxApply').addEventListener('click', function () { apply(); });
    el('fxInspect').addEventListener('click', inspect);
    el('fxAddCustom').addEventListener('click', addCustom);
    el('fxPresetBrowse').addEventListener('click', browsePreset);
    el('fxPresetInstall').addEventListener('click', installPreset);
    el('fxPresetApply').addEventListener('click', applyPreset);
    el('fxPresetScan').addEventListener('click', scanPresets);

    loadEffects(false);
  }

  /* ---------------------------- the effect grid ---------------------------- */
  function renderGrid() {
    var box = el('fxGrid');
    box.innerHTML = CATALOG.map(function (fx) {
      return '<div class="ep fx-tile" data-fx="' + fx.id + '" title="' + SY.esc(fx.note || '') + '">' +
        '<b>' + SY.esc(fx.name) + '</b>' +
        '<i>' + SY.esc(shortNote(fx)) + '</i></div>';
    }).join('');
    var tiles = box.querySelectorAll('.fx-tile');
    for (var i = 0; i < tiles.length; i++) {
      tiles[i].addEventListener('click', function (e) {
        var t = e.currentTarget;
        t.classList.toggle('on');
        syncState();
      });
    }
    syncState();
  }

  function shortNote(fx) {
    var keys = [];
    for (var k in fx.props) { if (fx.props.hasOwnProperty(k)) { keys.push(k + ' ' + fx.props[k]); } }
    return keys.length ? keys.join(' · ') : (fx.note ? fx.note.split('—')[0].trim() : 'attach only');
  }

  function selectedIds() {
    var out = [];
    var tiles = el('fxGrid').querySelectorAll('.fx-tile');
    for (var i = 0; i < tiles.length; i++) {
      if (tiles[i].classList.contains('on')) { out.push(tiles[i].getAttribute('data-fx')); }
    }
    return out;
  }

  function byId(id) {
    for (var i = 0; i < CATALOG.length; i++) { if (CATALOG[i].id === id) { return CATALOG[i]; } }
    return null;
  }

  /* Resolve the display name this build actually uses (Lumetri vs Lumetri Color,
   * Black & White vs Tint). Falls back to the canonical name. */
  function resolveName(fx) {
    if (!known.length) { return fx.match[0]; }
    for (var m = 0; m < fx.match.length; m++) {
      for (var k = 0; k < known.length; k++) {
        if (known[k].toLowerCase() === fx.match[m].toLowerCase()) { return known[k]; }
      }
    }
    for (var m2 = 0; m2 < fx.match.length; m2++) {
      for (var k2 = 0; k2 < known.length; k2++) {
        if (known[k2].toLowerCase().indexOf(fx.match[m2].toLowerCase()) !== -1) { return known[k2]; }
      }
    }
    return fx.match[0];
  }

  function syncState() {
    var ids = selectedIds();
    el('fxApply').disabled = !ids.length;
    el('fxCount').textContent = ids.length ? ids.length + ' effect(s) queued' : 'Pick one or more effects';
    var stat = el('fxStat');
    if (!ids.length) { stat.textContent = 'Nothing queued — click the tiles above.'; return; }
    var notes = [];
    for (var i = 0; i < ids.length; i++) {
      var fx = byId(ids[i]);
      if (fx && fx.note) { notes.push(fx.name + ': ' + fx.note); }
    }
    stat.innerHTML = notes.length ? notes.map(SY.esc).join('<br>') : 'Parameters will be written straight after each effect lands.';
  }

  /* --------------------------- the effect list --------------------------- */
  function loadEffects(force) {
    var tag = el('fxListTag');
    SY.call('listEffects', null, function (r) {
      if (!r.ok) {
        tag.className = 'tag err';
        tag.textContent = 'QE list unavailable';
        el('fxStat').textContent = '❌ ' + r.error;
        return;
      }
      known = r.data.video || [];
      loaded = true;
      tag.className = 'tag ok';
      tag.textContent = known.length + ' video effects · ' + (r.data.audio || []).length + ' audio';
      el('fxList').innerHTML = known.length
        ? known.map(function (n) { return '<div class="list-row"><span class="grow">' + SY.esc(n) + '</span></div>'; }).join('')
        : '<div class="empty">This build returned no effect list.</div>';
      if (force) { SY.toast('Effect list refreshed', 'ok', 2200); }
      syncState();
    });
  }

  /* ------------------------------- apply ------------------------------- */
  function apply() {
    var ids = selectedIds();
    if (!ids.length) { SY.toast('Pick at least one effect', 'warn'); return; }
    var btn = el('fxApply');
    var effects = [];
    for (var i = 0; i < ids.length; i++) {
      var fx = byId(ids[i]);
      if (!fx) { continue; }
      effects.push({ name: resolveName(fx), props: fx.props });
    }
    var custom = (el('fxCustom').value || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var props = parseProps(el('fxCustomProps').value || '');

    SY.busy(btn, true);
    el('fxStat').textContent = 'Applying…';
    SY.call('applyEffect', { effects: effects, custom: custom, props: props }, function (r) {
      SY.busy(btn, false);
      if (!r.ok) { el('fxStat').textContent = '❌ ' + r.error; SY.toast(r.error, 'err', 7000); return; }
      var d = r.data;
      el('fxStat').innerHTML = '✅ Applied <b>' + d.applied + '</b> effect(s) across ' + d.clips + ' clip(s)' +
        (d.unknown && d.unknown.length ? '<br><span style="color:var(--warn)">not found here: ' + d.unknown.map(SY.esc).join(', ') + '</span>' : '') +
        (d.propNotes && d.propNotes.length ? '<br><span class="mini">' + d.propNotes.map(SY.esc).join('<br>') + '</span>' : '');
      SY.toast(d.applied + ' effect(s) applied', 'ok', 4000);
      SY.log('applyEffect: ' + JSON.stringify(d).slice(0, 300), 'ok');
    });
  }

  /* "Blurriness=12, Opacity=0.5" → { Blurriness: 12, Opacity: 0.5 } */
  function parseProps(txt) {
    var out = {};
    var parts = String(txt || '').split(/[,;]/);
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i].split('=');
      if (kv.length < 2) { continue; }
      var k = kv[0].trim(), v = kv.slice(1).join('=').trim();
      if (!k) { continue; }
      if (/^(true|false)$/i.test(v)) { out[k] = /^true$/i.test(v); continue; }
      if (/^-?[0-9.]+$/.test(v)) { out[k] = parseFloat(v); continue; }
      out[k] = v;
    }
    return out;
  }

  function addCustom() {
    var name = (el('fxCustom').value || '').trim();
    if (!name) { SY.toast('Type an effect name first, e.g. "Camera Blur"', 'warn'); return; }
    if (loaded && known.length && known.map(function (s) { return s.toLowerCase(); }).indexOf(name.toLowerCase()) === -1) {
      SY.toast('"' + name + '" is not in this build\'s effect list — trying anyway', 'warn', 4200);
    }
    SY.call('applyEffect', { effects: [], custom: [name], props: parseProps(el('fxCustomProps').value || '') }, function (r) {
      if (!r.ok) { el('fxStat').textContent = '❌ ' + r.error; SY.toast(r.error, 'err', 6500); return; }
      el('fxStat').innerHTML = '✅ <b>' + SY.esc(name) + '</b> applied to ' + r.data.clips + ' clip(s)';
      SY.toast(name + ' applied', 'ok');
    });
  }

  function inspect() {
    SY.call('listClipEffects', null, function (r) {
      if (!r.ok) { el('fxStat').textContent = '❌ ' + r.error; return; }
      if (!r.data.length) { el('fxStat').textContent = 'Select a clip to inspect its effects.'; return; }
      el('fxStat').innerHTML = r.data.map(function (c) {
        return '<b>' + SY.esc(c.name) + '</b> @' + c.start.toFixed(2) + 's — ' +
          (c.effects.length ? c.effects.map(SY.esc).join(', ') : 'no effects');
      }).join('<br>');
    });
  }

  /* -------------------------- custom presets -------------------------- */
  /* Premiere cannot apply a .prfpset through ExtendScript, so the panel scans
   * for them, installs them next to the extension (Premiere reads the panel's
   * presets/effects folder), and best-effort applies by name. */
  function presetFolders() {
    var list = [];
    if (!SY.hasNode) { return list; }
    var path = SY.require('path');
    try {
      var ext = SY.cs.getSystemPath(SystemPath.EXTENSION);
      if (ext) { list.push(path.join(ext, 'presets', 'effects')); }
    } catch (e) {}
    var docs = '';
    try { docs = path.join(SY.require('os').homedir(), 'Documents', 'Adobe', 'Premiere Pro'); } catch (e2) {}
    if (docs && SY.exists(docs)) {
      var vers = SY.walk(docs, 0);
      for (var i = 0; i < vers.length; i++) {
        if (vers[i].dir) {
          list.push(vers[i].path);
          list.push(path.join(vers[i].path, 'Presets', 'Effects'));
        }
      }
    }
    return list;
  }

  function scanPresets() {
    var box = el('fxPresetList');
    if (!SY.hasNode) { box.innerHTML = '<div class="empty">Demo mode — install the panel to scan presets.</div>'; return; }
    var seen = {}, files = [];
    var folders = presetFolders();
    for (var i = 0; i < folders.length; i++) {
      var found = SY.walk(folders[i], 1);
      for (var j = 0; j < found.length; j++) {
        if (found[j].dir || !/\.prfpset$/i.test(found[j].name)) { continue; }
        if (seen[found[j].path]) { continue; }
        seen[found[j].path] = true;
        files.push(found[j]);
      }
    }
    if (!files.length) {
      box.innerHTML = '<div class="empty">No .prfpset files found. Save a preset in Premiere (Effect Controls › preset menu › Save Preset), or pick one below.</div>';
      return;
    }
    window.__fxPresets = files;
    box.innerHTML = files.map(function (f, n) {
      return '<div class="list-row" data-i="' + n + '" style="cursor:pointer">' +
        '<span class="grow">' + SY.esc(f.name) + '</span>' +
        '<span class="mini">' + SY.esc(f.path) + '</span></div>';
    }).join('');
    var rows = box.querySelectorAll('.list-row');
    for (var k = 0; k < rows.length; k++) {
      rows[k].addEventListener('click', function (e) {
        var idx = +e.currentTarget.getAttribute('data-i');
        var f = window.__fxPresets[idx];
        if (!f) { return; }
        el('fxPresetPath').value = f.path;
        el('fxPresetName').value = f.name.replace(/\.prfpset$/i, '');
      });
    }
  }

  function browsePreset() {
    SY.pickFile(['prfpset', ''], function (f) {
      if (!f) { return; }
      el('fxPresetPath').value = f;
      el('fxPresetName').value = f.replace(/^.*[\\/]/, '').replace(/\.prfpset$/i, '');
    });
  }

  function installPreset() {
    var src = (el('fxPresetPath').value || '').trim();
    var stat = el('fxPresetStat');
    if (!src || !SY.exists(src)) { SY.toast('Pick a .prfpset file first', 'warn'); return; }
    var dests = presetFolders();
    var target = '';
    for (var i = 0; i < dests.length; i++) { if (/presets[\\/]effects$/i.test(dests[i])) { target = dests[i]; break; } }
    if (!target) { target = dests[0]; }
    if (!target) { stat.textContent = '❌ Cannot locate the extension folder.'; return; }
    var path = SY.require('path'), fs = SY.require('fs');
    SY.mkdirp(target);
    var dst = path.join(target, path.basename(src));
    try { fs.copyFileSync(src, dst); }
    catch (e) { stat.textContent = '❌ Copy failed: ' + e.message; SY.toast(e.message, 'err', 6000); return; }
    stat.innerHTML = '✅ Installed to <span class="mini">' + SY.esc(dst) + '</span><br>' +
      'Restart Premiere, then the preset appears in the <b>Effects</b> panel.';
    SY.toast('Preset installed', 'ok', 4500);
    if (SY.hasNode) { SY.reveal(dst); }
  }

  function applyPreset() {
    var name = (el('fxPresetName').value || '').trim();
    var stat = el('fxPresetStat');
    if (!name) { SY.toast('Enter the preset name as it shows in the Effects panel', 'warn'); return; }
    SY.call('applyEffect', { effects: [], custom: [], preset: name }, function (r) {
      if (!r.ok) {
        stat.innerHTML = '⚠️ Could not apply "' + SY.esc(name) + '" by script — Premiere blocks .prfpset application. ' +
          'Use <b>Install preset</b> and drag it from the Effects panel.';
        SY.toast('Presets must be dragged from the Effects panel', 'warn', 6000);
        return;
      }
      stat.innerHTML = '✅ "' + SY.esc(name) + '" applied to ' + r.data.clips + ' clip(s)';
      SY.toast('Preset applied', 'ok');
    });
  }

  return { init: init, parseProps: parseProps, resolveName: resolveName, CATALOG: CATALOG, refresh: loadEffects };
})(window.SY);
