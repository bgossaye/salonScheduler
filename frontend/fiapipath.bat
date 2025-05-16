@echo off
SETLOCAL ENABLEDELAYEDEXPANSION

echo 🔍 Searching all files for "${API_BASE}/api" to replace with "${API_BASE}"...

REM Start from current directory and process all .js, .jsx, .ts, .tsx files
for /R %%f in (*.js *.jsx *.ts *.tsx) do (
  echo 🛠 Updating: %%f
  powershell -Command "(Get-Content -Raw '%%f') -replace '\$\{API_BASE\}/api', '\$\{API_BASE\}' | Set-Content '%%f'"
)

echo ✅ All occurrences replaced successfully.
pause
