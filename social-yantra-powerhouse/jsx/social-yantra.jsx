/* ==========================================================================
 * SOCIAL YANTRA POWERHOUSE PANEL — ExtendScript host script
 * Loaded automatically by the CEP manifest (ScriptPath).
 * Panels call SY.evalJson(fnName, argJson) — every call returns JSON:
 *   { ok:true, data:… } | { ok:false, error:'…' }
 * ========================================================================== */

var SY = {};

//@include "core/sy-core.jsxinc"
//@include "features/sy-silence.jsxinc"
//@include "features/sy-flow.jsxinc"
//@include "features/sy-wordpop.jsxinc"
//@include "features/sy-nest.jsxinc"
//@include "features/sy-assets.jsxinc"
//@include "features/sy-truedup.jsxinc"
//@include "features/sy-tools.jsxinc"

/* Ping */
SY.ping = function () {
  return {
    ok: true,
    data: {
      app: app.appName,
      version: app.version,
      build: app.buildName,
      project: app.project ? app.project.name : '',
      qe: (typeof qe !== 'undefined' && qe && qe.project) ? 'available' : 'unavailable'
    }
  };
};
