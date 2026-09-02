#!/usr/bin/env bash
# Run every Social Yantra Powerhouse test suite.
set -e
cd "$(dirname "$0")/.."
echo "== panel UI smoke =="
node test/smoke.js
echo "== ExtendScript engine smoke =="
node test/jsx-smoke.js
echo "== VAD engine smoke =="
node test/vad-smoke.js
echo "ALL SUITES PASSED"
