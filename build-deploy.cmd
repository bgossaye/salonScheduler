@echo off
setlocal EnableExtensions

set REPO=%~dp0
set IIS_ROOT=C:\inetpub\wwwroot\rakiesalon

taskkill /F /IM node.exe 2>NUL

rem ===== build SITE =====
pushd "%REPO%apps\site"
if not exist node_modules (
  echo [site] installing deps...
  npm install
)
echo [site] building...
npm run build || goto :error
popd

rem ===== build BOOKING =====
pushd "%REPO%apps\booking\frontend"
if not exist node_modules (
  echo [booking] installing deps...
  npm install
)
echo [booking] building...
npm run build || goto :error
popd

rem ===== deploy to IIS =====
echo [deploy] copying site...
robocopy "%REPO%apps\site\build" "%IIS_ROOT%" /MIR >NUL
echo [deploy] copying booking...
robocopy "%REPO%apps\booking\frontend\build" "%IIS_ROOT%\booking" /MIR >NUL

echo.
echo [done] Deploy complete.
echo.

:error
echo.
echo [error] Build failed. Scroll up for the first error.
echo.

rem --- wait for Enter (robust)
powershell -NoProfile -NoLogo -Command ^
 "$Host.UI.RawUI.FlushInputBuffer(); [void](Read-Host 'Press Enter to exit')"
