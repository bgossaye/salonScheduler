@echo off
setlocal enabledelayedexpansion

set "BASE=C:\Users\15853\Documents\salon-booking-app\backend"
set "SUBFOLDERS=controllers middleware models routes"

echo 🔎 Scanning .js files in: controllers, middleware, models, routes
echo - Condition 1: Filename has uppercase
echo - Condition 2: 'require' line contains uppercase
echo.

for %%D in (%SUBFOLDERS%) do (
    set "TARGETDIR=%BASE%\%%D"
    if exist "!TARGETDIR!" (
        for /f "delims=" %%F in ('dir "!TARGETDIR!\*.js" /b /s /a:-d') do (
            set "FILENAME=%%~nxF"

            :: Condition 1: Uppercase in filename
            echo !FILENAME! | findstr /R "[A-Z]" >nul
            if not errorlevel 1 (
                echo 🔴 Uppercase filename: %%F
            )

            :: Condition 2: require with uppercase
            findstr /R /C:"require.*[A-Z]" "%%F" >nul
            if not errorlevel 1 (
                echo 🟡 Uppercase require found: %%F
            )
        )
    ) else (
        echo Skipping missing folder: !TARGETDIR!
    )
)

echo.
echo ✅ Scan complete.
pause
