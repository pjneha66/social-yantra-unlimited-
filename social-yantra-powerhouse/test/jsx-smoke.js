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
  markers: { createMarker: function (sec) { var m = { name: '', comments: '', type: '' }; __markers.push({ at: sec, m: m }); return m; } },
  videoTracks: { numTracks: 2, 0: null, 1: null },
  audioTracks: { numTracks: 1, 0: null },
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
  numVideoTracks: 2, numAudioTracks: 1,
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
 'features/sy-truedup.jsxinc', 'features/sy-tools.jsxinc'].forEach(function (f) {
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
check('topology has 1 audio clip with media path', topo.ok && topo.data.audioClips.length === 1 && topo.data.audioClips[0].mediaPath === '/m/intro.mp4', topo.data && topo.data.audioClips);

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

console.log(failed ? ('\n' + failed + ' FAILURES') : '\nALL JSX TESTS PASSED');
process.exit(failed ? 1 : 0);
