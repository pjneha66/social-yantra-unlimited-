@echo off
REM ============================================================
REM  Social Yantra Powerhouse — Windows install validator
REM  Checks every common reason a CEP panel doesn't show up
REM  in Window > Extensions.
REM  Usage: double-click this file or run from cmd:
REM         install\check-install-windows.bat
REM ============================================================
setlocal EnableDelayedExpansion
echo === Social Yantra Powerhouse — Windows CEP Validator ===
echo.

set PASS=0
set FAIL=0
set WARN=0

REM ---- helpers ----
REM Use PowerShell for colored output if available
set "hasPS=0"
where powershell >nul 2>&1 && set "hasPS=1"

REM 1) Install location
echo [1] Install location
if "%APPDATA%"=="" set "APPDATA=%USERPROFILE%\AppData\Roaming"
set "DEST=%APPDATA%\Adobe\CEP\extensions\com.socialyantra.powerhouse"
set "SRC=%~dp0.."
if not exist "%DEST%" (
  echo   X FAIL: Not found: %DEST%
  echo     Run: install\install-windows.bat  (as same user that runs Premiere, not Admin-elevated)
  set /a FAIL+=1
) else (
  echo   PASS: Found %DEST%
  set /a PASS+=1
)

echo.
echo [2] Required files in %DEST%
for %%F in (CSXS\manifest.xml index.html jsx\social-yantra.jsx js\core\bridge.js js\core\app.js) do (
  if exist "%DEST%\%%F" (
    echo   PASS: %%F
    set /a PASS+=1
  ) else (
    echo   X FAIL: %%F missing in %DEST%
    set /a FAIL+=1
  )
)

echo.
echo [3] Manifest sanity
if exist "%DEST%\CSXS\manifest.xml" (
  findstr /C:"ExtensionBundleId=\"com.socialyantra.powerhouse\"" "%DEST%\CSXS\manifest.xml" >nul
  if !errorlevel!==0 (echo   PASS: ExtensionBundleId) else (echo   X FAIL: ExtensionBundleId mismatch & set /a FAIL+=1)
  findstr /C:"Id=\"com.socialyantra.powerhouse.panel\"" "%DEST%\CSXS\manifest.xml" >nul
  if !errorlevel!==0 (echo   PASS: Extension Id) else (echo   X FAIL: Extension Id mismatch & set /a FAIL+=1)
  findstr /C:"Host Name=\"PPRO\"" "%DEST%\CSXS\manifest.xml" >nul
  if !errorlevel!==0 (echo   PASS: Host PPRO) else (echo   X FAIL: Host PPRO missing & set /a FAIL+=1)
  findstr /C:"--mixed-context" "%DEST%\CSXS\manifest.xml" >nul
  if !errorlevel!==0 (echo   PASS: CEF --mixed-context) else (echo   X FAIL: CEF param should be --mixed-context not --mix-contexts & set /a FAIL+=1)
  findstr /C:"xmlns=\"http://ns.adobe.com/cep/manifest\"" "%DEST%\CSXS\manifest.xml" >nul
  if !errorlevel!==0 (echo   PASS: xmlns present) else (echo   ! WARN: xmlns missing - Premiere 2024+ prefers it & set /a WARN+=1)
  REM Simple well-formed check via PowerShell XML
  if !hasPS! equ 1 (
    powershell -Command "try { [xml](Get-Content '%DEST%\CSXS\manifest.xml') | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
    if !errorlevel!==0 (echo   PASS: XML well-formed) else (echo   X FAIL: XML malformed & set /a FAIL+=1)
  )
  echo     Manifest header:
  findstr /C:"ExtensionManifest" "%DEST%\CSXS\manifest.xml"
) else (
  echo   X FAIL: Cannot find manifest to check
  set /a FAIL+=1
)

echo.
echo [4] PlayerDebugMode (required for unsigned panels)
for %%v in (9 10 11 12) do (
  reg query "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode >nul 2>&1
  if !errorlevel! neq 0 (
    echo   X FAIL: CSXS.%%v PlayerDebugMode not set  ^(run as same user: reg add HKCU\Software\Adobe\CSXS.%%v /v PlayerDebugMode /t REG_SZ /d 1 /f^)
    set /a FAIL+=1
  ) else (
    for /f "tokens=3" %%A in ('reg query "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode 2^>nul ^| findstr /i "PlayerDebugMode"') do set "val=%%A"
    if "!val!"=="0x1" (
      echo   PASS: CSXS.%%v PlayerDebugMode = 1
      set /a PASS+=1
    ) else if "!val!"=="1" (
      echo   PASS: CSXS.%%v PlayerDebugMode = 1
      set /a PASS+=1
    ) else (
      echo   X FAIL: CSXS.%%v PlayerDebugMode = !val! ^(expected 1^)
      set /a FAIL+=1
    )
  )
)

echo.
echo [5] Premiere Pro
tasklist /FI "IMAGENAME eq Adobe Premiere Pro.exe" 2>nul | find /I "Adobe Premiere Pro.exe" >nul
if %errorlevel%==0 (
  echo   ! WARN: Premiere is RUNNING - fully quit (File ^> Exit) after fixing, then relaunch
  set /a WARN+=1
) else (
  echo   PASS: Premiere not running (good - launch after install)
  set /a PASS+=1
)

REM Common install locations
set "foundPPro=0"
if exist "C:\Program Files\Adobe\Adobe Premiere Pro 2024\Adobe Premiere Pro.exe" set "foundPPro=1"
if exist "C:\Program Files\Adobe\Adobe Premiere Pro 2025\Adobe Premiere Pro.exe" set "foundPPro=1"
if exist "C:\Program Files\Adobe\Adobe Premiere Pro 2023\Adobe Premiere Pro.exe" set "foundPPro=1"
if !foundPPro! equ 1 (
  echo   PASS: Premiere Pro found in C:\Program Files\Adobe\
) else (
  echo   ! WARN: Premiere not found in default path - check custom location
  set /a WARN+=1
)

echo.
echo [6] File blocks / permissions
if exist "%DEST%" (
  REM Check if files are blocked (Zone.Identifier)
  powershell -Command "Get-ChildItem -Path '%DEST%' -Recurse | Get-Content -Stream Zone.Identifier -ErrorAction SilentlyContinue | Measure-Object | Select-Object -ExpandProperty Count" > "%TEMP%\sy_zone.txt" 2>nul
  set /p zonecount=<"%TEMP%\sy_zone.txt" 2>nul
  if "!zonecount!"=="0" (
    echo   PASS: No blocked files (Zone.Identifier)
    set /a PASS+=1
  ) else if "!zonecount!"=="" (
    echo   PASS: Block check skipped
  ) else (
    echo   ! WARN: !zonecount! file(s) still blocked (Windows marks downloads)
    echo     Run: powershell -Command "Get-ChildItem -Path '%DEST%' -Recurse | Unblock-File"
    set /a WARN+=1
  )
)

echo.
echo [7] CEP logs
if exist "%APPDATA%\Adobe\CEP\logs" (
  echo   Logs at %APPDATA%\Adobe\CEP\logs\  (check for manifest parse errors):
  dir /b /o-d "%APPDATA%\Adobe\CEP\logs" 2>nul | head 2>nul
  powershell -Command "Get-ChildItem '%APPDATA%\Adobe\CEP\logs' | Sort-Object LastWriteTime -Descending | Select-Object -First 5 Name,LastWriteTime | Format-Table -AutoSize" 2>nul
) else (
  echo   No CEP logs yet (normal before first Premiere launch with panel)
)

echo.
echo [8] Alt install location (Common Files - for all users)
set "COMMON_DEST=C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\com.socialyantra.powerhouse"
if exist "%COMMON_DEST%\CSXS\manifest.xml" (
  echo   INFO: Also installed at %COMMON_DEST%
) else (
  echo   INFO: Not installed at Common Files (optional, not required)
)

echo.
echo -----------------------------------------------
echo Result: %PASS% passed, %WARN% warnings, %FAIL% failed
if %FAIL%==0 (
  if %WARN%==0 (
    echo All checks passed - restart Premiere and look in Window ^> Extensions ^> Social Yantra Powerhouse Panel
  ) else (
    echo No hard failures, but address warnings above then fully quit and relaunch Premiere.
  )
) else (
  echo Fix the X FAIL items above, re-run install-windows.bat AS THE SAME USER that runs Premiere, then fully quit and relaunch.
)
echo.
echo Still not showing?
echo   - After fixing, fully quit Premiere, then launch again.
echo   - Window ^> Extensions is where it appears (not Window ^> Workspace).
echo   - Name is exactly:  Social Yantra Powerhouse Panel
echo   - Check registry:  reg query HKCU\Software\Adobe\CSXS.11 /v PlayerDebugMode  ^(should be 1^)
echo   - Check log:  %%APPDATA%%\Adobe\CEP\logs\CEPHtmlEngine*.log  for "ExtensionManifest parse" errors
echo   - Ensure you copied the CONTENTS of social-yantra-powerhouse\ into com.socialyantra.powerhouse\, not a nested folder
echo.
pause
