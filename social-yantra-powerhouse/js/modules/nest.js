/* ==========================================================================
 * Module 5 — Nest Saver (premium backup engine)
 * ========================================================================== */
window.NestMod = (function (SY) {
  'use strict';

  var backups = []; // [{dir,name,date,preset,meta}]
  var selected = -1;

  function root() {
    if (SY.settings.nestRoot && SY.exists(SY.settings.nestRoot)) { return SY.settings.nestRoot; }
    return SY.paths.nests || '';
  }

  function init() {
    var go = document.getElementById('nsBackup');
    if (!go) { return; }
    document.getElementById('nsRoot').value = root();
    go.addEventListener('click', backup);
    document.getElementById('nsBrowse').addEventListener('click', function () {
      SY.pickFolder(function (f) {
        if (!f) { return; }
        SY.settings.nestRoot = f; SY.saveSettings();
        document.getElementById('nsRoot').value = f;
        refreshList();
      });
    });
    document.getElementById('nsRefresh').addEventListener('click', refreshList);
    document.getElementById('nsRestore').addEventListener('click', restore);
    document.getElementById('nsReveal').addEventListener('click', function () {
      if (selected >= 0 && backups[selected]) { SY.reveal(backups[selected].dir); }
      else { SY.toast('Select a backup first', 'warn'); }
    });
    refreshList();
  }

  function backup() {
    var btn = document.getElementById('nsBackup');
    var prog = document.getElementById('nsProg'), bar = prog.querySelector('div');
    var stat = document.getElementById('nsStat');
    var preset = document.getElementById('nsPreset').value;
    var wantThumb = document.getElementById('nsThumb').checked;
    var wantProj = document.getElementById('nsProjCopy').checked;

    var r = root();
    if (!r || !SY.hasNode) { SY.toast('Demo mode — backup engine needs the installed panel', 'warn'); return; }
    var path = SY.require('path');

    SY.busy(btn, true);
    prog.style.display = 'block'; bar.style.width = '6%';
    stat.textContent = 'Preparing backup…';

    SY.call('seqInfo', null, function (res) {
      if (!res.ok) { done('No active sequence: ' + res.error); return; }
      var info = res.data;
      var stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      var safe = info.name.replace(/[\\\/:*?"<>|]/g, '_');
      var dir = path.join(r, safe + '_' + stamp);
      SY.mkdirp(dir);

      var ext = preset === 'prores' ? '.mov' : '.mp4';
      var eprName = preset === 'prores' ? 'ProRes422HQ.epr' : 'H264-Master.epr';
      var eprPath = '';
      try {
        var extDir = SY.cs.getSystemPath(SystemPath.EXTENSION);
        eprPath = path.join(extDir, 'presets', eprName);
      } catch (e) { eprPath = ''; }
      if (!SY.exists(eprPath)) { done('Export preset missing: ' + eprPath); return; }

      bar.style.width = '20%';
      stat.textContent = 'Exporting (bundled ' + (preset === 'prores' ? 'ProRes 422 HQ' : 'H.264 Master') + ' EPR)…';

      SY.call('nestBackup', {
        eprPath: eprPath,
        videoPath: path.join(dir, safe + ext),
        thumbPath: wantThumb ? path.join(dir, 'thumbnail.png') : '',
        projPath: wantProj ? path.join(dir, safe + '_project.prproj') : '',
        metaPath: path.join(dir, 'meta.json'),
        presetName: preset === 'prores' ? 'Apple ProRes 422 HQ' : 'H.264 Master 40 Mbps'
      }, function (r2) {
        if (!r2.ok) { done('Backup failed: ' + r2.error); return; }
        bar.style.width = '100%';
        var d = r2.data;
        var lines = [];
        if (d.video) { lines.push('export queued'); }
        if (d.thumb) { lines.push('thumbnail saved'); }
        if (d.projectCopy) { lines.push('project bundled'); }
        stat.innerHTML = '✅ Backup created: <b>' + lines.join(' · ') + '</b>' +
          (d.exportMethod ? '<br><span class="mini">' + SY.esc(d.exportMethod) + '</span>' : '') +
          (d.warnings && d.warnings.length ? '<br><span style="color:var(--warn)">' + d.warnings.join(' · ') + '</span>' : '');
        SY.toast('Nest backup saved to library', 'ok', 4200);
        SY.log('nestBackup: ' + JSON.stringify(d), 'ok');
        SY.busy(btn, false);
        setTimeout(function () { prog.style.display = 'none'; }, 700);
        refreshList();
      });

      function done(msg) {
        SY.busy(btn, false);
        prog.style.display = 'none';
        stat.textContent = 'Backup failed.';
        SY.toast(msg, 'err', 5500);
      }
    });
  }

  function refreshList() {
    var list = document.getElementById('nsList');
    var r = root();
    backups = [];
    if (!r || !SY.hasNode) {
      list.innerHTML = '<div class="empty">No backups yet.</div>';
      return;
    }
    var path = SY.require('path');
    try {
      SY.require('fs').readdirSync(r, { withFileTypes: true }).forEach(function (ent) {
        if (!ent.isDirectory()) { return; }
        var dir = path.join(r, ent.name);
        var metaTxt = SY.readText(path.join(dir, 'meta.json'));
        var meta = {};
        try { meta = metaTxt ? JSON.parse(metaTxt) : {}; } catch (e) {}
        backups.push({
          dir: dir,
          name: meta.name || ent.name,
          date: meta.created || '',
          preset: meta.preset || '',
          meta: meta,
          hasVideo: SY.exists(path.join(dir, (meta.name || 'x').replace(/[\\\/:*?"<>|]/g, '_') + '.mov')) || SY.exists(path.join(dir, (meta.name || 'x').replace(/[\\\/:*?"<>|]/g, '_') + '.mp4')),
          hasProj: SY.exists(path.join(dir, ent.name + '_project.prproj')) || SY.walk(dir, 0).some(function (f) { return !f.dir && /\.prproj$/.test(f.name); })
        });
      });
    } catch (e) { /* root may not exist yet */ }

    backups.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    if (!backups.length) {
      list.innerHTML = '<div class="empty">No backups yet — back up a nested sequence or the active sequence.</div>';
      return;
    }
    list.innerHTML = backups.map(function (b, i) {
      return '<div class="list-row" data-i="' + i + '" style="cursor:pointer">' +
        '<span class="grow"><b>' + SY.esc(b.name) + '</b><br><span class="mini">' + SY.esc(String(b.date).slice(0, 24)) + (b.preset ? ' · ' + SY.esc(b.preset) : '') + '</span></span>' +
        (b.hasVideo ? '<span class="tag ok">video</span>' : '') +
        (b.meta.duration ? '<span class="tag muted">' + b.meta.duration.toFixed(1) + 's</span>' : '') +
        '</div>';
    }).join('');
    var rows = list.querySelectorAll('.list-row');
    for (var k = 0; k < rows.length; k++) {
      rows[k].addEventListener('click', function (e) {
        selected = +e.currentTarget.getAttribute('data-i');
        for (var x = 0; x < rows.length; x++) { rows[x].style.background = ''; }
        e.currentTarget.style.background = 'var(--bg-3)';
      });
    }
  }

  function restore() {
    if (selected < 0 || !backups[selected]) { SY.toast('Select a backup first', 'warn'); return; }
    var b = backups[selected];
    var path = SY.require('path');
    var prproj = null;
    SY.walk(b.dir, 0).some(function (f) {
      if (!f.dir && /\.prproj$/i.test(f.name)) { prproj = f.path; return true; }
      return false;
    });
    if (!prproj) { SY.toast('This backup has no .prproj bundle', 'err'); return; }
    SY.call('nestRestore', { prprojPath: prproj, itemName: b.name, mode: 'sequence' }, function (r) {
      if (!r.ok) { SY.toast(r.error, 'err', 6000); return; }
      SY.toast('Restored "' + b.name + '" at playhead (' + r.data.placedAt + ')', 'ok', 4500);
    });
  }

  return { init: init, refreshList: refreshList };
})(window.SY);
