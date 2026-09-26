# Start Tile38 as a standalone Windows process (no Docker).
# Default: 127.0.0.1:9851 — matches backend TILE38_HOST / TILE38_PORT.

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ServerDir = Join-Path $RepoRoot 'tools\tile38\tile38-1.38.0-windows-amd64'
$ServerExe = Join-Path $ServerDir 'tile38-server.exe'
$DataDir = Join-Path $RepoRoot 'tools\tile38\data'
$HostAddr = if ($env:TILE38_HOST) { $env:TILE38_HOST } else { '127.0.0.1' }
$Port = if ($env:TILE38_PORT) { $env:TILE38_PORT } else { '9851' }

if (-not (Test-Path $ServerExe)) {
    Write-Host 'Tile38 binary missing — downloading 1.38.0 windows-amd64...'
    $ZipDir = Join-Path $RepoRoot 'tools\tile38'
    New-Item -ItemType Directory -Force -Path $ZipDir | Out-Null
    $Zip = Join-Path $ZipDir 'tile38-windows.zip'
    $Url = 'https://github.com/tidwall/tile38/releases/download/1.38.0/tile38-1.38.0-windows-amd64.zip'
    Invoke-WebRequest -Uri $Url -OutFile $Zip -UseBasicParsing
    Expand-Archive -Path $Zip -DestinationPath $ZipDir -Force
    Remove-Item $Zip -Force
}

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

Write-Host "Starting Tile38 at ${HostAddr}:${Port}"
Write-Host "Data dir: $DataDir"
Set-Location $ServerDir
& $ServerExe "-d" $DataDir "-h" $HostAddr "-p" $Port
