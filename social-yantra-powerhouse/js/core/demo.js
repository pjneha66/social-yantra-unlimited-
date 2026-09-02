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
})(window.SY);
