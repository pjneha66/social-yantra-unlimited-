/*
 * Social Yantra Powerhouse Panel — CSInterface bridge (compatible subset).
 * Lightweight re-implementation of the parts of Adobe's CSInterface the panel
 * uses. When the panel runs inside Premiere Pro, window.__adobe_cep__ exists;
 * in a normal browser the panel falls back to Demo Mode (see js/core/demo.js).
 */
function CSInterface() {}

CSInterface.SYSTEM = {
  WINDOWS: 'Win',
  MACOS: 'Mac'
};

CSInterface.prototype.getHostEnvironment = function () {
  try {
    if (window.__adobe_cep__) {
      return JSON.parse(window.__adobe_cep__.getHostEnvironment());
    }
  } catch (e) { /* demo */ }
  return { appInfo: 'PPRO::25.0 (Demo)', scaleFactor: 1 };
};

CSInterface.prototype.getSystemPath = function (pathType) {
  if (!window.__adobe_cep__) { return ''; }
  var path = decodeURI(window.__adobe_cep__.getSystemPath(pathType));
  return path.replace('file://', '').replace(/^\/([A-Za-z]:)/, '$1');
};

CSInterface.prototype.evalScript = function (script, callback) {
  if (window.__adobe_cep__) {
    window.__adobe_cep__.evalScript(script, callback || function () {});
  } else if (window.SY_DEMO_EVAL) {
    window.SY_DEMO_EVAL(script, callback || function () {});
  } else {
    (callback || function () {})('EvalScript error.');
  }
};

CSInterface.prototype.openURLInDefaultBrowser = function (url) {
  if (window.cep && window.cep.util) {
    return window.cep.util.openURLInDefaultBrowser(url);
  }
  window.open(url, '_blank');
  return true;
};

CSInterface.prototype.resizeContent = function (w, h) {
  if (window.__adobe_cep__) { window.__adobe_cep__.resizeContent(w, h); }
};

CSInterface.prototype.getHostOS = function () {
  try {
    if (window.__adobe_cep__) {
      var ua = window.__adobe_cep__.getUserAgent();
      if (/Windows/.test(ua)) { return CSInterface.SYSTEM.WINDOWS; }
      if (/Mac/.test(ua)) { return CSInterface.SYSTEM.MACOS; }
    }
  } catch (e) { /* noop */ }
  return navigator.platform && /Win/.test(navigator.platform)
    ? CSInterface.SYSTEM.WINDOWS
    : CSInterface.SYSTEM.MACOS;
};

/* SystemPath constants used by the panel */
var SystemPath = {
  EXTENSION: 'extension',
  USER_DATA: 'userData',
  COMMON_FILES: 'commonFiles',
  MY_DOCUMENTS: 'myDocuments',
  APPLICATION: 'application',
  HOST_APPLICATION: 'hostApplication'
};
