# ⚡ Social Yantra Powerhouse Panel

**Bridge the gap between creative ideation, automation, and timeline execution — inside Adobe Premiere Pro.**

A seamlessly synced, feature-packed CEP panel engineered to eliminate classic editing and motion-graphics bottlenecks. Everything runs **locally** on your machine — no cloud fees, absolute privacy.

| | |
|---|---|
| Panel name | **Social Yantra Powerhouse Panel** |
| Platform | Adobe Premiere Pro 2020 → 2025+ (CEP 9–12) |
| Architecture | CEP panel (HTML/JS) + ExtendScript host + local Node engine |
| Privacy | 100% on-device. VAD + Whisper AI run locally. |

---

## ✨ Full Feature Capabilities

### 1. AI Silence Cut & Voice Activity Detection — *Cut the Silence, Keep the Pace*
- **Advanced VAD** analyzes your sequence's audio waveforms (via a local ffmpeg PCM engine), detects dead space and performs **frame-accurate ripple cuts**.
- **Smart AV Linking** — auto-detects audio-video relationships using **media paths + source timing**, safely handles detached audio and re-links cut segments across the timeline.
- **Progressive Disclosure UI** — threshold, minimum duration and padding tucked into a *Fine Tune* accordion; detected gaps listed dynamically with per-gap checkboxes, scan stats and seconds-saved projection.

### 2. FireCut-style Filler Word & Repetition Cleanup
- **Local Whisper AI** — transcribes clip audio locally with **millisecond-level word timestamps**. No cloud fees, absolute privacy.
- **Smart Filler Matching** — instantly targets stutters, repeat phrases and common fillers (*um, uh, like, you know, i mean…*), plus your own custom dictionary.
- **Seamless Ripple Cuts** — non-overlapping frame-accurate razor cuts keep the sequence fully synchronized.

### 3. Interactive Graph Editor 2.0 — *The Flow Tab*
- **Premium Curve Suite**: 6 interactive math models — **Bezier (draggable handles), Spline, Elastic, Bounce, Wave, Steps**.
- **Infinite Custom Presets** — Base Eases, *My Curves* (saved), and *Local Folder* preset libraries (`presets/flow/*.json`).
- **Adaptive Greedy-Fit Baking** — Premiere's ExtendScript lacks bezier keyframe handles, so Social Yantra uses a **Douglas–Peucker greedy-fit polyline reduction** to bake the smoothest possible curve into the fewest keyframes.
- **Anti-Overshoot Safety** — spatial properties (Position, Anchor Point) are value-clamped to the from→to envelope and frame bounds so clips never fly off-screen.

### 4. Automated Word-Pop Captions & Subtitles
- **Dynamic entrance scaling** — word-by-word pop baked as snapping scale/opacity curves on a selected clip.
- **Native Lanes** — generated subtitles are injected into a **real Premiere caption track** (`createCaptionTrack`, PPro 24.x+) for absolute styling control.
- **Caption Hold Logic** — each word holds on-screen until the next word starts, capped at **0.8s**, preventing flicker during conversational gaps.

### 5. Nest Saver — Premium Backup Engine
- **1-click secure backups** of nested sequences / the active sequence into a structured, dated library.
- **Default High-Quality EPR** — a bundled **Apple ProRes 422 HQ** export preset (plus an H.264 Master fallback) — zero config.
- **Interactive Thumbnails** — automatic PNG capture so you browse backups visually.
- **Cross-Project Importing** — restore any backup into the current project at **tick-accurate playhead positions** (bundles a `.prproj` copy).

### 6. Responsive Local Assets Library
- Media browser for local **images, videos, audio, MOGRTs, SRT files and LUTs**.
- **Smart installs**: `.mogrt` → placed at playhead / Essential Graphics; `.cube/.3dl` → Lumetri LUTs folder; `.srt` → captions-ready import; media → bin **or** timeline.
- Categories (sub-folders), keyword search, thumbnails, one-click import.

### 7. True Dup — Nest Cloning
- Bypasses Premiere's native limitation: **1-click fully isolated nest duplicates** with unique sequence IDs — original in/out points and track placement preserved, timeline clips replaced **in place**.

### 8. Dedicated Timeline Shortcut Tools
- **Smart Adjustment Layers** — one per clip, or a single span over the whole selection (the "Alt" mode).
- **Staircase Stagger** — Stair Up / Stair Down shifts clips diagonally across time (and tracks, where the QE DOM allows).
- **Freeze Frame Export** — stills at the playhead via a **multi-tier QE frame-capture ladder** → `Documents/SocialYantra/Freeze`.
- **Timeline QC Checker** — scans for blank frames, offline media and silent holes, dropping color-coded QC markers.

### ⬇ Whisper AI Models (with **custom download location**)
Download local ggml Whisper models (tiny → large-v3 / turbo) **to any folder you choose** — progress, cancel and size verification included — then wire them to the bundled runtimes:

| Mode | How |
|---|---|
| **Local server** (recommended) | `whisper-server -m ggml-base.bin --port 8080` (or LM Studio / LocalAI) → endpoint `http://127.0.0.1:8080` |
| **whisper.cpp CLI** | point the panel at your `whisper-cli`/`main` binary + the model you downloaded |

---

## 🚀 Install

1. **Windows**: run `install/install-windows.bat` · **macOS**: run `install/install-macos.sh`
2. Restart Premiere Pro → **Window ‹ Extensions ‹ Social Yantra Powerhouse Panel**
3. *(Optional but recommended)* install **ffmpeg** so silence detection is one-click — the panel auto-detects it on PATH, or set the path in **Settings**.

Full details, unsigned-panel (PlayerDebugMode) notes and troubleshooting: **[`social-yantra-powerhouse/INSTALL.md`](social-yantra-powerhouse/INSTALL.md)**

> The panel also opens in **any browser** without Premiere — a full demo mode with mock data lets you explore the UI before installing.

---

## 🧭 Quick Start (per tab)

| Tab | Flow |
|---|---|
| Silence Cutter | Open sequence → *Detect Silence* → review gaps → *Ripple Cut* (or Preview = markers) |
| Filler Remover | Configure Whisper (Models tab) → *Transcribe & Find Fillers* → tick detections → *Ripple Cut* |
| Flow | Pick a curve (drag Bezier handles) → choose property/range → *Bake Curve to Keyframes* |
| Word Pop | *Transcribe for Captions* (or import SRT / paste) → *Create Native Caption Track* |
| Nest Saver | Select nest → *Backup* → restore later at playhead |
| Assets | Set library folder → *Scan* → click an asset to import/insert |
| True Dup | Select nested clip(s) → *Clone & Replace In Place* |
| Tools | Adjustment layers · staircase · freeze frame · QC scan |
| Models | Choose custom folder → download a model → set runtime mode → *Test* |

---

## 🔒 Data & Privacy

Everything is stored locally:

```
Documents/SocialYantra/
├── settings.json      # panel settings mirror
├── logs/jsx-log.txt   # host-script log
├── Freeze/            # exported stills
├── NestSaver/         # backup library (changeable)
├── WhisperModels/     # default model dir (you choose ANY custom location)
├── AssetsLibrary/     # default assets root (changeable)
└── temp/              # wav/srt intermediates
```

Audio analysis (ffmpeg) and transcription (whisper.cpp) run on-device; the only network calls the panel can make are to **`127.0.0.1`** (your own Whisper server) and **huggingface.co** (only when you click *Download* on a model).

---

## 🧪 Development

```bash
cd social-yantra-powerhouse
node test/smoke.js      # panel UI boot + demo RPC round-trip
node test/jsx-smoke.js  # ExtendScript engine vs a Premiere API stub (14 checks)
node test/vad-smoke.js  # silence-detection math on synthetic PCM
```

```
social-yantra-powerhouse/
├── CSXS/manifest.xml      # CEP manifest (PPRO 15.0–99.9, Node enabled)
├── index.html             # 10-tab UI
├── css/app.css            # premium dark theme
├── js/core/               # bridge, VAD engine, Whisper client, model downloader, demo harness
├── js/modules/            # one module per feature tab
├── jsx/social-yantra.jsx  # ExtendScript host (auto-loaded) + jsx/ features
├── presets/               # ProRes/H264 .epr + flow presets
├── install/               # Windows / macOS installers
└── test/                  # smoke & unit tests
```

## ⚠ Notes & honest limits

- **Captions** need Premiere Pro **24.x+** (the `createCaptionTrack` API). On older builds the SRT is still imported for manual placement.
- **Nest export** enqueues through Adobe Media Encoder (ProRes requires AME with ProRes support).
- The **QE DOM** (razor, frame capture, cross-track moves) is undocumented; the panel uses defensive multi-tier ladders and reports when a build refuses a tier.
- Adjustment layers have no creation API — the panel adopts/duplicates a one-time template item (guided in-UI).
