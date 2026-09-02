/* Headless JSX test: stubs the Premiere Pro ExtendScript API and exercises
 * the SY.* host functions the panel calls (topology, snap, cuts, bake, QC,
 * true dup, captions, nest backup). */
'use strict';

/* ---------------- Premiere API stubs ---------------- */
function Time() { this.seconds = 0; this.ticks = '0'; }
global.Time = Time;
var __markers = [];
var __razors = [];
var __removed = [];
var __keys = [];

function mkClip(name, trackType, trackIndex, start, end, inP, outP, opts) {
  opts = opts || {};
  return {
    name: name,
    mediaType: opts.mediaType || (trackType === 'audio' ? 'Audio' : 'Video'),
    start: t(start), end: t(end), inPoint: t(inP), outPoint: t(outP),
    _selected: !!opts.selected,
    isSelected: function () { return this._selected; },
    setSelected: function (v) { this._selected = v; },
    isAdjustmentLayer: function () { return !!opts.adjustment; },
    projectItem: opts.noItem ? null : {
      nodeId: name + '-node',
      name: name,
      hasVideo: function () { return trackType !== 'audio'; },
      hasAudio: function () { return true; },
      isSequence: function () { return !!opts.isSequence; },
      getMediaPath: function () { return opts.mediaPath || ''; },
      duplicate: function () { return mkItem(name + '_CLONE', !!opts.isSequence); }
    },
    remove: function (ripple, align) { __removed.push({ name: name, ripple: ripple, align: align, at: this.start.seconds }); },
    components: opts.components || []
  };
}
function t(s) { var x = new Time(); x.seconds = s; x.ticks = String(Math.round(s * 254016000000)); return x; }
function mkItem(name, isSequence) {
  return { nodeId: name + '-node', name: name, isSequence: function () { return !!isSequence; },
    getMediaPath: function () { return ''; }, hasVideo: function () { return true; }, hasAudio: function () { return true; } };
}
function mkTrack(clips) {
  var col = {};
  for (var i = 0; i < clips.length; i++) { col[i] = clips[i]; }
  col.numItems = clips.length;
  return { isLocked: function () { return false; }, clips: col };
}

var SEQ = {
  name: 'TestSeq', sequenceID: 'seq-0001',
  frameSizeHorizontal: 1920, frameSizeVertical: 1080,
  timebase: '10160640000', end: t(41.5),
  markers: {
    createMarker: function (sec) {
      var m = {
        name: '', comments: '', type: 'Comment', guid: 'guid-' + __markers.length,
        start: t(sec), end: t(sec),
        setTypeAsComment: function () { this.type = 'Comment'; },
        setTypeAsChapter: function () { this.type = 'Chapter'; },
        setTypeAsSegmentation: function () { this.type = 'Segmentation'; }
      };
      __markers.push({ at: sec, m: m });
      return m;
    },
    get numMarkers() { return __markers.length; },
    getFirstMarker: function () { return __markers.length ? __markers[0].m : undefined; },
    getLastMarker: function () { return __markers.length ? __markers[__markers.length - 1].m : undefined; },
    getNextMarker: function (cur) {
      for (var i = 0; i < __markers.length; i++) { if (__markers[i].m === cur) { return i + 1 < __markers.length ? __markers[i + 1].m : undefined; } }
      return undefined;
    }
  },
  videoTracks: { numTracks: 2, 0: null, 1: null },
  audioTracks: { numTracks: 2, 0: null, 1: null },
  getSettings: function () { var fr = new Time(); fr.seconds = 1 / 25; return { videoFrameRate: fr, videoDisplayFormat: 110 }; },
  getPlayerPosition: function () { return t(7.2); },
  setPlayerPosition: function () {},
  getWorkAreaInPoint: function () { return '2'; },
  getWorkAreaOutPoint: function () { return '12'; },
  getSelection: function () { return []; },
  createCaptionTrack: function (item, off, fmt) { __createdCaption = { item: item.name, off: off, fmt: fmt }; return true; },
  insertClip: function () { return true; },
  overwriteClip: function (item, s) { __placed.push({ item: item ? item.name : '?', at: s }); return true; },
  importMGT: function () { return true; },
  exportAsMediaDirect: function () { return true; }
};
var __placed = [];
var __createdCaption = null;

var vclipsA = [mkClip('intro.mp4', 'video', 0, 0, 12.5, 0, 12.5, { mediaPath: '/m/intro.mp4', selected: true, components: [motionComp()] }),
               mkClip('NEST_A', 'video', 0, 12.5, 20, 0, 7.5, { isSequence: true, selected: true })];
SEQ.videoTracks[0] = mkTrack(vclipsA);
SEQ.videoTracks[1] = mkTrack([]);
SEQ.audioTracks[0] = mkTrack([mkClip('intro.mp4', 'audio', 0, 0, 20, 0, 20, { mediaPath: '/m/intro.mp4' })]);
/* A2 = the music bed, with a real Volume › Level parameter to duck */
var __volKeys = [];
function volumeComp() {
  return {
    displayName: 'Volume',
    properties: [
      { displayName: 'Bypass', name: 'Bypass', getValue: function () { return false; }, setValue: function () {} },
      { displayName: 'Level', name: 'Level',
        getValue: function () { return 0.17782793939114; },   // Premiere's stored 0.0 dB
        setTimeVarying: function () {}, removeKeyRange: function () {},
        setValue: function (v) { __volKeys.push({ op: 'set', v: v }); },
        setValueAtTime: function (v, tm) { __volKeys.push({ op: 'key', v: v, t: tm.seconds }); return true; } }
    ]
  };
}
SEQ.audioTracks[1] = mkTrack([mkClip('music_bed.mp3', 'audio', 1, 0, 41.5, 0, 41.5, { mediaPath: '/m/music_bed.mp3', components: [volumeComp()] })]);

function motionComp() {
  return {
    displayName: 'Motion',
    properties: [
      { displayName: 'Position', name: 'Position',
        getValue: function () { return [960, 540]; },
        setTimeVarying: function () {}, removeKeyRange: function () {},
        setValueAtTime: function (v, tm) { __keys.push({ p: 'Position', v: v, t: tm.seconds }); return true; } },
      { displayName: 'Scale', name: 'Scale',
        getValue: function () { return 100; },
        setTimeVarying: function () {}, removeKeyRange: function () {},
        setValueAtTime: function (v, tm) { __keys.push({ p: 'Scale', v: v, t: tm.seconds }); return true; } }
    ]
  };
}

var qeSeq = {
  numVideoTracks: 2, numAudioTracks: 2,
  getVideoTrackAt: function (i) { return { razor: function (tc) { __razors.push({ tr: 'v' + i, tc: tc }); }, getItemAt: function () { return null; } }; },
  getAudioTrackAt: function (i) { return { razor: function (tc) { __razors.push({ tr: 'a' + i, tc: tc }); } }; },
  addVideoTrack: function () { SEQ.videoTracks.numTracks++; },
  exportFramePNG: function (p) { __framePng = p; return true; }
};
var __framePng = null;

global.app = {
  appName: 'Adobe Premiere Pro', version: '25.0', buildName: 'test',
  enableQE: function () {},
  project: {
    name: 'Test.prproj', path: '/m/Test.prproj',
    activeSequence: SEQ,
    rootItem: { children: { numItems: 2, 0: mkItem('Adjustment Layer', false), 1: mkItem('Other', false) } },
    createBin: function (n) { return { name: n, children: { numItems: 0 } }; },
    importFiles: function (paths) {
      __imported = paths;
      paths.forEach(function (p) {
        var nm = p.replace(/^.*[\\\\/]/, '');
        var it = mkItem(nm, /\\.srt$/i.test(nm) ? false : false);
        it.getMediaPath = function () { return p; };
        var ch = app.project.rootItem.children;
        ch[ch.numItems] = it; ch.numItems++;
      });
      return true;
    },
    saveAsCopy: function (p) { __savedCopy = p; return true; },
    sequences: { numSequences: 1, 0: { sequenceID: 'seq-0001', name: 'NEST_A', projectItem: vclipsA[1].projectItem } }
  },
  encoder: { launchEncoder: function () {}, encodeSequence: function () { return 'job1'; } }
};
var __imported = null, __savedCopy = null;

global.qe = { project: { getActiveSequence: function () { return qeSeq; } } };
global.ProjectItemType = { BIN: 2, CLIP: 1 };
global.Sequence = { CAPTION_FORMAT_SUBTITLE: 0 };
global.File = function (p) {
  this.path = p;
  this.exists = /meta\.json|\.srt|\.png/.test(p) && !/missing/.test(p);
  this.length = 100;
  this.parent = { exists: true, create: function () { return true; } };
  var self = this;
  this.open = function (mode) { this._mode = mode; this._buf = ''; return true; };
  this.write = function (s) { this._buf += s; return true; };
  this.writeln = function (s) { this._buf += s + '\n'; return true; };
  this.close = function () { __files[p] = this._buf; return true; };
};
var __files = {};
global.Folder = function (p) { this.fsName = p; this.exists = true; this.create = function () { return true; }; };
global.Folder.myDocuments = { fsName: '/home/tester/Documents' };

/* ---------------- load SY ---------------- */
var SY = {};
global.SY = SY;
var fs = require('fs'), path = require('path');
var base = path.join(__dirname, '..', 'jsx');
['core/sy-core.jsxinc', 'features/sy-silence.jsxinc', 'features/sy-flow.jsxinc',
 'features/sy-wordpop.jsxinc', 'features/sy-nest.jsxinc', 'features/sy-assets.jsxinc',
 'features/sy-truedup.jsxinc', 'features/sy-tools.jsxinc', 'features/sy-audio.jsxinc',
 'features/sy-nesting.jsxinc', 'features/sy-effects.jsxinc', 'features/sy-frames.jsxinc',
 'features/sy-layers.jsxinc'].forEach(function (f) {
  var code = fs.readFileSync(path.join(base, f), 'utf8');
  try { (0, eval)(code.replace(/^\/\/@include.*$/gm, '')); console.log('LOADED', f); }
  catch (e) { console.log('LOAD-FAIL', f, e.message); process.exitCode = 1; }
});

/* evalJson helper through the real RPC entry */
function rpc(fn, arg) {
  var res = SY.evalJson(fn, JSON.stringify(arg || null));
  return JSON.parse(res);
}
var failed = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + JSON.stringify(extra).slice(0, 160) : ''));
  if (!cond) { failed++; }
}

SY.ping = function () { return { ok: true, data: { app: app.appName, version: app.version, build: app.buildName, project: app.project.name, qe: (typeof qe !== 'undefined') ? 'available' : 'no' } }; };

/* ---------------- tests ---------------- */
var r = rpc('ping');
check('ping', r.ok && r.data.qe === 'available', r);

var topo = rpc('getAudioTopology');
check('topology finds both audio clips with media paths', topo.ok && topo.data.audioClips.length === 2 &&
  topo.data.audioClips[0].mediaPath === '/m/intro.mp4' && topo.data.audioClips[1].mediaPath === '/m/music_bed.mp3',
  topo.data && topo.data.audioClips);

var snap = rpc('snapCuts', { cuts: [{ start: 3.421, end: 5.096 }, { start: 3.44, end: 5.1 }], minCut: 0.3 });
check('snapCuts merges overlapping + frame-snaps (25fps)', snap.ok && snap.data.length === 1 && Math.abs(snap.data[0].start - 3.44) < 0.001, snap.data);

__razors.length = 0; __removed.length = 0;
var cut = rpc('executeCuts', { cuts: [{ start: 6.0, end: 8.0 }], mode: 'ripple' });
check('executeCuts razored boundaries on v+a tracks', cut.ok && __razors.length >= 3, { razors: __razors, cut: cut });

__markers.length = 0;
var pv = rpc('executeCuts', { cuts: [{ start: 6, end: 8 }], mode: 'ripple', previewOnly: true, markerPrefix: 'SILENCE' });
check('preview mode adds markers, no razors', pv.ok && __markers.length === 1, pv);

__keys.length = 0;
var bake = rpc('bakeCurve', { prop: 'Scale', range: 'clip', from: 0, to: 100, keys: [{ p: 0, v: 0 }, { p: 0.5, v: 0.8 }, { p: 1, v: 1 }], antiOvershoot: true });
check('bakeCurve wrote scale keys on selected clip', bake.ok && __keys.length >= 4, { keys: __keys, bake: bake });

__keys.length = 0;
var bake2 = rpc('bakeCurve', { prop: 'Position', range: 'clip', fromXY: [0, 0], toXY: [-500, 9000], spatialOffset: true, antiOvershoot: true, keys: [{ p: 0, v: 0 }, { p: 1, v: 1 }] });
check('bakeCurve spatial anti-overshoot clamps to frame', bake2.ok && __keys.every(function (k) { return k.v[0] >= 0 && k.v[0] <= 1920 && k.v[1] >= 0 && k.v[1] <= 1080; }), __keys);

var cap = rpc('createCaptionTrackFromSrt', { srtPath: '/tmp/wordpop.srt' });
check('caption track created from srt', cap.ok && __createdCaption && __createdCaption.off === 0, cap);

var qc = rpc('qcScan', { gaps: true, offline: true, silence: true, markers: false });
check('qcScan clean pass', qc.ok && qc.data.issues.length === 0, qc.ok ? qc.data.issues : qc);

/* offline detection needs an offline clip */
SEQ.videoTracks[1] = mkTrack([mkClip('gone.mov', 'video', 1, 25, 30, 0, 5, { noItem: false, mediaPath: '' })]);
var qc2 = rpc('qcScan', { gaps: false, offline: true, silence: false, markers: true });
check('qcScan flags offline media + marker', qc2.ok && qc2.data.issues.some(function (i) { return i.kind === 'offline'; }), qc2.data.issues);

var fr = rpc('freezeFrame', { folder: '/tmp/Freeze' });
check('freeze frame ladder captures', fr.ok && __framePng && __framePng.indexOf('.png') > 0, fr);

var nb = rpc('nestBackup', { eprPath: '/x.epr', videoPath: '/out/m.mov', thumbPath: '/out/t.png', projPath: '/out/p.prproj', metaPath: '/out/meta.json', presetName: 'ProRes 422 HQ' });
check('nestBackup bundles video+thumb+project+meta', nb.ok && nb.data.thumb === '/out/t.png' && nb.data.projectCopy === '/out/p.prproj', nb);

/* trueDup on selected NEST_A clip */
SEQ.videoTracks[0] = mkTrack([mkClip('intro.mp4', 'video', 0, 0, 12.5, 0, 12.5, { mediaPath: '/m/intro.mp4' }),
  mkClip('NEST_A', 'video', 0, 12.5, 20, 0, 7.5, { isSequence: true, selected: true })]);
var origSeq = app.project.sequences[0];
origSeq.clone = function () { return { sequenceID: 'seq-0002', name: 'NEST_A', projectItem: mkItem('NEST_A_CLONE', true) }; };
__placed.length = 0;
var td = rpc('trueDup', { suffix: '_CLONE', all: false });
check('trueDup cloned + replaced in place', td.ok && __placed.length === 1, td);

var st = rpc('staircase', { dir: 1, frames: 12, trackShift: 0 });
check('staircase needs 2+ selected (graceful error)', st.ok === false, st);

/* ---------------- Feature 9: audio (ducking / beat razor / markers) ---------------- */
var at = rpc('getAudioTracks');
check('getAudioTracks lists A1 dialogue + A2 music',
  at.ok && at.data.tracks.length === 2 && at.data.tracks[1].clips[0].name === 'music_bed.mp3', at.data && at.data.tracks.length);

check('dB ⇄ linear round trip matches Premiere\'s stored scale',
  Math.abs(SY.dbToLinear(0) - 0.17782793939114) < 1e-7 &&
  Math.abs(SY.dbToLinear(-2) - 0.14125375449657) < 1e-7 &&
  Math.abs(SY.linearToDb(SY.dbToLinear(-12)) + 12) < 1e-6,
  { zero: SY.dbToLinear(0), m12: SY.dbToLinear(-12), back: SY.linearToDb(SY.dbToLinear(-12)) });

__volKeys.length = 0;
var duckKeys = [
  { t: 0, db: 0 }, { t: 1.0, db: 0 }, { t: 1.12, db: -12 }, { t: 4.0, db: -12 },
  { t: 4.45, db: 0 }, { t: 10, db: 0 }
];
var duck = rpc('duckTrack', { tracks: [1], keys: duckKeys, mode: 'keys', baseDb: 0, duckDb: -12 });
var ducked = __volKeys.filter(function (k) { return k.op === 'key'; });
var minV = ducked.length ? ducked.reduce(function (a, k) { return Math.min(a, k.v); }, 1) : 1;
check('duckTrack wrote linear-scale volume keys on the music clip',
  duck.ok && ducked.length >= 5 && Math.abs(minV - SY.dbToLinear(-12)) < 1e-9 &&
  /linear/.test(duck.data.clips.join(' ')), { keys: ducked.length, minV: minV, clips: duck.data.clips });

__volKeys.length = 0;
var dclear = rpc('duckTrack', { tracks: [1], keys: [], mode: 'clear', baseDb: 0 });
check('duckTrack clear restores the clip level',
  dclear.ok && __volKeys.some(function (k) { return k.op === 'set'; }), __volKeys);

__markers.length = 0;
var dmark = rpc('duckTrack', { tracks: [1], keys: duckKeys, mode: 'markers', baseDb: 0 });
check('duckTrack preview drops a marker at each duck start', dmark.ok && dmark.data.markers === 1, dmark.data);

__razors.length = 0;
var beats = rpc('razorPoints', { times: [2.001, 2.01, 4.0, 6.0], videoTracks: null, audioTracks: null });
check('razorPoints frame-snaps + de-dupes, razors v+a tracks',
  beats.ok && beats.data.cuts === 3 && __razors.length === 3 * (2 + 2),
  { cut: beats.data, razors: __razors.length });

__razors.length = 0; __markers.length = 0;
var bmark = rpc('razorPoints', { times: [2.0, 4.0], markers: true, markerPrefix: 'BEAT' });
check('razorPoints markers mode makes no cuts', bmark.ok && __razors.length === 0 && __markers.length === 2, bmark.data);

var mks = rpc('addMarkers', { markers: [{ at: 1, name: 'Intro', type: 'Chapter' }, { at: 5, name: 'Main', type: 'Chapter' }] });
check('addMarkers bulk-writes chapter markers', mks.ok && mks.data.added === 2, mks.data);

var read = rpc('getMarkers');
var names = (read.data || []).map(function (m) { return m.name; });
check('getMarkers reads names/types back off the ruler',
  read.ok && names.indexOf('Intro') >= 0 && read.data.length >= 2 &&
  read.data.filter(function (m) { return m.name === 'Intro'; })[0].type === 'Chapter',
  { count: read.data && read.data.length, names: names });

console.log(failed ? ('\n' + failed + ' FAILURES') : '\nALL JSX TESTS PASSED');
process.exit(failed ? 1 : 0);
