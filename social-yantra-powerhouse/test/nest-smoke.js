/* Headless JSX test for the new engines: nesting (Nest / Unnest / Nest
 * Separate), quick effects, layer tools, paste image, blank scan and Clear QC.
 * Stubs the Premiere Pro DOM + QE DOM the same way jsx-smoke.js does. */
'use strict';

var fs = require('fs'), path = require('path');

/* ---------------- Premiere API stubs ---------------- */
function Time() { this.seconds = 0; this.ticks = '0'; }
global.Time = Time;
function t(s) { var x = new Time(); x.seconds = s; x.ticks = String(Math.round(s * 254016000000)); return x; }

var __log = { removed: [], placed: [], markers: [], deleted: [], effects: [], props: [], moves: [], imported: [], png: null };

var __itemSeq = 0;
function mkItem(name, isSeq) {
  return {
    nodeId: name + '-node', name: name,
    isSequence: function () { return !!isSeq; },
    hasVideo: function () { return true; }, hasAudio: function () { return true; },
    getMediaPath: function () { return ''; },
    duplicate: function () { return mkItem(name + ' copy', isSeq); }
  };
}

/* components: Volume-style parameter bags used by the effect tests */
function comp(name, props) {
  var list = [];
  for (var k in props) {
    (function (key, val) {
      list.push({
        displayName: key, name: key, _v: val,
        setValue: function (v) { this._v = v; __log.props.push({ comp: name, prop: key, v: v }); return true; },
        setValueAtTime: function (v) { this._v = v; __log.props.push({ comp: name, prop: key, v: v }); return true; },
        setTimeVarying: function () {},
        getValue: function () { return this._v; }
      });
    })(k, props[k]);
  }
  var c = { displayName: name, matchName: 'ADBE ' + name, properties: list, addEffect: function (pname, val) {
    list.push({ displayName: pname, name: pname, _v: val,
      setValue: function (v) { __log.props.push({ comp: name, prop: pname, v: v }); return true; },
      setValueAtTime: function (v) { __log.props.push({ comp: name, prop: pname, v: v }); return true; },
      setTimeVarying: function () {} });
  } };
  return c;
}

function mkClip(name, trackType, trackIndex, start, end, inP, outP, opts) {
  opts = opts || {};
  var clip = {
    name: name,
    mediaType: trackType === 'audio' ? 'Audio' : 'Video',
    start: t(start), end: t(end), inPoint: t(inP), outPoint: t(outP),
    _selected: !!opts.selected,
    isSelected: function () { return this._selected; },
    setSelected: function (v) { this._selected = v; },
    isAdjustmentLayer: function () { return !!opts.adjustment; },
    projectItem: opts.item || (opts.noItem ? null : mkItem(name, opts.isSequence)),
    components: opts.components || [comp('Opacity', { Opacity: 100 })],
    remove: function (ripple, align) {
      __log.removed.push({ name: this.name, ripple: !!ripple, align: !!align, at: this.start.seconds, track: trackIndex });
      if (this._track) { this._track.removeClip(this); }
      return true;
    }
  };
  return clip;
}

function mkTrack(clips) {
  var track = {
    _clips: clips,
    isLocked: function () { return false; },
    get clips() {
      var col = {};
      for (var i = 0; i < this._clips.length; i++) { col[i] = this._clips[i]; }
      col.numItems = this._clips.length;
      col.length = this._clips.length;
      return col;
    },
    removeClip: function (c) {
      var i = this._clips.indexOf(c);
      if (i >= 0) { this._clips.splice(i, 1); }
    }
  };
  for (var i = 0; i < clips.length; i++) { clips[i]._track = track; }
  return track;
}

var __seqCounter = 0;
function mkSequence(name, videoTracks, audioTracks) {
  var seq = {
    name: name,
    sequenceID: 'seq-' + (++__seqCounter),
    frameSizeHorizontal: 1920, frameSizeVertical: 1080,
    end: t(41.5),
    videoTracks: { numTracks: videoTracks.length },
    audioTracks: { numTracks: audioTracks.length },
    markers: {
      createMarker: function (sec) {
        var m = {
          name: '', comments: '', type: 'Comment', guid: 'g' + __log.markers.length,
          start: t(sec), end: t(sec),
          setTypeAsComment: function () { this.type = 'Comment'; },
          setTypeAsChapter: function () { this.type = 'Chapter'; },
          setTypeAsSegmentation: function () { this.type = 'Segmentation'; },
          delete: function () {
            __log.deleted.push(this.name);
            var i = __log.markers.indexOf(this);
            if (i >= 0) { __log.markers.splice(i, 1); }   // Premiere really removes it
          }
        };
        __log.markers.push(m);
        return m;
      },
      getFirstMarker: function () { return __log.markers.length ? __log.markers[0] : undefined; },
      getNextMarker: function (cur) {
        var i = __log.markers.indexOf(cur);
        return (i >= 0 && i + 1 < __log.markers.length) ? __log.markers[i + 1] : undefined;
      }
    },
    getSettings: function () { var fr = new Time(); fr.seconds = 1 / 25; return { videoFrameRate: fr, videoDisplayFormat: 110 }; },
    getPlayerPosition: function () { return t(7.2); },
    setPlayerPosition: function () {},
    openInTimeline: function () { app.project.activeSequence = seq; },
    insertClip: function (item, tm, v) { __log.placed.push({ item: item.name, at: tm.seconds, track: v, how: 'insert' }); return true; },
    overwriteClip: function (item, tm, v) { __log.placed.push({ item: item.name, at: tm.seconds, track: v, how: 'overwrite' }); return true; },
    exportAsMediaDirect: function () { return true; }
  };
  for (var i = 0; i < videoTracks.length; i++) { seq.videoTracks[i] = videoTracks[i]; }
  for (var j = 0; j < audioTracks.length; j++) { seq.audioTracks[j] = audioTracks[j]; }

  /* clone() must hand back a sequence with its OWN clips, same settings */
  seq.clone = function () {
    var v = seq.videoTracks.numTracks, a = seq.audioTracks.numTracks;
    var vc = [], ac = [];
    for (var x = 0; x < v; x++) {
      var src = seq.videoTracks[x]._clips.slice();
      var copies = src.map(function (c) {
        return mkClip(c.name, 'video', x, c.start.seconds, c.end.seconds, c.inPoint.seconds, c.outPoint.seconds,
          { item: c.projectItem });
      });
      vc.push(mkTrack(copies));
    }
    for (var y = 0; y < a; y++) {
      var srcA = seq.audioTracks[y]._clips.slice();
      var copiesA = srcA.map(function (c) {
        return mkClip(c.name, 'audio', y, c.start.seconds, c.end.seconds, c.inPoint.seconds, c.outPoint.seconds,
          { item: c.projectItem });
      });
      ac.push(mkTrack(copiesA));
    }
    var clone = mkSequence(seq.name + ' CLONE', vc, ac);
    /* Premiere renames the sequence's project item along with the sequence */
    var cloneItem = mkItem(clone.name, true);
    Object.defineProperty(clone, 'projectItem', {
      get: function () { cloneItem.name = clone.name; return cloneItem; },
      configurable: true
    });
    app.project.sequences[app.project.sequences.numSequences] = clone;
    app.project.sequences.numSequences++;
    return clone;
  };
  var selfItem = mkItem(name, true);
  Object.defineProperty(seq, 'projectItem', {
    get: function () { selfItem.name = seq.name; return selfItem; },
    configurable: true
  });
  return seq;
}

/* --- the timeline under test ------------------------------------------------
 * V1: intro.mp4 0–12.5 (selected) | interview_B.mp4 12.5–20 (selected) | tail 20–30
 * V2: overlay.png 13–15  (selected → part of the nest span)
 * A1: voice 0–30
 */
var SEQ = mkSequence('TestSeq', [
  mkTrack([
    mkClip('intro.mp4', 'video', 0, 0, 12.5, 0, 12.5, { item: mkItem('intro.mp4') }),
    mkClip('interview_B.mp4', 'video', 0, 12.5, 20, 5, 12.5, { selected: true, item: mkItem('interview_B.mp4') }),
    mkClip('tail.mp4', 'video', 0, 21.3, 30, 0, 8.7, { item: mkItem('tail.mp4') })
  ]),
  mkTrack([
    mkClip('overlay.png', 'video', 1, 13, 15, 0, 2, { selected: true, item: mkItem('overlay.png') })
  ])
], [
  mkTrack([mkClip('voice.wav', 'audio', 0, 0, 30, 0, 30, { item: mkItem('voice.wav') })])
]);

var __qc = mkClip('NEST_A', 'video', 0, 12.5, 20, 0, 7.5, { isSequence: true, selected: true });
var NEST_SRC = mkSequence('NEST_A', [
  mkTrack([
    mkClip('shot1.mp4', 'video', 0, 0, 4, 0, 4, { item: mkItem('shot1.mp4') }),
    mkClip('shot2.mp4', 'video', 0, 4, 7.5, 0, 3.5, { item: mkItem('shot2.mp4') })
  ])
], [
  mkTrack([mkClip('voice.wav', 'audio', 0, 0, 7.5, 0, 7.5, { item: mkItem('voice.wav') })])
]);
__qc.projectItem = NEST_SRC.projectItem;

/* QC markers: two panel-stamped + one of the user's own */
function seedMarkers() {
  __log.markers.length = 0; __log.deleted.length = 0;
  var a = SEQ.markers.createMarker(5.1); a.name = 'QC: BLANK'; a.comments = 'V1 hole';
  var b = SEQ.markers.createMarker(18); b.name = 'QC: OFFLINE'; b.comments = 'offline media';
  var c = SEQ.markers.createMarker(27.4); c.name = 'Chapter 3'; c.comments = 'user marker';
}

/* QE DOM stub — always mirrors whichever sequence is open in the timeline */
var QE_PROPS = {
  'Gaussian Blur': { Blurriness: 0, 'Repeat Edge Pixels': false, Bypass: false },
  'Tint': { 'Map Black To': 0, Bypass: false },
  'Crop': { Left: 0, Right: 0, Top: 0, Bottom: 0, Bypass: false }
};
var __qeSeq = {
  numVideoTracks: 2, numAudioTracks: 1,
  getVideoTrackAt: function (i) {
    var act = app.project.activeSequence;
    var track = act && act.videoTracks[i];
    return {
      numItems: track ? track._clips.length : 0,
      getItemAt: function (j) {
        var c = track ? track._clips[j] : null;
        if (!c) { return null; }
        return {
          name: c.name, type: 'Clip', start: c.start, end: c.end,
          addVideoEffect: function (eff) {
            __log.effects.push({ clip: c.name, effect: eff.displayName });
            /* Premiere attaches a real component the DOM can then read */
            var props = QE_PROPS[eff.displayName] || { Bypass: false };
            c.components.push(comp(eff.displayName, props));
            return true;
          },
          moveToTrack: function (n) { __log.moves.push({ clip: c.name, to: n }); return true; },
          getComponentAt: function () { return null; }
        };
      },
      razor: function () {}
    };
  },
  getAudioTrackAt: function () { return { numItems: 0, getItemAt: function () { return null; }, razor: function () {} }; },
  addVideoTrack: function () {
    var act = app.project.activeSequence;
    var n = act.videoTracks.numTracks;
    act.videoTracks[n] = mkTrack([]);
    act.videoTracks.numTracks++;
  },
  exportFramePNG: function (p) { __log.png = p; return true; }
};

global.app = {
  appName: 'Adobe Premiere Pro', version: '25.0', buildName: 'test',
  enableQE: function () {},
  project: {
    name: 'Test.prproj', path: '/m/Test.prproj',
    activeSequence: SEQ,
    sequences: { numSequences: 2, 0: SEQ, 1: NEST_SRC },
    rootItem: {
      children: {
        numItems: 6,
        0: mkItem('Adjustment Layer', false),
        1: mkItem('intro.mp4', false),
        2: mkItem('overlay.png', false),
        /* the media the test nest points at — present in the project, as it
         * would be in any real project that contains that nest */
        3: mkItem('shot1.mp4', false),
        4: mkItem('shot2.mp4', false),
        5: mkItem('voice.wav', false)
      }
    },
    createBin: function (n) { return { name: n, children: { numItems: 0 } }; },
    /* a real import makes the new ProjectItem findable by its media path —
     * SY.importMedia depends on that, so the stub must do it too */
    importFiles: function (paths) {
      __log.imported = __log.imported.concat(paths);
      var ch = app.project.rootItem.children;
      for (var i = 0; i < paths.length; i++) {
        (function (p) {
          var it = mkItem(p.replace(/^.*[\\/]/, ''), false);
          it.getMediaPath = function () { return p; };
          ch[ch.numItems++] = it;
        })(paths[i]);
      }
      return true;
    }
  },
  encoder: { launchEncoder: function () {}, encodeSequence: function () { return 'job1'; } }
};
/* importFiles must make the imported item findable by path */
app.project.rootItem.children[1].getMediaPath = function () { return '/tmp/paste.png'; };
app.project.rootItem.children[2].getMediaPath = function () { return '/tmp/solid.png'; };

global.qe = {
  project: {
    getActiveSequence: function () { return __qeSeq; },
    getVideoEffectByName: function (n) { return { displayName: n, matchName: n }; },
    getAudioEffectByName: function (n) { return { displayName: n, matchName: n }; },
    getVideoEffectList: function () {
      var names = ['Gaussian Blur', 'Lumetri Color', 'Warp Stabilizer', 'Crop', 'Tint', 'Basic 3D'];
      var list = {};
      for (var i = 0; i < names.length; i++) { list[i] = { displayName: names[i] }; }
      list.length = names.length;
      return list;
    },
    getAudioEffectList: function () { return { length: 0 }; }
  }
};
global.ProjectItemType = { BIN: 2, CLIP: 1 };
global.File = function (p) {
  this.path = p;
  this.fsName = p;
  this.exists = !/missing/.test(p);
  this.length = 2048;
  this.parent = { exists: true, create: function () { return true; } };
  this.open = function () { return true; };
  this.write = function () { return true; };
  this.writeln = function () { return true; };
  this.close = function () { return true; };
};
global.Folder = function (p) { this.fsName = p; this.exists = true; this.create = function () { return true; }; };
global.Folder.myDocuments = { fsName: '/home/tester/Documents' };

/* ---------------- load SY ---------------- */
var SY = {};
global.SY = SY;
var base = path.join(__dirname, '..', 'jsx');
['core/sy-core.jsxinc', 'features/sy-nest.jsxinc', 'features/sy-truedup.jsxinc',
 'features/sy-tools.jsxinc', 'features/sy-audio.jsxinc', 'features/sy-nesting.jsxinc',
 'features/sy-effects.jsxinc', 'features/sy-frames.jsxinc', 'features/sy-layers.jsxinc',
 'features/sy-assets.jsxinc'].forEach(function (f) {
  var code = fs.readFileSync(path.join(base, f), 'utf8');
  try { (0, eval)(code.replace(/^\/\/@include.*$/gm, '')); }
  catch (e) { console.log('LOAD-FAIL', f, e.message); process.exitCode = 1; }
});

function rpc(fn, arg) { return JSON.parse(SY.evalJson(fn, JSON.stringify(arg === undefined ? null : arg))); }
var failed = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + JSON.stringify(extra).slice(0, 180) : ''));
  if (!cond) { failed++; }
}

/* ---------------- Nest ---------------- */
var r = rpc('nestSelection', { name: 'MY NEST' });
check('nestSelection succeeds', r.ok, r.error || r.data && r.data.name);
check('nest keeps the given name', r.ok && r.data.name === 'MY NEST', r.data && r.data.name);
check('nest span covers the whole selection (12.5–20)', r.ok && r.data.span.start === 12.5 && r.data.span.end === 20, r.data && r.data.span);
check('nest holds the 3 selected clips', r.ok && r.data.kept === 3, r.data && r.data.kept);
check('nest dropped the clips outside the span', r.ok && r.data.dropped >= 2, r.data && r.data.dropped);
check('nest clip was placed back at the span start', __log.placed.some(function (p) { return p.at === 12.5 && p.item === 'MY NEST'; }), __log.placed);
check('the originals were lifted before the replace', __log.removed.filter(function (x) { return x.ripple === false; }).length >= 3, __log.removed.length);
check('a new sequence appeared in the project', app.project.sequences.numSequences === 3, app.project.sequences.numSequences);
var nestSeq = app.project.sequences[2];
check('nested clips were shifted so the nest starts at 0',
  nestSeq.videoTracks[0]._clips.every(function (c) { return c.start.seconds >= -0.001 && c.start.seconds < 7.6; }),
  nestSeq.videoTracks[0]._clips.map(function (c) { return c.start.seconds; }));
check('the new sequence inherited the source settings',
  nestSeq.frameSizeHorizontal === 1920 && nestSeq.videoTracks.numTracks === 2, nestSeq.frameSizeHorizontal);

/* ---------------- Nest Separate ---------------- */
/* nestSeparate opens the new sequence, so come back to the parent first */
app.project.activeSequence = SEQ;
/* re-select a clip on the parent timeline */
SEQ.videoTracks[0]._clips.push(mkClip('extra.mp4', 'video', 0, 30, 34, 0, 4, { selected: true }));
var r2 = rpc('nestSeparate', { name: 'LIFTED' });
check('nestSeparate succeeds', r2.ok, r2.error || r2.data && r2.data.name);
check('nestSeparate lifts instead of replacing', r2.ok && r2.data.replaced === false, r2.data && r2.data.replaced);
check('nestSeparate lifted the selected clip', r2.ok && r2.data.lifted === 1, r2.data && r2.data.lifted);
check('nestSeparate put nothing back on the timeline',
  !__log.placed.some(function (p) { return p.item === 'LIFTED'; }), __log.placed.slice(-3));

/* ---------------- Unnest ---------------- */
app.project.activeSequence = SEQ;
SEQ.videoTracks[0]._clips.length = 0;
SEQ.videoTracks[0]._clips.push(__qc);
var beforePlaced = __log.placed.length;
var r3 = rpc('unnestSelection', {});
check('unnestSelection succeeds', r3.ok, r3.error || r3.data && r3.data.details);
check('unnest placed the nest contents', r3.ok && r3.data.placed === 3, r3.data && r3.data.placed);
check('unnest laid shot1 at the nest start (12.5)',
  __log.placed.slice(beforePlaced).some(function (p) { return p.item === 'shot1.mp4' && p.at === 12.5; }),
  __log.placed.slice(beforePlaced));
check('unnest laid shot2 at nest start + 4s',
  __log.placed.slice(beforePlaced).some(function (p) { return p.item === 'shot2.mp4' && Math.abs(p.at - 16.5) < 0.001; }),
  __log.placed.slice(beforePlaced));
check('unnest lifted the nest clip itself',
  __log.removed.some(function (x) { return x.name === 'NEST_A'; }), __log.removed.slice(-2));

/* retimed nests must be refused, not silently mangled */
app.project.activeSequence = SEQ;
var sped = mkClip('FAST_NEST', 'video', 0, 5, 6, 0, 4, { isSequence: true, selected: true });
sped.projectItem = NEST_SRC.projectItem;
SEQ.videoTracks[0]._clips.length = 0;
SEQ.videoTracks[0]._clips.push(sped);
var r4 = rpc('unnestSelection', {});
check('a retimed nest is skipped with a reason', !r4.ok && /retimed/.test(r4.error), r4.error);

/* ---------------- Quick Effects ---------------- */
app.project.activeSequence = SEQ;
SEQ.videoTracks[0]._clips.length = 0;
var fxClip = mkClip('fx.mp4', 'video', 0, 0, 10, 0, 10, { selected: true,
  components: [comp('Opacity', { Opacity: 100, Bypass: false })] });
SEQ.videoTracks[0]._clips.push(fxClip);
var r5 = rpc('applyEffect', { effects: [{ name: 'Gaussian Blur', props: { Blurriness: 18 } }] });
check('applyEffect attaches the effect via QE', r5.ok && __log.effects.some(function (e) { return e.effect === 'Gaussian Blur'; }), r5.error || __log.effects);
check('the effect is readable on the clip afterwards',
  fxClip.components.some(function (c) { return c.displayName === 'Gaussian Blur'; }),
  fxClip.components.map(function (c) { return c.displayName; }));
check('applyEffect wrote Blurriness=18 through the components API',
  __log.props.some(function (p) { return p.comp === 'Gaussian Blur' && p.prop === 'Blurriness' && p.v === 18; }),
  __log.props);
var r6 = rpc('applyEffect', { custom: ['Tint'] });
check('a custom effect name is passed through', r6.ok && __log.effects.some(function (e) { return e.effect === 'Tint'; }), __log.effects.slice(-2));
var r7 = rpc('listEffects', null);
check('listEffects reads the QE video effect list', r7.ok && r7.data.video.length === 6, r7.data.video);
var r8 = rpc('bypassEffect', { name: 'Opacity', on: true });
check('bypassEffect flips the Bypass switch', r8.ok && __log.props.some(function (p) { return p.prop === 'Bypass'; }), __log.props.slice(-2));
var r9 = rpc('applyEffect', { effects: [] });
check('applyEffect with nothing picked is refused', !r9.ok && /at least one/i.test(r9.error), r9.error);

/* ---------------- Layer Tools ---------------- */
var r10 = rpc('moveLayerTrack', { dir: 1, amount: 1 });
check('moveLayerTrack moves the selection up a track', r10.ok && __log.moves.some(function (m) { return m.to === 1; }), __log.moves);
var r11 = rpc('layerStack', null);
check('layerStack reports the video tracks', r11.ok && r11.data.numVideo >= 2, r11.data.numVideo);

var r12 = rpc('addStillLayer', { path: '/tmp/solid.png', durationSec: 4, mode: 'playhead', track: 'top' });
check('addStillLayer places a rendered still on a new top track', r12.ok && r12.data.track >= 1, r12.data);
check('addStillLayer honours the requested duration', r12.ok && Math.abs(r12.data.span.end - r12.data.span.start - 4) < 0.01, r12.data.span);

/* ---------------- Paste image / frames / QC ---------------- */
var r13 = rpc('pasteImage', { path: '/tmp/paste.png', durationSec: 3 });
check('pasteImage imports and places the still', r13.ok && __log.imported.indexOf('/tmp/paste.png') !== -1, r13.data);
check('pasteImage reports the duration it forced', r13.ok && r13.data.duration === 3, r13.data);
var r14 = rpc('pasteImage', { path: '/tmp/missing.png' });
check('pasteImage refuses a missing file', !r14.ok && /not found/i.test(r14.error), r14.error);

/* rebuild a clean V1 with a deliberate hole at 20.0–21.3 s */
SEQ.videoTracks[0] = mkTrack([
  mkClip('a.mp4', 'video', 0, 0, 20, 0, 20, {}),
  mkClip('b.mp4', 'video', 0, 21.3, 30, 0, 8.7, {})
]);
SEQ.videoTracks.numTracks = 1;
var r15 = rpc('blankScan', { minDur: 0.5 });
check('blankScan finds the hole between 20 and 21.3',
  r15.ok && r15.data.holes.some(function (h) { return Math.abs(h.at - 20) < 0.01 && Math.abs(h.until - 21.3) < 0.01; }),
  r15.data.holes);
check('blankScan also reports the tail with nothing on it',
  r15.ok && r15.data.holes.some(function (h) { return Math.abs(h.at - 30) < 0.01; }), r15.data.holes.length);

seedMarkers();
var r16 = rpc('qcClear', { prefix: 'QC' });
check('qcClear removes only the panel\'s QC markers', r16.ok && r16.data.removed === 2, r16.data);
check('qcClear left the user marker alone', __log.deleted.indexOf('Chapter 3') === -1, __log.deleted);
var r17 = rpc('qcClear', { all: true });
check('qcClear with all:true takes everything', r17.ok && r17.data.removed === 1, r17.data);

var r18 = rpc('jumpTo', { seconds: 12.5 });
check('jumpTo moves the playhead', r18.ok && r18.data.at === 12.5, r18.data);

var r19 = rpc('captureFrameTo', { path: '/tmp/cap.png' });
check('captureFrameTo writes through the QE ladder', r19.ok && __log.png === '/tmp/cap.png', r19.data);

var r20 = rpc('nestListSequences', null);
check('nestListSequences lists the project sequences', r20.ok && r20.data.length >= 2, r20.data.length);

/* ---------------- what a download does to the timeline ---------------- */
app.project.activeSequence = SEQ;
__log.placed.length = 0;
var r21 = rpc('assetInsertAtPlayhead', { path: '/tmp/Downloaded Clip.mp4' });
check('assetInsertAtPlayhead imports the downloaded file',
  r21.ok && __log.imported.indexOf('/tmp/Downloaded Clip.mp4') !== -1, r21.error || r21.data);
check('assetInsertAtPlayhead puts it on the timeline at the playhead',
  r21.ok && __log.placed.some(function (p) { return p.item === 'Downloaded Clip.mp4'; }), __log.placed);
check('assetInsertAtPlayhead reports the project item it made',
  r21.ok && r21.data.item === 'Downloaded Clip.mp4', r21.data);

/* freeze → straight back onto the timeline */
app.project.activeSequence = SEQ;
__log.placed.length = 0;
var r22 = rpc('freezeToTimeline', { durationSec: 3, mode: 'insert' });
check('freezeToTimeline captures a frame', r22.ok && /^.*Freeze_.*\.png$/.test(r22.data.path), r22.error || r22.data);
check('freezeToTimeline captures into the freeze folder',
  r22.ok && r22.data.path.indexOf('/SocialYantra/Freeze/') !== -1, r22.data && r22.data.path);
check('freezeToTimeline puts the still back on the timeline',
  r22.ok && __log.placed.length === 1, __log.placed);
check('freezeToTimeline honours the duration', r22.ok && r22.data.duration === 3, r22.data);
check('the capture wrote a PNG through the QE ladder', !!__log.png && /\.png$/.test(__log.png), __log.png);
var r22b = rpc('freezeToTimeline', { folder: '/tmp/fz', durationSec: 1 });
check('freezeToTimeline honours a custom folder', r22b.ok && r22b.data.path.indexOf('/tmp/fz/') === 0, r22b.data && r22b.data.path);

/* ---------------- effect read-back / bypass ---------------- */
app.project.activeSequence = SEQ;
SEQ.videoTracks[0] = mkTrack([mkClip('fx.mp4', 'video', 0, 0, 10, 0, 10, { selected: true,
  components: [comp('Opacity', { Opacity: 100, Bypass: false }), comp('Gaussian Blur', { Blurriness: 18, Bypass: false })] })]);
SEQ.videoTracks.numTracks = 1;
var r23 = rpc('listClipEffects', null);
check('listClipEffects reads the components off the selection',
  r23.ok && r23.data.length === 1 && r23.data[0].effects.indexOf('Gaussian Blur') !== -1,
  r23.error || r23.data);
check('listClipEffects keeps the clip identity for the UI row',
  r23.ok && r23.data[0].name === 'fx.mp4' && r23.data[0].start === 0, r23.data && r23.data[0]);

SEQ.videoTracks[0]._clips[0]._selected = false;
var r24 = rpc('listClipEffects', null);
check('listClipEffects with nothing selected returns an empty list',
  r24.ok && r24.data.length === 0, r24.data);

console.log(failed ? ('\n' + failed + ' NESTING/EFFECTS/LAYER TEST(S) FAILED') : '\nALL NESTING / EFFECTS / LAYER TESTS PASSED');
process.exit(failed ? 1 : 0);
