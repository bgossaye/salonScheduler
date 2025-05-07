@echo off
SETLOCAL ENABLEDELAYEDEXPANSION

:: First GO to the code's root directory, Check if Git is installed
git --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo Git is not installed on this system.
    echo Please download and install it from: https://git-scm.com/download/win
    pause
    exit /b
)

:: Initialize Git
echo Initializing Git repository...
git init

:: Create .gitignore
echo Creating .gitignore file...
(
    echo node_modules/
    echo .env
    echo dist/
    echo build/
    echo *.log
    echo .DS_Store
) > .gitignore

:: Stage files
git add .

:: First commit
git commit -m "Initial commit for salon booking system"

echo Git setup complete.
pause
