#!/usr/bin/env bash
# Run every Social Yantra Powerhouse test suite.
set -e
cd "$(dirname "$0")/.."
echo "== panel UI smoke =="
node test/smoke.js
echo "== CEP Node runtime smoke =="
node test/cep-node-smoke.js
echo "== CEP manifest and Windows installer smoke =="
node test/manifest-smoke.js
echo "== ExtendScript engine smoke =="
node test/jsx-smoke.js
echo "== VAD engine smoke =="
node test/vad-smoke.js
echo "== ducking envelope smoke =="
node test/duck-smoke.js
echo "== beat detection smoke =="
node test/beat-smoke.js
echo "== chapters / export smoke =="
node test/chapters-smoke.js
echo "== transcription language smoke =="
node test/lang-smoke.js
echo "== nesting / effects / layers engine smoke =="
node test/nest-smoke.js
echo "== frame QC + stills smoke =="
node test/frameqc-smoke.js
echo "== downloader (yt-dlp) arguments smoke =="
node test/getargs-smoke.js
echo "== UI / ExtendScript wiring smoke =="
node test/ui-wiring-smoke.js
echo "== media integration smoke (needs ffmpeg; set SY_FFMPEG to pin a binary) =="
node test/media-smoke.js
echo "ALL SUITES PASSED"
