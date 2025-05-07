@echo off
SETLOCAL ENABLEEXTENSIONS ENABLEDELAYEDEXPANSION

:: Check for Git
git --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo Git is not installed.
    echo Please download and install it from: https://git-scm.com/download/win
    pause
    exit /b
)

:: Set global Git config
echo Setting up Git user name and email...
set /p GIT_NAME="Enter your name for Git: "
git config --global user.name "!GIT_NAME!"

set /p GIT_EMAIL="Enter your email for Git: "
git config --global user.email "!GIT_EMAIL!"

:: Confirm directory
echo Current directory:
cd
echo.

:: Initialize Git
echo Initializing Git repository...
git init

:: Create .gitignore
echo Creating .gitignore...
(
    echo node_modules/
    echo .env
    echo dist/
    echo build/
    echo *.log
    echo .DS_Store
) > .gitignore

:: Create README.md
echo Creating README.md...
echo # Salon Booking System > README.md
echo This is a full-stack salon booking application. >> README.md

:: Stage files
echo Staging all files...
git add .

:: Initial commit
echo Creating initial commit...
git commit -m "Initial commit for salon booking system"

:: Set remote
set /p REMOTE_URL="Enter your GitHub repository URL (e.g. https://github.com/username/repo.git): "
git remote add origin !REMOTE_URL!
git branch -M main

:: Push to GitHub
echo Pushing to GitHub...
git push -u origin main

echo.
echo Git project initialized and pushed successfully!
pause
