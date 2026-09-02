#!/usr/bin/env bash
# ============================================================
#  Social Yantra Powerhouse — macOS install validator
#  Checks every common reason a CEP panel doesn't show up
#  in Window > Extensions.
#  Usage: bash install/check-install-macos.sh
#         bash social-yantra-powerhouse/install/check-install-macos.sh
# ============================================================
set -u

RED="\033[31m"; GRN="\033[32m"; YEL="\033[33m"; DIM="\033[2m"; RST="\033[0m"
pass=0; fail=0; warn=0
ok()   { echo -e "${GRN}  ✓ $1${RST}"; pass=$((pass+1)); }
bad()  { echo -e "${RED}  ✗ $1${RST}"; if [ -n "${2:-}" ]; then echo -e "    ${DIM}$2${RST}"; fi; fail=$((fail+1)); }
note() { echo -e "${YEL}  ! $1${RST}"; if [ -n "${2:-}" ]; then echo -e "    ${DIM}$2${RST}"; fi; warn=$((warn+1)); }

echo "=== Social Yantra Powerhouse — macOS CEP Validator ==="
echo ""

# 1) Panel installed location
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/com.socialyantra.powerhouse"
echo "[1] Install location"
if [ -d "$DEST" ]; then
  ok "Found $DEST"
else
  bad "Not found: $DEST" "Run: bash install/install-macos.sh  (then restart Premiere)"
fi

# 2) Manifest + key files
echo ""
echo "[2] Required files in $DEST"
for f in "CSXS/manifest.xml" "index.html" "jsx/social-yantra.jsx" "js/core/bridge.js" "js/core/app.js"; do
  if [ -f "$DEST/$f" ]; then ok "$f"
  else
    # also check source location for dev case
    SRC="$(cd "$(dirname "$0")/.." 2>/dev/null && pwd)"
    if [ -f "$SRC/$f" ]; then note "$f missing in install but exists in source ($SRC/$f)" "Re-run installer to copy"
    else bad "$f missing" "Expected at $DEST/$f"
    fi
  fi
done

# 3) Manifest XML sanity
echo ""
echo "[3] Manifest sanity"
M="$DEST/CSXS/manifest.xml"
if [ ! -f "$M" ]; then
  # try source
  SRC="$(cd "$(dirname "$0")/.." 2>/dev/null && pwd)"
  M="$SRC/CSXS/manifest.xml"
fi
if [ -f "$M" ]; then
  if grep -q 'ExtensionBundleId="com.socialyantra.powerhouse"' "$M"; then ok "ExtensionBundleId = com.socialyantra.powerhouse"; else bad "ExtensionBundleId mismatch"; fi
  if grep -q 'Id="com.socialyantra.powerhouse.panel"' "$M"; then ok "Extension Id = com.socialyantra.powerhouse.panel"; else bad "Extension Id mismatch"; fi
  if grep -q 'Host Name="PPRO"' "$M"; then ok "Host PPRO present"; else bad "Host PPRO missing"; fi
  if grep -q 'RequiredRuntime Name="CSXS"' "$M"; then ok "RequiredRuntime CSXS present"; else bad "RequiredRuntime missing"; fi
  if grep -q -- '--mixed-context' "$M"; then ok "CEF --mixed-context (correct)"; else bad "CEF param wrong" "Should be --mixed-context not --mix-contexts"; fi
  if grep -q 'xmlns="http://ns.adobe.com/cep/manifest"' "$M"; then ok "xmlns present"; else note "xmlns missing" "Premiere 2024+ prefers xmlns=http://ns.adobe.com/cep/manifest"; fi
  if grep -q 'Version="1.0.0"' "$M" | head -1; then :; fi
  # Manifest Version should be CEP version, not 1.0.0
  MAN_VER=$(grep -o 'ExtensionManifest[^>]*Version="[^"]*"' "$M" | grep -o 'Version="[^"]*"' | head -1)
  echo "    ${DIM}manifest header: $MAN_VER${RST}"
  if echo "$MAN_VER" | grep -q '1.0.0'; then
    note "Manifest Version is 1.0.0" "Should be 9.0 / 10.0 / 11.0 (CEP version) — fixed in latest"
  else
    ok "Manifest Version looks like a CEP version"
  fi
  # XML well-formed check (python if available)
  if command -v python3 >/dev/null 2>&1; then
    if python3 -c "import xml.etree.ElementTree as ET; ET.parse('$M')" 2>/dev/null; then ok "XML is well-formed"
    else bad "XML is malformed" "Run: python3 -m xml.tool $M"
    fi
  fi
else
  bad "Cannot find manifest to check"
fi

# 4) PlayerDebugMode
echo ""
echo "[4] PlayerDebugMode (required for unsigned panels)"
for v in 9 10 11 12; do
  val=$(defaults read com.adobe.CSXS.$v PlayerDebugMode 2>/dev/null || echo "__missing__")
  if [ "$val" = "1" ]; then ok "CSXS.$v PlayerDebugMode = 1"
  elif [ "$val" = "__missing__" ]; then bad "CSXS.$v PlayerDebugMode not set" "Run: defaults write com.adobe.CSXS.$v PlayerDebugMode 1"
  else bad "CSXS.$v PlayerDebugMode = $val (expected 1)" "Run: defaults write com.adobe.CSXS.$v PlayerDebugMode 1"
  fi
done

# 5) Premiere
echo ""
echo "[5] Premiere Pro"
if pgrep -q "Adobe Premiere Pro" 2>/dev/null; then
  note "Premiere is RUNNING" "You must fully quit (Premiere > Quit) after installing, then relaunch"
else
  ok "Premiere not running (good — launch after install)"
fi
if [ -d "/Applications/Adobe Premiere Pro 2024" ] || [ -d "/Applications/Adobe Premiere Pro 2025" ] || ls -d /Applications/Adobe\ Premiere\ Pro* >/dev/null 2>&1; then
  found=$(ls -d /Applications/Adobe\ Premiere\ Pro* 2>/dev/null | head -5)
  ok "Premiere found: $(echo $found | tr '\n' ' ')"
else
  note "No Premiere in /Applications" "Check custom install location"
fi

# 6) Quarantine
echo ""
echo "[6] macOS quarantine / permissions"
if [ -d "$DEST" ]; then
  q=$(xattr -lr "$DEST" 2>/dev/null | grep -c "com.apple.quarantine" || true)
  if [ "$q" -eq 0 ]; then ok "No quarantine attributes"
  else note "$q file(s) still quarantined" "Run: xattr -dr com.apple.quarantine \"$DEST\""
  fi
  if [ -r "$DEST/CSXS/manifest.xml" ] && [ -r "$DEST/index.html" ]; then ok "Files are readable"
  else bad "Files not readable" "Run: chmod -R u+rw \"$DEST\""
  fi
fi

# 7) Node / CEP
echo ""
echo "[7] CEP environment"
echo "    macOS $(sw_vers -productVersion 2>/dev/null || uname -r)  $(uname -m)"
if [ -d "$HOME/Library/Logs/CSXS" ]; then
  echo "    CEP logs at ~/Library/Logs/CSXS/ — check for manifest errors:"
  ls -lt "$HOME/Library/Logs/CSXS" 2>/dev/null | head -8 | sed 's/^/    /'
else
  echo "    No CEP logs yet (normal before first Premiere launch with panel)"
fi

# 8) .debug
echo ""
echo "[8] Debug file (.debug)"
if [ -f "$DEST/.debug" ]; then
  ok ".debug present in install (enables localhost:8088 remote debug)"
  cat "$DEST/.debug" | sed 's/^/    /'
elif [ -f "$(cd "$(dirname "$0")/.." && pwd)/.debug" ]; then
  note ".debug exists in source but not in install" "Re-copy or run installer again"
else
  note "No .debug (optional, only needed for remote debugging)"
fi

echo ""
echo "-----------------------------------------------"
echo -e "Result: ${GRN}$pass passed${RST}, ${YEL}$warn warnings${RST}, ${RED}$fail failed${RST}"
if [ $fail -eq 0 ] && [ $warn -eq 0 ]; then
  echo -e "${GRN}All checks passed — restart Premiere and look in Window > Extensions > Social Yantra Powerhouse Panel${RST}"
elif [ $fail -eq 0 ]; then
  echo -e "${YEL}No hard failures, but address warnings above then restart Premiere.${RST}"
else
  echo -e "${RED}Fix the ✗ items above, re-run installer, fully quit and relaunch Premiere.${RST}"
fi
echo ""
echo "Still not showing?"
echo "  • After fixing, do:  pkill 'Adobe Premiere Pro'  then launch Premiere again"
echo "  • Check Window > Extensions — the panel is called 'Social Yantra Powerhouse Panel'"
echo "  • Console.app > search CEPHtmlEngine  — look for manifest parse errors"
echo "  • Try:  defaults read com.adobe.CSXS.11 PlayerDebugMode   (should be 1)"
echo "  • Ensure you copied the *contents* of social-yantra-powerhouse/ into com.socialyantra.powerhouse/, not a nested folder"
