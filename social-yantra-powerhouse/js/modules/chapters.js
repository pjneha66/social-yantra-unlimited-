/* ==========================================================================
 * Module 7 — Chapters & Marker Export
 * Sources: Whisper transcript · QC scan · timeline markers · silence gaps ·
 *          beat bars.  Exports: CSV · YouTube chapters · SRT · JSON · markers.
 * ========================================================================== */
window.ChaptersMod = (function (SY) {
  'use strict';

  var raw = [];        // pre-finalize chapter candidates
  var chapters = [];   // finalized
  var sourceKind = '';

  function el(id) { return document.getElementById(id); }

  function init() {
    if (!el('chList')) { return; }
    el('chFromTranscript').addEventListener('click', function () { fromTranscript(); });
    el('chFromQc').addEventListener('click', function () { fromQc(); });
    el('chFromMarkers').addEventListener('click', function () { fromMarkers(); });
    el('chFromGaps').addEventListener('click', function () { fromGaps(); });
    el('chSave').addEventListener('click', save);
    el('chCopy').addEventListener('click', copy);
    el('chToMarkers').addEventListener('click', toMarkers);
    el('chReveal').addEventListener('click', function () {
      if (SY.hasNode) { SY.mkdirp(SY.exportDir()); SY.reveal(SY.exportDir()); } else { SY.toast('Demo mode', 'warn'); }
    });
    ['chGap', 'chMaxWords', 'chMaxDur', 'chMinLen', 'chTitleStyle', 'chTitleWords', 'chPrefix', 'chZero', 'chFormat']
      .forEach(function (id) { el(id).addEventListener('change', rebuild); });
    var g = el('chGap');
    g.addEventListener('input', function () { el('chGapV').textContent = (+g.value).toFixed(1) + ' s'; });
    el('chGapV').textContent = (+g.value).toFixed(1) + ' s';
    restore();
  }

  function opts() {
    var c = SY.settings.chapters;
    c.gapSec = +el('chGap').value;
    c.maxWords = +el('chMaxWords').value;
    c.maxDur = +el('chMaxDur').value;
    c.minChapterSec = +el('chMinLen').value;
    c.titleStyle = el('chTitleStyle').value;
    c.titleWords = +el('chTitleWords').value;
    c.prefix = el('chPrefix').value;
    c.format = el('chFormat').value;
    c.zeroFirst = el('chZero').checked;
    SY.saveSettings();
    return {
      gapSec: c.gapSec, maxWords: c.maxWords, maxDur: c.maxDur, minChapterSec: c.minChapterSec,
      titleStyle: c.titleStyle, titleWords: c.titleWords, prefix: c.prefix,
      zeroFirst: c.zeroFirst, endAt: (SYUI.seq && SYUI.seq.duration) ? SYUI.seq.duration : null
    };
  }

  function restore() {
    var c = SY.settings.chapters;
    el('chGap').value = c.gapSec; el('chGapV').textContent = (+c.gapSec).toFixed(1) + ' s';
    el('chMaxWords').value = c.maxWords;
    el('chMaxDur').value = c.maxDur;
    el('chMinLen').value = c.minChapterSec;
    el('chTitleStyle').value = c.titleStyle;
    el('chTitleWords').value = c.titleWords;
    el('chPrefix').value = '';
    el('chZero').checked = true;
    el('chFormat').value = c.format || 'csv';
  }

  /* ------------------------- sources ------------------------- */
  function fromTranscript() {
    var tr = SY.lastTranscript;
    if (!tr || !tr.words || !tr.words.length) {
      SY.toast('No transcript yet — run Transcribe in the Filler Remover tab', 'warn', 5000);
      return;
    }
    sourceKind = 'transcript (' + tr.words.length + ' words)';
    raw = SYChapters.buildFromWords(tr.words, opts());
    rebuild();
  }

  function fromQc() {
    el('chSourceStat').textContent = 'Scanning the timeline…';
    SY.call('qcScan', { gaps: true, offline: true, silence: true, markers: false }, function (r) {
      if (!r.ok) { el('chSourceStat').textContent = 'QC scan failed: ' + r.error; return; }
      var issues = r.data.issues || [];
      SY.lastQcIssues = issues;
      sourceKind = 'QC scan (' + issues.length + ' issues)';
      raw = SYChapters.buildFromIssues(issues, opts());
      rebuild();
      if (!issues.length) { SY.toast('QC scan is clean — nothing to turn into chapters', 'ok'); }
    });
  }

  function fromMarkers() {
    SY.call('getMarkers', null, function (r) {
      if (!r.ok) { el('chSourceStat').innerHTML = '❌ ' + SY.esc(r.error); return; }
      var ms = r.data || [];
      sourceKind = 'timeline markers (' + ms.length + ')';
      raw = SYChapters.buildFromMarkers(ms, opts());
      rebuild();
      if (!ms.length) { SY.toast('This sequence has no markers yet', 'warn'); }
    });
  }

  function fromGaps() {
    if (SY.lastSilenceGaps && SY.lastSilenceGaps.length) {
      sourceKind = 'silence gaps (' + SY.lastSilenceGaps.length + ')';
      raw = SYChapters.buildFromIntervals(SY.lastSilenceGaps, opts());
      rebuild();
      return;
    }
    el('chSourceStat').textContent = 'Running a local VAD scan…';
    SY.call('getAudioTopology', null, function (r) {
      if (!r.ok) { el('chSourceStat').textContent = r.error; return; }
      var s = SY.settings.silence;
      SYAudio.analyzeTimeline(r.data.audioClips || [], {
        threshold: s.threshold, minDur: s.minDur, padPre: s.padPre, padPost: s.padPost, minCut: s.minCut
      }, function (err, res) {
        if (err) { el('chSourceStat').textContent = 'Scan failed: ' + err.message; return; }
        SY.lastSilenceGaps = res.gaps;
        sourceKind = 'silence gaps (' + res.gaps.length + ')';
        raw = SYChapters.buildFromIntervals(res.gaps, opts());
        rebuild();
      });
    });
  }

  function fromBars() {
    if (!SY.lastBars) { return; }
    sourceKind = 'beat bars (' + SY.lastBars.intervals.length + ' bars @ ' + SY.lastBars.bpm + ' BPM)';
    raw = SYChapters.buildFromIntervals(SY.lastBars.intervals, opts());
    rebuild();
  }

  /* ------------------------- build & render ------------------------- */
  function rebuild() {
    var o = opts();
    chapters = SYChapters.finalize(raw, o);
    render();
  }

  function render() {
    var list = el('chList');
    el('chSourceStat').textContent = sourceKind ? ('Source: ' + sourceKind) : 'No source loaded yet.';
    if (!chapters.length) {
      list.innerHTML = '<div class="empty">' + (raw.length ? 'Every chapter was shorter than the minimum — lower it.' : 'Pick a source above.') + '</div>';
      el('chCount').textContent = '';
      el('chCheck').textContent = '';
      return;
    }
    list.innerHTML = chapters.map(function (c) {
      return '<div class="list-row">' +
        '<span class="mono" style="min-width:62px">' + SY.fmtClock(c.start) + '</span>' +
        '<span class="grow"><b>' + SY.esc(c.title) + '</b>' +
        (c.text ? ' <span class="mini">' + SY.esc(c.text.slice(0, 90)) + '</span>' : '') + '</span>' +
        '<span class="tag muted">' + c.duration.toFixed(1) + 's</span></div>';
    }).join('');
    var total = chapters[chapters.length - 1].end;
    el('chCount').textContent = '— ' + chapters.length + ' chapters · ' + SY.fmtClock(total);
    var problems = SYChapters.youTubeCheck(chapters);
    el('chCheck').innerHTML = problems.length
      ? '<span class="tag warn">YouTube</span> ' + SY.esc(problems.join(' '))
      : '<span class="tag ok">YouTube ready</span> ' + chapters.length + ' chapters, all ≥10 s, starting at 00:00.';
  }

  /* ------------------------- export ------------------------- */
  function body() {
    if (!chapters.length) { SY.toast('Build chapters first', 'warn'); return null; }
    return SYChapters.serialize(el('chFormat').value, chapters, { videoTitle: (SYUI.seq ? SYUI.seq.name : '') });
  }

  function fileName() {
    var base = (el('chName').value || '').trim() ||
      SY.slug((SYUI.seq ? SYUI.seq.name : 'sequence') + '-chapters');
    var fmt = el('chFormat').value;
    var ext = SYChapters.FORMATS[fmt] ? SYChapters.FORMATS[fmt].ext : '.txt';
    if (base.slice(-ext.length).toLowerCase() !== ext) { base += ext; }
    return base;
  }

  function save() {
    var text = body();
    if (!text) { return; }
    var name = fileName();
    // Prefer an explicit "Save as…" when the host offers it, else the export folder.
    SY.pickSave(name, [], function (picked) {
      var path = '';
      if (picked) { path = SY.writeText(picked, text) ? picked : ''; }
      if (!path) { path = SY.saveExport(name, text); }
      if (!path) {
        el('chStat').innerHTML = '❌ Could not write the file (no Node engine or folder is read-only).';
        SY.toast('Export failed — see the activity log', 'err', 5500);
        return;
      }
      el('chStat').innerHTML = '✅ Saved <b>' + SY.esc(path) + '</b>';
      SY.toast('Chapters exported: ' + name, 'ok');
      SY.log('chapters export → ' + path, 'ok');
      if (SY.hasNode) { SY.reveal(path); }
    });
  }

  function copy() {
    var text = body();
    if (!text) { return; }
    if (SY.clipboard(text)) {
      el('chStat').innerHTML = '✅ Copied ' + chapters.length + ' chapters to the clipboard.';
      SY.toast('Copied to clipboard', 'ok');
    } else {
      SY.toast('Clipboard blocked by the host — use Save file instead', 'warn', 5000);
    }
  }

  function toMarkers() {
    if (!chapters.length) { SY.toast('Build chapters first', 'warn'); return; }
    var payload = SYChapters.toMarkerPayload(chapters, { markerType: 'Chapter' });
    SY.call('addMarkers', { markers: payload }, function (r) {
      if (!r.ok) { SY.toast(r.error, 'err', 6000); return; }
      el('chStat').innerHTML = '✅ ' + r.data.added + ' chapter marker(s) on the sequence ruler.';
      SY.toast(r.data.added + ' markers added', 'ok');
    });
  }

  function refresh() { if (!chapters.length && raw.length) { rebuild(); } }

  return { init: init, refresh: refresh, fromBars: fromBars, rebuild: rebuild };
})(window.SY);
