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
    gaps) with **Clear QC**, freeze frame, **paste image** (clipboard, file or
    a freeze frame dropped straight back on the timeline), staircase baker,
    one-click chapters from the QC scan.
12. **Frame QC** — **flash frame detector** (per-frame mean luma from ffmpeg
    `signalstats`, isolated outliers only) and **empty frame checker**
    (`blackdetect` + a structural hole scan). Mark them or ripple-cut them.
13. **Nesting** — **Nest** the selection into a new sequence and replace it in
    place, **Nest separate** to lift it out and keep the gap, **Unnest** to lay
    a nest's contents back on the timeline. The new sequence is a `clone()`, so
    it inherits your frame size, pixel aspect and frame rate exactly.
14. **Quick Effects** — one click attaches a real Premiere effect to every
    selected clip (Warp Stabilizer, Lumetri, Gaussian Blur, Drop Shadow, Crop,
    Ultra Key, Basic 3D, Corner Pin, Directional Blur, Black & White) with its
    parameters already written. Custom effect names, custom parameters, and
    `.prfpset` install.
15. **Layer Tools** — text layers (rasterised on the panel's own canvas, so
    any font incl. Devanagari, with outline + shadow), solid layers with a
    colour picker and opacity, adjustment layers, and move-layer up/down.
16. **AI Image** — background removal with rembg (U2Net general / U2Net fast /
    ISNet sharp edges / U2Net human), from the **selected clip's frame** or an
    **image file**, then back onto the timeline. Weights live in `~/.u2net`;
    inference is local.
17. **Downloader** — yt-dlp front end for **YouTube / TikTok / Instagram /
    Pinterest** (and ~1800 other extractors): best / 1080p / 720p / 480p,
    **MP3** and **M4A-AAC** extraction, cookies (file or straight from a
    browser), **exact FPS**, **download section**, ffmpeg merging, and import
    into the project or the timeline.
18. **Model manager** — download whisper models to **any folder you choose**,
    verify them, relocate, see disk usage.
19. **Settings** — paths, VAD thresholds, defaults, export folder, diagnostics,
    full backup/restore of the settings JSON.

**Languages:** Auto-detect · English · हिन्दी · **Hinglish** (code-mixed, with a
Hindi filler dictionary that also matches the Devanagari spelling of *yaar*,
*matlab*, *achha*…).

The left rail is **grouped and searchable** — Cut, Music, Language, Motion,
Effects & Layers, Timeline, Library, Sources, System — and the type-ahead box
dims the tabs that don't match.

External engines (rembg, yt-dlp) are **detected, not assumed**: each tab shows
the CLI it found, and offers a one-click `pip` install when it is missing.

## Tabs at a glance

| Group | Tab | View | Needs |
|---|---|---|---|
| Cut | Silence Cutter | `#view-silence` | — |
| Cut | Filler Cleaner | `#view-filler` | whisper (server or CLI) |
| Cut | Chapters & Markers | `#view-chapters` | — |
| Audio | Ducking | `#view-duck` | — |
| Audio | Beat Cut | `#view-beat` | — |
| Motion | Flow Engine | `#view-flow` | — |
| Motion | WordPop | `#view-wordpop` | ffmpeg (for burn-in) |
| Effects & Layers | Quick Effects | `#view-quickfx` | — |
| Effects & Layers | Layer Tools | `#view-layers` | ffmpeg (solids only) |
| Timeline | Tools | `#view-tools` | ffmpeg (flash / empty scans) |
| Timeline | True Duplicate | `#view-truedup` | — |
| Library | Nest Saver | `#view-nest` | Adobe Media Encoder |
| Library | Media Manager | `#view-assets` | ffmpeg (transcode) |
| Sources | Downloader | `#view-mediaget` | yt-dlp (+ ffmpeg to merge) |
| Sources | AI Image | `#view-aiimage` | rembg + onnxruntime |
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

### Frame QC — catch the flash before your client does
1. **Tools › Flash frame detector** (or **Empty frame checker**), pick
   *selected clips only* or the whole timeline.
2. ffmpeg walks each file once with `signalstats`; the panel diffs every frame
   against the median of its neighbours and requires the deviation on **both**
   sides with the **same sign** — so a hard cut inside dark footage is not
   reported as a flash, and a 1-frame dip on already-black material is ignored.
3. **Mark at each hit** writes markers at `clip.start + sampleTime`;
   **Ripple-cut the flashes** removes them and re-times the track.
4. The empty checker runs `blackdetect` per file *and* a structural hole scan —
   ffmpeg cannot see the gap a deleted clip or an effect left behind.

### Quick Effects
1. Select the clips. **Quick Effects** → click a tile → **Apply to selected**.
2. **Add custom effect** attaches anything by exact display name; **Add custom
   parameters** writes named properties onto the last effect applied — the same
   path a `.prfpset` takes.
3. **List effects on selection** reads back what a clip really has;
   **Every effect this build reports** prints the authoritative name list, so a
   custom name is never guesswork.

### Layer Tools
Type the text, pick size / colour / font stack / outline / shadow →
**Add text layer**; or pick a colour and opacity → **Add solid layer**. Then
**Move layer up / down** to restack. The text is drawn on the panel's own
canvas, so nothing depends on ffmpeg's font handling.

### AI Image
**Detect rembg** (install it in one click if it's missing) → pick a model →
choose **Selected clip** or **Image file** → **Remove background** →
**Insert cutout onto timeline**. Weights cache in `~/.u2net`; inference is local.

### Downloader
**Detect yt-dlp** → paste the URL → quality (or MP3 / M4A) → optional cookies /
save location / exact FPS / section → **Download**. yt-dlp's output is parsed
line by line into a real progress bar, then **Import into project** or
**Insert on timeline**.

### Nest Saver (`#view-nest`)
Premium backup engine — **Nest** a range into a new sequence, keep the handles,
and get the nested clip back on the timeline; **Restore** from a saved nest;
queue an export through Adobe Media Encoder with the bundled ProRes preset.

### Nesting / Unnesting (Tools tab)
**Nest** wraps the selection in a new sequence *and replaces it in place*;
**Nest separate** lifts it out and leaves the gap; **Unnest** lays a nest's
contents back on the timeline. The new sequence is a `Sequence.clone()` plus
trim and shift, so it inherits your frame size, pixel aspect and frame rate
exactly — `createNewSequence()` would have inherited the project's default
preset instead.

### Media Manager
**List assets** → relink offlines, batch transcode (preset), create proxies, or
delete unused media (moves to the trash folder first).

### True Duplicate
Scan for repeated media by size+duration+name, then **replace all** with a single
shared clip.

### Tools
Markers (add / jump / clear), **QC scan** (offline, blank frames, no audio, long
gaps — with **Chapters from QC** and **Clear QC**), **paste image** (clipboard /
file / freeze frame), **flash frame detector**, **empty frame checker**,
freeze-frame ladder, staircase baker.

### Quick Effects
Click a tile → **Apply to selected**: Warp Stabilizer, Lumetri Color, Gaussian
Blur, Drop Shadow, Crop, Ultra Key, Basic 3D, Corner Pin, Directional Blur,
Black & White — each with its real parameters written (Ultra Key gets its key
colour, Crop gets its percentages, Directional Blur its angle).
**Add custom effect** / **Add custom parameters** cover anything else, and
**Every effect this build reports** prints the authoritative name list — because
a `.prfpset` you made yourself does *not* appear in Premiere's effect list.
**Bypass / un-bypass** toggles what a clip already has.

### Layer Tools
**Text layer** is rasterised on the panel's **own canvas** (so any font works,
including Devanagari, and no ffmpeg `drawtext` is needed), **Solid layer**
generates a true-colour PNG with ffmpeg's colour source at your picked colour
and opacity, **Adjustment layer** is Premiere-native, and **Move layer up /
down** nudges the selection one track — reporting back when there's no room
rather than failing silently.

### AI Image
rembg background removal with **U2Net general**, **U2Net fast** (`u2netp`),
**ISNet sharp edges** or **U2Net human**. Input is either the **selected clip's
frame** (grabbed to PNG) or an **image file**; the cutout goes back **onto the
timeline**. Weights cache in `~/.u2net` and all inference is local.

### Downloader
yt-dlp front end: **YouTube / TikTok / Instagram / Pinterest** (and the rest of
yt-dlp's ~1800 extractors), **best / 1080p / 720p / 480p**, **MP3** and
**M4A-AAC**, cookies from a file **or straight from a browser**, save location,
**exact FPS**, **download section**, ffmpeg merging, then import into the
project or the timeline. Progress is parsed line by line into a real progress
bar, and the destination line is matched for *every* post-processor stage —
`[ExtractAudio] Destination: …` included, which is what makes an audio-only
download resolve to a usable path.

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
- ffmpeg on PATH (or set `settings.ffmpegPath`) — needs `signalstats` and
  `blackdetect` (standard in every build) and `drawtext` **only** for the ffmpeg
  text fallback
- whisper.cpp CLI **or** a whisper-server (`whisper-server` / `main` with
  `--server`) for transcription
- For Hinglish / Hindi: a **multilingual** whisper model
- **rembg** + onnxruntime for AI Image, **yt-dlp** for the Downloader, and
  **Python 3.9+** to run the two one-click installers. Neither is assumed to be
  present: each tab detects its CLI, shows what it found, and offers to install
  it after showing you the exact command.

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
js/core/downloader.js           SYDownloader: whisper model download/verify/relocate
js/core/stills.js               SYStills: canvas text render, ffmpeg solids, clipboard PNG
js/core/frameqc.js              SYFrameQC: signalstats luma profile, flash finder, blackdetect
js/core/rembg.js                SYRembg: rembg detect/install/run, model cache
js/core/mediaget.js             SYMediaGet: yt-dlp detect/install/args/progress parse
js/core/flow|wordpop|nest|assets|truedup|tools.js
js/modules/*.js                 one file per tab (UI logic only)
jsx/social-yantra.jsx           ExtendScript entry: evalJson dispatch
jsx/core/sy-core.jsxinc         timecode maths, sequence/clip/marker helpers
jsx/features/sy-*.jsxinc        ExtendScript engines (silence, flow, tools, nest,
                                wordpop, truedup, assets, audio, nesting, effects,
                                frames, layers)
```

`js/core/downloader.js` is the **whisper model** downloader — the media
downloader lives in `js/core/mediaget.js`.

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
- *Nesting.* `app.project.createNewSequence()` inherits the project's default
  preset and has no `setSettings`, so a nest made that way can come out at the
  wrong frame size or frame rate. The engine instead does
  `Sequence.clone()` → trim to the range → shift the items to the start, which
  preserves every sequence setting for free. Removing items from a **live** PPro
  collection also shifts the indexes under you, so it snapshots, classifies, and
  removes in reverse index order.
- *Flash detection.* A naive "compare each frame to its neighbours" flags every
  hard cut. The finder requires the frame to deviate from the median of the
  window on **both** sides, in the **same direction**, above `threshold` with a
  run of at most `maxRun` frames — and it skips a one-frame drop to near-black
  when the surrounding footage is already dark.
- *Text layers.* `ffmpeg -version` listing `--enable-libfreetype` does **not**
  mean the `drawtext` filter was compiled in — two widely distributed static
  builds advertise it and ship without it. The panel probes `-filters` at
  runtime and renders text on a **Canvas 2D** (`toDataURL` → PNG) with
  `drawtext` only as a headless fallback, so the feature never depends on that.
  Outline is `strokeText` at `lineWidth = outline*2` **before** `fillText`, with
  the shadow raised for the stroke and cleared for the fill.
- *yt-dlp FPS.* There is no `--fps` option. Exact frame rate means
  `--recode-video mp4` **plus** `--postprocessor-args "ffmpeg:-vf fps=N"`; in
  copy mode filters are ignored and `--download-sections` cuts land on the
  nearest keyframe.

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
| `test/nest-smoke.js` | `Sequence.clone()` nesting, separate, unnest, effect application + QE, property writes, layer moves |
| `test/frameqc-smoke.js` | luma profile, flash finder (real flash, hard cut, dark footage), blackdetect parsing, canvas text layout maths |
| `test/getargs-smoke.js` | yt-dlp argument construction per site/quality/audio/cookies/FPS/section, and output-line parsing |
| `test/ui-wiring-smoke.js` | nav↔views, every `getElementById` target exists, every `SY.call()` target exists in ExtendScript, includes/scripts/modules resolve |
| `test/media-smoke.js` | **integration** — really runs ffmpeg: solid PNG pixels, luma profile, flash detection, blackdetect, canvas text PNG. Skips cleanly when ffmpeg is absent; pin one with `SY_FFMPEG=/path/to/ffmpeg` |

`test/ui-wiring-smoke.js` exists because the panel is three loosely-coupled
languages joined by string names: a typo'd element id or a `SY.call()` to a
function that doesn't exist only surfaces when a user clicks that button.

There is no `package.json` — everything is plain ES5-compatible JS so it runs
inside the CEP panel without a bundler.
