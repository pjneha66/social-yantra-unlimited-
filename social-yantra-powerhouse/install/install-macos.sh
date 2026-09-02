#!/usr/bin/env bash
# ============================================================
#  Social Yantra Powerhouse Panel — installer (macOS)
#  Copies the panel into the Adobe CEP extensions folder and
#  enables PlayerDebugMode so unsigned panels can load.
#  FIXED: robust SRC detection, full CEP 9-12 support, verification,
#         quarantine clearing, and detailed diagnostics.
# ============================================================
set -e

# --- resolve SRC (the panel root that contains CSXS/manifest.xml) ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/../CSXS/manifest.xml" ]; then
  SRC="$(cd "$SCRIPT_DIR/.." && pwd)"
elif [ -f "$SCRIPT_DIR/CSXS/manifest.xml" ]; then
  SRC="$SCRIPT_DIR"
else
  # fallback: assume install/ is inside social-yantra-powerhouse/
  SRC="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

if [ ! -f "$SRC/CSXS/manifest.xml" ]; then
  echo "[ERROR] Could not find CSXS/manifest.xml"
  echo "        Script dir: $SCRIPT_DIR"
  echo "        Tried SRC: $SRC"
  echo "        Run this script from inside the social-yantra-powerhouse/install/ folder"
  echo "        or from the panel root."
  exit 1
fi

DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/com.socialyantra.powerhouse"

echo "Source: $SRC"
echo "Installing to:"
echo "  $DEST"

# Quit Premiere first (warn if running)
if pgrep -q "Adobe Premiere Pro" 2>/dev/null; then
  echo ""
  echo "[WARN] Premiere Pro is running. Please quit it fully before installing."
  echo "       (Premiere > Quit Premiere Pro) — then re-run this installer."
  echo "       Continuing anyway in 3s..."
  sleep 3
fi

# Clean previous install if exists
if [ -d "$DEST" ]; then
  echo "Removing previous install at $DEST ..."
  rm -rf "$DEST"
fi

mkdir -p "$DEST"
echo "Copying files..."
# Use rsync if available to preserve permissions and skip .git etc.
if command -v rsync >/dev/null 2>&1; then
  rsync -a --exclude='.git' --exclude='.DS_Store' --exclude='node_modules' --exclude='.debug' "$SRC/" "$DEST/"
  # keep .debug for debugging but ensure it's not quarantined
  if [ -f "$SRC/.debug" ]; then cp -f "$SRC/.debug" "$DEST/.debug" 2>/dev/null || true; fi
else
  cp -R "$SRC/." "$DEST/"
fi

# Clear macOS quarantine (downloaded folders get com.apple.quarantine)
if command -v xattr >/dev/null 2>&1; then
  echo "Clearing quarantine attributes..."
  xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true
fi

# Enable PlayerDebugMode for CEP 9..12 (covers PPro 2020-2025)
echo "Enabling PlayerDebugMode (allows unsigned CEP panels)..."
for v in 9 10 11 12; do
  defaults write com.adobe.CSXS.$v PlayerDebugMode 1 2>/dev/null || true
  # verify
  val=$(defaults read com.adobe.CSXS.$v PlayerDebugMode 2>/dev/null || echo "0")
  if [ "$val" = "1" ]; then
    echo "  CSXS.$v PlayerDebugMode = 1  ✓"
  else
    echo "  CSXS.$v PlayerDebugMode = $val (try: defaults write com.adobe.CSXS.$v PlayerDebugMode 1)"
  fi
done

# Permissions
chmod -R u+rw "$DEST" 2>/dev/null || true

# Verification
echo ""
echo "Verifying install..."
if [ -f "$DEST/CSXS/manifest.xml" ] && [ -f "$DEST/index.html" ] && [ -f "$DEST/jsx/social-yantra.jsx" ]; then
  echo "  manifest.xml  ✓"
  echo "  index.html    ✓"
  echo "  jsx/social-yantra.jsx  ✓"
else
  echo "  [ERROR] Verification failed — files missing in $DEST"
  ls -R "$DEST" | head -n 40
  exit 1
fi

# Show manifest Host / Runtime for user
echo ""
echo "Manifest check:"
grep -E "Host Name|RequiredRuntime|ExtensionBundleId" "$DEST/CSXS/manifest.xml" | sed 's/^/  /'

echo ""
echo "Done! Restart Premiere Pro, then open:"
echo "  Window > Extensions > Social Yantra Powerhouse Panel"
echo ""
echo "If the panel still does not appear:"
echo "  1) Fully quit Premiere (Cmd+Q), re-run this installer, then launch Premiere again."
echo "  2) Check Premiere version: Premiere Pro > About Premiere Pro (2020+ required, 2023+ recommended)"
echo "  3) Check that PlayerDebugMode stuck: defaults read com.adobe.CSXS.11 PlayerDebugMode  (should be 1)"
echo "  4) Look for CEP logs: ~/Library/Logs/CSXS/  and  Console.app > CEPHtmlEngine"
echo "  5) Run the validator: bash \"$SCRIPT_DIR/check-install-macos.sh\"  (or bash social-yantra-powerhouse/install/check-install-macos.sh)"
