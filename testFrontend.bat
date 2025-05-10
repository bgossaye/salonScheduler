@echo off
SETLOCAL

:: Kill all Node.js processes
echo Killing all Node.js processes...
taskkill /F /IM node.exe /T >nul 2>&1

:: Start backend
echo Starting backend server...
cd /d "C:\Users\15853\Documents\salon-booking-app\backend"
start cmd /k "node server.js"

:: Go to frontend
cd /d "C:\Users\15853\Documents\salon-booking-app\frontend"

:: Ask if npm install is necessary
set /p INSTALL_NPM=Do you need to run npm install? (y/n): 
if /I "%INSTALL_NPM%"=="y" (
    echo Running npm install...
start cmd /k "npm install"
)

set /p START_NPM=Do you need to run npm start? (y/n): 
if /I "%START_NPM%"=="y" (

echo Starting frontend (npm start)...
start cmd /k "npm start"
)


