/* ==========================================================================
 * Module 14 — Sequence-in-Sequence: Nest · Unnest · Nest Separate
 * ========================================================================== */
window.NestSeqMod = (function (SY) {
  'use strict';

  function el(id) { return document.getElementById(id); }

  function init() {
    if (!el('tlNestGo')) { return; }

    el('tlNestGo').addEventListener('click', function () { run('nestSelection', nestArg()); });
    el('tlSepGo').addEventListener('click', function () {
      run('nestSeparate', {
        name: (el('tlSepName').value || '').trim(),
        openAfter: el('tlSepOpen').checked
      });
    });
    el('tlUnnestGo').addEventListener('click', function () { run('unnestSelection', {}); });
    el('tlSeqList').addEventListener('click', function (e) {
      var row = e.target.closest ? e.target.closest('.list-row') : null;
      if (!row) { return; }
      var name = row.getAttribute('data-name') || '';
      el('tlNestName').value = name;
      SY.toast('Name preset from "' + name + '"', 'ok', 2200);
    });
    refresh();
  }

  function nestArg() {
    return {
      name: (el('tlNestName').value || '').trim(),
      keepHandles: +el('tlNestHandles').value || 0,
      openAfter: el('tlNestOpen').checked
    };
  }

  function run(fn, arg) {
    var btn = el(fn === 'nestSelection' ? 'tlNestGo' : (fn === 'nestSeparate' ? 'tlSepGo' : 'tlUnnestGo'));
    var stat = el(fn === 'unnestSelection' ? 'tlUnnestStat' : 'tlNestStat');
    SY.busy(btn, true);
    stat.textContent = fn === 'unnestSelection' ? 'Laying the nest contents back on the timeline…' : 'Building the nested sequence…';

    SY.call(fn, arg, function (r) {
      SY.busy(btn, false);
      if (!r.ok) {
        stat.textContent = '❌ ' + r.error;
        SY.toast(r.error, 'err', 6500);
        return;
      }
      var d = r.data;
      if (fn === 'unnestSelection') {
        stat.innerHTML = '✅ Unnested <b>' + d.placed + '</b> clip(s) from ' + d.nests + ' nest(s)' +
          (d.skipped ? ' · <span style="color:var(--warn)">' + d.skipped + ' skipped</span>' : '') +
          '<br><span class="mini">' + (d.details || []).map(SY.esc).join('<br>') + '</span>';
        SY.toast(d.placed + ' clip(s) laid back on the timeline', 'ok', 4200);
      } else {
        stat.innerHTML = '✅ <b>' + SY.esc(d.name) + '</b> — ' + SY.esc(d.note) +
          '<br><span class="mini">span ' + d.span.start.toFixed(2) + 's → ' + d.span.end.toFixed(2) + 's (' +
          d.duration.toFixed(2) + 's)' + (d.dropped ? ' · ' + d.dropped + ' clip(s) left out' : '') +
          (d.shiftFails ? ' · <span style="color:var(--warn)">' + d.shiftFails + ' shift(s) refused</span>' : '') + '</span>';
        SY.toast(d.name + ' created', 'ok', 4200);
      }
      SY.log(fn + ': ' + JSON.stringify(d).slice(0, 300), 'ok');
      refresh();
    });
  }

  /* Sequence list — handy for picking a nest name that won't collide. */
  function refresh() {
    var list = el('tlSeqList');
    if (!list) { return; }
    SY.call('nestListSequences', null, function (r) {
      if (!r.ok || !r.data || !r.data.length) {
        list.innerHTML = '<div class="empty">No sequences in this project yet.</div>';
        return;
      }
      list.innerHTML = r.data.map(function (s) {
        return '<div class="list-row" data-name="' + SY.esc(s.name) + '" style="cursor:pointer">' +
          '<span class="grow">' + SY.esc(s.name) + '</span>' +
          '<span class="tag muted">' + s.clips + ' clips</span>' +
          '<span class="mono">' + s.duration.toFixed(1) + 's</span></div>';
      }).join('');
    });
  }

  return { init: init, refresh: refresh };
})(window.SY);
