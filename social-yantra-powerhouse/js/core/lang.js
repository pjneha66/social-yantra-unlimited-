/* ==========================================================================
 * Social Yantra Powerhouse — Transcription language engine
 * English · हिन्दी · Hinglish (code-mixed) — plus the filler dictionaries that
 * go with them. Everything here is local: the language only steers which
 * Whisper model/flags/prompt your own runtime gets.
 * ========================================================================== */
window.SYLang = (function (SY) {
  'use strict';

  var LANGS = [
    {
      id: 'auto', label: 'Auto-detect', short: 'AUTO', whisper: 'auto', multilingual: true,
      note: 'Let Whisper decide per clip — safest for mixed-language footage.'
    },
    {
      id: 'en', label: 'English', short: 'EN', whisper: 'en', multilingual: false,
      note: 'Fastest + most accurate on English-only audio. Works with .en models.'
    },
    {
      id: 'hi', label: 'हिन्दी (Hindi)', short: 'HI', whisper: 'hi', multilingual: true,
      note: 'Devanagari output. Needs a multilingual model (not a .en model).'
    },
    {
      id: 'hinglish', label: 'Hinglish (हिंदी + English)', short: 'HINGLISH', whisper: 'hi', multilingual: true,
      prompt: 'Yeh ek Hinglish conversation hai. Log Hindi aur English mix karke baat karte hain — ' +
        'yaar, matlab, achha, theek hai, samajh gaye, basically, like, you know, obviously. ' +
        'Topic: video editing, social media content aur tech. Punctuation English style mein rakho.',
      note: 'Code-mixed speech. Forces a Hinglish prompt + multilingual model for far fewer mis-hears.'
    }
  ];

  /* Filler / repetition dictionaries per language (lowercase, no punctuation). */
  var FILLERS = {
    en: ['um', 'uh', 'er', 'ah', 'hmm', 'like', 'you know', 'i mean', 'sort of', 'kind of',
      'basically', 'actually', 'literally', 'right', 'okay', 'so yeah', 'at the end of the day'],
    hi: ['मतलब', 'यार', 'अच्छा', 'अरे', 'वैसे', 'पता है', 'समझा', 'समझे', 'चलो', 'देखो',
      'ठीक है', 'हाँ तो', 'बिल्कुल', 'एकदम'],
    hinglish: ['matlab', 'yaar', 'arre', 'accha', 'achha', 'acha', 'waise', 'pata hai', 'samjha',
      'samjhe', 'chalo', 'dekho', 'theek hai', 'thik hai', 'haan to', 'bilkul', 'ekdam',
      'like', 'you know', 'i mean', 'basically', 'actually', 'literally', 'obviously',
      'sort of', 'kind of', 'um', 'uh', 'hmm', 'so yeah', 'right', 'okay', 'ok']
  };

  function byId(id) {
    for (var i = 0; i < LANGS.length; i++) { if (LANGS[i].id === id) { return LANGS[i]; } }
    return LANGS[0];
  }

  function current() {
    var s = (SY.settings && SY.settings.whisper) || {};
    return byId(s.language || 'auto');
  }

  /* Resolve everything the Whisper client needs for the active language. */
  function resolve() {
    var s = (SY.settings && SY.settings.whisper) || {};
    var l = byId(s.language || 'auto');
    return {
      id: l.id,
      label: l.label,
      language: l.whisper,                       // 'auto' | 'en' | 'hi'
      prompt: (s.customPrompt && s.customPrompt.trim()) ? s.customPrompt.trim() : (l.prompt || ''),
      task: s.translate ? 'translate' : 'transcribe',
      translate: !!s.translate,
      needsMultilingual: l.whisper !== 'en',
      note: l.note
    };
  }

  /* Warn loudly when an English-only model is asked to do Hindi/Hinglish. */
  function modelWarning(modelPath) {
    var r = resolve();
    if (!r.needsMultilingual) { return ''; }
    if (modelPath && /\.en\.bin$/i.test(modelPath)) {
      return 'The selected model is English-only (' + modelPath.replace(/^.*[\\/]/, '') +
        '). ' + r.label + ' needs a multilingual model — download e.g. ggml-base.bin in the Models tab.';
    }
    return '';
  }

  function fillers(id) {
    var l = byId(id || current().id);
    if (l.id === 'hinglish') { return FILLERS.hinglish.slice(); }
    if (l.id === 'hi') { return FILLERS.hi.concat(['um', 'uh', 'hmm']); }
    return FILLERS.en.slice();
  }

  /* Normalize a transcript word for dictionary matching. Keeps Latin,
   * Latin-extended AND Devanagari so Hindi/Hinglish transcripts still match. */
  function norm(w) {
    return String(w == null ? '' : w)
      .toLowerCase()
      .replace(/[\u0964\u0965।॥.,!?;:"'“”‘’()…\[\]]/g, ' ')   // punctuation incl. danda
      .replace(/[^\u0000-\u007f\u00c0-\u024f\u0900-\u097f\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* Romanize Devanagari so "matlab" also matches "मतलब" (best-effort, for
   * dictionary lookups only — never shown to the user).
   * Devanagari consonants carry an inherent "a" unless a matra or virama
   * follows, which is what makes "मतलब" → "matlab" and not "mtlb". */
  var DEV_CONS = {
    'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n', 'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh',
    'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n', 'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh',
    'न': 'n', 'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm', 'य': 'y', 'र': 'r', 'ल': 'l',
    'व': 'v', 'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h', 'क़': 'q', 'ख़': 'kh', 'ग़': 'g',
    'ज़': 'z', 'ड़': 'r', 'ढ़': 'rh', 'फ़': 'f', 'य़': 'y'
  };
  var DEV_CONJ = { 'क्ष': 'ksh', 'त्र': 'tr', 'ज्ञ': 'gy', 'श्र': 'shr' };
  var DEV_VOWEL = {
    'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai',
    'ओ': 'o', 'औ': 'au', 'ऑ': 'o', 'ऍ': 'e'
  };
  var DEV_MATRA = {
    'ा': 'a', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri', 'े': 'e', 'ै': 'ai',
    'ो': 'o', 'ौ': 'au', 'ॉ': 'o', 'ॅ': 'e'
  };
  var DEV_OTHER = { 'ं': 'n', 'ँ': 'n', 'ः': 'h', 'ऽ': '', '्': '' };
  var VIRAMA = '्';

  /* Canonical roman spellings for the fillers people actually say — the
   * generic transliterator cannot guess "yaar" from "यार". */
  var DEV_ALIAS = {
    'मतलब': 'matlab', 'यार': 'yaar', 'अच्छा': 'achha', 'अछा': 'achha', 'अरे': 'arre', 'वैसे': 'waise',
    'पता है': 'pata hai', 'समझा': 'samjha', 'समझे': 'samjhe', 'समझ': 'samajh', 'ठीक है': 'theek hai',
    'चलो': 'chalo', 'देखो': 'dekho', 'हाँ': 'haan', 'हां': 'haan', 'बिल्कुल': 'bilkul', 'एकदम': 'ekdam',
    'यानी': 'yaani', 'वास्तव': 'vastav', 'असल': 'asal', 'बेसिकली': 'basically'
  };

  function romanize(s) {
    s = String(s == null ? '' : s);
    var key = norm(s);
    if (DEV_ALIAS[key]) { return DEV_ALIAS[key]; }
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      var conj = DEV_CONJ[s.substr(i, 2)];
      if (conj !== undefined) {
        out += conj;
        i++;
        if (s.charAt(i + 1) !== VIRAMA && DEV_MATRA[s.charAt(i + 1)] === undefined) { out += 'a'; }
        continue;
      }
      if (DEV_CONS[ch] !== undefined) {
        out += DEV_CONS[ch];
        var nx = s.charAt(i + 1);
        // inherent "a" unless a matra or virama follows
        if (nx !== VIRAMA && DEV_MATRA[nx] === undefined) { out += 'a'; }
        continue;
      }
      if (DEV_MATRA[ch] !== undefined) { out += DEV_MATRA[ch]; continue; }
      if (DEV_VOWEL[ch] !== undefined) { out += DEV_VOWEL[ch]; continue; }
      if (DEV_OTHER[ch] !== undefined) { out += DEV_OTHER[ch]; continue; }
      if (/[\u0900-\u097f]/.test(ch)) { continue; }   // unknown Devanagari: drop
      out += ch;
    }
    return out;
  }

  /* Every dictionary key a transcript word could match under. */
  function matchKeys(word) {
    var n = norm(word);
    if (!n) { return []; }
    var keys = [n];
    var r = romanize(n);
    if (r && r !== n) { keys.push(r); }
    if (DEV_ALIAS[n]) { keys.push(DEV_ALIAS[n]); }
    return keys;
  }

  /* Build a lookup dictionary for the active language (+ any custom words).
   * Every entry is indexed under its own spelling, its romanisation and its
   * canonical alias, so a Devanagari transcript still hits the Hinglish list. */
  function dictionary(customCsv) {
    var dict = {};
    var list = fillers(current().id).concat(String(customCsv || '').split(','));
    list.forEach(function (w) {
      matchKeys(w).forEach(function (k) { if (k) { dict[k] = true; } });
    });
    return dict;
  }

  /* Does this (possibly Devanagari) word hit the dictionary? */
  function lookup(dict, word) {
    var keys = matchKeys(word);
    for (var i = 0; i < keys.length; i++) { if (dict[keys[i]]) { return keys[i]; } }
    return null;
  }

  /* Does this word look Devanagari? (used to label detections in the UI) */
  function hasDevanagari(s) { return /[\u0900-\u097f]/.test(String(s || '')); }

  /* Render the shared language picker into any container element. */
  function renderPicker(host, onChange) {
    if (!host) { return; }
    var cur = current().id;
    host.innerHTML = LANGS.map(function (l) {
      return '<span class="chip' + (l.id === cur ? ' on' : '') + '" data-lang="' + l.id + '" title="' +
        SY.esc(l.note) + '">' + SY.esc(l.label) + '</span>';
    }).join('');
    host.onclick = function (e) {
      var chip = e.target && e.target.closest ? e.target.closest('.chip') : null;
      if (!chip || !chip.getAttribute('data-lang')) { return; }
      var id = chip.getAttribute('data-lang');
      SY.settings.whisper.language = id;
      SY.saveSettings();
      var kids = host.querySelectorAll('.chip');
      for (var i = 0; i < kids.length; i++) {
        kids[i].classList.toggle('on', kids[i].getAttribute('data-lang') === id);
      }
      SY.log('transcription language → ' + byId(id).label, 'ok');
      if (onChange) { onChange(byId(id)); }
    };
  }

  return {
    LANGS: LANGS,
    FILLERS: FILLERS,
    DEV_ALIAS: DEV_ALIAS,
    byId: byId,
    current: current,
    resolve: resolve,
    fillers: fillers,
    norm: norm,
    romanize: romanize,
    matchKeys: matchKeys,
    dictionary: dictionary,
    lookup: lookup,
    hasDevanagari: hasDevanagari,
    modelWarning: modelWarning,
    renderPicker: renderPicker
  };
})(window.SY);
