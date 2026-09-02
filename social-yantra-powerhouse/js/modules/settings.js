/* ==========================================================================
 * Module 10 — Settings & Diagnostics
 * ========================================================================== */
window.SettingsMod = (function (SY) {
  'use strict';

  function init() {
    if (!document.getElementById('stEnv')) { return; }
    document.getElementById('stFfmpeg').value = SY.settings.ffmpegPath || '';
    document.getElementById('stFfmpegBrowse').addEventListener('click', function () {
      SY.pickFile(['exe', 'ffmpeg', ''], function (f) {
        if (f) {
          document.getElementById('stFfmpeg').value = f;
          SY.settings.ffmpegPath = f; SY.saveSettings();
          testFfmpeg();
        }
      });
    });
    document.getElementById('stFfmpeg').addEventListener('change', function () {
      SY.settings.ffmpegPath = this.value; SY.saveSettings(); testFfmpeg();
    });
    document.getElementById('stFfmpegTest').addEventListener('click', testFfmpeg);
    document.getElementById('stOpenDocs').addEventListener('click', function () {
      if (SY.hasNode) { SY.mkdirp(SY.paths.root); SY.reveal(SY.paths.root); } else { SY.toast('Demo mode', 'warn'); }
    });
    document.getElementById('stOpenLogs').addEventListener('click', function () {
      if (SY.hasNode) {
        var p = SY.require('path').join(SY.paths.root, 'logs', 'jsx-log.txt');
        if (!SY.exists(p)) { SY.writeText(p, 'Social Yantra log\n'); }
        SY.reveal(p);
      } else { SY.toast('Demo mode', 'warn'); }
    });
    document.getElementById('stReset').addEventListener('click', function () {
      if (confirm('Reset all panel settings?')) {
        localStorage.removeItem('sySettings');
        SY.loadSettings();
        SY.toast('Settings reset', 'ok');
        refresh();
      }
    });
    refresh();
  }

  function testFfmpeg() {
    var tag = document.getElementById('stFfmpegTag');
    tag.className = 'tag muted'; tag.textContent = 'testing…';
    SY.testFFmpeg(function (r) {
      if (r.ok) { tag.className = 'tag ok'; tag.textContent = 'ffmpeg ' + r.version; }
      else { tag.className = 'tag err'; tag.textContent = 'not found'; }
    });
  }

  function refresh() {
    var env = document.getElementById('stEnv');
    var nodeVer = 'unavailable';
    if (SY.hasNode) { try { nodeVer = 'v' + SY.require('process').versions.node; } catch (e) { nodeVer = 'unknown'; } }
    var extPath = '';
    try { extPath = SY.cs.getSystemPath(SystemPath.EXTENSION) || '(browser demo)'; } catch (e) { extPath = '(browser demo)'; }
    env.innerHTML =
      kv('Host', SY.inCEP ? 'Adobe Premiere Pro (CEP)' : 'Browser (demo mode)') +
      kv('Node engine', nodeVer) +
      kv('OS', SY.os === 'win' ? 'Windows' : 'macOS') +
      kv('Panel folder', extPath) +
      kv('Whisper mode', SY.settings.whisperMode) +
      kv('Panel version', '1.0.0');

    var paths = document.getElementById('stPaths');
    paths.innerHTML =
      kv('Data root', SY.paths.root || '(demo)') +
      kv('Nest library', SY.settings.nestRoot || SY.paths.nests || '(demo)') +
      kv('Freeze frames', SY.paths.freeze || '(demo)') +
      kv('Whisper models', SY.settings.whisperModelDir || SY.paths.models || '(demo)') +
      kv('Assets library', SY.settings.assetsRoot || SY.paths.library || '(demo)');

    function kv(k, v) { return '<span class="k">' + SY.esc(k) + '</span><span class="v">' + SY.esc(v) + '</span>'; }
  }

  return { init: init, refresh: refresh };
})(window.SY);
