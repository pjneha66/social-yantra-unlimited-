/* ==========================================================================
 * Module 2 — FireCut-style Filler Word & Repetition Cleanup (local Whisper)
 * ========================================================================== */
window.FillerMod = (function (SY) {
  'use strict';

  var hits = [];           // [{start,end,word,kind,selected}]
  var els = {};
  var DEFAULT_WORDS = ['um', 'uh', 'er', 'ah', 'hmm', 'like', 'you know', 'i mean', 'sort of', 'kind of', 'basically', 'actually', 'literally', 'right', 'okay'];

  function init() {
    els = {
      analyze: document.getElementById('fillAnalyze'),
      list: document.getElementById('fillList'),
      cut: document.getElementById('fillCut'),
      stats: document.getElementById('fillStats'),
      prog: document.getElementById('fillProg'),
      count: document.getElementById('fillCount')
    };
    if (!els.analyze) { return; }
    els.bar = els.prog.querySelector('div');

    els.analyze.addEventListener('click', analyze);
    els.cut.addEventListener('click', cut);
    document.getElementById('fillTestEngine').addEventListener('click', testEngine);
    document.getElementById('fillGotoModels').addEventListener('click', function () { SYUI.goto('models'); });
    document.getElementById('fillSelAll').addEventListener('click', function () { selectAll(true); });
    document.getElementById('fillSelNone').addEventListener('click', function () { selectAll(false); });
    document.getElementById('fillOnlyFillers').addEventListener('click', function () { selectKind('filler', true); });
    document.getElementById('fillOnlyRepeats').addEventListener('click', function () { selectKind('repeat', true); });

    var pad = document.getElementById('fillPad');
    pad.addEventListener('input', function () { document.getElementById('fillPadV').textContent = (+pad.value).toFixed(3) + ' s'; });
    document.getElementById('fillPadV').textContent = (+pad.value).toFixed(3) + ' s';

    renderWordChips();
    restore();
    updateEngineTag();
  }

  function restore() {
    var f = SY.settings.filler;
    document.getElementById('fillCustom').value = f.custom || '';
    document.getElementById('fillPad').value = f.pad;
    document.getElementById('fillPadV').textContent = f.pad.toFixed(3) + ' s';
    document.getElementById('fillMinLen').value = f.minLen;
    document.getElementById('fillRepeatOn').checked = !!f.repeats;
  }

  function persist() {
    var f = SY.settings.filler;
    f.custom = document.getElementById('fillCustom').value;
    f.pad = +document.getElementById('fillPad').value;
    f.minLen = +document.getElementById('fillMinLen').value;
    f.repeats = document.getElementById('fillRepeatOn').checked;
    var words = [];
    var chips = document.querySelectorAll('#fillWords .chip');
    for (var i = 0; i < chips.length; i++) {
      if (chips[i].classList.contains('on')) { words.push(chips[i].getAttribute('data-w')); }
    }
    f.words = words;
    SY.saveSettings();
    return f;
  }

  function renderWordChips() {
    var box = document.getElementById('fillWords');
    var words = (SY.settings.filler.words && SY.settings.filler.words.length) ? SY.settings.filler.words : DEFAULT_WORDS;
    box.innerHTML = words.map(function (w) {
      return '<span class="chip on" data-w="' + SY.esc(w) + '">' + SY.esc(w) + '</span>';
    }).join('');
    box.addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (chip) { chip.classList.toggle('on'); }
    });
  }

  function updateEngineTag() {
    var tag = document.getElementById('fillEngineTag');
    var m = SY.settings.whisperMode;
    if (m === 'server') { tag.textContent = 'engine: local server @ ' + SY.settings.whisperEndpoint; tag.className = 'tag info'; }
    else if (m === 'cli') { tag.textContent = 'engine: whisper.cpp CLI'; tag.className = 'tag info'; }
    else { tag.textContent = 'engine: not configured'; tag.className = 'tag err'; }
  }

  function testEngine() {
    SYWhisper.test(function (r) {
      var tag = document.getElementById('fillEngineTag');
      if (r.ok) { tag.className = 'tag ok'; SY.toast('Whisper engine online (' + (r.note || 'ok') + ')', 'ok'); }
      else { tag.className = 'tag err'; SY.toast('Engine offline: ' + r.error, 'err', 5000); }
    });
  }

  /* ------------------- transcribe + match ------------------- */
  function analyze() {
    if (SY.settings.whisperMode === 'off') {
      SY.toast('Configure a local Whisper engine first (Whisper AI Models tab)', 'warn', 4500);
      SYUI.goto('models');
      return;
    }
    var f = persist();
    SY.busy(els.analyze, true);
    els.prog.style.display = 'block'; els.bar.style.width = '5%';
    els.stats.textContent = 'Reading timeline & extracting audio…';

    SY.call('getAudioTopology', null, function (r) {
      if (!r.ok) { fail(r.error); return; }
      var topo = r.data;

      // choose source clips: selected A/V clips if any, else all audio clips
      var sources = [];
      if (topo.selection && topo.selection.length) {
        topo.selection.forEach(function (c) {
          if (c.mediaPath) { sources.push(c); }
        });
      }
      if (!sources.length) { sources = topo.audioClips; }
      if (!sources.length) { fail('No media-linked audio found to transcribe.'); return; }

      // group by media file, widest in/out span
      var byMedia = {};
      sources.forEach(function (c) {
        var g = byMedia[c.mediaPath];
        if (!g) { byMedia[c.mediaPath] = { path: c.mediaPath, inPoint: c.inPoint, outPoint: c.outPoint, clips: [c] }; }
        else {
          g.inPoint = Math.min(g.inPoint, c.inPoint);
          g.outPoint = Math.max(g.outPoint, c.outPoint);
          g.clips.push(c);
        }
      });
      var medias = Object.keys(byMedia);
      var done = 0, allWords = [];

      (function next(i) {
        if (i >= medias.length) { finish(allWords, topo); return; }
        var g = byMedia[medias[i]];
        els.stats.textContent = 'Transcribing ' + (i + 1) + '/' + medias.length + ' (local Whisper)…';
        els.bar.style.width = (5 + (85 * i / medias.length)) + '%';
        SYAudio.extractWav(g.path, g.inPoint, Math.max(0.2, g.outPoint - g.inPoint), null, function (err, wav) {
          if (err) { SY.log('extract failed ' + g.path + ': ' + err.message, 'warn'); next(i + 1); return; }
          SYWhisper.transcribe(wav, function (err2, tr) {
            if (err2) { SY.log('transcribe failed ' + g.path + ': ' + err2.message, 'warn'); SY.toast('Whisper: ' + err2.message, 'err', 5000); }
            else {
              // map media time -> timeline per clip
              tr.words.forEach(function (w) {
                for (var c = 0; c < g.clips.length; c++) {
                  var clip = g.clips[c];
                  var relS = w.start - clip.inPoint, relE = w.end - clip.inPoint;
                  if (relE > 0 && relS < (clip.end - clip.start)) {
                    allWords.push({
                      w: w.w,
                      start: clip.start + Math.max(0, relS),
                      end: clip.start + Math.min(relE, clip.end - clip.start)
                    });
                  }
                }
              });
            }
            next(i + 1);
          }, function (p) {
            els.stats.textContent = 'Uploading to local engine… ' + Math.round(p * 100) + '%';
          });
        });
      })(0);
    });

    function fail(msg) {
      SY.busy(els.analyze, false);
      els.prog.style.display = 'none';
      els.stats.textContent = 'Transcription failed.';
      SY.toast(msg, 'err', 6000);
      SY.log('filler analyze failed: ' + msg, 'err');
    }
  }

  function finish(words, topo) {
    SY.busy(els.analyze, false);
    els.bar.style.width = '100%';
    if (!words.length) { els.stats.textContent = 'No speech detected by Whisper.'; els.prog.style.display = 'none'; return; }
    words.sort(function (a, b) { return a.start - b.start; });
    SY.lastTranscript = { words: words, seqName: topo.seq.name, at: Date.now() };
    if (window.WordPopMod && WordPopMod.onTranscript) { WordPopMod.onTranscript(); }

    var f = SY.settings.filler;
    var pad = f.pad, minLen = f.minLen;
    var dict = {};
    f.words.concat((f.custom || '').split(',').map(function (w) { return w.trim().toLowerCase(); }))
      .forEach(function (w) { if (w) { dict[w] = true; } });

    hits = [];
    var norm = function (w) { return w.toLowerCase().replace(/[^a-z\u00c0-\u024f'\s]/g, '').trim(); };

    for (var i = 0; i < words.length; i++) {
      var w1 = words[i], n1 = norm(w1.w);
      if (!n1) { continue; }
      // single-word fillers
      if (dict[n1]) {
        hits.push({ start: w1.start, end: w1.end, word: n1, kind: 'filler', selected: true });
      }
      // two-word fillers ("you know", "i mean"…)
      var w2 = words[i + 1];
      if (w2 && w2.start - w1.end < 0.25) {
        var n2 = norm(w2.w);
        if (n2 && dict[n1 + ' ' + n2]) {
          hits.push({ start: w1.start, end: w2.end, word: n1 + ' ' + n2, kind: 'filler', selected: true });
          i++;
        }
      }
      // repeats / stutters: same normalized word chained
      if (f.repeats) {
        var chainStart = w1, count = 1, last = w1;
        for (var j = i + 1; j < words.length; j++) {
          if (norm(words[j].w) === n1 && words[j].start - last.end < 0.45) { last = words[j]; count++; }
          else { break; }
        }
        if (count >= 2) {
          hits.push({ start: chainStart.start, end: last.end, word: n1 + ' ×' + count, kind: 'repeat',
            cutStart: (words[i + 1] || chainStart).start, cutEnd: last.end, selected: true });
        }
      }
    }

    // non-overlapping frame-safe intervals with padding
    var cuts = [];
    hits.forEach(function (h) {
      var cs = (h.cutStart !== undefined ? h.cutStart : h.start) - pad;
      var ce = (h.cutEnd !== undefined ? h.cutEnd : h.end) + pad;
      for (var k = 0; k < cuts.length; k++) {
        if (cs < cuts[k].end && ce > cuts[k].start) {  // overlap → merge
          cuts[k].start = Math.min(cuts[k].start, cs);
          cuts[k].end = Math.max(cuts[k].end, ce);
          cuts[k].hits.push(h);
          return;
        }
      }
      cuts.push({ start: cs, end: ce, hits: [h] });
    });
    cuts.sort(function (a, b) { return a.start - b.start; });
    hits = cuts.map(function (c) {
      var h = c.hits[0];
      return { start: c.start, end: c.end, word: c.hits.map(function (x) { return x.word; }).join(' + '),
        kind: c.hits.some(function (x) { return x.kind === 'repeat'; }) ? 'repeat' : 'filler', selected: (c.end - c.start) >= minLen };
    });

    render();
    var total = hits.reduce(function (a, h) { return a + (h.end - h.start); }, 0);
    els.count.textContent = '— ' + hits.length + ' found · ' + total.toFixed(2) + 's';
    els.stats.innerHTML = 'Whisper found <b>' + words.length + '</b> words · <b>' + hits.length + '</b> removable detections.';
    els.cut.disabled = !hits.some(function (h) { return h.selected; });
    els.prog.style.display = 'none';
    SY.log('filler scan: ' + words.length + ' words, ' + hits.length + ' hits', 'ok');
    SY.toast(hits.length + ' detections ready to cut', 'ok');
  }

  function render() {
    if (!hits.length) {
      els.list.innerHTML = '<div class="empty">No fillers or repeats found. 🎉</div>';
      return;
    }
    var html = '';
    hits.forEach(function (h, i) {
      html += '<div class="list-row">' +
        '<input type="checkbox" data-i="' + i + '"' + (h.selected ? ' checked' : '') + '>' +
        '<span class="grow"><b>' + SY.esc(h.word) + '</b> <span class="mono">' + SY.fmtTC(h.start) + ' → ' + SY.fmtTC(h.end) + '</span></span>' +
        '<span class="tag ' + (h.kind === 'repeat' ? 'err' : 'warn') + '">' + (h.end - h.start).toFixed(2) + 's</span></div>';
    });
    els.list.innerHTML = html;
    var boxes = els.list.querySelectorAll('input[type=checkbox]');
    for (var b = 0; b < boxes.length; b++) {
      boxes[b].addEventListener('change', function (e) {
        hits[+e.target.getAttribute('data-i')].selected = e.target.checked;
        els.cut.disabled = !hits.some(function (h) { return h.selected; });
      });
    }
  }

  function selectAll(on) {
    hits.forEach(function (h) { h.selected = on; }); render();
    els.cut.disabled = !hits.some(function (h) { return h.selected; });
  }
  function selectKind(kind, on) {
    hits.forEach(function (h) { if (h.kind === kind) { h.selected = on; } }); render();
    els.cut.disabled = !hits.some(function (h) { return h.selected; });
  }

  function cut() {
    var cuts = hits.filter(function (h) { return h.selected; }).map(function (h) { return { start: h.start, end: h.end }; });
    if (!cuts.length) { SY.toast('Nothing selected', 'warn'); return; }
    SY.busy(els.cut, true);
    SY.call('executeCuts', {
      cuts: cuts, mode: 'ripple',
      previewOnly: document.getElementById('fillPreviewOnly').checked,
      markerPrefix: 'FILLER'
    }, function (r) {
      SY.busy(els.cut, false);
      if (!r.ok) { SY.toast('Cut failed: ' + r.error, 'err', 6000); return; }
      var d = r.data;
      SY.toast((d.markers !== undefined ? d.markers + ' preview markers' : 'Removed ' + cuts.length + ' fillers · ' + d.secondsSaved.toFixed(2) + 's saved'), 'ok');
      if (!document.getElementById('fillPreviewOnly').checked) {
        hits = []; render(); els.cut.disabled = true; SYUI.connect();
      }
    });
  }

  return { init: init, updateEngineTag: updateEngineTag };
})(window.SY);
