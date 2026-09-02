@echo off
REM ============================================================
REM  Social Yantra Powerhouse Panel - installer (Windows)
REM  Copies the panel into the Adobe CEP extensions folder and
REM  enables PlayerDebugMode so unsigned panels can load.
REM ============================================================
@echo off
setlocal

set "SRC=%~dp0..\social-yantra-powerhouse"
if not exist "%SRC%" set "SRC=%~dp0."

for /f "tokens=*" %%i in ('echo %APPDATA%') do set "DEST=%%i\Adobe\CEP\extensions\com.socialyantra.powerhouse"

echo Installing to:
echo   %DEST%
if not exist "%DEST%" mkdir "%DEST%"

xcopy /s /e /y /i "%SRC%\*" "%DEST%\" >nul
if errorlevel 1 (
  echo [ERROR] copy failed - run this script as the same user that runs Premiere.
  pause
  exit /b 1
)

REM Enable PlayerDebugMode for CEP 9..12 (unsigned panels)
for %%v in (9 10 11 12) do (
  reg add "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
)

echo.
echo Done! Restart Premiere Pro, then open:
echo   Window ^> Extensions ^> Social Yantra Powerhouse Panel
echo.
pause
