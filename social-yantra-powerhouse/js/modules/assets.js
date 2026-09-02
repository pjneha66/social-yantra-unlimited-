/* ==========================================================================
 * Module 6 — Responsive Local Assets Library
 * ========================================================================== */
window.AssetsMod = (function (SY) {
  'use strict';

  var items = [];       // [{path,name,ext,dir}]
  var categories = ['All'];
  var currentCat = 'All';
  var KINDS = {
    video: ['.mp4', '.mov', '.mxf', '.avi', '.mkv', '.webm', '.m4v', '.mpg', '.mpeg', '.wmv'],
    audio: ['.wav', '.mp3', '.aiff', '.aif', '.m4a', '.aac', '.ogg', '.flac'],
    image: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.tif', '.tiff', '.bmp', '.psd', '.ai'],
    mogrt: ['.mogrt'],
    srt: ['.srt', '.vtt'],
    lut: ['.cube', '.3dl', '.look', '.lut']
  };
  var ICONS = {
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>',
    audio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    mogrt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 7h8M8 12h8M8 17h5"/></svg>',
    srt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    lut: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor" stroke="none"/></svg>',
    other: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>'
  };

  function kindOf(ext) {
    for (var k in KINDS) { if (KINDS[k].indexOf(ext) !== -1) { return k; } }
    return 'other';
  }

  function init() {
    if (!document.getElementById('asScan')) { return; }
    document.getElementById('asRoot').value = SY.settings.assetsRoot || (SY.paths.library || '');
    document.getElementById('asBrowse').addEventListener('click', function () {
      SY.pickFolder(function (f) {
        if (!f) { return; }
        SY.settings.assetsRoot = f; SY.saveSettings();
        document.getElementById('asRoot').value = f;
        scan();
      });
    });
    document.getElementById('asScan').addEventListener('click', scan);
    document.getElementById('asSearch').addEventListener('input', render);
    scan();
  }

  function scan() {
    var rootDir = document.getElementById('asRoot').value;
    if (!rootDir || !SY.hasNode) {
      items = demoItems(); renderCats(); render(); return;
    }
    items = [];
    var path = SY.require('path');
    SY.walk(rootDir, 2).forEach(function (f) {
      if (f.dir) { return; }
      var rel = path.relative(rootDir, f.path);
      var cat = rel.split(path.sep)[0];
      if (cat === f.name) { cat = 'Root'; }
      items.push({ path: f.path, name: f.name, ext: f.ext, cat: cat, kind: kindOf(f.ext) });
    });
    renderCats();
    render();
    SY.log('assets scan: ' + items.length + ' files in ' + rootDir);
  }

  function demoItems() {
    return [
      { path: '/demo/assets/LowerThird.mogrt', name: 'LowerThird.mogrt', ext: '.mogrt', cat: 'MOGRTs', kind: 'mogrt' },
      { path: '/demo/assets/TealOrange.cube', name: 'TealOrange.cube', ext: '.cube', cat: 'LUTs', kind: 'lut' },
      { path: '/demo/assets/episode_captions.srt', name: 'episode_captions.srt', ext: '.srt', cat: 'Captions', kind: 'srt' },
      { path: '/demo/assets/intro_sting.wav', name: 'intro_sting.wav', ext: '.wav', cat: 'Audio', kind: 'audio' },
      { path: '/demo/assets/whoosh.mp3', name: 'whoosh.mp3', ext: '.mp3', cat: 'Audio', kind: 'audio' },
      { path: '/demo/assets/logo.png', name: 'logo.png', ext: '.png', cat: 'Images', kind: 'image' },
      { path: '/demo/assets/broll_city.mp4', name: 'broll_city.mp4', ext: '.mp4', cat: 'Video', kind: 'video' }
    ];
  }

  function renderCats() {
    var cats = {};
    items.forEach(function (it) { cats[it.cat] = true; });
    categories = ['All'].concat(Object.keys(cats).sort());
    var box = document.getElementById('asCats');
    box.innerHTML = categories.map(function (c) {
      return '<span class="chip' + (c === currentCat ? ' on' : '') + '" data-c="' + SY.esc(c) + '">' + SY.esc(c) + '</span>';
    }).join('');
    var chips = box.querySelectorAll('.chip');
    for (var i = 0; i < chips.length; i++) {
      chips[i].addEventListener('click', function (e) {
        currentCat = e.target.getAttribute('data-c');
        renderCats(); render();
      });
    }
  }

  function render() {
    var grid = document.getElementById('asGrid');
    var q = (document.getElementById('asSearch').value || '').toLowerCase();
    var show = items.filter(function (it) {
      if (currentCat !== 'All' && it.cat !== currentCat) { return false; }
      if (q && it.name.toLowerCase().indexOf(q) === -1) { return false; }
      return true;
    });
    var html = show.map(function (it, i) {
      var thumbStyle = (it.kind === 'image' && SY.hasNode)
        ? ' style="background-image:url(file://' + encodeURI(it.path.replace(/\\/g, '/')) + ')"' : '';
      return '<div class="asset" data-i="' + i + '" title="' + SY.esc(it.path) + '">' +
        '<div class="thumb"' + thumbStyle + '>' + (thumbStyle ? '' : ICONS[it.kind]) + '</div>' +
        '<span class="tag muted kinds">' + it.kind + '</span>' +
        '<div class="nm">' + SY.esc(it.name) + '</div></div>';
    }).join('');
    grid.innerHTML = html || '<div class="empty" style="grid-column:1/-1">No assets. Set a library folder and scan.</div>';
    var cards = grid.querySelectorAll('.asset');
    for (var k = 0; k < cards.length; k++) {
      cards[k].addEventListener('click', function (e) { place(e.currentTarget.getAttribute('data-i'), show); });
    }
  }

  function place(i, show) {
    var it = show[+i];
    if (!it) { return; }
    var action = document.getElementById('asAction').value;

    if (it.kind === 'lut') { installLut(it); return; }
    if (it.kind === 'mogrt' && action === 'playhead') {
      SY.call('mogrtToTimeline', { path: it.path }, function (r) {
        r.ok ? SY.toast('MOGRT placed at playhead', 'ok') : SY.toast(r.error, 'err');
      });
      return;
    }
    if (it.kind === 'srt') {
      SY.call('assetImport', { paths: [it.path], binName: 'Social Yantra Captions' }, function (r) {
        r.ok ? SY.toast('SRT imported — drag onto a caption track, or use the Word Pop tab', 'ok', 4500) : SY.toast(r.error, 'err');
      });
      return;
    }
    if (action === 'playhead') {
      SY.call('assetInsertAtPlayhead', { path: it.path }, function (r) {
        r.ok ? SY.toast('Inserted "' + it.name + '" at playhead', 'ok') : SY.toast(r.error, 'err');
      });
    } else {
      SY.call('assetImport', { paths: [it.path], binName: 'Social Yantra' }, function (r) {
        r.ok ? SY.toast('Imported "' + it.name + '"', 'ok') : SY.toast(r.error, 'err');
      });
    }
  }

  function installLut(it) {
    if (!SY.hasNode) { SY.toast('Demo mode — LUT install needs the panel', 'warn'); return; }
    var path = SY.require('path'), fs = SY.require('fs');
    var commonFiles = SY.env.COMMONPROGRAMFILES;
    var candidates = SY.os === 'win'
      ? (commonFiles ? [path.join(commonFiles, 'Adobe', 'Common', 'LUTs', 'Creative')] : [])
      : ['/Library/Application Support/Adobe/Common/LUTs/Creative', path.join(SY.home, 'Library', 'Application Support', 'Adobe', 'Common', 'LUTs', 'Creative')];
    for (var i = 0; i < candidates.length; i++) {
      try {
        if (!fs.existsSync(candidates[i])) { fs.mkdirSync(candidates[i], { recursive: true }); }
        fs.copyFileSync(it.path, path.join(candidates[i], it.name));
        SY.toast('LUT installed to Lumetri → Creative: ' + it.name, 'ok', 4500);
        SY.log('LUT installed: ' + candidates[i]);
        return;
      } catch (e) { /* try next */ }
    }
    SY.toast('Could not install LUT — check permissions', 'err');
  }

  return { init: init, refresh: function () { if (!items.length) { scan(); } } };
})(window.SY);
