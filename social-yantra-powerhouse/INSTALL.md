# Installing the Social Yantra Powerhouse Panel

## One-command install

### Windows
```bat
install\install-windows.bat
```
Copies the panel to `%APPDATA%\Adobe\CEP\extensions\com.socialyantra.powerhouse` and enables **PlayerDebugMode** (allows unsigned panels). Also installs to `Program Files (x86)\Common Files\Adobe\CEP\extensions\` for system-wide CEP.

### macOS
```bash
bash install/install-macos.sh
```
Copies to `~/Library/Application Support/Adobe/CEP/extensions/com.socialyantra.powerhouse` and writes the `PlayerDebugMode` default for CEP 9–12. Clears quarantine attributes automatically.

Then **fully quit Premiere Pro and relaunch** and open:

> **Window › Extensions › Social Yantra Powerhouse Panel**

> ⚠️ Premiere must be *fully quit* (not just close window) after install. On macOS: `Premiere Pro > Quit Premiere Pro` (⌘Q). On Windows: `File > Exit`. Then launch again.

---

## Validate your install (NEW)

If the panel does **not** appear in `Window > Extensions`, run the validator:

**macOS**
```bash
bash install/check-install-macos.sh
# or if installed:
bash ~/Library/Application\ Support/Adobe/CEP/extensions/com.socialyantra.powerhouse/install/check-install-macos.sh
```

**Windows**
```bat
install\check-install-windows.bat
:: or double-click it in Explorer
```

It checks all 8 common failure modes (wrong folder, bad manifest XML, missing PlayerDebugMode, quarantine, Premiere still running, blocked files) and tells you exactly what to fix.

---

## Manual install

1. Copy the **contents** of this folder (`social-yantra-powerhouse/`) — not a nested folder — to:
   - **Win:** `%APPDATA%\Adobe\CEP\extensions\com.socialyantra.powerhouse\`
   - **mac:** `~/Library/Application Support/Adobe/CEP/extensions/com.socialyantra.powerhouse/`
   > The destination folder must be named exactly `com.socialyantra.powerhouse` and contain `CSXS/manifest.xml` directly inside it. A common mistake is ending up with `.../com.socialyantra.powerhouse/social-yantra-powerhouse/CSXS/manifest.xml` (one level too deep) — that will not load.

2. Allow unsigned panels — enable **all** CSXS versions (covers PPro 2020–2025):
   - **Win:** 
     ```bat
     for %v in (9 10 11 12) do reg add HKCU\Software\Adobe\CSXS.%v /v PlayerDebugMode /t REG_SZ /d 1 /f
     ```
   - **mac:** 
     ```bash
     for v in 9 10 11 12; do defaults write com.adobe.CSXS.$v PlayerDebugMode 1; done
     ```
3. If on macOS and you downloaded a ZIP, clear quarantine:
   ```bash
   xattr -dr com.apple.quarantine ~/Library/Application\ Support/Adobe/CEP/extensions/com.socialyantra.powerhouse
   ```
   On Windows, unblock files:
   ```powershell
   Get-ChildItem -Path $env:APPDATA\Adobe\CEP\extensions\com.socialyantra.powerhouse -Recurse | Unblock-File
   ```
4. Fully quit Premiere and relaunch.

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

## Troubleshooting — Panel not loading

### Quick checklist (do in order)

1. **Is the folder correct?** Run the validator above. Must be:
   - Win: `%APPDATA%\Adobe\CEP\extensions\com.socialyantra.powerhouse\CSXS\manifest.xml` exists
   - Mac: `~/Library/Application Support/Adobe/CEP/extensions/com.socialyantra.powerhouse/CSXS/manifest.xml` exists
   - Not nested: `.../com.socialyantra.powerhouse/social-yantra-powerhouse/CSXS/...` is WRONG.

2. **Is PlayerDebugMode = 1?**
   - Win: `reg query HKCU\Software\Adobe\CSXS.11 /v PlayerDebugMode` → should be `0x1` or `1`
   - Mac: `defaults read com.adobe.CSXS.11 PlayerDebugMode` → should be `1`
   - Must be set for the **same Windows/macOS user** that runs Premiere (not Admin if Premiere runs as normal user).

3. **Did you fully quit Premiere after install?**
   - Premiere caches extensions at startup. Close window is not quit. Use `File > Exit` / `Premiere Pro > Quit`.

4. **Is Premiere new enough?**
   - Premiere Pro 14.0+ (CC 2020) minimum for this manifest. Recommended 23.0+ (CC 2023/2024/2025).

5. **Quarantine / blocked files?**
   - macOS ZIP download → `xattr -dr com.apple.quarantine ...`
   - Windows download → `Unblock-File` (the installer does this automatically).

6. **Check CEP logs for manifest errors:**
   - Mac: `~/Library/Logs/CSXS/` → look for `CEPHtmlEngine` logs, search for `com.socialyantra` or `ExtensionManifest` parse errors
   - Win: `%APPDATA%\Adobe\CEP\logs\` → same
   - If log says `manifest parse error` or `RequiredRuntime`, re-download and re-install (XML may be corrupted).

7. **Still not there? Try:**
   - Move the panel out, launch Premiere (confirm Extensions menu exists), quit, move it back, launch again.
   - Delete CEP cache: 
     - Win: `%APPDATA%\Adobe\CEP\extensions\` — ensure only one copy exists
     - Mac: same, plus `~/Library/Caches/CSXS/`
   - Try installing to the system folder as well: `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\` (Windows system location)

### Detailed symptom table

| Symptom | Fix |
|---|---|
| Panel not in the Window › Extensions menu | Re-check the extensions folder path (validator above); enable PlayerDebugMode for CSXS 9-12; **fully quit** Premiere; clear quarantine/blocked files; restart Premiere |
| Panel appears but is blank / white | Check CEP logs — likely a JS syntax error or missing `index.html`. Re-install. Try `Window > Extensions > Social Yantra Powerhouse Panel` again, or enable remote debug: open `http://localhost:8088` in Chrome while Premiere is running (if `.debug` present) |
| “Node engine unavailable” in Settings | Your Premiere's CEP is old or Node was stripped by policy — silence detection needs the Node engine; captions/curves/nest/tools still work. Ensure manifest has `--enable-nodejs --mixed-context` (fixed in v1.0.1) |
| Silence scan says ffmpeg missing | Install ffmpeg ([ffmpeg.org](https://ffmpeg.org)) or set its full path in Settings |
| “razor failed” / cuts land slightly off | Drop-frame sequences: the panel formats QE timecode automatically — verify your sequence frame rate matches media interpretation |
| Caption button errors | Native caption creation needs PPro 24+; the SRT is still imported into a bin for manual drag |
| Nest export never finishes | Nest Saver queues into Adobe Media Encoder — open AME and let it run |
| Text layer says “no drawtext filter” | Only the ffmpeg fallback needs it — text is normally rasterised on the panel's canvas. If you do hit it, install a full ffmpeg build or point *Settings › FFmpeg binary* at one |
| Clipboard paste says “holds no image” | Copy an actual image (not a file reference) first, or use **Choose file…** |
| rembg / yt-dlp “not installed” | Press the install button in that tab; if pip is missing, install Python 3.9+ and reopen Premiere |
| Downloads fail on Instagram / TikTok | Those posts are login-walled — add a `cookies.txt` or pick **read cookies from a browser** in the Downloader tab |
| Effects say “not found in this build” | The effect name must match this Premiere exactly — open *Quick Effects › Every effect this build reports* and copy the spelling |
| Manifest parse error in CEP log | Your `manifest.xml` is corrupted or has wrong XML namespace. Re-download. The fixed manifest uses `Version="9.0"` and `xmlns="http://ns.adobe.com/cep/manifest"` |
| CEF --mix-contexts warning | Fixed in latest: should be `--mixed-context` (not `--mix-contexts`). Re-install with the new `install-*.sh/bat` |

## What was fixed in v1.0.1 (CEP loading fix)

- **Manifest `Version`**: was `1.0.0` (invalid — CEP expects `9.0`/`11.0`). Changed to `9.0` with correct `xmlns`.
- **CEF flag**: `--mix-contexts` → `--mixed-context` (typo prevented Node from starting on some builds).
- **Installers**: robust `SRC` detection, clean previous install, quarantine/unblock handling, verification, full CSXS 9–12 PlayerDebugMode, system-wide fallback on Windows.
- **Validators**: new `install/check-install-macos.sh` and `check-install-windows.bat` that diagnose all common failures.

## Uninstall

Delete the `com.socialyantra.powerhouse` folder from the extensions directory (and optionally `Documents/SocialYantra`).
