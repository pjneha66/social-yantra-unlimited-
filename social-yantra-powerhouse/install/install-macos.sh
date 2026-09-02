#!/usr/bin/env bash
# ============================================================
#  Social Yantra Powerhouse Panel — installer (macOS)
#  Copies the panel into the Adobe CEP extensions folder and
#  enables PlayerDebugMode so unsigned panels can load.
# ============================================================
set -e

SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/com.socialyantra.powerhouse"

echo "Installing to:"
echo "  $DEST"
mkdir -p "$DEST"
cp -R "$SRC/." "$DEST/"

# Enable PlayerDebugMode for CEP 9..12 (unsigned panels)
for v in 9 10 11 12; do
  defaults write com.adobe.CSXS.$v PlayerDebugMode 1 2>/dev/null || true
done

echo
echo "Done! Restart Premiere Pro, then open:"
echo "  Window > Extensions > Social Yantra Powerhouse Panel"
