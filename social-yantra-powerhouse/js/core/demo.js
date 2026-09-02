/* ==========================================================================
 * Demo mode harness — lets the full UI run in a normal browser with plausible
 * mock data when window.__adobe_cep__ is absent (pre-install preview).
 * ========================================================================== */
(function (SY) {
  'use strict';
  if (SY.inCEP) { return; }

  var t = 0;
  function pick(fn, delay) {
    return function (script, cb) {
      setTimeout(function () { cb(fn(script)); }, delay || 120);
    };
  }

  var demoGaps = [
    { start: 3.42, end: 5.10, selected: true },
    { start: 12.80, end: 15.95, selected: true },
    { start: 21.30, end: 22.05, selected: true },
    { start: 30.10, end: 33.80, selected: true }
  ];

  function handler(script, cb) {
    var out = { ok: true, data: null };
    try {
      if (/SY\.evalJson\("ping"/.test(script)) {
        out.data = { app: 'Adobe Premiere Pro', version: '25.0 (Demo)', build: 'demo', project: 'Demo_Project.prproj', qe: 'available' };
      } else if (/SY\.evalJson\("seqInfo"/.test(script)) {
        out.data = { name: 'DEMO — Podcast_Ep12', sequenceID: 'demo', fps: 25, width: 1920, height: 1080, duration: 41.5, playerPosition: 7.2, numVideoTracks: 3, numAudioTracks: 4 };
      } else if (/SY\.evalJson\("getAudioTopology"/.test(script)) {
        out.data = {
          audioClips: [{ mediaPath: '/demo/podcast_ep12.wav', start: 0, end: 41.5, inPoint: 0, trackIndex: 0, name: 'podcast_ep12.wav' }],
          selection: [],
          seq: { name: 'DEMO — Podcast_Ep12', fps: 25, duration: 41.5 },
          playerPosition: 7.2
        };
      } else if (/SY\.evalJson\("snapCuts"/.test(script)) {
        out.data = demoGaps.map(function (g) { return { start: g.start, end: g.end }; });
        out.fps = 25;
      } else if (/SY\.evalJson\("executeCuts"|"applyCuts"/.test(script)) {
        if (/true/.test(script) && /previewOnly/.test(script)) {
          out.data = { applied: 0, markers: demoGaps.length, note: 'preview markers added' };
        } else {
          out.data = { applied: demoGaps.length, clipsRemoved: demoGaps.length * 2, secondsSaved: demoGaps.reduce(function (a, g) { return a + (g.end - g.start); }, 0) };
        }
      } else if (/SY\.evalJson\("bakeCurve"/.test(script)) {
        out.data = { clips: ['"interview_A.mp4": 24 keys', '"interview_B.mp4": 24 keys'], note: 'Anti-overshoot: values clamped to the from→to envelope (no flying off-screen).' };
      } else if (/SY\.evalJson\("bakeWordPop"/.test(script)) {
        out.data = { clipsPopped: 1 };
      } else if (/SY\.evalJson\("trueDup"/.test(script)) {
        out.data = { clones: 1, details: ['cloned: HERO_NEST_CLONE'] };
      } else if (/SY\.evalJson\("freezeFrame"/.test(script)) {
        out.data = { path: '/Users/demo/Documents/SocialYantra/Freeze/Freeze_demo_00-00-07-12.png' };
      } else if (/SY\.evalJson\("qcScan"/.test(script)) {
        out.data = { issues: [
          { kind: 'blank', severity: 'warn', at: 5.1, until: 5.86, text: 'V1: blank frames 5.10s–5.86s' },
          { kind: 'offline', severity: 'err', at: 18.0, until: 21.0, text: 'OFFLINE media: "broll_city_04.mov" @18.00s' },
          { kind: 'silence', severity: 'warn', at: 27.4, until: 29.9, text: 'A1: no audio 27.40s–29.90s' }
        ], scanned: { v: 3, a: 4 } };
      } else if (/SY\.evalJson\("adjFindTemplate"|"adjAdd"/.test(script)) {
        out.data = { found: true, name: 'Adjustment Layer' };
        if (/adjAdd/.test(script)) { out.data = { placed: 2, mode: 'perClip' }; }
      } else if (/SY\.evalJson\("staircase"/.test(script)) {
        out.data = { moved: 4, note: '' };
      } else if (/SY\.evalJson\("createCaptionTrackFromSrt"|"hasCaptionAPI"/.test(script)) {
        if (/hasCaptionAPI/.test(script)) { out.data = { createCaptionTrack: true }; }
        else { out.data = { note: 'Native caption track created (demo)' }; }
      } else if (/SY\.evalJson\("nestBackup"/.test(script)) {
        out.data = { video: '', thumb: '/demo/thumb.png', projectCopy: '', meta: '/demo/meta.json', exportMethod: 'demo', warnings: ['demo: AME not running'] };
      } else if (/SY\.evalJson\("nestRestore"/.test(script)) {
        out.data = { placedAt: '7.200s', item: 'DEMO_NEST' };

      /* ---- nesting (Nest / Unnest / Nest Separate) ---- */
      } else if (/SY\.evalJson\("nestSelection"|"nestSeparate"/.test(script)) {
        var sep = /nestSeparate/.test(script);
        out.data = {
          name: 'DEMO_NEST', sequenceId: 'demo-nest', clipsIn: 2, kept: 2, dropped: 5,
          span: { start: 12.5, end: 20.0 }, duration: 7.5, replaced: !sep, lifted: 2,
          placedAt: 12.5, track: 0, trimmed: true, shiftFails: 0,
          note: '2 clip(s) now live inside "DEMO_NEST".'
        };
        if (sep) { out.data.note = 'Lifted 2 clip(s) into "DEMO_NEST" — the parent timeline keeps the gap.'; }
      } else if (/SY\.evalJson\("unnestSelection"/.test(script)) {
        out.data = { placed: 3, nests: 1, skipped: 0, tracks: { video: 3, audio: 4 },
          details: ['"NEST_A" → 3 clip(s) at 12.50s'] };
      } else if (/SY\.evalJson\("nestListSequences"/.test(script)) {
        out.data = [
          { name: 'DEMO — Podcast_Ep12', id: 'demo', clips: 9, duration: 41.5 },
          { name: 'INTRO_NEST', id: 'demo-2', clips: 4, duration: 7.5 }
        ];

      /* ---- quick effects ---- */
      } else if (/SY\.evalJson\("listEffects"/.test(script)) {
        out.data = {
          video: ['Basic 3D', 'Black & White', 'Corner Pin', 'Crop', 'Directional Blur', 'Drop Shadow',
            'Gaussian Blur', 'Lumetri Color', 'Ultra Key', 'Warp Stabilizer'],
          audio: ['Dynamics', 'Parametric Equalizer', 'DeNoise'], source: 'qe'
        };
      } else if (/SY\.evalJson\("applyEffect"/.test(script)) {
        out.data = { applied: 2, clips: 2, effects: 1, unknown: [], propNotes: [], failed: [] };
      } else if (/SY\.evalJson\("listClipEffects"/.test(script)) {
        out.data = [{ name: 'interview_A.mp4', start: 0, track: 0, trackType: 'video',
          effects: ['Opacity', 'Gaussian Blur'] }];

      /* ---- frames / layers / QC ---- */
      } else if (/SY\.evalJson\("pasteImage"/.test(script)) {
        out.data = { name: 'paste_1.png', at: 7.2, duration: 5, track: 2, trimmed: true };
      } else if (/SY\.evalJson\("freezeToTimeline"/.test(script)) {
        out.data = { name: 'Freeze_demo.png', at: 7.2, duration: 2, track: 2, trimmed: true,
          path: '/Users/demo/Documents/SocialYantra/Freeze/Freeze_demo.png' };
      } else if (/SY\.evalJson\("captureFrameTo"/.test(script)) {
        out.data = { path: '/demo/captures/ai/clipframe.png', at: 7.2, size: 184320, name: 'interview_A.mp4' };
      } else if (/SY\.evalJson\("blankScan"/.test(script)) {
        out.data = { holes: [{ kind: 'blank', track: 0, at: 20.0, until: 21.3, dur: 1.3,
          text: 'V1: hole 20.00s–21.30s (1.30s)' }], duration: 41.5, fps: 25 };
      } else if (/SY\.evalJson\("qcClear"/.test(script)) {
        out.data = { removed: 3, failed: 0, all: false, prefix: 'QC' };
      } else if (/SY\.evalJson\("jumpTo"/.test(script)) {
        out.data = { at: 7.2 };
      } else if (/SY\.evalJson\("addStillLayer"/.test(script)) {
        out.data = { name: 'text.png', at: 0, duration: 12.5, track: 2, trimmed: true,
          span: { start: 0, end: 12.5 }, mode: 'span', track: 2 };
      } else if (/SY\.evalJson\("moveLayerTrack"/.test(script)) {
        out.data = { moved: 1, dir: 1, amount: 1, fallback: 0, blocked: [], tracks: 3 };
      } else if (/SY\.evalJson\("layerStack"/.test(script)) {
        out.data = {
          tracks: [
            { index: 0, label: 'V1', clips: 4, locked: false, hidden: false },
            { index: 1, label: 'V2', clips: 2, locked: false, hidden: false },
            { index: 2, label: 'V3', clips: 0, locked: false, hidden: false }
          ], numVideo: 3, numAudio: 4
        };
      } else if (/SY\.evalJson\("getAudioTracks"/.test(script)) {
        out.data = {
          tracks: [
            { index: 0, label: 'A1', name: 'A1', locked: false, clips: [
              { name: 'podcast_ep12.wav', trackType: 'audio', trackIndex: 0, start: 0, end: 41.5, inPoint: 0, mediaPath: '/demo/podcast_ep12.wav', selected: false } ] },
            { index: 1, label: 'A2', name: 'A2', locked: false, clips: [
              { name: 'music_bed.mp3', trackType: 'audio', trackIndex: 1, start: 0, end: 41.5, inPoint: 0, mediaPath: '/demo/music_bed.mp3', selected: false } ] },
            { index: 2, label: 'A3', name: 'A3', locked: false, clips: [
              { name: 'sfx_whoosh.wav', trackType: 'audio', trackIndex: 2, start: 12.5, end: 13.4, inPoint: 0, mediaPath: '/demo/sfx_whoosh.wav', selected: false } ] }
          ],
          selection: [],
          seq: { name: 'DEMO — Podcast_Ep12', fps: 25, duration: 41.5 }
        };
      } else if (/SY\.evalJson\("duckTrack"/.test(script)) {
        if (/"mode":"markers"/.test(script)) { out.data = { markers: 6, mode: 'markers', note: 'Preview markers placed at each duck start.' }; }
        else if (/"mode":"clear"/.test(script)) { out.data = { clips: ['"music_bed.mp3": ducking cleared'], keys: 1, mode: 'clear', tracks: [1], baseDb: 0, note: '' }; }
        else { out.data = { clips: ['"music_bed.mp3" (A2): 26 keys · linear'], keys: 26, mode: 'keys', tracks: [1], baseDb: 0, note: '' }; }
      } else if (/SY\.evalJson\("razorPoints"/.test(script)) {
        var n = (script.match(/"t":/g) || []).length || 10;
        if (/"markers":true/.test(script)) { out.data = { markers: n, cuts: n, note: 'Beat markers placed (no cuts).' }; }
        else { out.data = { cuts: n, points: n, note: '' }; }
      } else if (/SY\.evalJson\("getMarkers"/.test(script)) {
        out.data = [
          { at: 0, until: 12.5, name: 'Intro', comments: '', type: 'Chapter', guid: 'g1' },
          { at: 12.5, until: 27.2, name: 'Main topic', comments: '', type: 'Chapter', guid: 'g2' },
          { at: 27.2, until: 41.5, name: 'Wrap up', comments: '', type: 'Chapter', guid: 'g3' }
        ];
      } else if (/SY\.evalJson\("addMarkers"/.test(script)) {
        out.data = { added: 3, total: 3 };
      } else if (/SY\.evalJson\("getClips"/.test(script)) {
        out.data = [
          { name: 'interview_A.mp4', trackType: 'video', trackIndex: 0, start: 0, end: 12.5, inPoint: 0, outPoint: 12.5, mediaType: 'Video', selected: false, mediaPath: '/demo/interview_A.mp4', isAdjustment: false },
          { name: 'interview_B.mp4', trackType: 'video', trackIndex: 0, start: 12.5, end: 41.5, inPoint: 5, outPoint: 34, mediaType: 'Video', selected: false, mediaPath: '/demo/interview_B.mp4', isAdjustment: false }
        ];
      } else if (/SY\.evalJson\("assetImport"|"assetInsertAtPlayhead"|"mogrtToTimeline"|"insertAtPlayhead"|"createBin"/.test(script)) {
        out.data = { ok: true };
      } else {
        out = { ok: true, data: null };
      }
    } catch (e) {
      out = { ok: false, error: e.message };
    }
    setTimeout(function () { cb(JSON.stringify(out)); }, 150 + (t = (t + 90) % 300));
  }

  window.SY_DEMO_EVAL = handler;

  // Demo VAD: pretend ffmpeg exists with fixed gaps
  window.SYAudio && (window.SYAudio.analyzeTimeline = function (clips, opts, cb) {
    setTimeout(function () {
      cb(null, { gaps: demoGaps.map(function (g) { return [g.start, g.end]; }), clips: clips.length, media: 1, failures: [] });
    }, 900);
  });
  window.SYAudio && (window.SYAudio.extractWav = function (p, s, d, out, cb) {
    setTimeout(function () { cb(null, '/demo/extract.wav'); }, 500);
  });
  window.SYWhisper && (window.SYWhisper.transcribe = function (wav, cb) {
    setTimeout(function () {
      var script = 'you know this is basically the intro um and uh like i keep saying the the the same thing over and over you know what i mean so anyway lets keep cutting';
      var words = [], t0 = 1.0;
      script.split(' ').forEach(function (w) {
        var dur = 0.18 + w.length * 0.045;
        words.push({ w: w, start: t0, end: t0 + dur }); t0 += dur + 0.12;
      });
      cb(null, { words: words, raw: script });
    }, 1400);
  });
  window.SYWhisper && (window.SYWhisper.test = function (cb) { setTimeout(function () { cb({ ok: true, note: 'demo engine' }); }, 400); });

  // Demo ducking: same fake speech regions as the VAD, complemented
  window.SYAudio && (window.SYAudio.speechIntervals = function (clips, opts, cb) {
    setTimeout(function () {
      var iv = [[0, 3.42], [5.1, 12.8], [15.95, 21.3], [22.05, 30.1], [33.8, 41.5]];
      cb(null, { speech: iv, coverage: [[0, 41.5]], media: 1, failures: [], analyses: {} });
    }, 1100);
  });

  // Demo beat detection: a plausible 120 BPM grid with an envelope curve
  window.SYBeat && (window.SYBeat.detectMedia = function (mediaPath, opts, cb) {
    setTimeout(function () {
      var bpm = 120, period = 60 / bpm;
      var beats = [], env = [], low = [];
      for (var t = 0; t < 41.5; t += period) { beats.push(Math.round(t * 1000) / 1000); }
      for (var f = 0; f < 41.5 / 0.032; f++) {
        var ph = (f * 0.032) % period;
        var v = Math.max(0, 1 - ph / 0.09);
        env.push(v + 0.05 * Math.random());
        low.push((f % 8 === 0) ? 1 : 0.1);
      }
      var downbeats = beats.filter(function (b, i) { return i % 4 === 0; });
      cb(null, {
        bpm: bpm, periodSec: period, confidence: 0.93, beats: beats, downbeats: downbeats,
        onsets: beats.map(function (b) { return { t: b, s: 0.9 }; }),
        envelope: env, low: low, hopSec: 0.032, offsetSec: 0.032, frames: env.length,
        dur: 41.5, beatCount: beats.length, onBeatRatio: 2.4, barPhase: 0, beatsPerBar: 4,
        tempoScores: [{ bpm: 120, score: 0.82 }, { bpm: 60, score: 0.41 }, { bpm: 240, score: 0.22 }],
        note: ''
      });
    }, 1500);
  });

  // Demo downloader: no network, but keep the UI flow explorable
  window.SYDownloader && (window.SYDownloader.checkDir = function (dir, cb) {
    cb({ ok: true, dir: dir, created: false, writable: true, freeBytes: 0, models: 2 });
  });

  // Demo rembg: pretend the CLI is there and hand back a plausible cut-out
  window.SYRembg && (window.SYRembg.detect = function (cb) {
    setTimeout(function () {
      cb({ ok: true, bin: 'rembg', args: [], label: 'demo', version: '2.0.60 (demo)' });
    }, 300);
  });
  window.SYRembg && (window.SYRembg.hasModel = function (id) { return id === 'u2net'; });
  window.SYRembg && (window.SYRembg.modelDir = function () { return '~/.u2net'; });
  window.SYRembg && (window.SYRembg.run = function (opts, cb, onLog) {
    onLog && onLog('$ rembg i -m ' + opts.model + ' ' + opts.input + ' ' + opts.output);
    setTimeout(function () {
      onLog && onLog('Downloading u2net.onnx … done');
      onLog && onLog('Processing … done');
      cb(new Error('Demo mode — install the panel into Premiere to run rembg for real'));
    }, 1200);
  });

  // Demo yt-dlp: show the flow, never touch the network
  window.SYMediaGet && (window.SYMediaGet.detect = function (cb) {
    setTimeout(function () {
      cb({ ok: true, bin: 'yt-dlp', args: [], label: 'demo', version: '2026.09.03 (demo)' });
    }, 300);
  });
  window.SYMediaGet && (window.SYMediaGet.probe = function (url, cb) {
    setTimeout(function () {
      cb(null, {
        title: 'DEMO — How to colour grade in 60 seconds', uploader: 'Demo Channel',
        duration: 187, max_height: 2160, fps: 30, ext: 'mp4', id: 'demo123',
        chapters: [{ start: 0, end: 60, title: 'Intro' }, { start: 60, end: 187, title: 'Grade' }],
        site: window.SYMediaGet.siteFor(url).id
      });
    }, 700);
  });
  window.SYMediaGet && (window.SYMediaGet.run = function (opts, hooks, cb) {
    var args = window.SYMediaGet.buildArgs(opts);
    hooks.onLog && hooks.onLog('$ yt-dlp ' + window.SYMediaGet.quote(args).join(' '));
    var pct = 0;
    var iv = setInterval(function () {
      pct += 12;
      hooks.onProgress && hooks.onProgress({ pct: Math.min(99, pct), size: '18.42MiB', speed: '3.21MiB/s', eta: '00:04' });
      if (pct >= 99) {
        clearInterval(iv);
        hooks.onStage && hooks.onStage({ kind: 'postprocess', stage: 'Merger', detail: 'Merging formats', path: '~/Documents/SocialYantra/Downloads/demo.mp4' });
        cb(new Error('Demo mode — install the panel into Premiere to download for real'));
      }
    }, 220);
  });
  window.SYMediaGet && (window.SYMediaGet.newestFiles = function (dir, since, cb) { cb([]); });

  // Demo stills: no ffmpeg, so fail with a clear message instead of throwing
  window.SYStills && (window.SYStills.makeSolid = function (opts, cb) {
    setTimeout(function () { cb(new Error('Demo mode — solid rendering needs the installed panel + ffmpeg')); }, 400);
  });
  window.SYStills && (window.SYStills.makeText = function (opts, cb) {
    setTimeout(function () { cb(new Error('Demo mode — text rendering needs the installed panel + ffmpeg')); }, 400);
  });
  window.SYStills && (window.SYStills.pasteClipboard = function (p, cb) {
    setTimeout(function () { cb({ ok: false, error: 'Demo mode — clipboard paste needs the installed panel' }); }, 300);
  });
  window.SYStills && (window.SYStills.tempPath = function (sub, name) {
    return '~/Documents/SocialYantra/Captures/' + (sub || '') + '/' + (name || 'still') + '_' + Date.now() + '.png';
  });
  window.SYFrameQC && (window.SYFrameQC.scanClips = function (clips, opts, cb) {
    setTimeout(function () { cb(new Error('Demo mode has no ffmpeg — install the panel to analyse real pixels')); }, 500);
  });
})(window.SY);
