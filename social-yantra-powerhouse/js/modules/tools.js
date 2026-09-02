/* ==========================================================================
 * Module 8 — Dedicated Timeline Shortcut Tools
 * Adjustment layers · Staircase · Freeze frame · Paste image
 * Flash frame detector · Empty frame checker · QC scan · Clear QC
 * ========================================================================== */
window.ToolsMod = (function (SY) {
  'use strict';

  var frameIssues = [];      // last flash/empty scan result
  var frameMode = 'flash';

  function el(id) { return document.getElementById(id); }

  function init() {
    if (!el('tlAdjPer')) { return; }

    /* Smart adjustment layers */
    el('tlAdjPer').addEventListener('click', function () { adj('perClip'); });
    el('tlAdjSpan').addEventListener('click', function () { adj('span'); });
    el('tlAdjAdopt').addEventListener('click', adopt);

    /* Staircase stagger */
    el('tlStairUp').addEventListener('click', function () { stair(1); });
    el('tlStairDown').addEventListener('click', function () { stair(-1); });

    /* Freeze frame */
    el('tlFreeze').addEventListener('click', freeze);
    el('tlFreezeReveal').addEventListener('click', function () {
      if (SY.hasNode) { SY.reveal(SY.paths.freeze); } else { SY.toast('Demo mode', 'warn'); }
    });

    /* Paste image */
    el('tlPasteClip').addEventListener('click', pasteClipboard);
    el('tlPasteFile').addEventListener('click', pasteFile);
    el('tlPasteFreeze').addEventListener('click', pasteFreeze);

    /* Flash / empty frame detectors */
    el('tlFlashGo').addEventListener('click', function () { frameScan('flash'); });
    el('tlEmptyGo').addEventListener('click', function () { frameScan('empty'); });
    el('tlFrameMark').addEventListener('click', function () { frameAct('mark'); });
    el('tlFrameCut').addEventListener('click', function () { frameAct('cut'); });
    el('tlFrameClear').addEventListener('click', function () {
      frameIssues = [];
      el('tlFrameList').innerHTML = '<div class="empty">No scan yet.</div>';
      el('tlFrameStat').textContent = 'Cleared.';
      syncFrameButtons();
    });
    el('tlFrameList').addEventListener('click', function (e) {
      var row = e.target.closest ? e.target.closest('.list-row') : null;
      if (!row) { return; }
      var i = +row.getAttribute('data-i');
      if (frameIssues[i]) { SY.call('jumpTo', { seconds: frameIssues[i].at }, function () {}); }
    });

    /* QC checker */
    el('tlQcGo').addEventListener('click', qc);
    el('tlQcClear').addEventListener('click', qcClear);
    el('tlQcToChapters').addEventListener('click', function () {
      SYUI.goto('chapters');
      if (window.ChaptersMod) { ChaptersMod.refresh(); }
      SY.toast('Load them with “From QC scan” in the Chapters tab', 'ok', 5000);
    });
  }

  /* ------------------------ adjustment layers ------------------------ */
  function adj(mode) {
    var stat = el('tlAdjStat');
    SY.call('adjAdd', { mode: mode }, function (r) {
      if (!r.ok) { stat.textContent = '❌ ' + r.error; SY.toast(r.error, 'err', 6000); return; }
      stat.innerHTML = '✅ Placed <b>' + r.data.placed + '</b> adjustment layer(s) (' +
        (mode === 'span' ? 'spanning selection' : 'one per clip') + ')' + (r.data.note ? ' — ' + r.data.note : '');
      SY.toast('Adjustment layers placed', 'ok');
    });
  }

  function adopt() {
    var stat = el('tlAdjStat');
    SY.call('adjFindTemplate', {}, function (r) {
      if (!r.ok) { stat.textContent = '❌ ' + r.error; return; }
      if (r.data.found) {
        stat.innerHTML = '✅ Template found: <b>' + SY.esc(r.data.name) + '</b> — ready to use.';
        SY.toast('Adopted "' + r.data.name + '" as the adjustment-layer template', 'ok');
      } else {
        stat.innerHTML = 'No template yet — in Premiere: <b>File › New › Adjustment Layer</b>, keep the default name, then Adopt again.';
      }
    });
  }

  /* --------------------------- staircase --------------------------- */
  function stair(dir) {
    var arg = {
      dir: dir,
      frames: +el('tlStairN').value || 12,
      trackShift: +el('tlStairT').value || 0
    };
    SY.call('staircase', arg, function (r) {
      if (!r.ok) { SY.toast(r.error, 'err', 5000); return; }
      SY.toast('Staggered ' + r.data.moved + ' clips' + (r.data.note ? ' — ' + r.data.note : ''), r.data.note ? 'warn' : 'ok', 5000);
    });
  }

  /* -------------------------- freeze frame -------------------------- */
  function freeze() {
    var folder = SY.paths.freeze || '';
    var arg = folder ? { folder: folder } : {};
    SY.call('freezeFrame', arg, function (r) {
      if (!r.ok) { SY.toast(r.error, 'err', 5000); return; }
      SY.toast('Still saved: ' + r.data.path, 'ok', 4500);
      if (SY.hasNode) { SY.reveal(r.data.path); }
    });
  }

  /* --------------------------- paste image --------------------------- */
  function pasteDur() { return Math.max(0.2, +el('tlPasteDur').value || 5); }

  function placeImage(path, label) {
    var stat = el('tlPasteStat');
    stat.textContent = 'Placing ' + (label || 'image') + '…';
    SY.call('pasteImage', { path: path, durationSec: pasteDur(), mode: 'overwrite' }, function (r) {
      if (!r.ok) { stat.textContent = '❌ ' + r.error; SY.toast(r.error, 'err', 6000); return; }
      stat.innerHTML = '✅ <b>' + SY.esc(r.data.name) + '</b> on V' + (r.data.track + 1) +
        ' for ' + r.data.duration.toFixed(2) + 's at ' + r.data.at.toFixed(2) + 's';
      SY.toast('Pasted onto V' + (r.data.track + 1), 'ok', 3600);
    });
  }

  function pasteClipboard() {
    var stat = el('tlPasteStat');
    if (!SY.hasNode) { SY.toast('Demo mode — clipboard paste needs the installed panel', 'warn'); return; }
    var path = SY.paths.captures
      ? SY.require('path').join(SY.paths.captures, 'clipboard', 'paste_' + Date.now() + '.png')
      : '';
    stat.textContent = 'Reading the clipboard…';
    window.SYStills.pasteClipboard(path, function (r) {
      if (!r.ok) { stat.textContent = '❌ ' + r.error; SY.toast(r.error, 'warn', 6000); return; }
      placeImage(r.path, 'clipboard image');
    });
  }

  function pasteFile() {
    SY.pickFile(['png', 'jpg', 'jpeg', 'tif', 'tiff', 'webp', 'psd', ''], function (f) {
      if (!f) { return; }
      placeImage(f, SY.require ? f.replace(/^.*[\\/]/, '') : f);
    });
  }

  function pasteFreeze() {
    var stat = el('tlPasteStat');
    stat.textContent = 'Capturing the frame at the playhead…';
    SY.call('freezeToTimeline', { folder: SY.paths.freeze || '', durationSec: pasteDur() }, function (r) {
      if (!r.ok) { stat.textContent = '❌ ' + r.error; SY.toast(r.error, 'err', 6000); return; }
      stat.innerHTML = '✅ Freeze frame placed on V' + (r.data.track + 1) + ' for ' + r.data.duration.toFixed(2) + 's' +
        '<br><span class="mini">' + SY.esc(r.data.path || '') + '</span>';
      SY.toast('Freeze frame inserted', 'ok', 4000);
    });
  }

  /* -------------------- flash / empty frame detectors -------------------- */
  function frameScan(mode) {
    frameMode = mode;
    var btn = mode === 'flash' ? el('tlFlashGo') : el('tlEmptyGo');
    var list = el('tlFrameList'), stat = el('tlFrameStat');
    var prog = el('tlFrameProg'), bar = prog.querySelector('div');

    SY.busy(btn, true);
    prog.style.display = 'block';
    bar.style.width = '4%';
    list.innerHTML = '<div class="empty">Reading the timeline…</div>';
    stat.textContent = mode === 'flash' ? 'Decoding frames and measuring luma…' : 'Looking for black spans and holes…';

    SY.call('getClips', { selectedOnly: el('tlFrameSelOnly').checked }, function (r) {
      if (!r.ok) { SY.busy(btn, false); prog.style.display = 'none'; stat.textContent = '❌ ' + r.error; return; }
      var clips = r.data || [];
      if (!clips.length) {
        SY.busy(btn, false); prog.style.display = 'none';
        list.innerHTML = '<div class="empty">Nothing selected on the timeline.</div>';
        return;
      }

      var done = function (issues, notes, extra) {
        frameIssues = issues;
        SY.busy(btn, false);
        bar.style.width = '100%';
        setTimeout(function () { prog.style.display = 'none'; bar.style.width = '0%'; }, 600);
        renderFrames(notes, extra);
      };

      if (mode === 'empty') {
        /* structural holes first (instant), then the pixel pass */
        SY.call('blankScan', { minDur: +el('tlEmptyMin').value || 0.1 }, function (rb) {
          var holes = (rb.ok && rb.data && rb.data.holes) ? rb.data.holes : [];
          var mapped = holes.map(function (h) {
            return { kind: 'hole', clip: '(no clip)', track: h.track, at: h.at, until: h.until,
              dur: h.dur, text: h.text };
          });
          if (!SY.hasNode) {
            done(mapped.concat([]), ['Pixel pass skipped — demo mode has no ffmpeg.']);
            return;
          }
          window.SYFrameQC.scanClips(clips, {
            mode: 'empty',
            minDur: +el('tlEmptyMin').value || 0.1,
            pixTh: (+el('tlEmptyTh').value || 10) / 100,
            limitSeconds: +el('tlFrameLimit').value || 0,
            onProgress: function (d, t, name) {
              bar.style.width = (10 + 85 * (d / Math.max(1, t))) + '%';
              stat.textContent = 'blackdetect · ' + (name || '');
            }
          }, function (err, res) {
            if (err) { done(mapped, [err.message]); return; }
            done(mapped.concat(res.issues), (res.notes || []).concat(holes.length ? ['structural holes: ' + holes.length] : []));
          });
        });
        return;
      }

      if (!SY.hasNode) {
        done([], ['Demo mode has no ffmpeg — install the panel to analyse real pixels.']);
        return;
      }
      window.SYFrameQC.scanClips(clips, {
        mode: 'flash',
        threshold: +el('tlFlashTh').value || 45,
        maxRun: +el('tlFlashRun').value || 2,
        limitSeconds: +el('tlFrameLimit').value || 0,
        onProgress: function (d, t, name) {
          bar.style.width = (10 + 85 * (d / Math.max(1, t))) + '%';
          stat.textContent = 'signalstats · ' + (name || '');
        }
      }, function (err, res) {
        if (err) { done([], [err.message]); return; }
        done(res.issues, res.notes || []);
      });
    });
  }

  function renderFrames(notes, extra) {
    var list = el('tlFrameList'), stat = el('tlFrameStat');
    if (!frameIssues.length) {
      list.innerHTML = '<div class="empty">✅ Nothing found — no ' +
        (frameMode === 'flash' ? 'isolated flash frames' : 'empty or black frames') + ' in the analysed range.</div>';
      stat.textContent = (notes && notes.length) ? notes.join(' · ') : 'Clean.';
      syncFrameButtons();
      return;
    }
    list.innerHTML = frameIssues.map(function (iss, i) {
      var tag = iss.kind === 'hole' ? 'warn' : (iss.kind === 'empty' ? 'warn' : 'err');
      return '<div class="list-row" data-i="' + i + '" style="cursor:pointer">' +
        '<span class="tag ' + tag + '">' + SY.esc(iss.kind) + '</span>' +
        '<span class="grow">' + SY.esc(iss.text) + '</span>' +
        '<span class="mono">' + SY.fmtTC(iss.at) + '</span></div>';
    }).join('');
    stat.innerHTML = '<b>' + frameIssues.length + '</b> issue(s) · click a row to jump the playhead' +
      ((notes && notes.length) ? '<br><span class="mini">' + SY.esc(notes.slice(0, 4).join(' · ')) + '</span>' : '');
    SY.toast(frameIssues.length + ' issue(s) flagged', 'warn', 4200);
    syncFrameButtons();
  }

  function syncFrameButtons() {
    el('tlFrameMark').disabled = !frameIssues.length;
    el('tlFrameCut').disabled = !frameIssues.length;
  }

  function frameAct(kind) {
    if (!frameIssues.length) { SY.toast('Run a scan first', 'warn'); return; }
    var stat = el('tlFrameStat');
    if (kind === 'mark') {
      var pts = frameIssues.map(function (i, n) {
        return { at: i.at, name: 'QC ' + i.kind.toUpperCase() + ' ' + (n + 1), comments: i.text, type: 'Comment' };
      });
      SY.call('addMarkers', { markers: pts }, function (r) {
        if (!r.ok) { stat.textContent = '❌ ' + r.error; return; }
        stat.textContent = '✅ ' + r.data.added + ' QC marker(s) on the ruler.';
        SY.toast(r.data.added + ' marker(s) added', 'ok');
      });
      return;
    }
    var cuts = frameIssues.map(function (i) { return { start: i.at, end: i.until }; });
    if (!confirm('Ripple-cut ' + cuts.length + ' region(s) totalling ' +
      cuts.reduce(function (a, c) { return a + (c.end - c.start); }, 0).toFixed(2) + 's?')) { return; }
    SY.call('applyCuts', { cuts: cuts, mode: 'ripple' }, function (r) {
      if (!r.ok) { stat.textContent = '❌ ' + r.error; SY.toast(r.error, 'err', 6000); return; }
      stat.textContent = '✅ Cut ' + r.data.applied + ' region(s), removed ' +
        (r.data.clipsRemoved || 0) + ' clip(s), saved ' + (r.data.secondsSaved || 0).toFixed(2) + 's.';
      SY.toast('Regions removed', 'ok');
      frameIssues = [];
      renderFrames([], []);
    });
  }

  /* ------------------------------ QC scan ------------------------------ */
  function qc() {
    var list = el('tlQcList');
    var kinds = { gaps: false, offline: false, silence: false };
    var chips = document.querySelectorAll('[data-qc]');
    for (var i = 0; i < chips.length; i++) {
      if (chips[i].classList.contains('on')) { kinds[chips[i].getAttribute('data-qc')] = true; }
    }
    list.innerHTML = '<div class="empty">Scanning…</div>';
    SY.call('qcScan', {
      gaps: kinds.gaps, offline: kinds.offline, silence: kinds.silence,
      markers: el('tlQcMarkers').checked
    }, function (r) {
      if (!r.ok) { list.innerHTML = '<div class="empty">' + SY.esc(r.error) + '</div>'; return; }
      var issues = r.data.issues || [];
      SY.lastQcIssues = issues;
      var toCh = el('tlQcToChapters');
      if (toCh) { toCh.disabled = !issues.length; }
      el('tlQcClear').disabled = false;
      if (!issues.length) {
        list.innerHTML = '<div class="empty">✅ Clean timeline — no blank frames, offline media or silent holes found.</div>';
        SY.toast('QC scan: clean ✓', 'ok');
        return;
      }
      list.innerHTML = issues.map(function (iss) {
        var tag = iss.kind === 'offline' ? 'err' : (iss.kind === 'blank' ? 'warn' : 'info');
        return '<div class="list-row"><span class="tag ' + tag + '">' + iss.kind + '</span>' +
          '<span class="grow">' + SY.esc(iss.text) + '</span>' +
          '<span class="mono">' + SY.fmtTC(iss.at) + '</span></div>';
      }).join('');
      SY.toast('QC scan: ' + issues.length + ' issue(s) flagged' + (el('tlQcMarkers').checked ? ' + markers' : ''), 'warn');
    });
  }

  function qcClear() {
    var btn = el('tlQcClear');
    var all = el('tlQcClearAll').checked;
    if (all && !confirm('Remove EVERY marker on this sequence, not just the QC ones?')) { return; }
    SY.busy(btn, true);
    SY.call('qcClear', { prefix: 'QC', all: all }, function (r) {
      SY.busy(btn, false);
      if (!r.ok) { SY.toast(r.error, 'err', 5500); return; }
      SY.lastQcIssues = [];
      el('tlQcList').innerHTML = '<div class="empty">QC results cleared' +
        (r.data.removed ? ' — ' + r.data.removed + ' marker(s) removed from the ruler.' : '.') + '</div>';
      el('tlQcToChapters').disabled = true;
      SY.toast(r.data.removed ? 'Removed ' + r.data.removed + ' QC marker(s)' : 'QC list cleared',
        r.data.removed ? 'ok' : 'info', 3600);
    });
  }

  return { init: init };
})(window.SY);
