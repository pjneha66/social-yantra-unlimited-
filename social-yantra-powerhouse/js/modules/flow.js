/* ==========================================================================
 * Module 3 — Interactive Graph Editor 2.0 (Flow tab)
 * 6 math easing models · infinite presets · greedy-fit baking
 * ========================================================================== */
window.FlowMod = (function (SY) {
  'use strict';

  /* ------------------------- easing math ------------------------- */
  function cubicBezier(x1, y1, x2, y2) {
    // returns fn(t)->eased via x-solve (Newton + bisection), like CSS
    function coeff(a, b, t) { return 3 * a * (1 - t) * (1 - t) * t + 3 * b * (1 - t) * t * t + t * t * t; }
    function solveX(t) {
      var lo = 0, hi = 1, x = t, i = 0;
      for (i = 0; i < 8; i++) {
        var gx = coeff(x1, x2, x) - t;
        if (Math.abs(gx) < 1e-6) { return x; }
        var d = 3 * (1 - x) * (1 - x) * x1 + 6 * (1 - x) * x * (x2 - x1) + 3 * x * x * (1 - x2);
        if (Math.abs(d) < 1e-6) { break; }
        x -= gx / d;
        if (x < lo) { x = lo; } else if (x > hi) { x = hi; }
      }
      lo = 0; hi = 1; x = t;
      for (i = 0; i < 24; i++) {
        var v = coeff(x1, x2, x);
        if (Math.abs(v - t) < 1e-6) { return x; }
        if (v < t) { lo = x; } else { hi = x; }
        x = (lo + hi) / 2;
      }
      return x;
    }
    return function (t) { return coeff(y1, y2, solveX(t)); };
  }

  var MODELS = {
    bezier: {
      label: 'Bezier', desc: 'CSS-style handles — drag in the canvas',
      params: { x1: 0.32, y1: 0.06, x2: 0.68, y2: 0.94 },
      fn: function (p, prm) { return cubicBezier(prm.x1, prm.y1, prm.x2, prm.y2)(p); }
    },
    spline: {
      label: 'Spline', desc: 'Catmull-Rom smoothed S-curve',
      params: { curvature: 0.5 },
      fn: function (p, prm) {
        var c = 0.15 + prm.curvature * 1.1; // mapping to bezier-ish
        return cubicBezier(0.5 - c / 2, 0, 0.5 + c / 2, 1)(p);
      }
    },
    elastic: {
      label: 'Elastic', desc: 'springy overshoot',
      params: { amplitude: 1.0, period: 0.38 },
      fn: function (p, prm) {
        if (p === 0 || p === 1) { return p; }
        var a = prm.amplitude, per = Math.max(0.08, prm.period);
        return 1 - Math.pow(2, -10 * p) * Math.cos((p / per) * Math.PI * 2) * a + (p === 1 ? 0 : 0);
      }
    },
    bounce: {
      label: 'Bounce', desc: 'gravity bounce-out',
      params: { bounces: 4 },
      fn: function (p, prm) {
        var n = Math.max(2, Math.round(prm.bounces));
        function f(t) {
          var v = 1, g = Math.pow(1 / n, 1.4);
          for (var i = 0; i < n; i++) {
            var seg = Math.pow(g, i);
            if (t <= seg) {
              var local = t / seg;
              return v - seg / 4 * Math.sin(local * Math.PI);
            }
            v -= seg / 2;
            t -= seg;
          }
          return 1;
        }
        return Math.min(1, Math.max(0, f(p)));
      }
    },
    wave: {
      label: 'Wave', desc: 'damped sine oscillation',
      params: { frequency: 3, decay: 0.55 },
      fn: function (p, prm) {
        var env = Math.pow(1 - prm.decay, p * 3);
        return p + Math.sin(p * prm.frequency * Math.PI * 2) * env * 0.35;
      }
    },
    steps: {
      label: 'Steps', desc: 'staircase / hold steps',
      params: { steps: 5, snap: 'end' },
      fn: function (p, prm) {
        var n = Math.max(2, Math.round(prm.steps));
        var v = Math.floor(p * n) / n;
        return prm.snap === 'start' ? Math.ceil(p * n) / n : v;
      }
    }
  };

  var BASE_PRESETS = [
    { name: 'Smooth (Ease)', model: 'bezier', params: { x1: 0.32, y1: 0.06, x2: 0.68, y2: 0.94 } },
    { name: 'Snappy Pop', model: 'bezier', params: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 } },
    { name: 'Dramatic Lag', model: 'bezier', params: { x1: 0.85, y1: 0, x2: 0.15, y2: 1 } },
    { name: 'Anticipate', model: 'bezier', params: { x1: 0.6, y1: -0.28, x2: 0.28, y2: 1.35 } },
    { name: 'Silk Spline', model: 'spline', params: { curvature: 0.5 } },
    { name: 'Whip Spline', model: 'spline', params: { curvature: 0.95 } },
    { name: 'Soft Spline', model: 'spline', params: { curvature: 0.18 } },
    { name: 'Springy', model: 'elastic', params: { amplitude: 0.8, period: 0.42 } },
    { name: 'Jelly Wobble', model: 'elastic', params: { amplitude: 1.3, period: 0.24 } },
    { name: 'Drop', model: 'bounce', params: { bounces: 4 } },
    { name: 'Basketball', model: 'bounce', params: { bounces: 7 } },
    { name: 'Hum', model: 'wave', params: { frequency: 3, decay: 0.55 } },
    { name: 'Shake In', model: 'wave', params: { frequency: 7, decay: 0.75 } },
    { name: 'Tick 4', model: 'steps', params: { steps: 4, snap: 'end' } },
    { name: 'Tick 8 Snap', model: 'steps', params: { steps: 8, snap: 'start' } }
  ];

  /* ------------------------- state ------------------------- */
  var state = { model: 'bezier', params: clone(MODELS.bezier.params), lib: 'base' };
  var canvas, ctx, W = 0, H = 0, drag = null, fitPts = [];

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function currentFn() {
    var m = MODELS[state.model];
    return function (p) { return m.fn(p, state.params); };
  }

  /* ------------------------- init ------------------------- */
  function init() {
    canvas = document.getElementById('flowCanvas');
    if (!canvas) { return; }
    ctx = canvas.getContext('2d');
    buildPicks();
    buildParams();
    resize();
    window.addEventListener('resize', resize);
    canvas.addEventListener('mousedown', down);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup', up);
    canvas.addEventListener('mouseleave', function () { drag = null; });

    var budget = document.getElementById('flowKeys');
    budget.addEventListener('input', function () {
      document.getElementById('flowKeysV').textContent = budget.value;
      refit();
    });
    document.getElementById('flowProp').addEventListener('change', function () {
      var spatial = /Position|Anchor/.test(document.getElementById('flowProp').value);
      document.getElementById('flowSpatial').style.display = spatial ? 'grid' : 'none';
    });
    document.getElementById('flowBake').addEventListener('click', bake);
    document.getElementById('flowSavePreset').addEventListener('click', savePreset);
    var tabs = document.querySelectorAll('#flowLibTabs .chip');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function (e) {
        var t = e.target;
        for (var k = 0; k < tabs.length; k++) { tabs[k].classList.toggle('on', tabs[k] === t); }
        state.lib = t.getAttribute('data-lib');
        renderPresets();
      });
    }
    renderPresets();
    bindListOnce();
    refit();
  }

  function buildPicks() {
    var box = document.getElementById('flowPicks');
    var icons = {
      bezier: 'M0,26 C8,2 18,24 26,0',
      spline: 'M0,26 C4,4 22,22 26,0',
      elastic: 'M0,26 L4,6 L8,18 L12,10 L16,15 L20,12 L26,0',
      bounce: 'M0,0 L0,10 L8,26 L12,16 L16,24 L20,19 L26,22',
      wave: 'M0,13 Q4,2 8,13 T16,13 T24,13 L26,13',
      steps: 'M0,26 L8,26 L8,19 L15,19 L15,12 L22,12 L22,5 L26,5'
    };
    box.innerHTML = Object.keys(MODELS).map(function (k) {
      return '<div class="ep' + (k === state.model ? ' on' : '') + '" data-m="' + k + '">' +
        '<svg viewBox="0 0 26 26" preserveAspectRatio="none"><path d="' + icons[k] + '"/></svg>' +
        '<div>' + MODELS[k].label + '</div></div>';
    }).join('');
    var eps = box.querySelectorAll('.ep');
    for (var i = 0; i < eps.length; i++) {
      eps[i].addEventListener('click', function (e) {
        var el = e.currentTarget, k = el.getAttribute('data-m');
        state.model = k;
        state.params = clone(MODELS[k].params);
        for (var j = 0; j < eps.length; j++) { eps[j].classList.toggle('on', eps[j] === el); }
        buildParams();
        refit(); draw();
        document.getElementById('flowStat').textContent = MODELS[k].label + ' — ' + MODELS[k].desc;
      });
    }
  }

  function buildParams() {
    var grid = document.getElementById('flowParamGrid');
    var prms = MODELS[state.model].params;
    var html = '';
    var labels = {
      x1: 'Handle 1 X', y1: 'Handle 1 Y', x2: 'Handle 2 X', y2: 'Handle 2 Y',
      curvature: 'Curvature', amplitude: 'Amplitude', period: 'Period',
      bounces: 'Bounces', frequency: 'Frequency', decay: 'Decay', steps: 'Steps'
    };
    Object.keys(prms).forEach(function (k) {
      var v = state.params[k];
      if (typeof v === 'number') {
        var max = k === 'bounces' || k === 'steps' || k === 'frequency' ? 12 : (k === 'x1' || k === 'x2' ? 1 : 2);
        var min = k === 'x1' || k === 'x2' ? 0 : (k === 'steps' || k === 'bounces' ? 2 : 0);
        html += '<div class="field"><label>' + (labels[k] || k) + '</label>' +
          '<div class="range-line"><input type="range" data-p="' + k + '" min="' + min + '" max="' + max + '" step="' +
          (max > 4 ? 1 : 0.01) + '" value="' + v + '"><span class="val">' + v.toFixed(2) + '</span></div></div>';
      } else {
        html += '<div class="field"><label>' + (labels[k] || k) + '</label><select data-p="' + k + '">' +
          '<option' + (v === 'end' ? ' selected' : '') + '>end</option><option' + (v === 'start' ? ' selected' : '') + '>start</option></select></div>';
      }
    });
    if (!Object.keys(prms).length) { html = '<div class="note mt0" style="grid-column:1/-1">Drag the two handles directly in the graph. Right handle pulls the landing, left handle the launch.</div>'; }
    grid.innerHTML = html;
    var inputs = grid.querySelectorAll('[data-p]');
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].addEventListener('input', function (e) {
        var k = e.target.getAttribute('data-p');
        state.params[k] = e.target.type === 'range' ? +e.target.value : e.target.value;
        var val = e.target.parentNode.querySelector('.val');
        if (val) { val.textContent = (+state.params[k]).toFixed(2); }
        refit(); draw();
      });
    }
  }

  /* ------------------------- canvas ------------------------- */
  function resize() {
    var wrap = canvas.parentNode;
    W = canvas.width = wrap.clientWidth;
    H = canvas.height = 230;
    draw();
  }

  function px(p) { return { x: 18 + p * (W - 36), y: H - 18 - p * (H - 36) }; }

  function draw() {
    if (!ctx) { return; }
    ctx.clearRect(0, 0, W, H);
    // grid
    ctx.strokeStyle = '#202632'; ctx.lineWidth = 1;
    for (var g = 0; g <= 8; g++) {
      var gx = 18 + (g / 8) * (W - 36), gy = H - 18 - (g / 8) * (H - 36);
      ctx.beginPath(); ctx.moveTo(gx, 8); ctx.lineTo(gx, H - 18); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(18, gy); ctx.lineTo(W - 18, gy); ctx.stroke();
    }
    var f = currentFn();
    // curve
    ctx.strokeStyle = '#29d3c8'; ctx.lineWidth = 2.4;
    ctx.beginPath();
    var N = 240;
    for (var i = 0; i <= N; i++) {
      var p = i / N, v = f(p);
      var pt = px(p);
      var ptv = px(Math.max(-0.5, Math.min(1.5, v)));
      if (i === 0) { ctx.moveTo(pt.x, ptv.y); } else { ctx.lineTo(pt.x, ptv.y); }
    }
    ctx.stroke();
    // greedy-fit points
    ctx.fillStyle = '#7c5cff';
    fitPts.forEach(function (pt) {
      var a = px(pt.p), b = px(pt.v);
      ctx.beginPath(); ctx.arc(b.x, a.y, 3, 0, 7); ctx.fill();
    });
    // bezier handles
    if (state.model === 'bezier') {
      var h1 = px(state.params.x1), h2 = px(state.params.x2);
      var vy1 = px(Math.max(-0.5, Math.min(1.5, state.params.y1))).y;
      var vy2 = px(Math.max(-0.5, Math.min(1.5, state.params.y2))).y;
      ctx.strokeStyle = 'rgba(124,92,255,.55)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(px(0).x, px(0).y); ctx.lineTo(h1.x, vy1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px(1).x, px(1).y); ctx.lineTo(h2.x, vy2); ctx.stroke();
      [[h1.x, vy1, state.params.y1], [h2.x, vy2, state.params.y2]].forEach(function (h) {
        ctx.fillStyle = '#7c5cff';
        ctx.beginPath(); ctx.arc(h[0], h[1], 5.5, 0, 7); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      });
    }
    // labels
    ctx.fillStyle = '#6f7a90'; ctx.font = '10px Consolas, monospace';
    ctx.fillText('time →', W - 54, H - 6);
    ctx.fillText('↑ value', 4, 14);
  }

  function down(e) {
    if (state.model !== 'bezier') { return; }
    var r = canvas.getBoundingClientRect();
    var mx = e.clientX - r.left, my = e.clientY - r.top;
    var h1 = px(state.params.x1), h2 = px(state.params.x2);
    var vy1 = px(state.params.y1).y, vy2 = px(state.params.y2).y;
    if (dist(mx, my, h1.x, vy1) < 16) { drag = 1; }
    else if (dist(mx, my, h2.x, vy2) < 16) { drag = 2; }
  }
  function move(e) {
    if (!drag) { return; }
    var r = canvas.getBoundingClientRect();
    var mx = e.clientX - r.left, my = e.clientY - r.top;
    var p = Math.max(0, Math.min(1, (mx - 18) / (W - 36)));
    var v = Math.max(-0.5, Math.min(1.5, (H - 18 - my) / (H - 36)));
    if (drag === 1) { state.params.x1 = p; state.params.y1 = v; }
    if (drag === 2) { state.params.x2 = p; state.params.y2 = v; }
    buildParams(); refit(); draw();
  }
  function up() { drag = null; }
  function dist(a, b, c, d) { var x = a - c, y = b - d; return Math.sqrt(x * x + y * y); }

  /* ------------------------- greedy fit ------------------------- */
  function sampleCurve(n) {
    var f = currentFn(), out = [];
    for (var i = 0; i <= n; i++) { var p = i / n; out.push({ p: p, v: f(p) }); }
    return out;
  }
  function douglasPeucker(pts, tol) {
    if (pts.length < 3) { return pts.slice(); }
    var keep = [0, pts.length - 1];
    var stack = [[0, pts.length - 1]];
    while (stack.length) {
      var seg = stack.pop(), i0 = seg[0], i1 = seg[1];
      var maxD = -1, maxI = -1;
      var a = pts[i0], b = pts[i1];
      var dx = b.p - a.p, dy = b.v - a.v;
      var len = Math.sqrt(dx * dx + dy * dy) || 1e-9;
      for (var i = i0 + 1; i < i1; i++) {
        var d = Math.abs(dy * (pts[i].p - a.p) - dx * (pts[i].v - a.v)) / len;
        if (d > maxD) { maxD = d; maxI = i; }
      }
      if (maxD > tol && maxI > 0) {
        keep.push(maxI);
        stack.push([i0, maxI], [maxI, i1]);
      }
    }
    keep.sort(function (x, y) { return x - y; });
    return keep.map(function (i) { return pts[i]; });
  }
  function refit() {
    var budget = Math.max(4, +document.getElementById('flowKeys').value || 48);
    var pts = sampleCurve(120);
    var lo = 0.0002, hi = 0.5, best = null;
    for (var it = 0; it < 18; it++) {
      var mid = (lo + hi) / 2;
      var r = douglasPeucker(pts, mid);
      if (r.length <= budget) { best = r; hi = mid; }
      else { lo = mid; }
      if (hi - lo < 0.0004) { break; }
    }
    fitPts = best && best.length ? best : [pts[0], pts[pts.length - 1]];
  }

  /* ------------------------- presets ------------------------- */
  function renderPresets() {
    var list = document.getElementById('flowPresets');
    var items = [];
    if (state.lib === 'base') { items = BASE_PRESETS; }
    else if (state.lib === 'user') {
      items = getUserPresets();
    } else {
      items = getLocalPresets();
    }
    if (!items.length) {
      list.innerHTML = '<div class="empty">' + (state.lib === 'user' ? 'Save your first curve below.' : 'Drop .json presets in presets/flow/ inside the panel folder.') + '</div>';
      return;
    }
    list.innerHTML = items.map(function (p, i) {
      return '<div class="list-row" data-i="' + i + '"><span class="grow"><b>' + SY.esc(p.name) + '</b> <span class="mini">' +
        (p.model || '?') + '</span></span>' +
        '<button class="btn sm" data-apply="' + i + '">Apply</button>' +
        (state.lib === 'user' ? '<button class="btn sm danger" data-del="' + i + '">✕</button>' : '') + '</div>';
    }).join('');
  }
  var listBound = false;
  function onClickList(e) {
    var apply = e.target.getAttribute && e.target.getAttribute('data-apply');
    var del = e.target.getAttribute && e.target.getAttribute('data-del');
    if (apply !== null && apply !== undefined) {
      var items = state.lib === 'base' ? BASE_PRESETS : (state.lib === 'user' ? getUserPresets() : getLocalPresets());
      var p = items[+apply];
      if (p) { applyPreset(p); }
    } else if (del !== null && del !== undefined) {
      var ups = getUserPresets(); ups.splice(+del, 1);
      localStorage.setItem('syFlowPresets', JSON.stringify(ups));
      renderPresets();
    }
  }
  function bindListOnce() {
    if (listBound) { return; }
    listBound = true;
    document.getElementById('flowPresets').addEventListener('click', onClickList);
  }
  function applyPreset(p) {
    state.model = p.model;
    state.params = clone(p.params);
    var eps = document.querySelectorAll('#flowPicks .ep');
    for (var i = 0; i < eps.length; i++) { eps[i].classList.toggle('on', eps[i].getAttribute('data-m') === p.model); }
    buildParams(); refit(); draw();
    SY.toast('Preset applied: ' + p.name);
  }
  function getUserPresets() {
    try { return JSON.parse(localStorage.getItem('syFlowPresets') || '[]'); } catch (e) { return []; }
  }
  function getLocalPresets() {
    if (!SY.hasNode || !SY.inCEP) { return []; }
    var dir = null;
    try {
      var extPath = SY.cs.getSystemPath(SystemPath.EXTENSION);
      dir = SY.require('path').join(extPath, 'presets', 'flow');
    } catch (e) { return []; }
    var out = [];
    SY.walk(dir, 0).forEach(function (f) {
      if (!f.dir && f.ext === '.json') {
        var t = SY.readText(f.path);
        try { var j = JSON.parse(t); if (j && j.model && j.params) { out.push({ name: j.name || f.name, model: j.model, params: j.params }); } } catch (x) {}
      }
    });
    return out;
  }
  function savePreset() {
    var name = (document.getElementById('flowPresetName').value || '').trim();
    if (!name) { SY.toast('Name the preset first', 'warn'); return; }
    var ups = getUserPresets();
    ups.push({ name: name, model: state.model, params: clone(state.params) });
    localStorage.setItem('syFlowPresets', JSON.stringify(ups));
    document.getElementById('flowPresetName').value = '';
    SY.toast('Saved "' + name + '" to My Curves', 'ok');
    renderPresets();
  }

  /* ------------------------- bake ------------------------- */
  function bake() {
    var prop = document.getElementById('flowProp').value;
    var spatial = /Position|Anchor/.test(prop);
    var anti = document.getElementById('flowAnti').checked;
    var from = parseFloat(document.getElementById('flowFrom').value) || 0;
    var to = parseFloat(document.getElementById('flowTo').value);
    if (isNaN(to)) { to = 100; }
    var keys = fitPts.map(function (pt) {
      var v = pt.v;
      if (anti && spatial) { v = Math.max(0, Math.min(1, v)); } // envelope clamp
      return { p: +pt.p.toFixed(5), v: +v.toFixed(5) };
    });
    if (spatial) {
      var fxy = parseXY(document.getElementById('flowFromXY').value);
      var txy = parseXY(document.getElementById('flowToXY').value);
      if (!fxy || !txy) { SY.toast('From/To X,Y must look like "160, -90"', 'warn'); return; }
      var arg = buildArg(prop, keys, anti);
      arg.fromXY = fxy; arg.toXY = txy; arg.spatialOffset = true;
      send(arg);
    } else {
      var arg2 = buildArg(prop, keys, anti);
      arg2.from = from; arg2.to = to;
      send(arg2);
    }
    function send(a) {
      SY.busy(document.getElementById('flowBake'), true);
      SY.log('bake ' + prop + ' keys=' + a.keys.length + (a.fromXY ? ' spatial' : ''));
      SY.call('bakeCurve', a, function (r) {
        SY.busy(document.getElementById('flowBake'), false);
        var stat = document.getElementById('flowStat');
        if (!r.ok) { stat.textContent = '❌ ' + r.error; SY.toast(r.error, 'err', 5000); return; }
        stat.innerHTML = '✅ Baked ' + a.keys.length + ' keyframes (greedy-fit) → ' +
          (r.data.clips || []).join(' · ') + (r.data.note ? ' — ' + r.data.note : '');
        SY.toast('Curve baked to keyframes', 'ok');
      });
    }
  }
  function buildArg(prop, keys, anti) {
    return {
      prop: prop,
      range: document.getElementById('flowRange').value,
      duration: parseFloat(document.getElementById('flowDur').value) || 1,
      customStart: 0,
      customEnd: parseFloat(document.getElementById('flowDur').value) || 1,
      antiOvershoot: anti,
      keys: keys
    };
  }
  function parseXY(s) {
    var m = /^\s*(-?[\d.]+)\s*[, ]\s*(-?[\d.]+)\s*$/.exec(s || '');
    return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
  }

  return { init: init, refit: function () { refit(); draw(); } };
})(window.SY);
