# scripts/Kill-Simple.ps1
$ports = 3000,3001,5000
foreach ($p in $ports) {
  Write-Host "Killing $p..."
  (Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue).OwningProcess |
    Select-Object -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
}
Write-Host "Done."
