/* ==========================================================================
 * Social Yantra Powerhouse — Chapters & Marker engine
 * Builds chapter lists from anything the panel already knows about a
 * timeline (Whisper transcript, QC scan issues, silence gaps, duck regions,
 * existing sequence markers) and serialises them to CSV, YouTube chapters,
 * SRT, JSON or Premiere markers.
 *
 * Pure functions — no Node, no Premiere — so they unit-test cleanly.
 * ========================================================================== */
window.SYChapters = (function (SY) {
  'use strict';

  var DEFAULTS = {
    gapSec: 1.2,          // transcript pause that starts a new chapter
    maxWords: 60,         // hard cap per chapter
    maxDur: 60,           // seconds cap per chapter
    minChapterSec: 10,    // YouTube requires chapters of at least 10 s
    titleWords: 6,        // words lifted into the title
    titleStyle: 'first',  // 'first' | 'index' | 'none'
    prefix: '',           // "Chapter {n} — " style prefix, optional
    zeroFirst: true,      // force the first chapter to 00:00 (YouTube rule)
    endAt: null           // duration of the sequence, closes the last chapter
  };

  function o(opts, k) { return (opts && opts[k] !== undefined && opts[k] !== null && opts[k] !== '') ? opts[k] : DEFAULTS[k]; }

  function clean(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
  }

  var SMALL = { a: 1, an: 1, the: 1, and: 1, or: 1, but: 1, of: 1, to: 1, in: 1, on: 1, for: 1, with: 1, at: 1, by: 1, is: 1, it: 1 };

  function titleCase(s) {
    return s.split(' ').map(function (w, i) {
      if (!w) { return w; }
      if (i > 0 && SMALL[w.toLowerCase()]) { return w.toLowerCase(); }
      // leave Devanagari / already-capitalised words alone
      if (/[^\u0000-\u007f]/.test(w)) { return w; }
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }).join(' ');
  }

  function makeTitle(text, index, opts) {
    var style = o(opts, 'titleStyle');
    var prefix = String(o(opts, 'prefix') || '');
    var body;
    if (style === 'index') { body = 'Chapter ' + (index + 1); }
    else if (style === 'none') { body = ''; }
    else {
      var all = clean(text).split(' ').filter(Boolean);
      var words = all.slice(0, Math.max(1, +o(opts, 'titleWords')));
      // never end a title on a dangling "the" / "of" / "to"
      while (words.length > 1 && SMALL[words[words.length - 1].toLowerCase()]) { words.pop(); }
      body = titleCase(words.join(' '));
      if (all.length > words.length) { body += '…'; }
    }
    var t = prefix.replace(/\{n\}/g, String(index + 1)) + body;
    return clean(t) || ('Chapter ' + (index + 1));
  }

  /* ------------------------- builders ------------------------- */

  /* Transcript words -> chapters (pause / length driven). */
  function buildFromWords(words, opts) {
    words = (words || []).slice().sort(function (a, b) { return a.start - b.start; });
    if (!words.length) { return []; }
    var gapSec = +o(opts, 'gapSec');
    var maxWords = Math.max(1, +o(opts, 'maxWords'));
    var maxDur = +o(opts, 'maxDur');
    var chapters = [], cur = null;

    function close() {
      if (!cur) { return; }
      chapters.push({ start: cur.start, end: cur.words[cur.words.length - 1].end, text: cur.words.map(function (w) { return w.w; }).join(' ') });
      cur = null;
    }
    words.forEach(function (w) {
      if (!cur) { cur = { start: w.start, words: [w] }; return; }
      var last = cur.words[cur.words.length - 1];
      var pause = w.start - last.end;
      var tooLong = cur.words.length >= maxWords || (w.end - cur.start) > maxDur;
      if (pause >= gapSec || tooLong) { close(); cur = { start: w.start, words: [w] }; }
      else { cur.words.push(w); }
    });
    close();
    return chapters;
  }

  /* Generic [start,end] intervals (silence gaps, duck regions, beat bars). */
  function buildFromIntervals(iv, opts) {
    var out = [];
    (iv || []).forEach(function (x) {
      var s = Array.isArray(x) ? x[0] : x.start;
      var e = Array.isArray(x) ? x[1] : x.end;
      var label = Array.isArray(x) ? '' : (x.title || x.text || x.word || '');
      out.push({ start: +s, end: +e, text: clean(label) });
    });
    return out;
  }

  /* Existing sequence markers -> chapters (uses marker end when it has one). */
  function buildFromMarkers(markers, opts) {
    var ms = (markers || []).slice().sort(function (a, b) { return a.at - b.at; });
    var out = [];
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i];
      var end = (m.until !== undefined && m.until > m.at) ? m.until : (ms[i + 1] ? ms[i + 1].at : (+o(opts, 'endAt') || m.at + 10));
      out.push({ start: m.at, end: end, text: clean(m.name || m.comments || '') });
    }
    return out;
  }

  /* QC issues -> chapters (each issue becomes a review chapter). */
  function buildFromIssues(issues, opts) {
    var out = [];
    (issues || []).forEach(function (iss) {
      out.push({
        start: +iss.at,
        end: (iss.until && iss.until > iss.at) ? +iss.until : (+iss.at + 2),
        text: clean(iss.text || iss.kind || 'issue'),
        kind: iss.kind
      });
    });
    return out.sort(function (a, b) { return a.start - b.start; });
  }

  /* ------------------------- normalisation ------------------------- */

  /* Merge chapters that are too short for YouTube, force the 00:00 start,
   * close the final chapter at the sequence end, and assign titles. */
  function finalize(chapters, opts) {
    var minSec = +o(opts, 'minChapterSec');
    var endAt = o(opts, 'endAt');
    var list = (chapters || []).slice()
      .filter(function (c) { return isFinite(c.start); })
      .sort(function (a, b) { return a.start - b.start; });
    if (!list.length) { return []; }

    if (o(opts, 'zeroFirst')) { list[0].start = 0; }

    // merge anything shorter than the minimum chapter length
    var merged = [];
    list.forEach(function (c) {
      var last = merged[merged.length - 1];
      if (last && (c.start - last.start) < minSec) {
        last.end = Math.max(last.end || last.start, c.end || c.start);
        last.text = clean((last.text ? last.text + ' · ' : '') + (c.text || ''));
        last.merged = (last.merged || 1) + 1;
      } else {
        merged.push({ start: c.start, end: c.end || c.start, text: c.text || '', kind: c.kind });
      }
    });
    /* YouTube chapters are points: each one runs until the next starts.
     * Chain first, then fold a runt — the real length of a chapter is its
     * span to the next one, not the length of its own speech. */
    function chain(list) {
      for (var i = 0; i < list.length; i++) {
        var next = list[i + 1];
        list[i].end = next ? next.start
          : (endAt !== null && endAt !== '' && +endAt > list[i].start
            ? +endAt
            : Math.max(list[i].end || list[i].start, list[i].start + 1));
      }
      return list;
    }
    chain(merged);

    // fold a trailing runt into its neighbour (YouTube ignores <10 s chapters)
    while (merged.length > 1) {
      var lastCh = merged[merged.length - 1];
      var prev = merged[merged.length - 2];
      if ((lastCh.end - lastCh.start) < minSec || (lastCh.start - prev.start) < minSec) {
        prev.end = lastCh.end;
        prev.text = clean((prev.text ? prev.text + ' · ' : '') + lastCh.text);
        merged.pop();
        chain(merged);
      } else { break; }
    }

    for (var i = 0; i < merged.length; i++) {
      merged[i].duration = Math.round((merged[i].end - merged[i].start) * 100) / 100;
      merged[i].index = i + 1;
      merged[i].title = makeTitle(merged[i].text, i, opts);
    }
    return merged;
  }

  /* ------------------------- serialisers ------------------------- */

  function tc(sec, compact) {
    if (!isFinite(sec) || sec < 0) { sec = 0; }
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
    function p2(n) { return (n < 10 ? '0' : '') + n; }
    if (compact && h === 0) { return p2(m) + ':' + p2(s); }
    return p2(h) + ':' + p2(m) + ':' + p2(s);
  }
  function tcMs(sec) {
    var ms = Math.round((sec - Math.floor(sec)) * 1000);
    return tc(sec) + ',' + (ms < 10 ? '00' : ms < 100 ? '0' : '') + ms;
  }
  function csvField(v) {
    var s = String(v == null ? '' : v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSV(chapters, opts) {
    var rows = [['#', 'start', 'end', 'duration_s', 'timecode', 'title', 'transcript']];
    chapters.forEach(function (c, i) {
      rows.push([i + 1, tc(c.start), tc(c.end), (c.duration !== undefined ? c.duration : (c.end - c.start)).toFixed(2),
        c.start.toFixed(3), c.title || '', clean(c.text).slice(0, 400)]);
    });
    return rows.map(function (r) { return r.map(csvField).join(','); }).join('\r\n') + '\r\n';
  }

  /* YouTube description chapters — first line must be 00:00.
   * YouTube's own chapter list uses MM:SS under an hour, H:MM:SS above it. */
  function toYouTube(chapters, opts) {
    var lines = chapters.map(function (c) { return tc(c.start, true) + ' ' + (c.title || ('Chapter ' + c.index)); });
    return lines.join('\n') + '\n';
  }

  /* Same list wrapped in a paste-ready YouTube description block. */
  function toYouTubeDescription(chapters, opts) {
    var head = (opts && opts.videoTitle ? opts.videoTitle + '\n\n' : '');
    return head + 'Chapters:\n' + toYouTube(chapters, opts) + '\n#chapters\n';
  }

  function toSRT(chapters) {
    return chapters.map(function (c, i) {
      return (i + 1) + '\n' + tcMs(c.start) + ' --> ' + tcMs(c.end) + '\n' + (c.title || '') + '\n';
    }).join('\n');
  }

  function toJSON(chapters, opts) {
    return JSON.stringify({
      generatedBy: 'Social Yantra Powerhouse',
      at: new Date().toISOString(),
      count: chapters.length,
      chapters: chapters.map(function (c) {
        return { index: c.index, start: +c.start.toFixed(3), end: +c.end.toFixed(3), title: c.title, transcript: clean(c.text) };
      })
    }, null, 2);
  }

  /* Payload for SY.addMarkers (drops them onto the Premiere ruler). */
  function toMarkerPayload(chapters, opts) {
    var type = (opts && opts.markerType) || 'Chapter';
    return chapters.map(function (c) {
      return { at: c.start, name: c.title || ('Chapter ' + c.index), comments: clean(c.text).slice(0, 300), type: type };
    });
  }

  var FORMATS = {
    csv: { ext: '.csv', mime: 'text/csv', label: 'CSV (spreadsheet / editor)', fn: toCSV },
    youtube: { ext: '.txt', mime: 'text/plain', label: 'YouTube chapters', fn: toYouTube },
    ytdesc: { ext: '.txt', mime: 'text/plain', label: 'YouTube description block', fn: toYouTubeDescription },
    srt: { ext: '.srt', mime: 'text/plain', label: 'SRT subtitles', fn: toSRT },
    json: { ext: '.json', mime: 'application/json', label: 'JSON', fn: toJSON }
  };

  function serialize(fmt, chapters, opts) {
    var f = FORMATS[fmt] || FORMATS.csv;
    return f.fn(chapters, opts);
  }

  /* YouTube sanity report (3+ chapters, each ≥10 s, starts at 00:00). */
  function youTubeCheck(chapters) {
    var problems = [];
    if (chapters.length < 3) { problems.push('YouTube needs at least 3 chapters (you have ' + chapters.length + ').'); }
    if (!chapters.length || chapters[0].start > 0.01) { problems.push('The first chapter must start at 00:00.'); }
    var short = chapters.filter(function (c) { return (c.end - c.start) < 9.5; });
    if (short.length) { problems.push(short.length + ' chapter(s) shorter than 10 s — YouTube will ignore them.'); }
    return problems;
  }

  return {
    DEFAULTS: DEFAULTS,
    FORMATS: FORMATS,
    buildFromWords: buildFromWords,
    buildFromIntervals: buildFromIntervals,
    buildFromMarkers: buildFromMarkers,
    buildFromIssues: buildFromIssues,
    finalize: finalize,
    toCSV: toCSV,
    toYouTube: toYouTube,
    toYouTubeDescription: toYouTubeDescription,
    toSRT: toSRT,
    toJSON: toJSON,
    toMarkerPayload: toMarkerPayload,
    serialize: serialize,
    youTubeCheck: youTubeCheck,
    tc: tc,
    tcMs: tcMs,
    titleCase: titleCase
  };
})(window.SY);
