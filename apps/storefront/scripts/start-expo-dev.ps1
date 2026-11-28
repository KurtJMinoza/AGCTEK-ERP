# Keeps Metro running outside IDE shells (web + Expo Go on LAN).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

$log = Join-Path $PWD "expo-dev.log"
$port = 8081

Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

Write-Host "Starting Expo on port $port (LAN + web). Log: $log"
Write-Host "Web:    http://127.0.0.1:$port/"
Write-Host "Expo Go: scan QR below or exp://<your-lan-ip>:$port"
Write-Host ""

$env:CI = $null
$env:EXPO_NO_TELEMETRY = "1"

# cmd /k keeps Metro alive in its own console (survives IDE agent shells).
Start-Process -FilePath "cmd.exe" -ArgumentList @(
  "/k",
  "title AGCTEK Expo && cd /d `"$PWD`" && npm start"
) -WorkingDirectory $PWD

Start-Sleep -Seconds 12
if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
  Write-Host "Metro is listening on port $port."
} else {
  Write-Host "Metro did not start. Check the Expo command window for errors."
  exit 1
}