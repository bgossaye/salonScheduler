# scripts/Start-Stack.ps1
$ErrorActionPreference = "Stop"

function Wait-Http($url, $timeoutSec = 300) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $timeoutSec) {
    try {
      $res = Invoke-WebRequest -Uri $url -UseBasicParsing -Method Head -TimeoutSec 5
      if ($res.StatusCode -ge 200 -and $res.StatusCode -lt 600) { return }
    } catch { }
    Start-Sleep -Milliseconds 500
  }
  throw "Timed out waiting for $url"
}

function Start-Term([string]$title, [string]$workdir, [string]$command) {
  # Prevent $Host and $env: expansion in THIS process so the child sets them
  $cmd = "`$Host.UI.RawUI.WindowTitle = '$title'; $command"
  Start-Process -FilePath "powershell.exe" `
    -WorkingDirectory $workdir `
    -ArgumentList "-NoExit","-NoLogo","-Command",$cmd | Out-Null
}

# --- repo root (scripts/..)
$ROOT = (Resolve-Path "$PSScriptRoot\..").Path

Write-Host "Killing ports: 5000, 3001, 3000..."
foreach ($p in 5000,3001,3000) {
  try {
    Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique |
      ForEach-Object { try { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } catch {} }
  } catch {}
}

# --- Backend (5000)
# IMPORTANT: force root-only npm behavior in each child with --workspaces=false
Start-Term "Rakie Backend (5000)" (Join-Path $ROOT "apps\booking\backend") "npm --workspaces=false run dev"
Wait-Http "http://localhost:5000"

# --- Booking Frontend (3001)
Start-Term "Booking Frontend (3001)" (Join-Path $ROOT "apps\booking\frontend") "`$env:PORT=3001; `$env:BROWSER='none'; npm --workspaces=false start"
Wait-Http "http://localhost:3001"

# --- Marketing Site (3000)
Start-Term "Site (3000)" (Join-Path $ROOT "apps\site") "`$env:BROWSER='none'; npm --workspaces=false start"
Wait-Http "http://localhost:3000"

Write-Host "`nAll services are up: 5000, 3001, 3000 ✅" -ForegroundColor Green
