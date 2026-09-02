# Installing the Social Yantra Powerhouse Panel

## One-command install

### Windows
```bat
install\install-windows.bat
```
Copies the panel to `%APPDATA%\Adobe\CEP\extensions\com.socialyantra.powerhouse` and enables **PlayerDebugMode** (allows unsigned panels).

### macOS
```bash
bash install/install-macos.sh
```
Copies to `~/Library/Application Support/Adobe/CEP/extensions/com.socialyantra.powerhouse` and writes the `PlayerDebugMode` default.

Then **restart Premiere Pro** and open:

> **Window ‹ Extensions ‹ Social Yantra Powerhouse Panel**

---

## Manual install

1. Copy this whole folder (`social-yantra-powerhouse/`) to:
   - **Win:** `%APPDATA%\Adobe\CEP\extensions\com.socialyantra.powerhouse\`
   - **mac:** `~/Library/Application Support/Adobe/CEP/extensions/com.socialyantra.powerhouse/`
2. Allow unsigned panels — pick the CSXS version matching your Premiere (2022+ = 11, 2020/2021 = 9/10):
   - **Win:** `reg add HKCU\Software\Adobe\CSXS.11 /v PlayerDebugMode /t REG_SZ /d 1 /f`
   - **mac:** `defaults write com.adobe.CSXS.11 PlayerDebugMode 1`
3. Restart Premiere.

## Requirements

| Component | Needed for | Notes |
|---|---|---|
| Premiere Pro 2020+ | everything | 24.x+ required for **native caption tracks** |
| **ffmpeg** | Silence detection, Whisper audio extraction, solid layers, flash/empty frame scans, downloader merging | auto-detected on PATH; or set binary in *Settings* (`ffmpeg.org`). Needs `signalstats` + `blackdetect` (standard) and `drawtext` **only** for the ffmpeg text fallback |
| **whisper.cpp** (server or CLI) | Filler cleanup & caption transcription | see the *Whisper AI Models* tab → *Setup help*; LM Studio / LocalAI also work |
| **Python 3.9+** | the one-click installers for rembg and yt-dlp | python.org; `pip` or `pipx` on PATH |
| **rembg** + onnxruntime | AI Image → background removal | installed from the *AI Image* tab; weights download to `~/.u2net` on first use, all inference is local |
| **yt-dlp** | the Downloader tab | installed from the *Downloader* tab; needs ffmpeg for merging / MP3 / M4A |
| Adobe Media Encoder | Nest Saver video export | ProRes 422 HQ preset is bundled |

## Whisper in 2 minutes

1. Open the **Whisper AI Models** tab.
2. **Choose a custom download location** (any folder — keep it on a fast SSD) and download e.g. `ggml-base.en.bin`.
3. Pick a runtime:
   - **Server**: `whisper-server -m /your/custom/path/ggml-base.en.bin --port 8080` → endpoint `http://127.0.0.1:8080`
   - **CLI**: browse to your `whisper-cli` (or `main`) binary and select the downloaded model.
4. Press **Test transcription engine** — you want a green ✅.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Panel not in the Window ‹ Extensions menu | Re-check the extensions folder path; enable PlayerDebugMode for your CSXS version; restart Premiere fully |
| "Node engine unavailable" in Settings | Your Premiere's CEP is old or Node was stripped by policy — silence detection needs the Node engine; captions/curves/nest/tools still work |
| Silence scan says ffmpeg missing | Install ffmpeg ([ffmpeg.org](https://ffmpeg.org)) or set its full path in Settings |
| "razor failed" / cuts land slightly off | Drop-frame sequences: the panel formats QE timecode automatically — verify your sequence frame rate matches media interpretation |
| Caption button errors | Native caption creation needs PPro 24+; the SRT is still imported into a bin for manual drag |
| Nest export never finishes | Nest Saver queues into Adobe Media Encoder — open AME and let it run |
| Text layer says "no drawtext filter" | Only the ffmpeg fallback needs it — text is normally rasterised on the panel's canvas. If you do hit it, install a full ffmpeg build or point *Settings › FFmpeg binary* at one |
| Clipboard paste says "holds no image" | Copy an actual image (not a file reference) first, or use **Choose file…** |
| rembg / yt-dlp "not installed" | Press the install button in that tab; if pip is missing, install Python 3.9+ and reopen Premiere |
| Downloads fail on Instagram / TikTok | Those posts are login-walled — add a `cookies.txt` or pick **read cookies from a browser** in the Downloader tab |
| Effects say "not found in this build" | The effect name must match this Premiere exactly — open *Quick Effects › Every effect this build reports* and copy the spelling |

## Uninstall

Delete the `com.socialyantra.powerhouse` folder from the extensions directory (and optionally `Documents/SocialYantra`).
