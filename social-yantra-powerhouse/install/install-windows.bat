@echo off
REM ============================================================
REM  Social Yantra Powerhouse Panel - installer (Windows)
REM  Copies the panel into the Adobe CEP extensions folder and
REM  enables PlayerDebugMode so unsigned panels can load.
REM  FIXED: robust SRC detection, verification, full CEP 9-12,
REM         handles OneDrive / roaming APPDATA, longer paths.
REM ============================================================
setlocal EnableDelayedExpansion

REM --- Resolve SRC: folder that contains CSXS\manifest.xml ---
set "SCRIPT_DIR=%~dp0"
REM strip trailing backslash
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

set "SRC="
if exist "%SCRIPT_DIR%\..\CSXS\manifest.xml" (
  for %%A in ("%SCRIPT_DIR%\..") do set "SRC=%%~fA"
) else if exist "%SCRIPT_DIR%\CSXS\manifest.xml" (
  set "SRC=%SCRIPT_DIR%"
) else if exist "%SCRIPT_DIR%\social-yantra-powerhouse\CSXS\manifest.xml" (
  set "SRC=%SCRIPT_DIR%\social-yantra-powerhouse"
) else (
  REM fallback: try parent of install folder
  for %%A in ("%SCRIPT_DIR%\..") do set "SRC=%%~fA"
)

if not exist "%SRC%\CSXS\manifest.xml" (
  echo [ERROR] Could not find CSXS\manifest.xml
  echo         Script dir: %SCRIPT_DIR%
  echo         Tried SRC: %SRC%
  echo         Make sure you run install-windows.bat from inside
  echo         social-yantra-powerhouse\install\
  pause
  exit /b 1
)

echo Source: %SRC%

REM --- Destination: %APPDATA%\Adobe\CEP\extensions\com.socialyantra.powerhouse ---
REM Handle case where APPDATA is not set (e.g. service account)
if "%APPDATA%"=="" set "APPDATA=%USERPROFILE%\AppData\Roaming"

set "DEST=%APPDATA%\Adobe\CEP\extensions\com.socialyantra.powerhouse"
echo Installing to:
echo   %DEST%

REM Warn if Premiere is running
tasklist /FI "IMAGENAME eq Adobe Premiere Pro.exe" 2>nul | find /I "Adobe Premiere Pro.exe" >nul
if %errorlevel%==0 (
  echo.
  echo [WARN] Premiere Pro is running. Please quit it fully before installing,
  echo        then re-run this installer. Continuing in 5s...
  timeout /t 5 >nul
)

REM Clean previous install
if exist "%DEST%" (
  echo Removing previous install...
  rmdir /s /q "%DEST%" 2>nul
)

if not exist "%DEST%" mkdir "%DEST%" 2>nul

echo Copying files...
xcopy /s /e /y /i /q "%SRC%\*" "%DEST%\" >nul
if errorlevel 1 (
  echo [ERROR] Copy failed.
  echo         - Run this script as the same user that runs Premiere (not Admin if Premiere is normal user).
  echo         - Check antivirus / OneDrive sync is not locking %DEST%
  echo         - Try manually copying:  xcopy /s /e /y /i "%SRC%\*" "%DEST%\"
  pause
  exit /b 1
)

REM Also install to Common Files for system-wide CEP (some installs look there)
set "COMMON_DEST=C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\com.socialyantra.powerhouse"
if exist "C:\Program Files (x86)\Common Files\Adobe\CEP\extensions" (
  echo Also installing to Common Files (for all users)...
  if not exist "%COMMON_DEST%" mkdir "%COMMON_DEST%" 2>nul
  xcopy /s /e /y /i /q "%SRC%\*" "%COMMON_DEST%\" >nul 2>&1
)

REM Enable PlayerDebugMode for CEP 9..12 (unsigned panels)
echo Enabling PlayerDebugMode for CEP 9..12...
for %%v in (9 10 11 12) do (
  reg add "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
  if !errorlevel! neq 0 (
    echo   CSXS.%%v  - failed to write (try Run as normal user, not elevated)
  ) else (
    echo   CSXS.%%v PlayerDebugMode = 1  [ok]
  )
)

REM Unblock files (Windows marks downloaded files as blocked)
echo Unblocking files...
powershell -Command "Get-ChildItem -Path '%DEST%' -Recurse | Unblock-File" >nul 2>&1

REM Verify
echo.
echo Verifying install...
if exist "%DEST%\CSXS\manifest.xml" (
  echo   manifest.xml  [ok]
) else (
  echo   manifest.xml  [MISSING]
)
if exist "%DEST%\index.html" (
  echo   index.html    [ok]
) else (
  echo   index.html    [MISSING]
)
if exist "%DEST%\jsx\social-yantra.jsx" (
  echo   jsx\social-yantra.jsx  [ok]
) else (
  echo   jsx\social-yantra.jsx  [MISSING]
)

if not exist "%DEST%\CSXS\manifest.xml" (
  echo [ERROR] Verification failed - files missing in %DEST%
  dir "%DEST%" 2>nul
  pause
  exit /b 1
)

echo.
echo Manifest check:
findstr /C:"Host Name" /C:"RequiredRuntime" /C:"ExtensionBundleId" "%DEST%\CSXS\manifest.xml"

echo.
echo Done! Restart Premiere Pro, then open:
echo   Window ^> Extensions ^> Social Yantra Powerhouse Panel
echo.
echo If the panel still does not appear:
echo   1) Fully quit Premiere (File ^> Exit), re-run this installer AS THE SAME USER, then launch Premiere again.
echo   2) Check Premiere version: Help ^> About Premiere Pro (needs 2020+; 2023+ recommended)
echo   3) Check registry: reg query HKCU\Software\Adobe\CSXS.11 /v PlayerDebugMode  (should be 1)
echo   4) Look for CEP logs: %%APPDATA%%\Adobe\CEP\logs\   and   Event Viewer
echo   5) Run validator: install\check-install-windows.bat
echo.
pause
