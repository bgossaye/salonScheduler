@echo off
SETLOCAL ENABLEDELAYEDEXPANSION

:: Check if Git is installed
git --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo Git is not installed.
    echo Please install Git from https://git-scm.com/download/win
    pause
    exit /b
)

:: Go to the script's directory (your project folder)
cd /d %~dp0

:: Add all new and changed files
git add -A

:: Check for changes
git diff --cached --quiet
IF %ERRORLEVEL% EQU 0 (
    echo No changes to commit.
    pause
    exit /b
)

:: Create a timestamp
for /f %%I in ('powershell -Command "Get-Date -Format yyyy-MM-dd_HH-mm-ss"') do set timestamp=%%I

:: Commit
git commit -m "Update at !timestamp!"

:: Push to origin main
git push origin main

echo.
echo Changes committed and pushed successfully at !timestamp!
pause
