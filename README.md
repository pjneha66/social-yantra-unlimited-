# Social Yantra Powerhouse

A CEP panel for **Adobe Premiere Pro 2023+** that edits long-form and short-form
social video at speed — and then does the music, chapters and multilingual work
on top of it. It combines a native-speed timeline engine (ExtendScript) with
ffmpeg for media I/O and whisper.cpp for transcription.

## What it does

1. **Silence / dead-air cutter** — VAD scan, gap list, ripple delete in one shot.
2. **Filler-word cleaner** — Whisper transcription with word timestamps, find
   *um / uh / like / you know* (+ your own list) and ripple them out.
3. **Chapters & markers** — turn a transcript, a QC scan, silence gaps or
   existing markers into YouTube chapters; export CSV / YouTube description /
   SRT / JSON / FCP XML or push them into Premiere as markers.
4. **Music auto-ducking** — dip the music track wherever dialogue happens, with
   real volume keyframes, attack/release ramps and an envelope you can preview.
5. **Beat-cut editor** — onset/energy beat detection on the music clip, snap
   cuts to the grid, cut every *N* beats, or turn bars into chapters.
6. **Flow engine** — staircase / jump-cut editor over the silence gaps: punch-in
   and punch-back with optional zoom, speed-ramp (time remap) or plain cuts.
7. **WordPop** — karaoke captions: SRT / JSON / PNG / burned-in, with templates.
8. **Sequence-in-Sequence (nesting)** — split, wrap in a nested sequence, or
   lift a range out into its own sequence.
9. **Media manager** — list assets, find used/unused media, relink offlines,
   batch transcode, proxy workflow.
10. **True duplicate detector** — find genuinely repeated media (not just same
    filename) and replace them with one shared clip.
11. **Timeline tools** — markers, QC scan (offline / blank / audio-less / long
    gaps), freeze frame, staircase baker, one-click chapters from the QC scan.
12. **Model manager** — download whisper models to **any folder you choose**,
    verify them, relocate, see disk usage.
13. **Settings** — paths, VAD thresholds, defaults, export folder, diagnostics,
    full backup/restore of the settings JSON.

**Languages:** Auto-detect · English · हिन्दी · **Hinglish** (code-mixed, with a
Hindi filler dictionary that also matches the Devanagari spelling of *yaar*,
*matlab*, *achha*…).

The left rail is **grouped and searchable** — Cut, Music, Language, Media,
System — and the type-ahead box dims the tabs that don't match.

## Tabs at a glance

| Group | Tab | View | Needs |
|---|---|---|---|
| Cut | Silence Cutter | `#view-silence` | — |
| Cut | Filler Cleaner | `#view-filler` | whisper (server or CLI) |
| Cut | Flow Engine | `#view-flow` | — |
| Cut | WordPop | `#view-wordpop` | ffmpeg (for burn-in) |
| Music | Ducking | `#view-duck` | — |
| Music | Beat Cut | `#view-beat` | — |
| Music | Chapters & Markers | `#view-chapters` | — |
| Language | — | `#view-filler` (Language card) | whisper |
| Media | Nesting | `#view-nest` | — |
| Media | Media Manager | `#view-assets` | ffmpeg (transcode) |
| Media | True Duplicate | `#view-truedup` | — |
| System | Tools | `#view-tools` | — |
| System | Models | `#view-models` | — |
| System | Settings | `#view-settings` | — |

## Quick start

### Silence Cutter
1. Open the sequence with the rough cut on it.
2. Pick the **audio track** to analyse (or *All audio tracks*).
3. Click **Scan** → gaps appear with their lengths.
4. Untick anything you want to keep (or press **Select all** / **Invert**).
5. **Cut** → ripple delete.

### Filler Cleaner
1. Choose a **whisper backend** in Settings (server or CLI + model).
2. Pick the audio track and the **language** (Auto / English / हिन्दी / Hinglish).
3. **Transcribe** — the panel decodes that track to WAV via ffmpeg and runs whisper.
4. Tick the fillers to remove (they are pre-ticked) → **Cut**.
5. Optional: **Copy transcript** or **Save .srt/.json**, and **Send to Chapters**.

> **Hinglish tip:** Hinglish needs a multilingual model (`ggml-base.bin` or
> bigger — not a `.en.bin`); the panel warns you if you picked an English-only
> one. The prompt tells Whisper the audio is code-mixed, which measurably
> improves Hindi+English output.

### Chapters & Markers
1. Load chapters from a **transcript**, the **QC scan**, **silence gaps** or the
   **existing markers**.
2. Tune the grouping (pause length, max words, max duration), the title style
   and the "chapters must start at 00:00" / minimum-length rules.
3. **Export** as CSV, YouTube description, SRT, JSON, FCP XML or DaVinci — or
   **Add as Premiere markers** (Chapter markers) and **Reveal**.
4. The sanity report tells you when YouTube would ignore the list.

### Ducking
1. **Scan** the sequence (or reuse the silence-scan / transcript result) to build
   the speech mask, or **Guess** from the timeline if you have no VAD yet.
2. **Pick the music track** (the panel pre-selects the track that is *not* your
   dialogue track).
3. Set duck depth, attack, release, hold and the un-ducked base level.
4. **Preview envelope** shows the gain curve over the timeline before you commit.
5. **Apply keyframes** writes Volume › Level keys on the music clip(s) — smooth
   ramps, not jumps. **Clear** removes them again.

### Beat Cut
1. Pick the **music clip** and **Analyze** (FFT spectral-flux onset detection,
   tempo autocorrelation with octave correction and sub-hop interpolation).
2. The BPM, beat count, bar count and a waveform/beat overlay are shown;
   alternative tempos are one click away if the detector locked onto half-time.
3. Choose **cut mode** (razor / markers / chapters), **every N beats**, a
   minimum gap, a target track set and an optional time range.
4. **Cut** razors the grid; **Markers** stamps the beats; **Chapters** sends the
   bars to the Chapters tab.

> Beat snapping is on by default: grid points move to the nearest real transient
> so cuts land on the kick, not 30 ms early.

### Flow Engine
Pick the gaps to process, set punch-in %, hold-out %, zoom amount and speed, then
**Apply cuts**, **Bake staircase** or **Speed ramp**.

### WordPop
Transcribe (or paste an SRT), pick a template, export SRT / JSON / PNG strip, or
**Burn in** with ffmpeg.

### Nesting
**Split at playhead**, **Wrap selection in nest**, or **Lift range to new
sequence** — pick tracks, keep the handles, get a nested clip back.

### Media Manager
**List assets** → relink offlines, batch transcode (preset), create proxies, or
delete unused media (moves to the trash folder first).

### True Duplicate
Scan for repeated media by size+duration+name, then **replace all** with a single
shared clip.

### Tools
Markers (add / jump / clear), **QC scan** (offline, blank frames, no audio, long
gaps — with **Chapters from QC**), freeze-frame ladder, staircase baker.

### Models
Pick a model, **choose the destination folder** (defaults to
`settings.whisperModelDir`), **Download**, then **Verify**. Existing models can
be relocated to a new folder. Disk usage for the current folder is shown.

### Settings
Set paths (`root`, `models`, `exports`, `temp`, `ffmpeg`), VAD thresholds,
defaults, the export folder and diagnostics; export/import a full settings
backup.

## Requirements

- Adobe Premiere Pro 2023 or newer (CEP panels enabled)
- Node.js **inside the panel** (CEP `node` integration) or the optional Node
  sidecar for ffmpeg/whisper work
- ffmpeg on PATH (or set `settings.ffmpegPath`)
- whisper.cpp CLI **or** a whisper-server (`whisper-server` / `main` with
  `--server`) for transcription
- For Hinglish / Hindi: a **multilingual** whisper model

## Install

1. Drop `social-yantra-powerhouse/` into your CEP extensions folder, e.g.
   - macOS: `~/Library/Application Support/Adobe/CEP/extensions/`
   - Windows: `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\`
2. Enable unsigned panels (PlayerDebugMode) or sign the extension.
3. Launch Premiere, **Window › Extensions › Social Yantra Powerhouse**.
4. Set your paths in the Settings tab.

## Architecture

```
index.html + css/app.css        panel shell (grouped nav + search)
js/core/bridge.js               window.SY  (settings, fs, RPC, ffmpeg, utils)
js/core/app.js                  SYUI: view routing, nav search, module init
js/core/audio-vad.js            SYAudio: decode, energy VAD, speech masks
js/core/duck.js                 SYDuck: speech → volume envelope + keyframes
js/core/beat.js                 SYBeat: FFT onset envelope, tempo, beat grid
js/core/chapters.js             SYChapters: transcript/QC → chapters + exports
js/core/lang.js                 SYLang: language packs, Hinglish filler dict
js/core/whisper.js              SYWhisper: server + CLI transcription, JSON/SRT
js/core/downloader.js           SYDownloader: model download/verify/relocate
js/core/flow|wordpop|nest|assets|truedup|tools.js
js/modules/*.js                 one file per tab (UI logic only)
jsx/social-yantra.jsx           ExtendScript entry: evalJson dispatch
jsx/core/sy-core.jsxinc         timecode maths, sequence/clip/marker helpers
jsx/features/sy-*.jsxinc        ExtendScript engines (silence, flow, tools,
                                nest, wordpop, truedup, assets, audio)
```

**Panel ↔ Premiere:** every timeline operation goes through
`SY.call(fn, arg, cb)` → `SY.evalJson("fn", argJson)` in ExtendScript, returning
`{ok:true,data}` or `{ok:false,error}`. Nothing in the panel talks to Premiere
directly.

**Two details worth knowing:**

- *Ducking units.* Premiere stores Volume › Level as a **linear** value with a
  +15 offset (`dB → 10^((dB−15)/20)`), so −12 dB is `0.0794`, not `−0.12`. The
  ducking engine detects the scale from the clip's current value and writes keys
  in the right unit.
- *Beat detection.* Onset detection uses a spectral-flux envelope (1024-point
  FFT, 50 % overlap, log-magnitude, gamma compression, low-cut emphasis). Tempo
  comes from autocorrelation of that envelope with a BPM prior, octave
  correction and **parabolic interpolation of the correlation peak** — one FFT
  hop is 32 ms, and 120 BPM is 15.625 hops, so without sub-hop refinement the
  grid drifts ~2 % over a few minutes.

## Dev / test

Headless tests run under Node with DOM and ExtendScript stubs:

```bash
cd social-yantra-powerhouse
bash test/run-all.sh
```

| Suite | Covers |
|---|---|
| `test/smoke.js` | loads every core + module file against a DOM shim |
| `test/jsx-smoke.js` | ExtendScript engines incl. ducking keyframes, beat razors, markers, timecode maths |
| `test/vad-smoke.js` | VAD gap detection |
| `test/duck-smoke.js` | speech envelope → dB keys, ramps, slicing, edge cases |
| `test/beat-smoke.js` | FFT, onset envelope, 120 BPM grid accuracy, cut planning, clip mapping |
| `test/chapters-smoke.js` | transcript/QC/marker → chapters, YouTube rules, CSV/SRT/JSON/marker export |
| `test/lang-smoke.js` | language packs, Hinglish dictionary + Devanagari matching, whisper JSON/CLI flags |

There is no `package.json` — everything is plain ES5-compatible JS so it runs
inside the CEP panel without a bundler.
